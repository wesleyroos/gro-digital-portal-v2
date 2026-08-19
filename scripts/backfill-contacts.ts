/**
 * Backfill organisations and contacts from the places contact data currently
 * lives: clientProfiles, invoice headers, leads and outreachProspects.
 *
 * Dry run by default — prints exactly what it would do. Pass --apply to write.
 *
 *   DATABASE_URL=mysql://… npx tsx scripts/backfill-contacts.ts
 *   DATABASE_URL=mysql://… npx tsx scripts/backfill-contacts.ts --apply
 *
 * It never guesses. Where two sources disagree, or one email address belongs to
 * two companies, it reports the collision and takes the first occurrence rather
 * than inventing a resolution. Re-runnable: contacts are matched on email or
 * phone, so an existing row is updated rather than duplicated.
 */
import mysql from 'mysql2/promise';
import {
  isInternalEmail,
  normalisePhone,
  slugify,
  splitEmails,
  splitName,
} from '../shared/contacts.ts';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');

/**
 * Lead/prospect rows that are the same company as an existing client, matched by
 * inspection on 2026-08-19 because their names do not slugify to the client
 * slug. Everything else is matched on an exact slug match or gets its own
 * organisation — no fuzzy matching, since a wrong merge is worse than a
 * duplicate. Review this list when re-running.
 */
const MANUAL_ORG_MATCHES: Record<string, string> = {
  'igl africa marketing': 'igl-coatings-africa',
  'exotic jams': 'zuildvaal-exotic-jams',
  'fundi contractor retainer': 'fundi-capital',
  'fundi — fas ledger development': 'fundi-capital',
  'fundi — innovation hub build': 'fundi-capital',
};

const CONSENT_SOURCE = 'Existing client relationship (POPIA s69(3)(a)) — portal backfill 2026-08-19';

type Org = {
  slug: string;
  name: string;
  stage: 'prospect' | 'lead' | 'client' | 'past_client';
  address: string | null;
  website: string | null;
  industry: string | null;
};

type Candidate = {
  orgSlug: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  source: string;
};

const conn = await mysql.createConnection(DATABASE_URL);
const q = async <T = any>(sql: string, args: any[] = []): Promise<T[]> => {
  const [rows] = await conn.execute(sql, args);
  return rows as T[];
};

const orgs = new Map<string, Org>();
const candidates: Candidate[] = [];
const problems: string[] = [];

function addOrg(o: Org) {
  const existing = orgs.get(o.slug);
  if (!existing) { orgs.set(o.slug, o); return; }
  // A company seen as both a client and a lead is a client.
  const rank = { prospect: 0, lead: 1, past_client: 2, client: 3 };
  if (rank[o.stage] > rank[existing.stage]) existing.stage = o.stage;
  existing.address ??= o.address;
  existing.website ??= o.website;
  existing.industry ??= o.industry;
}

// ── Clients: clientProfiles plus any slug that exists only on invoices ───────

const profiles = await q(`SELECT clientSlug, name, contact, email, phone, address FROM clientProfiles`);
for (const p of profiles) {
  addOrg({
    slug: p.clientSlug,
    name: p.name || p.clientSlug,
    stage: 'client',
    address: p.address || null,
    website: null,
    industry: null,
  });
  const { firstName, lastName } = splitName(p.contact);
  const emails = splitEmails(p.email);
  const phone = normalisePhone(p.phone);
  if (!emails.length && !phone && !firstName) {
    problems.push(`GAP  ${p.clientSlug}: no contact details at all on the client profile`);
  }
  // The named contact takes the phone and the first address; further addresses
  // become their own contacts with no name, which the gaps view then surfaces.
  emails.forEach((email, i) => {
    candidates.push({
      orgSlug: p.clientSlug,
      firstName: i === 0 ? firstName : null,
      lastName: i === 0 ? lastName : null,
      email,
      phone: i === 0 ? phone : null,
      role: null,
      isPrimary: i === 0,
      source: 'clientProfiles',
    });
  });
  if (!emails.length && (phone || firstName)) {
    candidates.push({
      orgSlug: p.clientSlug, firstName, lastName, email: null, phone,
      role: null, isPrimary: true, source: 'clientProfiles',
    });
  }
}

