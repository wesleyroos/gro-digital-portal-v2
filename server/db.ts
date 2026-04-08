import { eq, inArray, sql, asc, desc, and, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import { InsertUser, InsertInvoice, InsertInvoiceItem, users, invoices, invoiceItems, tasks, clientProfiles, leads, henryMessages, subscriptions, agentMessages, proposals, proposalViews, marketingCampaigns, marketingPosts, campaignMessages, campaignAssets, campaignMailers, InsertMarketingPost, portalSettings, mailerChatMessages, mailerEvents, outreachProspects, InsertOutreachProspect, mediaFiles, InsertMediaFile, userActivity, recurringInvoiceConfig, InsertRecurringInvoiceConfig, aiInteractions, projects, quotes, InsertQuote } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'superAdmin';
      updateSet.role = 'superAdmin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClientUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users)
    .where(and(eq(users.email, email), eq(users.role, "client")))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClientUsersBySlug(clientSlug: string) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users).where(eq(users.clientSlug, clientSlug));
}

export async function createClientUser(data: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
  clientSlug: string | null;
  role?: "client" | "admin" | "superAdmin";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(users).values({
    openId: data.openId,
    name: data.name,
    email: data.email,
    loginMethod: "password",
    role: data.role ?? "client",
    clientSlug: data.clientSlug,
    passwordHash: data.passwordHash,
    lastSignedIn: new Date(),
  });
}

export async function updateUserProfile(openId: string, fields: { name?: string; email?: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(fields).where(eq(users.openId, openId));
}

export async function updateUserPasswordHash(openId: string, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
}

export async function deleteClientUser(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(users).where(eq(users.openId, openId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.createdAt);
}

export async function touchUserSeen(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.openId, openId));
}

export async function logUserActivity(data: {
  openId: string;
  action: string;
  path?: string;
  meta?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userActivity).values({
    openId: data.openId,
    action: data.action,
    path: data.path ?? null,
    meta: data.meta ?? null,
  });
}

export async function getUserActivity(openId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userActivity)
    .where(eq(userActivity.openId, openId))
    .orderBy(desc(userActivity.createdAt))
    .limit(limit);
}

export async function getUserByEmailWithPassword(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users)
    .where(and(eq(users.email, email), isNotNull(users.passwordHash)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserAssignedClients(openId: string, assignedClients: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ assignedClients: JSON.stringify(assignedClients) })
    .where(eq(users.openId, openId));
}

export async function updateUserRole(openId: string, role: "client" | "admin" | "superAdmin"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.openId, openId));
}

// ── Invoice queries ──

/**
 * Derives the 2-letter client prefix used in invoice numbers.
 * "bison-mining-supplies" → "BI", "igl" → "IG", "joe-bloggs" → "JO"
 */
function clientInvoicePrefix(clientSlug: string): string {
  const firstWord = clientSlug.split('-')[0] ?? clientSlug;
  return firstWord.slice(0, 2).toUpperCase();
}

/**
 * Returns the next invoice number in the INV-XX### sequence.
 * Scans all existing invoice numbers globally to find the highest number
 * for this client's prefix, then increments it. Falls back to 001 if none exist.
 */
