import { getSetting, setSetting, getContacts } from './db';
import { canMarket } from '@shared/contacts';

// Engage (engage.grodigital.co.za) — GD's own engagement rails, with GD as
// tenant #4. The portal is the master contact list; Engage executes sends.
//
// Modelled on MyFundi's integration deliberately, so there is one pattern
// across both platforms rather than two. Two differences worth knowing:
//   - Engage cannot list campaigns (GET /api/v1/campaigns is 405), so campaign
//     records live here and Engage only executes.
//   - The consent gate is re-applied at Engage on every send regardless of what
//     we say, so a bug here cannot cause a send to someone who opted out.

const BASE_URL = process.env.ENGAGE_API_BASE_URL ?? 'https://engage.grodigital.co.za';
const ENGAGE_ENABLED_KEY = 'engage_enabled';

export function engageKeyPresent(): boolean {
  return Boolean(process.env.ENGAGE_API_KEY);
}

/**
 * The runtime kill switch, separate from whether a key exists.
 *
 * A missing key means "never configured"; this means "configured but stop".
 * Worth having as its own switch: turning sending off should not require
 * deleting a credential and then finding it again.
 */
export async function isEngageEnabled(): Promise<boolean> {
  if (!engageKeyPresent()) return false;
  return (await getSetting(ENGAGE_ENABLED_KEY)) === 'true';
}

export async function setEngageEnabled(on: boolean): Promise<void> {
  await setSetting(ENGAGE_ENABLED_KEY, on ? 'true' : 'false');
}

async function engageFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = process.env.ENGAGE_API_KEY;
  if (!apiKey) throw new Error('ENGAGE_API_KEY is not configured');
  // Every supplier call bounded. An Engage outage must not hang a portal page.
  const timeout = AbortSignal.timeout(15_000);
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    signal: timeout,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function engageJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await engageFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Engage ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export interface EngageWallet {
  balanceCents: number;
  reservedCents: number;
  availableCents: number;
  billingActive: boolean;
  canSend: boolean;
  sendingBlockedReason: string | null;
  lowBalance: boolean;
  billingEmail: string | null;
  trial: { endsAt: string | null; remaining: number | null } | null;
  rates: Record<string, number>;
  entries: { id: string; type: string; amountCents: number; balanceAfterCents: number; note: string | null; at: string }[];
}

export interface EngageChannels {
  whatsapp: { status: string; displayNumber: string | null };
  email: { status: string; from: string | null };
  sms: { status: string };
}

export function getEngageWallet(): Promise<EngageWallet> {
  return engageJson<EngageWallet>('/api/v1/wallet');
}

export async function getEngageChannels(): Promise<EngageChannels> {
  const r = await engageJson<{ data: EngageChannels }>('/api/v1/channels');
  return r.data;
}

export interface EngageTemplate {
  id: string;
  name: string;
  channel: string;
  category?: string;
  status?: string;
  language?: string;
}

export async function getEngageTemplates(): Promise<EngageTemplate[]> {
  const r = await engageJson<{ templates: EngageTemplate[] }>('/api/v1/templates');
  return r.templates ?? [];
}

export async function countEngageContacts(): Promise<number> {
  // No count endpoint; page through and tally. Fine at our size, and the cursor
  // is honoured so it stays correct if the list grows.
  let cursor: string | null = null;
  let total = 0;
  for (let page = 0; page < 50; page++) {
    const qs: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const r: { data: unknown[]; nextCursor: string | null } =
      await engageJson<{ data: unknown[]; nextCursor: string | null }>(`/api/v1/contacts${qs}`);
    total += r.data.length;
    if (!r.nextCursor) break;
    cursor = r.nextCursor;
  }
  return total;
}

type EngageContactInput = {
  externalId: string;
  phone?: string;
  email?: string;
  name?: string;
  traits: Record<string, unknown>;
  consent?: { popia?: boolean; marketing?: 'opt_in' | 'opt_out' };
};

type PortalContact = Awaited<ReturnType<typeof getContacts>>[number];

/**
 * Map a portal contact onto Engage's contract.
 *
 * Traits carry the company relationships, because Engage segments can only
 * filter on traits — anything not sent here cannot be segmented on there. Its
 * DSL has no not_contains, so "everyone except this client" is not expressible
 * as a rule for someone who acts for several companies; that is why an excluded
 * contact is sent as opt_out rather than filtered at campaign time.
 */
