/**
 * Contact normalisation, shared by the server and the backfill script so the
 * two can never disagree about what a phone number is.
 */

/** GD's own people — never marketing targets, whatever list they turn up on. */
export const INTERNAL_EMAIL_DOMAINS = ['grodigital.co.za'];

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/**
 * Invisible characters that arrive with numbers copied out of phones and chat
 * apps: bidi embedding and isolate marks, zero-width joiners, non-breaking
 * space. One of these is wrapped around a real number in clientProfiles, and it
 * breaks both sending and any attempt to match on the value.
 */
const INVISIBLE_RE = /[\u00a0\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * A South African number in E.164, or null if it cannot be read as one.
 *
 * Four formats were in use — "082 331 6651", "0724849014",
 * "+27 71 896 3934" and a bidi-wrapped variant. WhatsApp and SMS both need
 * E.164, and dedupe is meaningless until every number is written one way.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(INVISIBLE_RE, '').trim();
  const plus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  if (!plus && digits.length === 9) return `+27${digits}`;
  // Already international and not South African — keep it rather than mangle it.
  if (plus && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Every address in a field that may hold a list. */
export function splitEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .replace(INVISIBLE_RE, '')
    .split(/[,;]+|\s+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => EMAIL_RE.test(p));
  return Array.from(new Set(parts));
}

export function isValidEmail(raw: string | null | undefined): boolean {
  return !!raw && EMAIL_RE.test(raw.trim().toLowerCase());
}

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return !!domain && INTERNAL_EMAIL_DOMAINS.includes(domain);
}

export function splitName(raw: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const cleaned = (raw ?? '').replace(INVISIBLE_RE, '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: null, lastName: null };
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function displayName(c: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return name || c.email || 'Unnamed contact';
}

/**
 * Whether a contact may receive marketing on a given rail.
 *
 * POPIA s69(3)(a) permits direct marketing to an existing customer for similar
 * services while every message carries an opt-out, so existing_customer is a
 * lawful basis for email and SMS. WhatsApp is stricter and not for legal
 * reasons: Meta requires a WhatsApp-specific opt-in for marketing templates and
 * enforces it through the number's quality rating, so sending without one risks
 * the whole WABA rather than a fine.
 */
export function canMarket(
  c: {
    consentBasis: 'none' | 'existing_customer' | 'explicit_optin';
    doNotContact: boolean;
    optedOutAt: Date | string | null;
    whatsappOptInAt: Date | string | null;
    isInternal: boolean;
    email: string | null;
    phone: string | null;
  },
  channel: 'email' | 'sms' | 'whatsapp',
): boolean {
  if (c.isInternal || c.doNotContact || c.optedOutAt) return false;
  if (c.consentBasis === 'none') return false;
  if (channel === 'email') return !!c.email;
  if (channel === 'sms') return !!c.phone;
  return !!c.phone && !!c.whatsappOptInAt;
}