export async function getNextInvoiceNumber(clientSlug: string): Promise<string> {
  const db = await getDb();
  const prefix = clientInvoicePrefix(clientSlug);
  const pattern = `INV-${prefix}%`;

  if (!db) return `INV-${prefix}001`;

  const rows = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${pattern}`);

  let max = 0;
  for (const { invoiceNumber } of rows) {
    const match = invoiceNumber.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }

  const next = String(max + 1).padStart(3, '0');
  return `INV-${prefix}${next}`;
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.invoiceNumber, invoiceNumber))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(invoiceItems.sortOrder);
}

export async function getAllInvoices() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(invoices).orderBy(invoices.invoiceDate);
}

export async function getInvoicesByClientSlug(clientSlug: string) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(invoices)
    .where(eq(invoices.clientSlug, clientSlug))
    .orderBy(invoices.invoiceDate);
}

export async function createInvoice(
  data: Omit<InsertInvoice, 'shareToken'>,
  items: Omit<InsertInvoiceItem, 'invoiceId' | 'sortOrder'>[]
): Promise<{ invoiceNumber: string; shareToken: string; clientSlug: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const shareToken = nanoid();

  const result = await db.insert(invoices).values({ ...data, shareToken }).$returningId();
  const invoiceId = result[0].id;

  if (items.length > 0) {
    await db.insert(invoiceItems).values(
      items.map((item, i) => ({ ...item, invoiceId, sortOrder: i + 1 }))
    );
  }

  return { invoiceNumber: data.invoiceNumber!, shareToken, clientSlug: data.clientSlug ?? '' };
}

export async function getInvoiceByShareToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(invoices).where(eq(invoices.shareToken, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteInvoice(invoiceNumber: string) {
  const db = await getDb();
  if (!db) return;
  const inv = await getInvoiceByNumber(invoiceNumber);
  if (!inv) return;
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
  await db.delete(invoices).where(eq(invoices.invoiceNumber, invoiceNumber));
}

export async function updateInvoiceStatus(id: number, status: 'draft' | 'sent' | 'paid' | 'overdue') {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set({ status }).where(eq(invoices.id, id));
}

export async function updateInvoicePaymentUrl(id: number, paymentUrl: string | null, paymentToken: string | null = null) {
  const db = await getDb();
  if (!db) return;

  await db.update(invoices).set({ paymentUrl, paymentToken }).where(eq(invoices.id, id));
}

export async function getMetrics() {
  const db = await getDb();
  if (!db) return null;

  // Recurring — from subscriptions table (not invoices, to avoid double-counting repeated billing)
  const [mrrRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${subscriptions.amount}), 0)` })
    .from(subscriptions)
    .where(sql`${subscriptions.type} = 'monthly' AND ${subscriptions.status} = 'active'`);

  const [annualRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${subscriptions.amount}), 0)` })
    .from(subscriptions)
    .where(sql`${subscriptions.type} = 'annual' AND ${subscriptions.status} = 'active'`);

  // Per-client recurring from subscriptions
  const clientSubs = await db
    .select({
      clientSlug: subscriptions.clientSlug,
      clientName: subscriptions.clientName,
      amount: subscriptions.amount,
      type: subscriptions.type,
    })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'));

  // Financial year: April–March
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = new Date(fyStartYear, 3, 1);   // 1 April
  const fyEnd   = new Date(fyStartYear + 1, 2, 31, 23, 59, 59); // 31 March
  const fyLabel = `FY${String(fyStartYear).slice(2)}/${String(fyStartYear + 1).slice(2)}`;

  // Project fees — collected this FY
  const [projectsCollectedRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(sql`${invoices.invoiceType} = 'once-off' AND ${invoices.status} = 'paid' AND ${invoices.invoiceDate} >= ${fyStart} AND ${invoices.invoiceDate} <= ${fyEnd}`);

  // Project fees — outstanding invoices
  const outstandingInvoices = await db
    .select({
      invoiceNumber: invoices.invoiceNumber,
      clientName: invoices.clientName,
      clientSlug: invoices.clientSlug,
      amountDue: invoices.amountDue,
      status: invoices.status,
    })
    .from(invoices)
    .where(sql`${invoices.invoiceType} = 'once-off' AND ${invoices.status} IN ('sent', 'overdue')`);

  // Monthly project revenue breakdown (April → March)
  const monthlyRevenueRaw = await db
    .select({
      yearMonth: sql<string>`DATE_FORMAT(${invoices.invoiceDate}, '%Y-%m')`,
      invoiceNumber: invoices.invoiceNumber,
      clientName: invoices.clientName,
      totalAmount: invoices.totalAmount,
    })
    .from(invoices)
    .where(sql`${invoices.invoiceType} = 'once-off' AND ${invoices.status} = 'paid' AND ${invoices.invoiceDate} >= ${fyStart} AND ${invoices.invoiceDate} <= ${fyEnd}`)
    .orderBy(invoices.invoiceDate);

  const monthlyRevenueMap = new Map<string, { total: number; invoices: { invoiceNumber: string; clientName: string; amount: number }[] }>();
  for (const r of monthlyRevenueRaw) {
    const amount = parseFloat(String(r.totalAmount)) || 0;
    const existing = monthlyRevenueMap.get(r.yearMonth);
    if (existing) {
      existing.total += amount;
      existing.invoices.push({ invoiceNumber: r.invoiceNumber!, clientName: r.clientName, amount });
    } else {
      monthlyRevenueMap.set(r.yearMonth, { total: amount, invoices: [{ invoiceNumber: r.invoiceNumber!, clientName: r.clientName, amount }] });
    }
  }

  const nowYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLabels = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const monthlyProjectRevenue = Array.from({ length: 12 }, (_, i) => {
    const jsMonth = (3 + i) % 12;
    const year = jsMonth >= 3 ? fyStartYear : fyStartYear + 1;
    const yearMonth = `${year}-${String(jsMonth + 1).padStart(2, '0')}`;
    const data = monthlyRevenueMap.get(yearMonth);
    return {
      label: monthLabels[i],
      yearMonth,
      total: data?.total || 0,
      invoices: data?.invoices || [],
      isFuture: yearMonth > nowYM,
      isCurrent: yearMonth === nowYM,
    };
  });

  const mrr = parseFloat(mrrRow.total) || 0;
  const annualRecurring = parseFloat(annualRow.total) || 0;
  const arr = mrr * 12 + annualRecurring;
  const projectsCollected = parseFloat(projectsCollectedRow.total) || 0;
  const projectsOutstanding = outstandingInvoices.reduce((s, i) => s + (parseFloat(String(i.amountDue)) || 0), 0);

  // Merge per-client recurring from subscriptions
  const clientMap = new Map<string, { clientSlug: string; clientName: string; mrr: number; annual: number }>();
  for (const s of clientSubs) {
    const amount = parseFloat(String(s.amount)) || 0;
    const existing = clientMap.get(s.clientSlug);
    if (existing) {
      if (s.type === 'monthly') existing.mrr += amount;
      else existing.annual += amount;
    } else {
      clientMap.set(s.clientSlug, {
        clientSlug: s.clientSlug,
        clientName: s.clientName,
        mrr: s.type === 'monthly' ? amount : 0,
        annual: s.type === 'annual' ? amount : 0,
      });
    }
  }

  return {
    // Recurring
    mrr,
    annualRecurring,
    arr,
    recurringClients: Array.from(clientMap.values()).sort((a, b) => (b.mrr + b.annual / 12) - (a.mrr + a.annual / 12)),
    // Projects
    fyStartYear,
    projectsCollected,
    projectsOutstanding,
    monthlyProjectRevenue,
    outstandingInvoices: outstandingInvoices.map(i => ({
      ...i,
      amountDue: parseFloat(String(i.amountDue)) || 0,
    })),
  };
}

export async function getDistinctClients() {
  const db = await getDb();
  if (!db) return [];

  // Clients derived from invoices
  const fromInvoices = await db
    .select({
      clientSlug: invoices.clientSlug,
      clientName: sql<string>`MAX(${invoices.clientName})`,
      clientContact: sql<string>`MAX(${invoices.clientContact})`,
      clientEmail: sql<string>`MAX(${invoices.clientEmail})`,
      clientPhone: sql<string>`MAX(${invoices.clientPhone})`,
      address: clientProfiles.address,
      analyticsToken: clientProfiles.analyticsToken,
      instagramUsername: clientProfiles.instagramUsername,
      facebookPageName: clientProfiles.facebookPageName,
      resendSegmentId: clientProfiles.resendSegmentId,
    })
    .from(invoices)
    .leftJoin(clientProfiles, eq(invoices.clientSlug, clientProfiles.clientSlug))
    .groupBy(invoices.clientSlug, clientProfiles.address, clientProfiles.analyticsToken, clientProfiles.instagramUsername, clientProfiles.facebookPageName, clientProfiles.resendSegmentId);

  const invoiceSlugs = new Set(fromInvoices.map(c => c.clientSlug));

  // Standalone clients that exist only in clientProfiles (no invoices yet)
  const allProfiles = await db.select().from(clientProfiles);
  const standaloneProfiles = allProfiles
    .filter(p => !invoiceSlugs.has(p.clientSlug))
    .map(p => ({
      clientSlug: p.clientSlug,
      clientName: p.name ?? p.clientSlug,
      clientContact: p.contact ?? null,
      clientEmail: p.email ?? null,
      clientPhone: p.phone ?? null,
      address: p.address ?? null,
      analyticsToken: p.analyticsToken ?? null,
      instagramUsername: p.instagramUsername ?? null,
      facebookPageName: p.facebookPageName ?? null,
      resendSegmentId: p.resendSegmentId ?? null,
    }));

  return [...fromInvoices, ...standaloneProfiles];
}

export async function createStandaloneClient(data: { clientSlug: string; name: string; contact?: string; email?: string; phone?: string }) {
  await upsertClientProfile(data.clientSlug, {
    name: data.name,
    contact: data.contact ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
  });
}

export async function deleteClientProfile(clientSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(clientProfiles).where(eq(clientProfiles.clientSlug, clientSlug));
}

// ── Task queries ──

export async function getTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).orderBy(tasks.createdAt);
}

export async function createTask(
  text: string,
  clientSlug?: string | null,
  clientName?: string | null,
  opts?: { status?: string; dueDate?: string | null; priority?: string | null; notes?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(tasks).values({
    text,
    clientSlug: clientSlug ?? null,
    clientName: clientName ?? null,
    status: opts?.status ?? 'todo',
    dueDate: opts?.dueDate ? new Date(opts.dueDate) : null,
    priority: opts?.priority ?? null,
    notes: opts?.notes ?? null,
  });
}

export async function setTaskDone(id: number, done: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ status: done ? 'done' : 'todo' }).where(eq(tasks.id, id));
}

export async function updateTask(
  id: number,
  text: string,
  clientSlug?: string | null,
  clientName?: string | null,
  opts?: { status?: string; dueDate?: string | null; priority?: string | null; notes?: string | null },
) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({
    text,
    clientSlug: clientSlug ?? null,
    clientName: clientName ?? null,
    ...(opts?.status !== undefined ? {
      status: opts.status,
      resolvedAt: opts.status === "resolved" ? new Date() : null,
    } : {}),
    ...(opts && 'dueDate' in opts ? { dueDate: opts.dueDate ? new Date(opts.dueDate) : null } : {}),
    ...(opts && 'priority' in opts ? { priority: opts.priority ?? null } : {}),
    ...(opts && 'notes' in opts ? { notes: opts.notes ?? null } : {}),
  }).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ── Client profile queries ──

export async function getClientProfile(clientSlug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(clientProfiles).where(eq(clientProfiles.clientSlug, clientSlug)).limit(1);
  return result[0] ?? null;
}

export async function upsertClientProfile(clientSlug: string, fields: { notes?: string | null; address?: string | null; name?: string | null; contact?: string | null; email?: string | null; phone?: string | null; analyticsEmbed?: string | null; analyticsToken?: string | null }) {
  const db = await getDb();
  if (!db) return;
  const values: Record<string, unknown> = { clientSlug };
  const updateSet: Record<string, unknown> = {};
  const fieldKeys = ['notes', 'address', 'name', 'contact', 'email', 'phone', 'analyticsEmbed', 'analyticsToken'] as const;
  for (const key of fieldKeys) {
    if (key in fields) { values[key] = fields[key] ?? null; updateSet[key] = fields[key] ?? null; }
  }
  await db.insert(clientProfiles)
    .values(values as any)
    .onDuplicateKeyUpdate({ set: updateSet });
}

// ── Invoice update ──

export async function updateInvoice(
  invoiceNumber: string,
  data: Omit<InsertInvoice, 'shareToken' | 'invoiceNumber'>,
  items: Omit<InsertInvoiceItem, 'invoiceId' | 'sortOrder'>[]
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [existing] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
  if (!existing) throw new Error('Invoice not found');

  await db.update(invoices).set(data).where(eq(invoices.invoiceNumber, invoiceNumber));

  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, existing.id));

  if (items.length > 0) {
    await db.insert(invoiceItems).values(
      items.map((item, i) => ({ ...item, invoiceId: existing.id, sortOrder: i + 1 }))
    );
  }
}

// ── Email ──

export async function sendWelcomeEmail(opts: {
  name: string;
  email: string;
  password: string;
  portalUrl: string;
}) {
  const { Resend } = await import('resend');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const resend = new Resend(apiKey);
  const loginUrl = `${opts.portalUrl}/portal`;
  const firstName = opts.name.split(' ')[0];

  await resend.emails.send({
    from: 'Gro Digital <hello@grodigital.co.za>',
    to: opts.email,
    subject: 'Welcome to your Gro Digital client portal',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Gro Digital</title>
</head>
<body style="margin:0;padding:0;background-color:#EDF2F7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDF2F7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <img src="https://pub-7689bb2e0fe5474fb166518d32366c41.r2.dev/media/1773510512118-7qummfmnmo2.jpeg"
                   alt="Gro Digital" height="44"
                   style="height:44px;display:block;border-radius:6px;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(58,155,213,0.10);overflow:hidden;">

              <!-- Blue header band -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#3A9BD5 0%,#2D7AB6 100%);padding:32px 36px 28px;">
                    <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:2px;">Client Portal</p>
                    <h1 style="margin:8px 0 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">Welcome, ${firstName}!</h1>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:32px 36px;">

                    <p style="margin:0 0 16px;font-size:15px;color:#2D3748;line-height:1.6;">
                      Your Gro Digital client portal account is ready. Use the details below to sign in and access your invoices, proposals, and project updates.
                    </p>

                    <!-- Credentials box -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7FAFC;border:1px solid #E2E8F0;border-radius:10px;margin:24px 0;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#3A9BD5;text-transform:uppercase;letter-spacing:1.5px;">Your login details</p>

                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding:6px 0;border-bottom:1px solid #E2E8F0;">
                                <span style="font-size:12px;color:#718096;">Email</span><br/>
                                <span style="font-size:14px;font-weight:600;color:#1A202C;">${opts.email}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0 0;">
                                <span style="font-size:12px;color:#718096;">Temporary password</span><br/>
                                <span style="font-size:14px;font-weight:600;color:#1A202C;font-family:monospace;letter-spacing:0.5px;">${opts.password}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 24px;font-size:13px;color:#718096;line-height:1.5;">
                      We recommend changing your password after your first sign-in. If you have any trouble accessing the portal, reply to this email and we'll help you out.
                    </p>

                    <!-- CTA button -->
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#3A9BD5 0%,#2D7AB6 100%);border-radius:10px;">
                          <a href="${loginUrl}"
                             style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                            Sign in to your portal →
                          </a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 8px;" align="center">
              <p style="margin:0;font-size:12px;color:#A0AEC0;line-height:1.6;">
                Gro Digital (Pty) Ltd &bull; <a href="https://grodigital.co.za" style="color:#A0AEC0;text-decoration:none;">grodigital.co.za</a><br/>
                Questions? Email us at <a href="mailto:hello@grodigital.co.za" style="color:#3A9BD5;text-decoration:none;">hello@grodigital.co.za</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  });
}

export async function sendInvoiceEmail(invoiceId: number, recipientEmail: string, baseUrl: string) {
  const { Resend } = await import('resend');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new Error('Invoice not found');
  if (!invoice.shareToken) throw new Error('Invoice has no share token');

  const invoiceUrl = `${baseUrl}/i/${invoice.shareToken}`;
  const amountDue = parseFloat(String(invoice.amountDue)) || 0;
  const formattedAmount = `R${amountDue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'Wesley @ Gro Digital <wesley@grodigital.co.za>',
    to: recipientEmail,
    subject: `Invoice ${invoice.invoiceNumber} from Gro Digital`,

    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">

        <!-- Header bar -->
        <div style="background: #ffffff; padding: 28px 32px 20px; border: 1px solid #e5e7eb; border-bottom: 3px solid #2286c2; border-radius: 12px 12px 0 0;">
          <img src="https://pub-7689bb2e0fe5474fb166518d32366c41.r2.dev/media/1773557375019-ei1drt50gii.png"
               alt="Gro Digital" style="height: 32px; display: block;" />
        </div>

        <!-- Body -->
        <div style="padding: 36px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">

          <p style="font-size: 16px; font-weight: 600; margin: 0 0 6px; color: #111;">Hi ${(invoice.clientContact || '').split(' ')[0] || invoice.clientName?.split(' ')[0] || 'there'},</p>
          <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 28px;">
            Please find your invoice <strong style="color: #111;">${invoice.invoiceNumber}</strong> from Gro Digital attached below.
            ${invoice.projectName ? `This relates to <strong style="color: #111;">${invoice.projectName}</strong>.` : ''}
          </p>

          <!-- Amount card -->
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 22px 26px; margin-bottom: 28px;">
            <p style="margin: 0 0 6px; font-size: 11px; color: #2286c2; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Amount Due</p>
            <p style="margin: 0; font-size: 34px; font-weight: 800; color: #111; letter-spacing: -1px;">${formattedAmount}</p>
            ${invoice.paymentTerms ? `<p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">${invoice.paymentTerms}</p>` : ''}
          </div>

          <a href="${invoiceUrl}" style="display: inline-block; background: #2286c2; color: #fff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-bottom: 32px; letter-spacing: 0.2px;">
            View Invoice →
          </a>

          <p style="font-size: 12px; color: #9ca3af; margin: 0; padding-top: 24px; border-top: 1px solid #f3f4f6;">
            Gro Digital (Pty) Ltd &bull; <a href="https://grodigital.co.za" style="color: #2286c2; text-decoration: none;">grodigital.co.za</a><br/>
            Questions? Email <a href="mailto:wesley@grodigital.co.za" style="color: #2286c2; text-decoration: none;">wesley@grodigital.co.za</a>
          </p>
        </div>
      </div>
    `,
  });
}

export async function markOverdueInvoices() {
  const db = await getDb();
  if (!db) return;
  await db
    .update(invoices)
    .set({ status: 'overdue' })
    .where(sql`${invoices.status} = 'sent' AND ${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} < NOW()`);
}

// ── Leads ───────────────────────────────────────────────────────────────────

export async function getLeads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).orderBy(leads.createdAt);
}

export async function createLead(data: {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  monthlyValue?: number | null;
  onceOffValue?: number | null;
  stage?: 'prospect' | 'proposal' | 'negotiation';
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const [result] = await db.insert(leads).values({
    name: data.name,
    contactName: data.contactName ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    monthlyValue: data.monthlyValue != null ? String(data.monthlyValue) : null,
    onceOffValue: data.onceOffValue != null ? String(data.onceOffValue) : null,
    stage: data.stage ?? 'prospect',
    notes: data.notes ?? null,
  });
  return result.insertId as number;
}

export async function updateLead(id: number, data: {
  name?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  monthlyValue?: number | null;
  onceOffValue?: number | null;
  stage?: 'prospect' | 'proposal' | 'negotiation';
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const set: Record<string, unknown> = {};
  if (data.name !== undefined) set.name = data.name;
  if ('contactName' in data) set.contactName = data.contactName ?? null;
  if ('contactEmail' in data) set.contactEmail = data.contactEmail ?? null;
  if ('contactPhone' in data) set.contactPhone = data.contactPhone ?? null;
  if ('monthlyValue' in data) set.monthlyValue = data.monthlyValue != null ? String(data.monthlyValue) : null;
  if ('onceOffValue' in data) set.onceOffValue = data.onceOffValue != null ? String(data.onceOffValue) : null;
  if ('stage' in data) set.stage = data.stage;
  if ('notes' in data) set.notes = data.notes ?? null;
  await db.update(leads).set(set).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.delete(leads).where(eq(leads.id, id));
}

// ── Henry chat history ────────────────────────────────────────────────────────

export async function getHenryHistory(openId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ role: henryMessages.role, content: henryMessages.content })
    .from(henryMessages)
    .where(eq(henryMessages.openId, openId))
    .orderBy(asc(henryMessages.createdAt))
    .limit(100);
}

export async function appendHenryMessages(openId: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const db = await getDb();
  if (!db) return;
  await db.insert(henryMessages).values(messages.map(m => ({ openId, role: m.role, content: m.content })));
}

// ── Specialist agent chat history ─────────────────────────────────────────────

export async function getAgentHistory(openId: string, agentSlug: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ role: agentMessages.role, content: agentMessages.content })
    .from(agentMessages)
    .where(eq(agentMessages.openId, openId))
    .where(eq(agentMessages.agentSlug, agentSlug))
    .orderBy(asc(agentMessages.createdAt))
    .limit(100);
}

export async function appendAgentMessages(openId: string, agentSlug: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const db = await getDb();
  if (!db) return;
  await db.insert(agentMessages).values(messages.map(m => ({ openId, agentSlug, role: m.role, content: m.content })));
}

// ── Google OAuth tokens ───────────────────────────────────────────────────────

export async function storeGoogleTokens(openId: string, refreshToken: string, connectedEmail: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ googleRefreshToken: refreshToken, googleConnectedEmail: connectedEmail }).where(eq(users.openId, openId));
}

export async function clearGoogleTokens(openId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ googleRefreshToken: null, googleConnectedEmail: null }).where(eq(users.openId, openId));
}

export async function getGoogleRefreshToken(openId: string): Promise<{ refreshToken: string; connectedEmail: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ googleRefreshToken: users.googleRefreshToken, googleConnectedEmail: users.googleConnectedEmail })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  if (result.length === 0) return null;
  const { googleRefreshToken, googleConnectedEmail } = result[0];
  if (!googleRefreshToken || !googleConnectedEmail) return null;
  return { refreshToken: googleRefreshToken, connectedEmail: googleConnectedEmail };
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export async function getSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptions).orderBy(subscriptions.clientName);
}

export async function createSubscription(data: {
  clientSlug: string;
  clientName: string;
  description?: string | null;
  amount: number;
  type: 'monthly' | 'annual';
  status?: 'active' | 'paused' | 'cancelled';
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(subscriptions).values({
    clientSlug: data.clientSlug,
    clientName: data.clientName,
    description: data.description ?? null,
    amount: String(data.amount) as any,
    type: data.type,
    status: data.status ?? 'active',
  });
}

export async function updateSubscription(id: number, data: {
  clientSlug?: string;
  clientName?: string;
  description?: string | null;
  amount?: number;
  type?: 'monthly' | 'annual';
  status?: 'active' | 'paused' | 'cancelled';
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = {};
  if (data.clientSlug !== undefined) set.clientSlug = data.clientSlug;
  if (data.clientName !== undefined) set.clientName = data.clientName;
  if ('description' in data) set.description = data.description ?? null;
  if (data.amount !== undefined) set.amount = String(data.amount);
  if (data.type !== undefined) set.type = data.type;
  if (data.status !== undefined) set.status = data.status;
  await db.update(subscriptions).set(set).where(eq(subscriptions.id, id));
}

export async function deleteSubscription(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export async function getProposals() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proposals).orderBy(desc(proposals.createdAt));
}

export async function getProposalsByClient(clientSlug: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proposals)
    .where(eq(proposals.clientSlug, clientSlug))
    .orderBy(desc(proposals.createdAt));
}

export async function getProposalByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(proposals).where(eq(proposals.token, token)).limit(1);
  return result[0] ?? null;
}

export async function createProposal(data: {
  title: string;
  htmlContent: string;
  status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined';
  assignedType?: 'client' | 'lead' | 'none';
  assignedName?: string | null;
  clientSlug?: string | null;
  leadId?: number | null;
  externalEmail?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const token = nanoid(21);
  await db.insert(proposals).values({
    token,
    title: data.title,
    htmlContent: data.htmlContent,
    status: data.status ?? 'draft',
    assignedType: data.assignedType ?? 'none',
    assignedName: data.assignedName ?? null,
    clientSlug: data.clientSlug ?? null,
    leadId: data.leadId ?? null,
    externalEmail: data.externalEmail ?? null,
  });
  return token;
}

export async function updateProposal(id: number, data: {
  title?: string;
  htmlContent?: string;
  status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined';
  assignedType?: 'client' | 'lead' | 'none';
  assignedName?: string | null;
  clientSlug?: string | null;
  leadId?: number | null;
  externalEmail?: string | null;
  sentAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = {};
  if (data.title !== undefined) set.title = data.title;
  if (data.htmlContent !== undefined) set.htmlContent = data.htmlContent;
  if (data.status !== undefined) set.status = data.status;
  if ('assignedType' in data) set.assignedType = data.assignedType;
  if ('assignedName' in data) set.assignedName = data.assignedName ?? null;
  if ('clientSlug' in data) set.clientSlug = data.clientSlug ?? null;
  if ('leadId' in data) set.leadId = data.leadId ?? null;
  if ('externalEmail' in data) set.externalEmail = data.externalEmail ?? null;
  if ('sentAt' in data) set.sentAt = data.sentAt ?? null;
  await db.update(proposals).set(set).where(eq(proposals.id, id));
}

export async function markProposalViewed(token: string, viewerIp?: string, viewerLocation?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(proposals)
    .set({ status: 'viewed', viewedAt: new Date(), viewerIp: viewerIp ?? null, viewerLocation: viewerLocation ?? null })
    .where(sql`${proposals.token} = ${token} AND ${proposals.status} = 'sent'`);
}

export async function logProposalView(proposalId: number, viewerIp?: string, viewerLocation?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(proposalViews).values({ proposalId, viewerIp: viewerIp ?? null, viewerLocation: viewerLocation ?? null });
}

export async function getProposalViewLog(proposalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proposalViews)
    .where(eq(proposalViews.proposalId, proposalId))
    .orderBy(sql`${proposalViews.viewedAt} DESC`);
}

export async function acceptProposal(token: string, email: string) {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db' };
  const proposal = await getProposalByToken(token);
  if (!proposal) return { ok: false, reason: 'not_found' };
  if (proposal.status === 'accepted') return { ok: false, reason: 'already_accepted' };
  if (proposal.status === 'draft') return { ok: false, reason: 'not_sent' };
  await db.update(proposals)
    .set({ status: 'accepted', acceptedAt: new Date(), acceptedBy: email })
    .where(eq(proposals.token, token));
  return { ok: true };
}

export async function deleteProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(proposals).where(eq(proposals.id, id));
}

// ── Client analytics ──────────────────────────────────────────────────────────

export async function setClientAnalytics(clientSlug: string, analyticsEmbed: string) {
  const existing = await getClientProfile(clientSlug);
  const token = existing?.analyticsToken ?? nanoid(21);
  await upsertClientProfile(clientSlug, { analyticsEmbed, analyticsToken: token });
  return token;
}

export async function clearClientAnalytics(clientSlug: string) {
  await upsertClientProfile(clientSlug, { analyticsEmbed: null, analyticsToken: null });
}

export async function getClientByAnalyticsToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({
      clientSlug: clientProfiles.clientSlug,
      name: clientProfiles.name,
      analyticsEmbed: clientProfiles.analyticsEmbed,
    })
    .from(clientProfiles)
    .where(eq(clientProfiles.analyticsToken, token))
    .limit(1);
  return result[0] ?? null;
}

export async function getOutstandingInvoices() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      invoiceNumber: invoices.invoiceNumber,
      clientName: invoices.clientName,
      projectName: invoices.projectName,
      amountDue: invoices.amountDue,
      status: invoices.status,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(sql`${invoices.status} IN ('sent', 'overdue')`)
    .orderBy(asc(invoices.dueDate));
}

// ── Marketing campaigns ────────────────────────────────────────────────────────

export async function getCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt));
}

export async function getCampaignsByClientSlug(clientSlug: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketingCampaigns).where(eq(marketingCampaigns.clientSlug, clientSlug)).orderBy(desc(marketingCampaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createCampaign(data: {
  clientSlug: string;
  name: string;
  createdBy?: string;
  postToInstagram?: boolean;
  postToFacebook?: boolean;
  postToLinkedin?: boolean;
  postToEmail?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(marketingCampaigns).values({
    clientSlug: data.clientSlug,
    name: data.name,
    status: 'discovery',
    createdBy: data.createdBy ?? null,
    postToInstagram: data.postToInstagram ?? true,
    postToFacebook: data.postToFacebook ?? false,
    postToLinkedin: data.postToLinkedin ?? false,
    postToEmail: data.postToEmail ?? false,
  }).$returningId();
  return result[0].id;
}

export async function updateCampaign(id: number, data: {
  status?: 'discovery' | 'strategy' | 'generating' | 'approval' | 'active' | 'completed';
  strategy?: string | null;
  brandVoice?: string | null;
  targetAudience?: string | null;
  contentThemes?: string | null;
  postsPerWeek?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  imageModel?: string | null;
  imageStyle?: string | null;
  imageAspectRatio?: string | null;
  shareToken?: string | null;
  sharePassword?: string | null;
  postToInstagram?: boolean;
  postToFacebook?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = {};
  if (data.status !== undefined) set.status = data.status;
  if ('strategy' in data) set.strategy = data.strategy ?? null;
  if ('brandVoice' in data) set.brandVoice = data.brandVoice ?? null;
  if ('targetAudience' in data) set.targetAudience = data.targetAudience ?? null;
  if ('contentThemes' in data) set.contentThemes = data.contentThemes ?? null;
  if ('postsPerWeek' in data) set.postsPerWeek = data.postsPerWeek ?? null;
  if ('startDate' in data) set.startDate = data.startDate ? new Date(data.startDate) : null;
  if ('endDate' in data) set.endDate = data.endDate ? new Date(data.endDate) : null;
  if ('imageModel' in data) set.imageModel = data.imageModel ?? 'dall-e-3';
  if ('imageStyle' in data) set.imageStyle = data.imageStyle ?? '';
  if ('imageAspectRatio' in data) set.imageAspectRatio = data.imageAspectRatio ?? '1:1';
  if ('shareToken' in data) set.shareToken = data.shareToken ?? null;
  if ('sharePassword' in data) set.sharePassword = data.sharePassword ?? null;
  if ('postToInstagram' in data) set.postToInstagram = data.postToInstagram;
  if ('postToFacebook' in data) set.postToFacebook = data.postToFacebook;
  await db.update(marketingCampaigns).set(set).where(eq(marketingCampaigns.id, id));
}

export async function getCampaignByShareToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.shareToken, token)).limit(1);
  return result[0] ?? null;
}

// ── Marketing posts ────────────────────────────────────────────────────────────

export async function getPostsByCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketingPosts)
    .where(eq(marketingPosts.campaignId, campaignId))
    .orderBy(asc(marketingPosts.sortOrder), asc(marketingPosts.scheduledAt));
}

export async function getPostById(postId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(marketingPosts).where(eq(marketingPosts.id, postId)).limit(1);
  return result[0] ?? null;
}

export async function createPosts(posts: Omit<InsertMarketingPost, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (posts.length === 0) return;
  await db.insert(marketingPosts).values(posts);
}

export async function updatePostStatus(
  postId: number,
  status: 'draft' | 'approved' | 'rejected' | 'scheduled' | 'posted' | 'failed',
  extra?: { instagramPostId?: string; notes?: string }
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = { status };
  if (extra?.instagramPostId !== undefined) set.instagramPostId = extra.instagramPostId;
  if (extra?.notes !== undefined) set.notes = extra.notes;
  if (status === 'posted') set.postedAt = new Date();
  await db.update(marketingPosts).set(set).where(eq(marketingPosts.id, postId));
}

export async function updatePostContent(postId: number, data: { caption?: string; hashtags?: string; imagePrompt?: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = {};
  if (data.caption !== undefined) set.caption = data.caption;
  if (data.hashtags !== undefined) set.hashtags = data.hashtags;
  if (data.imagePrompt !== undefined) set.imagePrompt = data.imagePrompt;
  if (Object.keys(set).length === 0) return;
  await db.update(marketingPosts).set(set).where(eq(marketingPosts.id, postId));
}

export async function updatePostImageUrl(postId: number, imageUrl: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(marketingPosts).set({ imageUrl }).where(eq(marketingPosts.id, postId));
}

export async function updatePostVideo(postId: number, videoUrl: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(marketingPosts).set({ videoUrl, mediaType: 'video' }).where(eq(marketingPosts.id, postId));
}

export async function approveAllPosts(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(marketingPosts)
    .set({ status: 'approved' })
    .where(sql`${marketingPosts.campaignId} = ${campaignId} AND ${marketingPosts.status} = 'draft'`);
}

export async function getPostsDueForPublishing() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketingPosts)
    .where(sql`${marketingPosts.status} IN ('approved', 'scheduled') AND ${marketingPosts.scheduledAt} IS NOT NULL AND ${marketingPosts.scheduledAt} <= NOW()`);
}

// ── Campaign messages ─────────────────────────────────────────────────────────

export async function getCampaignMessages(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignMessages)
    .where(eq(campaignMessages.campaignId, campaignId))
    .orderBy(asc(campaignMessages.createdAt));
}

export async function appendCampaignMessages(campaignId: number, messages: Array<{
  role: string;
  content: string;
  toolCallId?: string | null;
  toolName?: string | null;
}>) {
  const db = await getDb();
  if (!db) return;
  await db.insert(campaignMessages).values(
    messages.map(m => ({
      campaignId,
      role: m.role,
      content: m.content,
      toolCallId: m.toolCallId ?? null,
      toolName: m.toolName ?? null,
    }))
  );
}

export async function deleteCampaign(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(campaignMessages).where(eq(campaignMessages.campaignId, id));
  await db.delete(marketingPosts).where(eq(marketingPosts.campaignId, id));
  await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
}

// ── Instagram tokens ──────────────────────────────────────────────────────────

export async function storeInstagramTokens(clientSlug: string, businessId: string, accessToken: string, username: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clientProfiles)
    .values({ clientSlug, instagramBusinessId: businessId, instagramAccessToken: accessToken, instagramUsername: username } as any)
    .onDuplicateKeyUpdate({ set: { instagramBusinessId: businessId, instagramAccessToken: accessToken, instagramUsername: username } });
}

export async function clearInstagramTokens(clientSlug: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(clientProfiles)
    .set({ instagramBusinessId: null, instagramAccessToken: null, instagramUsername: null })
    .where(eq(clientProfiles.clientSlug, clientSlug));
}

export async function getInstagramTokens(clientSlug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ instagramBusinessId: clientProfiles.instagramBusinessId, instagramAccessToken: clientProfiles.instagramAccessToken, instagramUsername: clientProfiles.instagramUsername })
    .from(clientProfiles)
    .where(eq(clientProfiles.clientSlug, clientSlug))
    .limit(1);
  if (result.length === 0) return null;
  const { instagramBusinessId, instagramAccessToken, instagramUsername } = result[0];
  if (!instagramBusinessId || !instagramAccessToken) return null;
  return { businessId: instagramBusinessId, accessToken: instagramAccessToken, username: instagramUsername ?? '' };
}

// ── Facebook page tokens ───────────────────────────────────────────────────────

export async function storeFacebookPage(clientSlug: string, pageId: string, pageAccessToken: string, pageName: string, userToken?: string) {
  const db = await getDb();
  if (!db) return;
  console.log(`[storeFacebookPage] clientSlug=${clientSlug} userToken=${userToken ? userToken.substring(0, 20) + '...' : 'NOT PROVIDED'}`);
  const set: Record<string, unknown> = { facebookPageId: pageId, facebookPageAccessToken: pageAccessToken, facebookPageName: pageName };
  if (userToken) set.facebookUserToken = userToken;
  await db.insert(clientProfiles)
    .values({ clientSlug, ...set } as any)
    .onDuplicateKeyUpdate({ set: set as any });
}

export async function clearFacebookTokens(clientSlug: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(clientProfiles)
    .set({ facebookPageId: null, facebookPageAccessToken: null, facebookPageName: null, facebookUserToken: null } as any)
    .where(eq(clientProfiles.clientSlug, clientSlug));
}

export async function getFacebookTokens(clientSlug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ facebookPageId: clientProfiles.facebookPageId, facebookPageAccessToken: clientProfiles.facebookPageAccessToken, facebookPageName: clientProfiles.facebookPageName, facebookUserToken: (clientProfiles as any).facebookUserToken })
    .from(clientProfiles)
    .where(eq(clientProfiles.clientSlug, clientSlug))
    .limit(1);
  if (result.length === 0) return null;
  const { facebookPageId, facebookPageAccessToken, facebookPageName, facebookUserToken } = result[0];
  if (!facebookPageId || !facebookPageAccessToken) return null;
  return { pageId: facebookPageId, pageAccessToken: facebookPageAccessToken, pageName: facebookPageName ?? '', userToken: facebookUserToken ?? null };
}

export async function updatePostFacebookId(postId: number, facebookPostId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Also stamp postedAt if not already set (covers FB-only posts)
  await db.update(marketingPosts)
    .set({ facebookPostId, postedAt: new Date() })
    .where(eq(marketingPosts.id, postId));
}

// ── LinkedIn tokens ────────────────────────────────────────────────────────────

export async function storeLinkedinTokens(
  clientSlug: string,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiresAt: Date,
  personUrn: string,
  orgId?: string,
  orgName?: string,
) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {
    linkedinAccessToken: accessToken,
    linkedinRefreshToken: refreshToken,
    linkedinTokenExpiresAt: tokenExpiresAt,
    linkedinPersonUrn: personUrn,
  };
  if (orgId) set.linkedinOrganizationId = orgId;
  if (orgName) set.linkedinOrganizationName = orgName;
  await db.insert(clientProfiles)
    .values({ clientSlug, ...set } as any)
    .onDuplicateKeyUpdate({ set: set as any });
}

export async function clearLinkedinTokens(clientSlug: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(clientProfiles)
    .set({
      linkedinAccessToken: null,
      linkedinRefreshToken: null,
      linkedinTokenExpiresAt: null,
      linkedinPersonUrn: null,
      linkedinOrganizationId: null,
      linkedinOrganizationName: null,
      linkedinPostTarget: 'personal',
    } as any)
    .where(eq(clientProfiles.clientSlug, clientSlug));
}

export async function getLinkedinTokens(clientSlug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({
      linkedinAccessToken: (clientProfiles as any).linkedinAccessToken,
      linkedinRefreshToken: (clientProfiles as any).linkedinRefreshToken,
      linkedinTokenExpiresAt: (clientProfiles as any).linkedinTokenExpiresAt,
      linkedinPersonUrn: (clientProfiles as any).linkedinPersonUrn,
      linkedinOrganizationId: (clientProfiles as any).linkedinOrganizationId,
      linkedinOrganizationName: (clientProfiles as any).linkedinOrganizationName,
      linkedinPostTarget: (clientProfiles as any).linkedinPostTarget,
    })
    .from(clientProfiles)
    .where(eq(clientProfiles.clientSlug, clientSlug))
    .limit(1);
  if (!result[0]?.linkedinAccessToken) return null;
  const r = result[0];
  return {
    accessToken: r.linkedinAccessToken as string,
    refreshToken: r.linkedinRefreshToken as string | null,
    tokenExpiresAt: r.linkedinTokenExpiresAt as Date | null,
    personUrn: r.linkedinPersonUrn as string,
    orgId: r.linkedinOrganizationId as string | null,
    orgName: r.linkedinOrganizationName as string | null,
    postTarget: (r.linkedinPostTarget ?? 'personal') as 'personal' | 'organization',
  };
}

export async function updateLinkedinTokens(clientSlug: string, accessToken: string, refreshToken: string | null, tokenExpiresAt: Date) {
  const db = await getDb();
  if (!db) return;
  await db.update(clientProfiles)
    .set({ linkedinAccessToken: accessToken, linkedinRefreshToken: refreshToken, linkedinTokenExpiresAt: tokenExpiresAt } as any)
    .where(eq(clientProfiles.clientSlug, clientSlug));
}

export async function updatePostLinkedinId(postId: number, linkedinPostId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(marketingPosts)
    .set({ linkedinPostId, postedAt: new Date() } as any)
    .where(eq(marketingPosts.id, postId));
}

export async function setLinkedinPostTarget(clientSlug: string, target: 'personal' | 'organization') {
  const db = await getDb();
  if (!db) return;
  await db.update(clientProfiles)
    .set({ linkedinPostTarget: target } as any)
    .where(eq(clientProfiles.clientSlug, clientSlug));
}

export async function updatePostLinkedinCaption(postId: number, linkedinCaption: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(marketingPosts)
    .set({ linkedinCaption } as any)
    .where(eq(marketingPosts.id, postId));
}

export async function getCampaignAssetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(campaignAssets).where(eq(campaignAssets.id, id)).limit(1);
  return rows[0];
}

export async function getCampaignAssets(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignAssets).where(eq(campaignAssets.campaignId, campaignId)).orderBy(asc(campaignAssets.createdAt));
}

export async function insertCampaignAsset(campaignId: number, url: string, label?: string | null, aiDescription?: string | null) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(campaignAssets).values({ campaignId, url, label: label ?? null, aiDescription: aiDescription ?? null });
  const rows = await db.select().from(campaignAssets).where(eq(campaignAssets.campaignId, campaignId)).orderBy(desc(campaignAssets.createdAt)).limit(1);
  return rows[0];
}

export async function updateCampaignAssetDescription(id: number, aiDescription: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(campaignAssets).set({ aiDescription }).where(eq(campaignAssets.id, id));
}

export async function deleteCampaignAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(campaignAssets).where(eq(campaignAssets.id, id));
}

export async function getCampaignMailers(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignMailers).where(eq(campaignMailers.campaignId, campaignId)).orderBy(asc(campaignMailers.createdAt));
}

export async function getPastScheduledMailers(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db.select({ id: campaignMailers.id, scheduledAt: campaignMailers.scheduledAt, resendBroadcastId: campaignMailers.resendBroadcastId })
    .from(campaignMailers)
    .where(and(
      eq(campaignMailers.campaignId, campaignId),
      eq(campaignMailers.status, 'scheduled'),
      lte(campaignMailers.scheduledAt, now),
    ));
}

export async function markMailerAsSent(id: number, sentAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(campaignMailers).set({ status: 'sent', sentAt }).where(eq(campaignMailers.id, id));
}

export async function createCampaignMailer(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(campaignMailers).values({ campaignId, subject: 'Untitled mailer', htmlContent: '' });
  const rows = await db.select().from(campaignMailers).where(eq(campaignMailers.campaignId, campaignId)).orderBy(desc(campaignMailers.createdAt)).limit(1);
  return rows[0];
}

export async function updateCampaignMailer(id: number, data: {
  subject?: string;
  previewText?: string | null;
  htmlContent?: string;
  status?: 'draft' | 'scheduled' | 'sent';
  scheduledAt?: Date | null;
  sentAt?: Date | null;
  notes?: string | null;
  sentCount?: number;
  resendBroadcastId?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = {};
  if (data.subject !== undefined) set.subject = data.subject;
  if (data.previewText !== undefined) set.previewText = data.previewText;
  if (data.htmlContent !== undefined) set.htmlContent = data.htmlContent;
  if (data.status !== undefined) set.status = data.status;
  if (data.scheduledAt !== undefined) set.scheduledAt = data.scheduledAt;
  if (data.sentAt !== undefined) set.sentAt = data.sentAt;
  if (data.notes !== undefined) set.notes = data.notes;
  if (data.sentCount !== undefined) set.sentCount = data.sentCount;
  if (data.resendBroadcastId !== undefined) set.resendBroadcastId = data.resendBroadcastId;
  if (Object.keys(set).length === 0) return;
  await db.update(campaignMailers).set(set).where(eq(campaignMailers.id, id));
}

export async function deleteCampaignMailer(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(campaignMailers).where(eq(campaignMailers.id, id));
}

export async function getCampaignMailerById(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const rows = await db.select().from(campaignMailers).where(eq(campaignMailers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getResendSegmentId(clientSlug: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ resendSegmentId: clientProfiles.resendSegmentId }).from(clientProfiles).where(eq(clientProfiles.clientSlug, clientSlug)).limit(1);
  return rows[0]?.resendSegmentId ?? null;
}

export async function setResendSegmentId(clientSlug: string, segmentId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(clientProfiles).values({ clientSlug, resendSegmentId: segmentId }).onDuplicateKeyUpdate({ set: { resendSegmentId: segmentId } });
}

// ── Portal settings ──

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portalSettings).where(eq(portalSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(portalSettings).values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

// ── Mailer chat ──

export async function getMailerChatMessages(mailerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mailerChatMessages).where(eq(mailerChatMessages.mailerId, mailerId)).orderBy(asc(mailerChatMessages.createdAt));
}

export async function insertMailerChatMessage(mailerId: number, role: 'user' | 'assistant', content: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(mailerChatMessages).values({ mailerId, role, content });
}

export async function clearMailerChatMessages(mailerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(mailerChatMessages).where(eq(mailerChatMessages.mailerId, mailerId));
}

// ── Outreach prospects ──

export async function getProspects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(outreachProspects).orderBy(desc(outreachProspects.createdAt));
}

export async function getProspectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(outreachProspects).where(eq(outreachProspects.id, id)).limit(1);
  return rows[0];
}

export async function createProspect(data: InsertOutreachProspect) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [result] = await db.insert(outreachProspects).values(data);
  return result.insertId as number;
}

export async function updateProspect(id: number, data: Partial<InsertOutreachProspect>) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(outreachProspects).set(data).where(eq(outreachProspects.id, id));
}

export async function deleteProspect(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(outreachProspects).where(eq(outreachProspects.id, id));
}

export async function bulkCreateProspects(rows: InsertOutreachProspect[]) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(outreachProspects).values(rows);
}

// ── Media library ──

export async function getMediaFiles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mediaFiles).orderBy(desc(mediaFiles.createdAt));
}

export async function insertMediaFile(data: InsertMediaFile) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [result] = await db.insert(mediaFiles).values(data);
  return result.insertId as number;
}

export async function deleteMediaFile(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const rows = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
  return rows[0]?.key ?? null;
}

// ── Mailer events (open/click tracking) ──

export async function insertMailerEvent(mailerId: number, type: 'open' | 'click', url?: string | null) {
  const db = await getDb();
  if (!db) return;
  await db.insert(mailerEvents).values({ mailerId, type, url: url ?? null });
}

export async function getMailerAnalytics(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  const mailerRows = await db.select().from(campaignMailers).where(eq(campaignMailers.campaignId, campaignId));
  if (!mailerRows.length) return [];
  const ids = mailerRows.map(m => m.id);
  const events = await db.select().from(mailerEvents).where(inArray(mailerEvents.mailerId, ids));
  return mailerRows
    .map(m => {
      const mEvents = events.filter(e => e.mailerId === m.id);
      const opens = mEvents.filter(e => e.type === 'open').length;
      const clicks = mEvents.filter(e => e.type === 'click').length;
      const urlCounts: Record<string, number> = {};
      mEvents.filter(e => e.type === 'click' && e.url).forEach(e => {
        urlCounts[e.url!] = (urlCounts[e.url!] ?? 0) + 1;
      });
      const topLinks = Object.entries(urlCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([url, count]) => ({ url, count }));
      return {
        mailer: m,
        sentCount: m.sentCount ?? 0,
        opens,
        clicks,
        topLinks,
      };
    });
}

// ── Recurring invoice config ─────────────────────────────────────────────────

export async function getRecurringInvoiceConfig(clientSlug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(recurringInvoiceConfig)
    .where(eq(recurringInvoiceConfig.clientSlug, clientSlug))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertRecurringInvoiceConfig(
  clientSlug: string,
  fields: Partial<Omit<InsertRecurringInvoiceConfig, 'id' | 'clientSlug' | 'createdAt' | 'updatedAt'>>
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db
    .insert(recurringInvoiceConfig)
    .values({ clientSlug, ...fields })
    .onDuplicateKeyUpdate({ set: fields });
}

export async function getAllEnabledRecurringConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(recurringInvoiceConfig)
    .where(eq(recurringInvoiceConfig.enabled, true));
}

export async function updateRecurringInvoiceLastSent(clientSlug: string, sentAt: Date) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(recurringInvoiceConfig)
    .set({ lastSentAt: sentAt })
    .where(eq(recurringInvoiceConfig.clientSlug, clientSlug));
}

export async function insertAiInteraction(data: {
  source: string;
  toolName: string;
  inputSummary?: string;
  isError?: boolean;
  clientSlug?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(aiInteractions).values({
    source: data.source,
    toolName: data.toolName,
    inputSummary: data.inputSummary ?? null,
    isError: data.isError ?? false,
    clientSlug: data.clientSlug ?? null,
  });
}

export async function getAiInteractions(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiInteractions)
    .orderBy(desc(aiInteractions.createdAt))
    .limit(limit);
}

export async function getInvoiceForClientInMonth(clientSlug: string, year: number, month: number) {
  const db = await getDb();
  if (!db) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const result = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.clientSlug, clientSlug),
        eq(invoices.invoiceType, 'monthly'),
        sql`${invoices.invoiceDate} >= ${start} AND ${invoices.invoiceDate} < ${end}`
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).orderBy(desc(projects.updatedAt));
}

export async function upsertProject(data: {
  name: string;
  repoPath: string;
  lastCommitMessage?: string;
  lastCommitAt?: Date;
  branch?: string;
  currentFocus?: string;
}) {
  const db = await getDb();
  if (!db) return;

  const existing = await db.select({ id: projects.id, commitCount: projects.commitCount })
    .from(projects)
    .where(eq(projects.repoPath, data.repoPath))
    .limit(1);

  if (existing.length > 0) {
    await db.update(projects)
      .set({
        name: data.name,
        lastCommitMessage: data.lastCommitMessage ?? null,
        lastCommitAt: data.lastCommitAt ?? null,
        branch: data.branch ?? null,
        ...(data.currentFocus !== undefined ? { currentFocus: data.currentFocus } : {}),
        commitCount: (existing[0].commitCount ?? 0) + 1,
      })
      .where(eq(projects.repoPath, data.repoPath));
  } else {
    await db.insert(projects).values({
      name: data.name,
      repoPath: data.repoPath,
      lastCommitMessage: data.lastCommitMessage ?? null,
      lastCommitAt: data.lastCommitAt ?? null,
      branch: data.branch ?? null,
      currentFocus: data.currentFocus ?? null,
      commitCount: 1,
    });
  }
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export async function getQuotes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(quotes).orderBy(desc(quotes.createdAt));
}

export async function getQuoteByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(quotes).where(eq(quotes.token, token)).limit(1);
  return result[0] ?? undefined;
}

export async function createQuote(data: Omit<InsertQuote, 'token'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const token = nanoid();
  await db.insert(quotes).values({ ...data, token });
  return token;
}

export async function updateQuote(id: number, data: Partial<InsertQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(quotes).set(data).where(eq(quotes.id, id));
}

export async function deleteQuote(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(quotes).where(eq(quotes.id, id));
}

export async function signQuote(token: string, signedBy: string, signedCompany: string, signerIp: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(quotes).set({ signedBy, signedCompany, signedAt: new Date(), signerIp, status: 'signed' }).where(eq(quotes.token, token));
}
