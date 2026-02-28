import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  deleteInvoice,
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
  upsertClientProfile,
  sendInvoiceEmail,
  updateInvoice,
  getLeads,
  createLead,
  updateLead,
  deleteLead,
  getHenryHistory,
  getAgentHistory,
  getGoogleRefreshToken,
  clearGoogleTokens,
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getProposals,
  getProposalsByClient,
  createProposal,
  updateProposal,
  deleteProposal,
  getProposalViewLog,
  logProposalView,
  setClientAnalytics,
  clearClientAnalytics,
  getClientByAnalyticsToken,
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getPostsByCampaign,
  getPostById,
  updatePostStatus,
  approveAllPosts,
  getCampaignMessages,
  getInstagramTokens,
  clearInstagramTokens,
} from "./db";
import { generateAndStorePostImage } from "./image-gen";
import { getCalendarEvents } from "./calendar";

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

    delete: adminProcedure
      .input(z.object({ invoiceNumber: z.string() }))
      .mutation(async ({ input }) => {
        await deleteInvoice(input.invoiceNumber);
        return { success: true };
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
        clientAddress: z.string().nullish(),
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
        clientAddress: z.string().nullish(),
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

    updateProfile: adminProcedure
      .input(z.object({
        clientSlug: z.string(),
        notes: z.string().nullish(),
        address: z.string().nullish(),
        name: z.string().nullish(),
        contact: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const { clientSlug, ...fields } = input;
        await upsertClientProfile(clientSlug, fields);
        return { success: true };
      }),

    setAnalytics: adminProcedure
      .input(z.object({
        clientSlug: z.string(),
        analyticsEmbed: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const token = await setClientAnalytics(input.clientSlug, input.analyticsEmbed);
        return { token };
      }),

    clearAnalytics: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ input }) => {
        await clearClientAnalytics(input.clientSlug);
        return { success: true };
      }),

    getAnalytics: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        return getClientByAnalyticsToken(input.token);
      }),
  }),

  task: router({
    list: adminProcedure.query(async () => getTasks()),

    create: adminProcedure
      .input(z.object({
        text: z.string().min(1),
        clientSlug: z.string().nullish(),
        clientName: z.string().nullish(),
        status: z.string().nullish(),
        dueDate: z.string().nullish(),
        priority: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        await createTask(input.text, input.clientSlug, input.clientName, {
          status: input.status ?? undefined,
          dueDate: input.dueDate,
          priority: input.priority,
          notes: input.notes,
        });
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
        status: z.string().nullish(),
        dueDate: z.string().nullish(),
        priority: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        await updateTask(input.id, input.text, input.clientSlug, input.clientName, {
          status: input.status ?? undefined,
          dueDate: input.dueDate,
          priority: input.priority,
          notes: input.notes,
        });
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

  subscription: router({
    list: adminProcedure.query(() => getSubscriptions()),

    create: adminProcedure
      .input(z.object({
        clientSlug: z.string().min(1),
        clientName: z.string().min(1),
        description: z.string().nullish(),
        amount: z.number().min(0),
        type: z.enum(['monthly', 'annual']),
        status: z.enum(['active', 'paused', 'cancelled']).default('active'),
      }))
      .mutation(async ({ input }) => {
        await createSubscription(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        clientSlug: z.string().min(1).optional(),
        clientName: z.string().min(1).optional(),
        description: z.string().nullish(),
        amount: z.number().min(0).optional(),
        type: z.enum(['monthly', 'annual']).optional(),
        status: z.enum(['active', 'paused', 'cancelled']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateSubscription(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSubscription(input.id);
        return { success: true };
      }),
  }),

  henry: router({
    history: adminProcedure.query(async ({ ctx }) => {
      const openId = ctx.user!.openId;
      return getHenryHistory(openId);
    }),
  }),

  agent: router({
    history: adminProcedure
      .input(z.object({ agentSlug: z.string() }))
      .query(async ({ ctx, input }) => {
        return getAgentHistory(ctx.user!.openId, input.agentSlug);
      }),
  }),

  google: router({
    status: adminProcedure.query(async ({ ctx }) => {
      const data = await getGoogleRefreshToken(ctx.user!.openId);
      if (!data) return { connected: false, email: null };
      return { connected: true, email: data.connectedEmail };
    }),

    disconnect: adminProcedure.mutation(async ({ ctx }) => {
      await clearGoogleTokens(ctx.user!.openId);
      return { success: true };
    }),

    getToken: adminProcedure.query(async ({ ctx }) => {
      const data = await getGoogleRefreshToken(ctx.user!.openId);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Google not connected" });
      return data; // { refreshToken, connectedEmail }
    }),
  }),

  calendar: router({
    events: adminProcedure
      .input(z.object({ timeMin: z.string(), timeMax: z.string() }))
      .query(async ({ input, ctx }) => {
        return getCalendarEvents(ctx.user!.openId, input.timeMin, input.timeMax);
      }),
  }),

  proposal: router({
    list: adminProcedure.query(async () => getProposals()),

    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        htmlContent: z.string().min(1),
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined']).default('draft'),
        assignedType: z.enum(['client', 'lead', 'none']).default('none'),
        assignedName: z.string().nullish(),
        clientSlug: z.string().nullish(),
        leadId: z.number().int().nullish(),
        externalEmail: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const token = await createProposal(input);
        return { token };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        title: z.string().min(1).optional(),
        htmlContent: z.string().min(1).optional(),
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined']).optional(),
        assignedType: z.enum(['client', 'lead', 'none']).optional(),
        assignedName: z.string().nullish(),
        clientSlug: z.string().nullish(),
        leadId: z.number().int().nullish(),
        externalEmail: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const sentAt = data.status === 'sent' ? new Date() : undefined;
        await updateProposal(id, { ...data, ...(sentAt ? { sentAt } : {}) });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteProposal(input.id);
        return { success: true };
      }),

    getViews: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => getProposalViewLog(input.id)),

    listByClient: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => getProposalsByClient(input.clientSlug)),
  }),

  campaign: router({
    list: adminProcedure.query(async () => getCampaigns()),

    get: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) return null;
        const [posts, messages] = await Promise.all([
          getPostsByCampaign(input.id),
          getCampaignMessages(input.id),
        ]);
        return { campaign, posts, messages };
      }),

    create: adminProcedure
      .input(z.object({ clientSlug: z.string().min(1), name: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const id = await createCampaign(input);
        return { id };
      }),

    updateStatus: adminProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(['discovery', 'strategy', 'generating', 'approval', 'active', 'completed']),
      }))
      .mutation(async ({ input }) => {
        await updateCampaign(input.id, { status: input.status });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteCampaign(input.id);
        return { success: true };
      }),

    post: router({
      approve: adminProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ input }) => {
          await updatePostStatus(input.postId, 'approved');
          return { success: true };
        }),

      reject: adminProcedure
        .input(z.object({ postId: z.number().int(), notes: z.string().optional() }))
        .mutation(async ({ input }) => {
          await updatePostStatus(input.postId, 'rejected', { notes: input.notes });
          return { success: true };
        }),

      generateImage: adminProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          if (!post.imagePrompt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No image prompt set' });
          const url = await generateAndStorePostImage(post.imagePrompt, post.id);
          return { url };
        }),

      regenerateImage: adminProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          if (!post.imagePrompt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No image prompt set' });
          const url = await generateAndStorePostImage(post.imagePrompt, post.id);
          return { url };
        }),

      approveAll: adminProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .mutation(async ({ input }) => {
          await approveAllPosts(input.campaignId);
          return { success: true };
        }),
    }),
  }),

  instagram: router({
    getStatus: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        const tokens = await getInstagramTokens(input.clientSlug);
        if (!tokens) return { connected: false, username: null };
        return { connected: true, username: tokens.username };
      }),

    disconnect: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ input }) => {
        await clearInstagramTokens(input.clientSlug);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