const invoiceClients = await q(`
  SELECT clientSlug,
         MAX(clientName) AS clientName,
         MAX(clientContact) AS clientContact,
         MAX(clientEmail) AS clientEmail,
         MAX(clientPhone) AS clientPhone
  FROM invoices WHERE clientSlug <> '' GROUP BY clientSlug
`);
for (const c of invoiceClients) {
  addOrg({
    slug: c.clientSlug, name: c.clientName || c.clientSlug, stage: 'client',
    address: null, website: null, industry: null,
  });
  const { firstName, lastName } = splitName(c.clientContact);
  const emails = splitEmails(c.clientEmail);
  const phone = normalisePhone(c.clientPhone);
  emails.forEach((email, i) => {
    candidates.push({
      orgSlug: c.clientSlug,
      firstName: i === 0 ? firstName : null,
      lastName: i === 0 ? lastName : null,
      email,
      phone: i === 0 ? phone : null,
      role: null,
      isPrimary: false,
      source: 'invoices',
    });
  });
  if (!emails.length && (phone || firstName)) {
    candidates.push({
      orgSlug: c.clientSlug, firstName, lastName, email: null, phone,
      role: null, isPrimary: false, source: 'invoices',
    });
  }
}

// ── Leads and prospects ─────────────────────────────────────────────────────

function resolveOrg(name: string, stage: 'lead' | 'prospect', extra: Partial<Org> = {}): string {
  const manual = MANUAL_ORG_MATCHES[name.trim().toLowerCase()];
  if (manual) {
    if (!orgs.has(manual)) problems.push(`MAP  "${name}" maps to ${manual}, which does not exist`);
    return manual;
  }
  const slug = slugify(name);
  if (orgs.has(slug)) return slug;
  addOrg({ slug, name: name.trim(), stage, address: null, website: null, industry: null, ...extra } as Org);
  return slug;
}

const leadRows = await q(`SELECT id, name, contactName, contactEmail, contactPhone FROM leads`);
for (const l of leadRows) {
  const orgSlug = resolveOrg(l.name, 'lead');
  const { firstName, lastName } = splitName(l.contactName);
  const emails = splitEmails(l.contactEmail);
  const phone = normalisePhone(l.contactPhone);
  if (emails.length || phone) {
    emails.forEach((email, i) => candidates.push({
      orgSlug, firstName: i === 0 ? firstName : null, lastName: i === 0 ? lastName : null,
      email, phone: i === 0 ? phone : null, role: null, isPrimary: false, source: `lead:${l.id}`,
    }));
    if (!emails.length) {
      candidates.push({ orgSlug, firstName, lastName, email: null, phone, role: null, isPrimary: false, source: `lead:${l.id}` });
    }
  } else {
    problems.push(`GAP  lead #${l.id} "${l.name}": no email and no phone`);
  }
}

const prospectRows = await q(`
  SELECT id, businessName, contactName, contactEmail, contactPhone, website, industry FROM outreachProspects
`);
for (const p of prospectRows) {
  const orgSlug = resolveOrg(p.businessName, 'prospect', { website: p.website || null, industry: p.industry || null });
  const { firstName, lastName } = splitName(p.contactName);
  const emails = splitEmails(p.contactEmail);
  const phone = normalisePhone(p.contactPhone);
  emails.forEach((email, i) => candidates.push({
    orgSlug, firstName: i === 0 ? firstName : null, lastName: i === 0 ? lastName : null,
    email, phone: i === 0 ? phone : null, role: null, isPrimary: false, source: `prospect:${p.id}`,
  }));
  if (!emails.length && phone) {
    candidates.push({ orgSlug, firstName, lastName, email: null, phone, role: null, isPrimary: false, source: `prospect:${p.id}` });
  }
}

// ── Dedupe. Email and phone are unique, so a clash is a decision. ───────────

type Merged = Candidate & { stage: Org['stage'] };
const byEmail = new Map<string, Merged>();
const byPhone = new Map<string, Merged>();
const final: Merged[] = [];

for (const c of candidates) {
  const stage = c.orgSlug ? (orgs.get(c.orgSlug)?.stage ?? 'prospect') : 'prospect';
  const emailHit = c.email ? byEmail.get(c.email) : undefined;
  const phoneHit = c.phone ? byPhone.get(c.phone) : undefined;
  const hit = emailHit ?? phoneHit;

  if (hit) {
    if (hit.orgSlug !== c.orgSlug) {
      problems.push(
        `DUPE ${c.email ?? c.phone} appears on both ${hit.orgSlug} (${hit.source}) and ${c.orgSlug} (${c.source}) — kept on ${hit.orgSlug}`,
      );
    }
    hit.firstName ??= c.firstName;
    hit.lastName ??= c.lastName;
    hit.phone ??= c.phone;
    hit.email ??= c.email;
    hit.isPrimary ||= c.isPrimary;
    if (hit.email) byEmail.set(hit.email, hit);
    if (hit.phone) byPhone.set(hit.phone, hit);
    continue;
  }

  const merged: Merged = { ...c, stage };
  final.push(merged);
  if (merged.email) byEmail.set(merged.email, merged);
  if (merged.phone) byPhone.set(merged.phone, merged);
}

