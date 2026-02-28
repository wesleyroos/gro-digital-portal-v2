import { eq, inArray, sql, asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import { InsertUser, InsertInvoice, InsertInvoiceItem, users, invoices, invoiceItems, tasks, clientProfiles, leads, henryMessages, subscriptions, agentMessages, proposals, proposalViews, marketingCampaigns, marketingPosts, campaignMessages, InsertMarketingPost } from "../drizzle/schema";
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
      values.role = 'admin';
      updateSet.role = 'admin';
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

// ── Invoice queries ──

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

  const result = await db
    .select({
      clientSlug: invoices.clientSlug,
      clientName: sql<string>`MAX(${invoices.clientName})`,
      clientContact: sql<string>`MAX(${invoices.clientContact})`,
      clientEmail: sql<string>`MAX(${invoices.clientEmail})`,
      clientPhone: sql<string>`MAX(${invoices.clientPhone})`,
      address: clientProfiles.address,
      analyticsToken: clientProfiles.analyticsToken,
    })
    .from(invoices)
    .leftJoin(clientProfiles, eq(invoices.clientSlug, clientProfiles.clientSlug))
    .groupBy(invoices.clientSlug, clientProfiles.address, clientProfiles.analyticsToken);

  return result;
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
    ...(opts?.status !== undefined ? { status: opts.status } : {}),
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
    from: 'Gro Digital <invoices@grodigital.co.za>',
    to: recipientEmail,
    subject: `Invoice ${invoice.invoiceNumber} from Gro Digital`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">GRO<span style="font-weight: 300;">digital</span></h1>
          <p style="font-size: 11px; color: #888; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 2px;">Invoice</p>
        </div>

        <p style="font-size: 15px; margin-bottom: 8px;">Hi ${invoice.clientContact || invoice.clientName},</p>
        <p style="font-size: 14px; color: #444; line-height: 1.6; margin-bottom: 24px;">
          Please find your invoice <strong>${invoice.invoiceNumber}</strong> from Gro Digital below.
          ${invoice.projectName ? `This relates to <strong>${invoice.projectName}</strong>.` : ''}
        </p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px;">
          <p style="margin: 0 0 4px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Amount Due</p>
          <p style="margin: 0; font-size: 32px; font-weight: 800; font-family: monospace; color: #111;">${formattedAmount}</p>
          ${invoice.paymentTerms ? `<p style="margin: 8px 0 0; font-size: 12px; color: #888;">${invoice.paymentTerms}</p>` : ''}
        </div>

        <a href="${invoiceUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-bottom: 28px;">
          View Invoice →
        </a>

        <p style="font-size: 12px; color: #aaa; margin-top: 32px; border-top: 1px solid #f0f0f0; padding-top: 20px;">
          Gro Digital (Pty) Ltd &bull; grodigital.co.za<br/>
          If you have any questions, reply to this email.
        </p>
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
  await db.insert(leads).values({
    name: data.name,
    contactName: data.contactName ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    monthlyValue: data.monthlyValue != null ? String(data.monthlyValue) : null,
    onceOffValue: data.onceOffValue != null ? String(data.onceOffValue) : null,
    stage: data.stage ?? 'prospect',
    notes: data.notes ?? null,
  });
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

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createCampaign(data: { clientSlug: string; name: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(marketingCampaigns).values({
    clientSlug: data.clientSlug,
    name: data.name,
    status: 'discovery',
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
  await db.update(marketingCampaigns).set(set).where(eq(marketingCampaigns.id, id));
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