export function portalContactToEngage(c: PortalContact): EngageContactInput {
  const companies = c.organisations.map((o) => o.slug).filter(Boolean) as string[];
  const primary = c.organisations.find((o) => o.isPrimary) ?? c.organisations[0];
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');

  const traits: Record<string, unknown> = {};
  if (primary?.slug) traits.company = primary.slug;
  if (primary?.name) traits.company_name = primary.name;
  if (primary?.stage) traits.stage = primary.stage;
  if (primary?.role) traits.role = primary.role;
  // Delimited so a `contains` rule can match one company within the list.
  if (companies.length) traits.companies = `,${companies.join(',')},`;
  traits.source = 'gd-portal';

  const marketable = canMarket(c, 'email') || canMarket(c, 'sms');

  return {
    externalId: `gdportal:${c.id}`,
    ...(c.phone ? { phone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(name ? { name } : {}),
    traits,
    consent: {
      popia: c.consentBasis !== 'none',
      marketing: marketable ? 'opt_in' : 'opt_out',
    },
  };
}

export interface SyncResult {
  sent: number;
  created: number;
  updated: number;
  errors: string[];
  skipped: number;
}

/**
 * Push the master list to Engage. Batches of 100, the documented maximum.
 *
 * Internal contacts are skipped entirely rather than sent as opt_out: GD's own
 * addresses have no business being in a sending platform's contact table at all.
 */
export async function syncContactsToEngage(): Promise<SyncResult> {
  const all = await getContacts();
  const sendable = all.filter((c) => !c.isInternal && (c.email || c.phone));
  const result: SyncResult = {
    sent: 0,
    created: 0,
    updated: 0,
    errors: [],
    skipped: all.length - sendable.length,
  };

  for (let i = 0; i < sendable.length; i += 100) {
    const batch = sendable.slice(i, i + 100).map(portalContactToEngage);
    try {
      const r = await engageJson<{ results: { status: string; error?: string }[] }>(
        '/api/v1/contacts',
        { method: 'POST', body: JSON.stringify(batch) },
      );
      for (const row of r.results ?? []) {
        if (row.status === 'created') result.created++;
        else if (row.status === 'updated') result.updated++;
        else if (row.error) result.errors.push(row.error);
      }
      result.sent += batch.length;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}

/**
 * Push one contact after it changes. Fire-and-forget: never throws, never
 * blocks the write that triggered it.
 *
 * This exists because the manual sync button is the wrong safety model for
 * consent. An opt-in that arrives late is a missed send; an OPT-OUT that never
 * arrives means Engage keeps sending to someone who asked us to stop, until
 * somebody remembers to press a button. The asymmetry is the whole argument.
 *
 * Engage re-applies its own consent gate on send, but only against what it
 * knows — so what it knows has to keep up.
 */
export function syncContactToEngage(contactId: number): void {
  void (async () => {
    if (!(await isEngageEnabled())) return;
    const all = await getContacts();
    const c = all.find((x) => x.id === contactId);
    if (!c) return;
    if (c.isInternal || (!c.email && !c.phone)) return;
    const res = await engageFetch('/api/v1/contacts', {
      method: 'POST',
      body: JSON.stringify(portalContactToEngage(c)),
    });
    if (!res.ok) {
      console.warn(`[engage] contact ${contactId} sync failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  })().catch((err) => console.warn(`[engage] contact ${contactId} sync threw: ${String(err)}`));
}

/**
 * Re-push every contact acting for one organisation.
 *
 * Excluding a company changes marketability for all of its people at once, and
 * that change has to reach Engage for the same reason a single opt-out does.
 */
export function syncOrganisationContactsToEngage(organisationId: number): void {
  void (async () => {
    if (!(await isEngageEnabled())) return;
    const all = await getContacts();
    const affected = all.filter(
      (c) => !c.isInternal && (c.email || c.phone) && c.organisations.some((o) => o.id === organisationId),
    );
    if (!affected.length) return;
    const res = await engageFetch('/api/v1/contacts', {
      method: 'POST',
      body: JSON.stringify(affected.map(portalContactToEngage)),
    });
    if (!res.ok) {
      console.warn(`[engage] org ${organisationId} sync failed: ${res.status}`);
    }
  })().catch((err) => console.warn(`[engage] org ${organisationId} sync threw: ${String(err)}`));
}

/**
 * Opt a contact out at Engage before deleting it here.
 *
 * The v1 API has no delete, so removing someone from the portal would otherwise
 * leave them in Engage exactly as they were — still marketable, and now with no
 * record here to explain why. Opting them out is the closest honest equivalent.
 */
export async function optOutAtEngage(contactId: number): Promise<void> {
  if (!(await isEngageEnabled())) return;
  const all = await getContacts();
  const c = all.find((x) => x.id === contactId);
  if (!c || c.isInternal || (!c.email && !c.phone)) return;
  try {
    await engageFetch('/api/v1/contacts', {
      method: 'POST',
      body: JSON.stringify({
        ...portalContactToEngage(c),
        consent: { marketing: 'opt_out' as const },
      }),
    });
  } catch (err) {
    console.warn(`[engage] opt-out on delete failed for ${contactId}: ${String(err)}`);
  }
}

/** Fire-and-forget whole-list push, for bulk actions that change many people. */
export function syncAllContactsToEngage(): void {
  void (async () => {
    if (!(await isEngageEnabled())) return;
    const r = await syncContactsToEngage();
    if (r.errors.length) console.warn(`[engage] bulk sync: ${r.errors.length} failed, first: ${r.errors[0]}`);
  })().catch((err) => console.warn(`[engage] bulk sync threw: ${String(err)}`));
}
