import { eq, inArray, sql, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import { InsertUser, InsertInvoice, InsertInvoiceItem, users, invoices, invoiceItems, tasks, clientProfiles, leads, henryMessages } from "../drizzle/schema";
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
  if (status === 'paid') {
    await db.update(invoices).set({ status, amountDue: 0 }).where(eq(invoices.id, id));
  } else {
    await db.update(invoices).set({ status, amountDue: sql`${invoices.totalAmount}` }).where(eq(invoices.id, id));
  }
}

export async function updateInvoicePaymentUrl(id: number, paymentUrl: string | null, paymentToken: string | null = null) {
  const db = await getDb();
  if (!db) return;

  await db.update(invoices).set({ paymentUrl, paymentToken }).where(eq(invoices.id, id));
}

export async function getMetrics() {
  const db = await getDb();
  if (!db) return null;

  // Recurring — use totalAmount (contract value), not amountDue (which goes to 0 when paid)
  const [mrrRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.invoiceType, 'monthly'));

  const [annualRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.invoiceType, 'annual'));

  // Per-client monthly recurring
  const clientMonthly = await db
    .select({
      clientSlug: invoices.clientSlug,
      clientName: invoices.clientName,
      mrr: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.invoiceType, 'monthly'))
    .groupBy(invoices.clientSlug, invoices.clientName);

  // Per-client annual recurring
  const clientAnnual = await db
    .select({
      clientSlug: invoices.clientSlug,
      clientName: invoices.clientName,
      annual: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.invoiceType, 'annual'))
    .groupBy(invoices.clientSlug, invoices.clientName);

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

  // Merge per-client recurring
  const clientMap = new Map<string, { clientSlug: string; clientName: string; mrr: number; annual: number }>();
  for (const c of clientMonthly) {
    clientMap.set(c.clientSlug, { clientSlug: c.clientSlug, clientName: c.clientName, mrr: parseFloat(c.mrr) || 0, annual: 0 });
  }
  for (const c of clientAnnual) {
    const existing = clientMap.get(c.clientSlug);
    if (existing) {
      existing.annual = parseFloat(c.annual) || 0;
    } else {
      clientMap.set(c.clientSlug, { clientSlug: c.clientSlug, clientName: c.clientName, mrr: 0, annual: parseFloat(c.annual) || 0 });
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
    })
    .from(invoices)
    .groupBy(invoices.clientSlug);

  return result;
}

// ── Task queries ──

export async function getTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).orderBy(tasks.createdAt);
}

export async function createTask(text: string, clientSlug?: string | null, clientName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(tasks).values({ text, clientSlug: clientSlug ?? null, clientName: clientName ?? null });
}

export async function setTaskDone(id: number, done: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ done }).where(eq(tasks.id, id));
}

export async function updateTask(id: number, text: string, clientSlug?: string | null, clientName?: string | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ text, clientSlug: clientSlug ?? null, clientName: clientName ?? null }).where(eq(tasks.id, id));
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

export async function upsertClientNotes(clientSlug: string, notes: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clientProfiles)
    .values({ clientSlug, notes })
    .onDuplicateKeyUpdate({ set: { notes } });
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
