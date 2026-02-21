import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getInvoiceByNumber,
  getInvoiceByShareToken,
  getInvoiceItems,
  getAllInvoices,
  getInvoicesByClientSlug,
  getDistinctClients,
  updateInvoicePaymentUrl,
  updateInvoiceStatus,
  createInvoice,
  getMetrics,
  getTasks,
  createTask,
  updateTask,
  setTaskDone,
  deleteTask,
  getClientProfile,
  upsertClientNotes,
  sendInvoiceEmail,
  updateInvoice,
  getLeads,
  createLead,
  updateLead,
  deleteLead,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  invoice: router({
    // Admin-only: look up by invoice number
    getByNumber: adminProcedure
      .input(z.object({ invoiceNumber: z.string() }))
      .query(async ({ input }) => {
        const invoice = await getInvoiceByNumber(input.invoiceNumber);
        if (!invoice) return null;
        const items = await getInvoiceItems(invoice.id);
        return { invoice, items };
      }),

    // Public: look up by share token (client-facing links)
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invoice = await getInvoiceByShareToken(input.token);
        if (!invoice) return null;
        const items = await getInvoiceItems(invoice.id);
        return { invoice, items };
      }),

    // Admin-only: list all invoices
    list: adminProcedure.query(async () => {
      return getAllInvoices();
    }),

    // Admin-only: list invoices for a specific client
    listByClient: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        return getInvoicesByClientSlug(input.clientSlug);
      }),

    // Admin-only: list all distinct clients
    clients: adminProcedure.query(async () => {
      return getDistinctClients();
    }),

    // Admin-only: revenue metrics
    metrics: adminProcedure.query(async () => {
      return getMetrics();
    }),

    // Admin-only: create a new invoice
    create: adminProcedure
      .input(z.object({
        invoiceNumber: z.string().min(1),
        clientName: z.string().min(1),
        clientSlug: z.string().min(1),
        clientContact: z.string().nullish(),
        clientPhone: z.string().nullish(),
        clientEmail: z.string().nullish(),
        projectName: z.string().nullish(),
        projectSummary: z.string().nullish(),
        invoiceType: z.enum(['once-off', 'monthly', 'annual']).default('once-off'),
        status: z.enum(['draft', 'sent', 'paid', 'overdue']).default('sent'),
        subtotal: z.number().min(0),
        discountPercent: z.number().min(0).max(100).default(0),
        discountAmount: z.number().min(0).default(0),
        totalAmount: z.number().min(0),
        amountDue: z.number().min(0),
        paymentTerms: z.string().default('Due upon receipt'),
        paymentReference: z.string().nullish(),
        paymentUrl: z.string().nullish(),
        bankName: z.string().default('FNB/RMB'),
        accountHolder: z.string().default('Gro Digital'),
        accountNumber: z.string().default('62842244725'),
        accountType: z.string().default('Gold Business Account'),
        branchCode: z.string().default('250655'),
        notes: z.string().nullish(),
        invoiceDate: z.string(),
        dueDate: z.string().nullish(),
        items: z.array(z.object({
          description: z.string().min(1),
          frequency: z.string().default('Once Off'),
          vat: z.string().default('No VAT'),
          unitPrice: z.number().min(0),
          quantity: z.number().int().min(1).default(1),
          lineTotal: z.number().min(0),
        })),
      }))
      .mutation(async ({ input }) => {
        const { items, invoiceDate, dueDate, ...invoiceData } = input;
        return createInvoice(
          {
            ...invoiceData,
            invoiceDate: new Date(invoiceDate),
            dueDate: dueDate ? new Date(dueDate) : null,
          },
          items,
        );
      }),

    // Admin-only: update invoice status
    updateStatus: adminProcedure
      .input(z.object({
        invoiceId: z.number(),
        status: z.enum(['draft', 'sent', 'paid', 'overdue']),
      }))
      .mutation(async ({ input }) => {
        await updateInvoiceStatus(input.invoiceId, input.status);
        return { success: true };
      }),

    // Admin-only: update an existing invoice
    update: adminProcedure
      .input(z.object({
        invoiceNumber: z.string(),
        clientName: z.string().min(1),
        clientSlug: z.string().min(1),
        clientContact: z.string().nullish(),
        clientPhone: z.string().nullish(),
        clientEmail: z.string().nullish(),
        projectName: z.string().nullish(),
        projectSummary: z.string().nullish(),
        invoiceType: z.enum(['once-off', 'monthly', 'annual']),
        status: z.enum(['draft', 'sent', 'paid', 'overdue']),
        subtotal: z.number().min(0),
        discountPercent: z.number().min(0).max(100),
        discountAmount: z.number().min(0),
        totalAmount: z.number().min(0),
        amountDue: z.number().min(0),
        paymentTerms: z.string(),
        paymentReference: z.string().nullish(),
        paymentUrl: z.string().nullish(),
        bankName: z.string(),
        accountHolder: z.string(),
        accountNumber: z.string(),
        accountType: z.string(),
        branchCode: z.string(),
        notes: z.string().nullish(),
        invoiceDate: z.string(),
        dueDate: z.string().nullish(),
        items: z.array(z.object({
          description: z.string().min(1),
          frequency: z.string(),
          vat: z.string(),
          unitPrice: z.number().min(0),
          quantity: z.number().int().min(1),
          lineTotal: z.number().min(0),
        })),
      }))
      .mutation(async ({ input }) => {
        const { invoiceNumber, items, invoiceDate, dueDate, ...rest } = input;
        await updateInvoice(
          invoiceNumber,
          { ...rest, invoiceDate: new Date(invoiceDate), dueDate: dueDate ? new Date(dueDate) : null },
          items,
        );
        return { success: true };
      }),

    // Admin-only: send invoice by email
    sendEmail: adminProcedure
      .input(z.object({
        invoiceId: z.number(),
        recipientEmail: z.string().email(),
      }))
      .mutation(async ({ input, ctx }) => {
        const baseUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
        await sendInvoiceEmail(input.invoiceId, input.recipientEmail, baseUrl);
        return { success: true };
      }),

    // Admin-only: update PayFast payment URL and/or subscription token
    updatePaymentUrl: adminProcedure
      .input(z.object({
        invoiceId: z.number(),
        paymentUrl: z.string().url().nullable(),
        paymentToken: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateInvoicePaymentUrl(input.invoiceId, input.paymentUrl, input.paymentToken ?? null);
        return { success: true };
      }),
  }),

  client: router({
    getProfile: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => getClientProfile(input.clientSlug)),

    updateNotes: adminProcedure
      .input(z.object({ clientSlug: z.string(), notes: z.string() }))
      .mutation(async ({ input }) => {
        await upsertClientNotes(input.clientSlug, input.notes);
        return { success: true };
      }),
  }),

  task: router({
    list: adminProcedure.query(async () => getTasks()),

    create: adminProcedure
      .input(z.object({
        text: z.string().min(1),
        clientSlug: z.string().nullish(),
        clientName: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        await createTask(input.text, input.clientSlug, input.clientName);
        return { success: true };
      }),

    setDone: adminProcedure
      .input(z.object({ id: z.number(), done: z.boolean() }))
      .mutation(async ({ input }) => {
        await setTaskDone(input.id, input.done);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        text: z.string().min(1),
        clientSlug: z.string().nullish(),
        clientName: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        await updateTask(input.id, input.text, input.clientSlug, input.clientName);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTask(input.id);
        return { success: true };
      }),
  }),

  lead: router({
    list: adminProcedure.query(async () => getLeads()),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        contactName: z.string().nullish(),
        contactEmail: z.string().nullish(),
        contactPhone: z.string().nullish(),
        monthlyValue: z.number().nullish(),
        onceOffValue: z.number().nullish(),
        stage: z.enum(['prospect', 'proposal', 'negotiation']).default('prospect'),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        await createLead(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        contactName: z.string().nullish(),
        contactEmail: z.string().nullish(),
        contactPhone: z.string().nullish(),
        monthlyValue: z.number().nullish(),
        onceOffValue: z.number().nullish(),
        stage: z.enum(['prospect', 'proposal', 'negotiation']).optional(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateLead(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLead(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