// ── Report ──────────────────────────────────────────────────────────────────

const internal = final.filter((c) => isInternalEmail(c.email));
const marketable = final.filter((c) => c.stage === 'client' && !isInternalEmail(c.email));
const noPhone = final.filter((c) => !c.phone && !isInternalEmail(c.email));
const noEmail = final.filter((c) => !c.email && !isInternalEmail(c.email));

console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN — nothing written'}\n`);
console.log(`organisations   ${orgs.size}`);
for (const stage of ['client', 'lead', 'prospect'] as const) {
  console.log(`  ${stage.padEnd(13)} ${[...orgs.values()].filter((o) => o.stage === stage).length}`);
}
console.log(`\ncontacts        ${final.length}`);
console.log(`  marketable    ${marketable.length}  (existing_customer basis)`);
console.log(`  internal      ${internal.length}  (never marketed to)`);
console.log(`  missing phone ${noPhone.length}`);
console.log(`  missing email ${noEmail.length}`);

if (problems.length) {
  console.log(`\n${problems.length} thing(s) needing a human:`);
  for (const p of problems) console.log(`  ${p}`);
}

if (noPhone.length) {
  console.log('\nNo cell number yet:');
  for (const c of noPhone) {
    console.log(`  ${(c.orgSlug ?? '—').padEnd(28)} ${[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}`);
  }
}

// ── Apply ───────────────────────────────────────────────────────────────────

if (!APPLY) {
  console.log('\nRe-run with --apply to write.\n');
  await conn.end();
  process.exit(0);
}

const orgIds = new Map<string, number>();
for (const o of orgs.values()) {
  await conn.execute(
    `INSERT INTO organisations (slug, name, stage, website, industry, address)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), stage = VALUES(stage),
       website = COALESCE(organisations.website, VALUES(website)),
       industry = COALESCE(organisations.industry, VALUES(industry)),
       address = COALESCE(organisations.address, VALUES(address))`,
    [o.slug, o.name, o.stage, o.website, o.industry, o.address],
  );
  const [row] = await q<{ id: number }>(`SELECT id FROM organisations WHERE slug = ?`, [o.slug]);
  orgIds.set(o.slug, row.id);
}
console.log(`\n✓ ${orgIds.size} organisations`);

let inserted = 0;
let updated = 0;
for (const c of final) {
  const isInternal = isInternalEmail(c.email);
  const basis = isInternal ? 'none' : c.stage === 'client' ? 'existing_customer' : 'none';
  const existing = c.email
    ? await q<{ id: number }>(`SELECT id FROM contacts WHERE email = ?`, [c.email])
    : c.phone
      ? await q<{ id: number }>(`SELECT id FROM contacts WHERE phone = ?`, [c.phone])
      : [];

  if (existing.length) {
    await conn.execute(
      `UPDATE contacts SET
         organisationId = COALESCE(organisationId, ?),
         firstName = COALESCE(firstName, ?), lastName = COALESCE(lastName, ?),
         email = COALESCE(email, ?), phone = COALESCE(phone, ?)
       WHERE id = ?`,
      [c.orgSlug ? orgIds.get(c.orgSlug) ?? null : null, c.firstName, c.lastName, c.email, c.phone, existing[0].id],
    );
    updated++;
    continue;
  }

  await conn.execute(
    `INSERT INTO contacts
      (organisationId, firstName, lastName, email, phone, isPrimary, isInternal,
       consentBasis, consentSource, consentAt, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.orgSlug ? orgIds.get(c.orgSlug) ?? null : null,
      c.firstName, c.lastName, c.email, c.phone,
      c.isPrimary ? 1 : 0, isInternal ? 1 : 0,
      basis,
      basis === 'none' ? null : CONSENT_SOURCE,
      basis === 'none' ? null : new Date(),
      c.source,
    ],
  );
  inserted++;
}
console.log(`✓ ${inserted} contacts inserted, ${updated} updated`);

for (const l of leadRows) {
  const slug = MANUAL_ORG_MATCHES[l.name.trim().toLowerCase()] ?? slugify(l.name);
  const id = orgIds.get(slug);
  if (id) await conn.execute(`UPDATE leads SET organisationId = ? WHERE id = ?`, [id, l.id]);
}
for (const p of prospectRows) {
  const slug = MANUAL_ORG_MATCHES[p.businessName.trim().toLowerCase()] ?? slugify(p.businessName);
  const id = orgIds.get(slug);
  if (id) await conn.execute(`UPDATE outreachProspects SET organisationId = ? WHERE id = ?`, [id, p.id]);
}
console.log('✓ leads and prospects linked to organisations\n');

await conn.end();
