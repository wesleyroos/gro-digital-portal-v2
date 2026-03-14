import { Resend } from 'resend';
import sharp from 'sharp';
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { adminProcedure, clientProcedure, protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";
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
  createStandaloneClient,
  deleteClientProfile,
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
  updatePostContent,
  approveAllPosts,
  getCampaignMessages,
  getInstagramTokens,
  clearInstagramTokens,
  storeInstagramTokens,
  updatePostImageUrl,
  updatePostVideo,
  getCampaignByShareToken,
  storeFacebookPage,
  clearFacebookTokens,
  getFacebookTokens,
  updatePostFacebookId,
  getCampaignAssets,
  getCampaignAssetById,
  insertCampaignAsset,
  deleteCampaignAsset,
  updateCampaignAssetDescription,
  getCampaignMailers,
  createCampaignMailer,
  updateCampaignMailer,
  deleteCampaignMailer,
  getCampaignMailerById,
  getResendSegmentId,
  setResendSegmentId,
  getSetting,
  setSetting,
  getMailerChatMessages,
  insertMailerChatMessage,
  clearMailerChatMessages,
  getMediaFiles,
  insertMediaFile,
  deleteMediaFile,
  getProspects,
  getProspectById,
  createProspect,
  updateProspect,
  deleteProspect,
  getSequences,
  createSequence,
  updateSequence,
  deleteSequence,
  getSequenceSteps,
  getSequenceStepById,
  createSequenceStep,
  updateSequenceStep,
  deleteSequenceStep,
  getSends,
  createSend,
  updateSend,
  getClientUsersBySlug,
  createClientUser,
  deleteClientUser,
  updateUserPasswordHash,
  updateUserProfile,
  getCampaignsByClientSlug,
} from "./db";
import { hashPassword } from "./_core/oauth";
import Anthropic from "@anthropic-ai/sdk";
import { describeImageForBrand } from "./_core/imageGeneration";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { generateAndStorePostImage } from "./image-gen";
import { storagePut, storageDelete } from "./storage";
import { createMediaContainer, createVideoMediaContainer, publishMedia, getIgUserInfo, getPostInsights } from "./instagram";
import { getFacebookPostInsights, postImageToPage, postVideoToPage } from "./facebook";
import { getPendingFacebookPages, confirmFacebookPage } from "./facebook-oauth";
import { getCalendarEvents } from "./calendar";

/**
 * Finds <img src="..."> URLs in HTML, fetches each image, compresses to max
 * 1200px wide JPEG at 80% quality using Sharp, re-uploads to R2 under
 * email-compressed/, and replaces the original URL in the HTML.
 * Skips images that are already small (<100KB) or unreachable.
 */
async function compressMailerImages(html: string): Promise<string> {
  const urlRegex = /<img[^>]+src="(https?:\/\/[^"]+)"/gi;
  const matches: { original: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(html)) !== null) {
    matches.push({ original: m[0], url: m[1] });
  }
  if (matches.length === 0) return html;

  let result = html;
  await Promise.allSettled(
    matches.map(async ({ url }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return;
        const arrayBuf = await res.arrayBuffer();
        const original = Buffer.from(arrayBuf);
        if (original.byteLength < 100_000) return; // already small, skip

        const compressed = await sharp(original)
          .resize({ width: 1200, withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();

        const { url: newUrl } = await storagePut(`email-compressed/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, compressed, 'image/jpeg');
        result = result.replaceAll(url, newUrl);
      } catch {
        // keep original URL on any error
      }
    })
  );
  return result;
}

/** Throws FORBIDDEN if a client user tries to access a campaign that isn't theirs. No-op for admin/superAdmin. */
function assertCampaignAccess(user: { role: string; clientSlug?: string | null }, campaignClientSlug: string) {
  if (user.role === 'client' && user.clientSlug !== campaignClientSlug) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
}

/** Throws FORBIDDEN if a client user tries to access another client's slug. No-op for admin/superAdmin. */
function assertClientSlugAccess(user: { role: string; clientSlug?: string | null }, clientSlug: string) {
  if (user.role === 'client' && user.clientSlug !== clientSlug) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
}

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
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(120).optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.openId, input);
        return { success: true };
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
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        contact: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const clientSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await createStandaloneClient({ clientSlug, ...input });
        return { clientSlug };
      }),

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

    delete: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ input }) => {
        await deleteClientProfile(input.clientSlug);
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
        stage: z.enum(['prospect', 'proposal', 'negotiation', 'cold']).default('prospect'),
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
        stage: z.enum(['prospect', 'proposal', 'negotiation', 'cold']).optional(),
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

  settings: router({
    getAiModel: adminProcedure.query(async () => {
      return { model: (await getSetting('aiModel')) ?? 'claude-sonnet-4-6' };
    }),
    setAiModel: adminProcedure
      .input(z.object({ model: z.enum(['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']) }))
      .mutation(async ({ input }) => {
        await setSetting('aiModel', input.model);
        return { model: input.model };
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
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'client') return getCampaignsByClientSlug(ctx.user.clientSlug!);
      return getCampaigns();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) return null;
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        const [posts, messages] = await Promise.all([
          getPostsByCampaign(input.id),
          getCampaignMessages(input.id),
        ]);
        return { campaign, posts, messages };
      }),

    create: protectedProcedure
      .input(z.object({ clientSlug: z.string().min(1), name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const clientSlug = ctx.user.role === 'client' ? ctx.user.clientSlug! : input.clientSlug;
        const id = await createCampaign({ clientSlug, name: input.name });
        return { id };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(['discovery', 'strategy', 'generating', 'approval', 'active', 'completed']),
      }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { status: input.status });
        return { success: true };
      }),

    setImageModel: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        imageModel: z.enum(['dall-e-3', 'nano-banana-2', 'gpt-image-1']),
      }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { imageModel: input.imageModel });
        return { success: true };
      }),

    setImageStyle: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        imageStyle: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { imageStyle: input.imageStyle });
        return { success: true };
      }),

    setImageAspectRatio: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        imageAspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9']),
      }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { imageAspectRatio: input.imageAspectRatio });
        return { success: true };
      }),

    saveStrategy: protectedProcedure
      .input(z.object({ id: z.number().int(), strategy: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { strategy: input.strategy, status: 'strategy' });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await deleteCampaign(input.id);
        return { success: true };
      }),

    generateShareLink: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        const token = nanoid(21);
        await updateCampaign(input.id, { shareToken: token });
        return { token };
      }),

    setSharePassword: protectedProcedure
      .input(z.object({ id: z.number().int(), password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        const hashed = input.password
          ? createHash('sha256').update(input.password).digest('hex')
          : null;
        await updateCampaign(input.id, { sharePassword: hashed });
        return { success: true };
      }),

    revokeShareLink: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { shareToken: null, sharePassword: null });
        return { success: true };
      }),

    // Public — fetch campaign by share token (password checked here)
    getByShareToken: publicProcedure
      .input(z.object({ token: z.string(), password: z.string().optional() }))
      .query(async ({ input }) => {
        const campaign = await getCampaignByShareToken(input.token);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        if (campaign.sharePassword) {
          const provided = input.password
            ? createHash('sha256').update(input.password).digest('hex')
            : null;
          if (provided !== campaign.sharePassword) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });
          }
        }
        const posts = await getPostsByCampaign(campaign.id);
        // Strip internal-only fields before sending to client
        const { sharePassword, shareToken, strategy, brandVoice, targetAudience, contentThemes, imageModel, imageStyle, imageAspectRatio, ...publicCampaign } = campaign;
        return { campaign: publicCampaign, posts };
      }),

    post: router({
      approve: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          await updatePostStatus(input.postId, 'approved');
          return { success: true };
        }),

      setStatus: protectedProcedure
        .input(z.object({ postId: z.number().int(), status: z.enum(['draft', 'approved', 'rejected', 'scheduled']) }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          await updatePostStatus(input.postId, input.status);
          return { success: true };
        }),

      reject: protectedProcedure
        .input(z.object({ postId: z.number().int(), notes: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          await updatePostStatus(input.postId, 'rejected', { notes: input.notes });
          return { success: true };
        }),

      generateImage: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          if (!post.imagePrompt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No image prompt set' });
          const [campaign, assets] = await Promise.all([
            getCampaignById(post.campaignId),
            getCampaignAssets(post.campaignId),
          ]);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const model = (campaign.imageModel ?? 'dall-e-3') as 'dall-e-3' | 'nano-banana-2' | 'gpt-image-1';
          const style = campaign.imageStyle ?? '';
          const aspectRatio = (campaign.imageAspectRatio ?? '1:1') as '1:1' | '4:5' | '9:16' | '16:9';
          const referenceImages = assets.filter(a => a.aiDescription).map(a => ({ url: a.url, description: a.aiDescription! }));
          const url = await generateAndStorePostImage(post.imagePrompt, post.id, model, style, aspectRatio, referenceImages);
          return { url };
        }),

      regenerateImage: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          if (!post.imagePrompt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No image prompt set' });
          const [campaign, assets] = await Promise.all([
            getCampaignById(post.campaignId),
            getCampaignAssets(post.campaignId),
          ]);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const model = (campaign.imageModel ?? 'dall-e-3') as 'dall-e-3' | 'nano-banana-2' | 'gpt-image-1';
          const style = campaign.imageStyle ?? '';
          const aspectRatio = (campaign.imageAspectRatio ?? '1:1') as '1:1' | '4:5' | '9:16' | '16:9';
          const referenceImages = assets.filter(a => a.aiDescription).map(a => ({ url: a.url, description: a.aiDescription! }));
          const url = await generateAndStorePostImage(post.imagePrompt, post.id, model, style, aspectRatio, referenceImages);
          // If the post was rejected, reset to draft so the client can review the new image
          if (post.status === 'rejected') {
            await updatePostStatus(input.postId, 'draft');
          }
          return { url };
        }),

      suggestImagePrompt: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          if (!ENV.anthropicApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Anthropic API key not configured' });
          const model = (await getSetting('aiModel')) ?? 'claude-sonnet-4-6';
          const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
          const msg = await anthropic.messages.create({
            model,
            max_tokens: 200,
            system: 'You write concise image generation prompts for social media posts. Return only the prompt text, no explanation, no quotes.',
            messages: [{ role: 'user', content: `Write a new image generation prompt for this social media post.\n\nTheme: ${post.theme ?? 'none'}\nCaption: ${post.caption ?? 'none'}\nHashtags: ${post.hashtags ?? 'none'}\n\nThe prompt should describe a specific visual scene or composition that would work well as an Instagram post image.` }],
          });
          const prompt = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
          return { prompt };
        }),

      updateContent: protectedProcedure
        .input(z.object({
          postId: z.number().int(),
          caption: z.string().optional(),
          hashtags: z.string().optional(),
          imagePrompt: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (post) {
            const campaign = await getCampaignById(post.campaignId);
            if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          }
          await updatePostContent(input.postId, {
            caption: input.caption,
            hashtags: input.hashtags,
            imagePrompt: input.imagePrompt,
          });
          // If the post was rejected, reset to draft so the client can review the changes
          if (post?.status === 'rejected') {
            await updatePostStatus(input.postId, 'draft');
          }
          return { success: true };
        }),

      uploadImage: protectedProcedure
        .input(z.object({
          postId: z.number().int(),
          base64: z.string(),
          mimeType: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (post) {
            const campaign = await getCampaignById(post.campaignId);
            if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          }
          const buffer = Buffer.from(input.base64, 'base64');
          const ext = input.mimeType.split('/')[1] ?? 'jpg';
          const { url } = await storagePut(`uploads/${Date.now()}.${ext}`, buffer, input.mimeType);
          await updatePostImageUrl(input.postId, url);
          return { url };
        }),

      uploadVideo: protectedProcedure
        .input(z.object({
          postId: z.number().int(),
          base64: z.string(),
          mimeType: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (post) {
            const campaign = await getCampaignById(post.campaignId);
            if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          }
          const buffer = Buffer.from(input.base64, 'base64');
          const ext = input.mimeType.split('/')[1] ?? 'mp4';
          const { url } = await storagePut(`videos/${Date.now()}.${ext}`, buffer, input.mimeType);
          await updatePostVideo(input.postId, url);
          return { url };
        }),

      approveAll: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          await approveAllPosts(input.campaignId);
          return { success: true };
        }),

      getInsights: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          if (!post.instagramPostId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Post has not been published to Instagram yet' });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const tokens = await getInstagramTokens(campaign.clientSlug);
          if (!tokens) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Instagram not connected' });
          const insights = await getPostInsights(post.instagramPostId, tokens.accessToken);
          return insights;
        }),

      getPerformance: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const posts = await getPostsByCampaign(input.campaignId);
          const postedPosts = posts.filter(p => p.status === 'posted' && (p.instagramPostId || p.facebookPostId));
          if (postedPosts.length === 0) return { rows: [] };
          const igTokens = await getInstagramTokens(campaign.clientSlug);
          const fbTokens = await getFacebookTokens(campaign.clientSlug);
          type FbInsights = Awaited<ReturnType<typeof getFacebookPostInsights>>;
          type Row = {
            post: typeof postedPosts[0];
            insights: { reach: number; likes: number; comments: number; shares: number; saved: number; totalInteractions: number };
            fbInsights: FbInsights | null;
            fbInsightsSource: 'full' | null;
            fbError: 'token_invalid' | null;
          };
          const results = await Promise.allSettled(
            postedPosts.map(async (post): Promise<Row> => {
              const igInsights = post.instagramPostId && igTokens
                ? await getPostInsights(post.instagramPostId, igTokens.accessToken).catch(() => null)
                : null;

              let fbInsights: FbInsights | null = null;
              let fbInsightsSource: Row['fbInsightsSource'] = null;
              let fbError: Row['fbError'] = null;
              if (post.facebookPostId && fbTokens) {
                const full = await getFacebookPostInsights(post.facebookPostId, fbTokens.pageAccessToken).catch(() => null);
                if (full) {
                  fbInsights = full;
                  fbInsightsSource = 'full';
                } else {
                  fbError = 'token_invalid';
                }
              }

              const insights = igInsights ?? (fbInsights ? {
                reach: fbInsights.reach, likes: fbInsights.reactions, comments: 0,
                shares: fbInsights.shares, saved: 0,
                totalInteractions: fbInsights.reactions + fbInsights.shares + fbInsights.clicks,
              } : { reach: 0, likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 });
              return { post, insights, fbInsights, fbInsightsSource, fbError };
            })
          );
          const rows = results
            .filter((r): r is PromiseFulfilledResult<Row> => r.status === 'fulfilled')
            .map(r => r.value);
          return { rows };
        }),

      publishNow: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          const isVideo = post.mediaType === 'video';
          const mediaUrl = isVideo ? post.videoUrl : post.imageUrl;
          if (!mediaUrl) throw new TRPCError({ code: 'BAD_REQUEST', message: `Post has no ${isVideo ? 'video' : 'image'} — upload one first` });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const caption = [post.caption ?? '', post.hashtags ?? ''].filter(Boolean).join('\n\n');
          const postedTo: string[] = [];

          // ── Instagram ──
          if (campaign.postToInstagram !== false) {
            const tokens = await getInstagramTokens(campaign.clientSlug);
            if (!tokens) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Instagram not connected for this client' });
            const creationId = isVideo
              ? await createVideoMediaContainer(tokens.businessId, tokens.accessToken, mediaUrl, caption)
              : await createMediaContainer(tokens.businessId, tokens.accessToken, mediaUrl, caption);
            const instagramPostId = await publishMedia(tokens.businessId, tokens.accessToken, creationId);
            await updatePostStatus(input.postId, 'posted', { instagramPostId });
            postedTo.push('Instagram');
          }

          // ── Facebook ──
          if (campaign.postToFacebook) {
            const fbTokens = await getFacebookTokens(campaign.clientSlug);
            if (fbTokens) {
              const facebookPostId = isVideo
                ? await postVideoToPage(fbTokens.pageId, fbTokens.pageAccessToken, mediaUrl, caption)
                : await postImageToPage(fbTokens.pageId, fbTokens.pageAccessToken, mediaUrl, caption);
              await updatePostFacebookId(input.postId, facebookPostId);
              if (campaign.postToInstagram === false) {
                await updatePostStatus(input.postId, 'posted');
              }
              postedTo.push('Facebook');
            }
          }

          return { postedTo };
        }),

      // Public — approve a post via share token
      approveByToken: publicProcedure
        .input(z.object({ token: z.string(), postId: z.number().int(), password: z.string().optional() }))
        .mutation(async ({ input }) => {
          const campaign = await getCampaignByShareToken(input.token);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          if (campaign.sharePassword) {
            const provided = input.password ? createHash('sha256').update(input.password).digest('hex') : null;
            if (provided !== campaign.sharePassword) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });
          }
          const post = await getPostById(input.postId);
          if (!post || post.campaignId !== campaign.id) throw new TRPCError({ code: 'NOT_FOUND' });
          await updatePostStatus(input.postId, 'approved');
          return { success: true };
        }),

      // Public — reject a post via share token
      rejectByToken: publicProcedure
        .input(z.object({ token: z.string(), postId: z.number().int(), password: z.string().optional(), notes: z.string().optional() }))
        .mutation(async ({ input }) => {
          const campaign = await getCampaignByShareToken(input.token);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          if (campaign.sharePassword) {
            const provided = input.password ? createHash('sha256').update(input.password).digest('hex') : null;
            if (provided !== campaign.sharePassword) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });
          }
          const post = await getPostById(input.postId);
          if (!post || post.campaignId !== campaign.id) throw new TRPCError({ code: 'NOT_FOUND' });
          await updatePostStatus(input.postId, 'rejected', { notes: input.notes });
          return { success: true };
        }),

    }),

    setPlatforms: protectedProcedure
      .input(z.object({ id: z.number().int(), postToInstagram: z.boolean(), postToFacebook: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        await updateCampaign(input.id, { postToInstagram: input.postToInstagram, postToFacebook: input.postToFacebook });
        return { success: true };
      }),

    asset: router({
      list: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          return getCampaignAssets(input.campaignId);
        }),

      upload: protectedProcedure
        .input(z.object({
          campaignId: z.number().int(),
          base64: z.string(),
          mimeType: z.string(),
          label: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const buffer = Buffer.from(input.base64, 'base64');
          const ext = input.mimeType.split('/')[1] ?? 'jpg';
          const { url } = await storagePut(`campaign-assets/${input.campaignId}/${Date.now()}.${ext}`, buffer, input.mimeType);
          const asset = await insertCampaignAsset(input.campaignId, url, input.label ?? null);
          // Fire-and-forget vision description
          describeImageForBrand(url).then(desc => {
            if (desc) return updateCampaignAssetDescription(asset.id, desc);
          }).catch(() => {});
          return asset;
        }),

      delete: protectedProcedure
        .input(z.object({ assetId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const asset = await getCampaignAssetById(input.assetId);
          if (asset) {
            const campaign = await getCampaignById(asset.campaignId);
            if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          }
          await deleteCampaignAsset(input.assetId);
          return { success: true };
        }),
    }),

    mailer: router({
      list: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          return getCampaignMailers(input.campaignId);
        }),

      create: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const mailer = await createCampaignMailer(input.campaignId);
          return mailer;
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number().int(),
          subject: z.string().optional(),
          previewText: z.string().nullable().optional(),
          htmlContent: z.string().optional(),
          status: z.enum(['draft', 'scheduled', 'sent']).optional(),
          scheduledAt: z.string().nullable().optional(), // ISO string or null
          notes: z.string().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const mailer = await getCampaignMailerById(input.id);
          if (mailer) {
            const campaign = await getCampaignById(mailer.campaignId);
            if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          }
          await updateCampaignMailer(input.id, {
            subject: input.subject,
            previewText: input.previewText,
            htmlContent: input.htmlContent,
            status: input.status,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : input.scheduledAt === null ? null : undefined,
            notes: input.notes,
          });
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const mailer = await getCampaignMailerById(input.id);
          if (mailer) {
            const campaign = await getCampaignById(mailer.campaignId);
            if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          }
          await deleteCampaignMailer(input.id);
          return { success: true };
        }),

      generate: protectedProcedure
        .input(z.object({
          campaignId: z.number().int(),
          heroImageUrl: z.string().nullable().optional(),
          logoUrl: z.string().nullable().optional(),
          purpose: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          if (!ENV.anthropicApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Anthropic API key not configured' });
          const [campaign, assets] = await Promise.all([
            getCampaignById(input.campaignId),
            getCampaignAssets(input.campaignId),
          ]);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);

          const assetsWithDesc = assets.filter(a => a.aiDescription);
          const assetsSection = assetsWithDesc.length > 0
            ? `\nBRAND VISUAL REFERENCES (inform colour palette, mood, style):\n${assetsWithDesc.map((a, i) => `- ${a.label || `Reference ${i + 1}`}: ${a.aiDescription}`).join('\n')}`
            : '';

          const logoHtml = input.logoUrl
            ? `<img src="${input.logoUrl}" alt="${campaign.clientSlug}" style="max-height:50px;width:auto;display:block;">`
            : `<span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:inherit;">${campaign.clientSlug}</span><!-- REPLACE WITH LOGO: <img src="YOUR_LOGO_URL" alt="${campaign.clientSlug}" style="max-height:50px;width:auto;"> -->`;

          const heroSection = input.heroImageUrl
            ? `Include a full-width hero image using this URL: ${input.heroImageUrl} — display it edge-to-edge within the 600px container with no padding, aspect ratio preserved.`
            : 'No hero image — use a clean white header with the logo, followed by a bold headline section.';

          const purposeSection = input.purpose ? `\nMAILER PURPOSE: ${input.purpose}` : '';

          const campaignContext = `CAMPAIGN: ${campaign.name}
CLIENT: ${campaign.clientSlug}
BRAND VOICE: ${campaign.brandVoice ?? 'Not specified'}
TARGET AUDIENCE: ${campaign.targetAudience ?? 'Not specified'}
CONTENT THEMES: ${campaign.contentThemes ?? 'Not specified'}
STRATEGY: ${campaign.strategy ? campaign.strategy.slice(0, 800) : 'Not specified'}${purposeSection}${assetsSection}`;

          // Step 1: generate subject + previewText from campaign context
          const aiModel = (await getSetting('aiModel')) ?? 'claude-sonnet-4-6';
          const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
          let subject = `${campaign.name} — ${new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`;
          let previewText: string | undefined;
          try {
            const metaMsg = await anthropic.messages.create({
              model: aiModel,
              max_tokens: 200,
              system: 'You write compelling email subject lines and preview text for marketing campaigns. Return ONLY valid JSON with keys "subject" (max 80 chars) and "previewText" (max 140 chars, the inbox snippet shown after the subject). No explanation.',
              messages: [{ role: 'user', content: `${campaignContext}\n\nWrite the subject line and preview text for this email campaign mailer.` }],
            });
            const metaText = metaMsg.content[0]?.type === 'text' ? metaMsg.content[0].text.trim() : '{}';
            const parsed = JSON.parse(metaText) as { subject?: string; previewText?: string };
            if (parsed.subject) subject = parsed.subject;
            if (parsed.previewText) previewText = parsed.previewText;
          } catch { /* keep defaults */ }

          // Step 2: generate HTML
          const prompt = `You are a world-class HTML email designer. Create a beautiful, clean, mobile-responsive HTML email.

${campaignContext}

LOGO HTML TO USE IN HEADER (use exactly as-is):
${logoHtml}

HERO: ${heroSection}

DESIGN REQUIREMENTS:
- Complete HTML document, all CSS inlined PLUS a <style> block for media queries
- Max width 600px, centred, clean white (#ffffff) content area throughout
- Outer wrapper: very light grey background (#f8f8f8)
- HEADER: white background, logo centred or left-aligned, clean minimal padding (30px), no dark colours
- HERO: full-width image (if provided) OR bold headline section on white/very light background
- CONTENT SECTIONS: 2-3 distinct sections with clear visual hierarchy:
    • Strong opening headline (24-32px bold)
    • Body copy in brand voice (16px, line-height 1.6)
    • 2-3 feature/benefit callouts — use a light grey (#f4f4f4) or thin-bordered card style with Unicode icons (✦ ◆ ✓ →)
- CTA BUTTON: large, minimum 200px wide, bold text, brand accent colour (derive from brand voice/assets), 6px border-radius, centred, generous whitespace around it
- TYPOGRAPHY: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif. Body 16px line-height 1.6. Muted text #777, 13px.
- COLOUR PALETTE: white base with one accent colour derived from the brand/assets. Keep it restrained and clean.
- SPACING: generous padding (40px sections, 30px sides). Lots of white space.
- FOOTER: white or very light grey (#f8f8f8), small muted text, copyright "© ${new Date().getFullYear()} ${campaign.clientSlug}", unsubscribe link, clean and minimal
- Mobile: @media max-width 600px — padding 20px sides, font sizes adjust, images 100% width
- Return ONLY the raw HTML document. No explanation. No markdown. No code fences. Start with <!DOCTYPE html>.`;

          const htmlMsg = await anthropic.messages.create({
            model: aiModel,
            max_tokens: 8192,
            system: 'You are an expert HTML email developer. Output only raw HTML with no markdown, no code fences, no explanations.',
            messages: [{ role: 'user', content: prompt }],
          });

          if (!htmlMsg.content[0] || htmlMsg.content[0].type !== 'text') {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No content returned from AI' });
          }

          let html = htmlMsg.content[0].text.trim();
          html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();

          const mailer = await createCampaignMailer(input.campaignId);
          await updateCampaignMailer(mailer.id, { subject, previewText: previewText ?? null, htmlContent: html });
          return { ...mailer, subject, previewText: previewText ?? null, htmlContent: html };
        }),

      sendTest: protectedProcedure
        .input(z.object({
          mailerId: z.number().int(),
          emails: z.array(z.string().email()).min(1).max(10),
        }))
        .mutation(async ({ ctx, input }) => {
          if (!ENV.resendApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_API_KEY is not configured' });
          if (!ENV.resendFromEmail) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_FROM_EMAIL is not configured' });

          const mailer = await getCampaignMailerById(input.mailerId);
          if (!mailer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mailer not found' });
          const mailerCampaign = await getCampaignById(mailer.campaignId);
          if (mailerCampaign) assertCampaignAccess(ctx.user, mailerCampaign.clientSlug);
          if (!mailer.htmlContent) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mailer has no HTML content yet' });

          // Compress any large images referenced in the HTML before sending
          const html = await compressMailerImages(mailer.htmlContent);

          const resend = new Resend(ENV.resendApiKey);
          const results: PromiseSettledResult<unknown>[] = [];
          for (const email of input.emails) {
            results.push(await Promise.resolve(
              resend.emails.send({
                from: ENV.resendFromEmail,
                to: email,
                subject: `[TEST] ${mailer.subject || 'Email preview'}`,
                html,
              })
            ).then(r => ({ status: 'fulfilled' as const, value: r })).catch(e => ({ status: 'rejected' as const, reason: e })));
            if (input.emails.indexOf(email) < input.emails.length - 1) {
              await new Promise(r => setTimeout(r, 600));
            }
          }

          const failed = results.filter(r => r.status === 'rejected').length;
          if (failed === input.emails.length) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'All sends failed — check Resend config' });

          return { sent: results.filter(r => r.status === 'fulfilled').length, failed };
        }),

      getSegmentStatus: protectedProcedure
        .input(z.object({ clientSlug: z.string() }))
        .query(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) return { segmentId: null, subscriberCount: 0 };
          const segmentId = await getResendSegmentId(input.clientSlug);
          if (!segmentId) return { segmentId: null, subscriberCount: 0 };
          try {
            const resend = new Resend(ENV.resendApiKey);
            const allRes = await resend.contacts.list({ segmentId, limit: 100 });
            return { segmentId, subscriberCount: allRes?.data?.data?.length ?? 0 };
          } catch {
            return { segmentId, subscriberCount: 0 };
          }
        }),

      ensureSegment: protectedProcedure
        .input(z.object({ clientSlug: z.string(), clientName: z.string() }))
        .mutation(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_API_KEY is not configured' });
          const existing = await getResendSegmentId(input.clientSlug);
          if (existing) return { segmentId: existing };
          const resend = new Resend(ENV.resendApiKey);
          const res = await resend.segments.create({ name: input.clientName });
          if (res.error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Resend: ${res.error.message}` });
          const segmentId: string = res.data?.id ?? (res as any)?.id;
          if (!segmentId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Resend segment created but returned no ID' });
          await setResendSegmentId(input.clientSlug, segmentId);
          return { segmentId };
        }),

      listSubscribers: protectedProcedure
        .input(z.object({ clientSlug: z.string() }))
        .query(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) return [];
          const segmentId = await getResendSegmentId(input.clientSlug);
          if (!segmentId) return [];
          try {
            const resend = new Resend(ENV.resendApiKey);
            const res = await resend.contacts.list({ segmentId, limit: 100 });
            return (res?.data?.data ?? []) as { id: string; email: string; first_name: string; last_name: string; unsubscribed: boolean; created_at: string }[];
          } catch {
            return [];
          }
        }),

      addSubscriber: protectedProcedure
        .input(z.object({
          clientSlug: z.string(),
          clientName: z.string(),
          email: z.string().email(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_API_KEY is not configured' });
          let segmentId = await getResendSegmentId(input.clientSlug);
          const resend = new Resend(ENV.resendApiKey);
          if (!segmentId) {
            const res = await resend.segments.create({ name: input.clientName });
            if (res.error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Resend: ${res.error.message}` });
            segmentId = res.data?.id ?? (res as any)?.id;
            if (!segmentId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Resend segment created but returned no ID' });
            await setResendSegmentId(input.clientSlug, segmentId);
          }
          await resend.contacts.create({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            unsubscribed: false,
            segments: [{ id: segmentId }],
          });
          return { ok: true };
        }),

      importSubscribers: protectedProcedure
        .input(z.object({
          clientSlug: z.string(),
          clientName: z.string(),
          contacts: z.array(z.object({
            email: z.string().email(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
          })).min(1).max(500),
        }))
        .mutation(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_API_KEY is not configured' });
          let segmentId = await getResendSegmentId(input.clientSlug);
          const resend = new Resend(ENV.resendApiKey);
          if (!segmentId) {
            const res = await resend.segments.create({ name: input.clientName });
            if (res.error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Resend: ${res.error.message}` });
            segmentId = res.data?.id ?? (res as any)?.id;
            if (!segmentId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Resend segment created but returned no ID' });
            await setResendSegmentId(input.clientSlug, segmentId);
          }
          let added = 0;
          let failed = 0;
          for (const contact of input.contacts) {
            try {
              await resend.contacts.create({ email: contact.email, firstName: contact.firstName, lastName: contact.lastName, unsubscribed: false, segments: [{ id: segmentId }] });
              added++;
            } catch {
              failed++;
            }
            // Respect Resend rate limit
            await new Promise(r => setTimeout(r, 250));
          }
          return { added, failed };
        }),

      removeSubscriber: protectedProcedure
        .input(z.object({ clientSlug: z.string(), email: z.string().email() }))
        .mutation(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_API_KEY is not configured' });
          const segmentId = await getResendSegmentId(input.clientSlug);
          if (!segmentId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No subscriber list for this client' });
          const resend = new Resend(ENV.resendApiKey);
          await resend.contacts.segments.remove({ email: input.email, segmentId });
          return { ok: true };
        }),

      chat: router({
        getMessages: protectedProcedure
          .input(z.object({ mailerId: z.number().int() }))
          .query(async ({ ctx, input }) => {
            const mailer = await getCampaignMailerById(input.mailerId);
            if (mailer) {
              const campaign = await getCampaignById(mailer.campaignId);
              if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
            }
            return getMailerChatMessages(input.mailerId);
          }),

        send: protectedProcedure
          .input(z.object({
            mailerId: z.number().int(),
            message: z.string().min(1).max(8000),
          }))
          .mutation(async ({ ctx, input }) => {
            if (!ENV.anthropicApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Anthropic API key not configured' });

            const mailer = await getCampaignMailerById(input.mailerId);
            if (!mailer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mailer not found' });

            const [campaign, assets, allMailers, posts, history] = await Promise.all([
              getCampaignById(mailer.campaignId),
              getCampaignAssets(mailer.campaignId),
              getCampaignMailers(mailer.campaignId),
              getPostsByCampaign(mailer.campaignId),
              getMailerChatMessages(input.mailerId),
            ]);

            if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            assertCampaignAccess(ctx.user, campaign.clientSlug);

            // Build rich context for the system prompt
            const assetsSection = assets.filter(a => a.aiDescription).length > 0
              ? `\n\nBRAND ASSETS:\n${assets.filter(a => a.aiDescription).map((a, i) => `- ${a.label || `Asset ${i + 1}`}: ${a.aiDescription}`).join('\n')}`
              : '';

            const imagesSection = posts.filter(p => p.imageUrl).length > 0
              ? `\n\nGENERATED CAMPAIGN IMAGES (for visual style reference):\n${posts.filter(p => p.imageUrl).slice(0, 8).map((p, i) => `- Image ${i + 1}${p.theme ? ` (${p.theme})` : ''}: ${p.imageUrl}`).join('\n')}`
              : '';

            const otherMailers = allMailers.filter(m => m.id !== input.mailerId);
            const mailerPosition = allMailers.findIndex(m => m.id === input.mailerId) + 1;
            const totalMailers = allMailers.length;
            const mailersSection = otherMailers.length > 0
              ? `\n\nOTHER MAILERS IN THIS SEQUENCE:\n${otherMailers.map((m, i) => `Email ${i + 1}: "${m.subject || 'Untitled'}"\n${m.htmlContent ? m.htmlContent.slice(0, 600) + (m.htmlContent.length > 600 ? '...' : '') : '(no content)'}`).join('\n\n')}`
              : '';

            const systemPrompt = `You are an expert HTML email designer and copywriter embedded inside a marketing portal. You help the admin iteratively improve and redesign email HTML by chatting.

CAMPAIGN CONTEXT:
Campaign: ${campaign.name}
Client: ${campaign.clientSlug}
Brand Voice: ${campaign.brandVoice ?? 'Not specified'}
Target Audience: ${campaign.targetAudience ?? 'Not specified'}
Content Themes: ${campaign.contentThemes ?? 'Not specified'}
Strategy: ${campaign.strategy ? campaign.strategy.slice(0, 1000) : 'Not specified'}${assetsSection}${imagesSection}${mailersSection}

CURRENT MAILER BEING EDITED:
Position: Email ${mailerPosition} of ${totalMailers} in the sequence
Subject: ${mailer.subject || '(none)'}
Preview Text: ${mailer.previewText || '(none)'}
HTML Content:
${mailer.htmlContent || '(empty)'}

BRAND GUIDELINES (apply to all output):
- Primary colour: #2D7AB6 (blue) — use for primary CTAs, accents, labels
- Dark colour: #111111 — use for headings, secondary CTAs, dark backgrounds
- Light background: #f7f9fc — use for callout boxes and section backgrounds
- Tone: direct, no-fluff, outcomes-focused. No buzzwords, no hype. Short sentences. Active voice.
- Always write as if the reader is a busy business owner who values results over promises.

CTA RULES:
- One primary CTA per email (blue #2D7AB6 button). Secondary CTAs are optional (dark #111111 button).
- CTAs must link to specific pages — NEVER link to the bare homepage (https://www.grodigital.co.za with no path).
  - "See what's included" / "View marketing packages" → https://www.grodigital.co.za/services/marketing
  - "Book a strategy call" / booking CTAs → https://www.grodigital.co.za/contact
  - "Claim your spot" / sign-up CTAs → https://www.grodigital.co.za/contact

EMAIL SEQUENCE FRAMING (use to set the right tone):
- Email 1 of 4: Announcement — introduce the new service, build curiosity
- Email 2 of 4: Education — explain exactly what's included, remove doubt
- Email 3 of 4: Urgency/conviction — competitive pressure, why act now
- Email 4 of 4: Close — concrete offer, scarcity, clear next step

INSTRUCTIONS:
- When the user asks for changes to the email, respond with the COMPLETE updated HTML document.
- Start your HTML response on a new line after any explanation text.
- If providing HTML, always include the FULL document starting with <!DOCTYPE html> — never partial snippets.
- You may also answer questions, explain choices, or suggest improvements without outputting HTML.
- Keep responses concise. If outputting HTML, provide it after a brief explanation (1-3 sentences max before the code).`;

            // Save user message
            await insertMailerChatMessage(input.mailerId, 'user', input.message);

            // Build messages array from history + new message
            const msgs: { role: 'user' | 'assistant'; content: string }[] = [
              ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
              { role: 'user', content: input.message },
            ];

            const aiModel = (await getSetting('aiModel')) ?? 'claude-sonnet-4-6';
            const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

            const response = await anthropic.messages.create({
              model: aiModel,
              max_tokens: 8192,
              system: systemPrompt,
              messages: msgs,
            });

            const replyText = response.content[0]?.type === 'text' ? response.content[0].text : '';

            // Save assistant reply
            await insertMailerChatMessage(input.mailerId, 'assistant', replyText);

            return { reply: replyText };
          }),

        clear: protectedProcedure
          .input(z.object({ mailerId: z.number().int() }))
          .mutation(async ({ ctx, input }) => {
            const mailer = await getCampaignMailerById(input.mailerId);
            if (mailer) {
              const campaign = await getCampaignById(mailer.campaignId);
              if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
            }
            await clearMailerChatMessages(input.mailerId);
            return { success: true };
          }),
      }),

      broadcast: protectedProcedure
        .input(z.object({
          mailerId: z.number().int(),
          clientSlug: z.string(),
          scheduledAt: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          assertClientSlugAccess(ctx.user, input.clientSlug);
          if (!ENV.resendApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_API_KEY is not configured' });
          if (!ENV.resendFromEmail) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'RESEND_FROM_EMAIL is not configured' });

          const segmentId = await getResendSegmentId(input.clientSlug);
          if (!segmentId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No subscriber list set up for this client. Add subscribers first.' });

          const mailer = await getCampaignMailerById(input.mailerId);
          if (!mailer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mailer not found' });
          if (!mailer.htmlContent) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mailer has no HTML content yet' });
          if (!mailer.subject) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mailer must have a subject before sending' });

          const resend = new Resend(ENV.resendApiKey);
          const res = await (resend.broadcasts as any).create({
            segmentId,
            from: ENV.resendFromEmail,
            subject: mailer.subject,
            html: mailer.htmlContent,
            send: true,
            ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
          });

          const broadcastId: string = res?.data?.id ?? res?.id;
          if (!broadcastId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Broadcast creation failed' });

          await updateCampaignMailer(input.mailerId, {
            status: input.scheduledAt ? 'scheduled' : 'sent',
            sentAt: input.scheduledAt ? null : new Date(),
          });

          return { broadcastId };
        }),
    }),
  }),

  instagram: router({
    getStatus: protectedProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        const tokens = await getInstagramTokens(input.clientSlug);
        if (!tokens) return { connected: false, username: null, businessId: null };
        return { connected: true, username: tokens.username, businessId: tokens.businessId };
      }),

    disconnect: protectedProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        await clearInstagramTokens(input.clientSlug);
        return { success: true };
      }),

    // Fix the stored businessId by re-fetching from /me using the existing token
    refreshUserId: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ input }) => {
        const tokens = await getInstagramTokens(input.clientSlug);
        if (!tokens) throw new TRPCError({ code: 'NOT_FOUND', message: 'No Instagram connection found' });
        const { id, username } = await getIgUserInfo(tokens.accessToken);
        await storeInstagramTokens(input.clientSlug, id, tokens.accessToken, username);
        return { id, username };
      }),
  }),

  facebook: router({
    getStatus: protectedProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        const tokens = await getFacebookTokens(input.clientSlug);
        if (!tokens) return { connected: false, pageName: null, pageId: null };
        return { connected: true, pageName: tokens.pageName, pageId: tokens.pageId };
      }),

    disconnect: protectedProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        await clearFacebookTokens(input.clientSlug);
        return { success: true };
      }),

    getPendingPages: adminProcedure
      .input(z.object({ state: z.string() }))
      .query(({ input }) => {
        return getPendingFacebookPages(input.state) ?? null;
      }),

    confirmPage: adminProcedure
      .input(z.object({ state: z.string(), pageId: z.string() }))
      .mutation(async ({ input }) => {
        await confirmFacebookPage(input.state, input.pageId);
        return { success: true };
      }),
  }),

  media: router({
    list: adminProcedure.query(async () => {
      return getMediaFiles();
    }),

    upload: adminProcedure
      .input(z.object({
        name: z.string(),
        base64: z.string(),
        mimeType: z.string(),
        size: z.number().int(),
      }))
      .mutation(async ({ input }) => {
        const ext = input.mimeType.split('/')[1]?.split('+')[0] ?? 'bin';
        const key = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const buffer = Buffer.from(input.base64, 'base64');
        const { url } = await storagePut(key, buffer, input.mimeType);
        const id = await insertMediaFile({ name: input.name, url, key, mimeType: input.mimeType, size: input.size });
        return { id, url, key };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const key = await deleteMediaFile(input.id);
        if (key) {
          try { await storageDelete(key); } catch { /* ignore R2 errors */ }
        }
        return { success: true };
      }),
  }),

  outreach: router({
    prospect: router({
      list: adminProcedure.query(async () => {
        return getProspects();
      }),

      create: adminProcedure
        .input(z.object({
          businessName: z.string().min(1),
          contactName: z.string().optional(),
          contactEmail: z.string().optional(),
          contactPhone: z.string().optional(),
          linkedinUrl: z.string().optional(),
          instagramHandle: z.string().optional(),
          website: z.string().optional(),
          industry: z.string().optional(),
          location: z.string().optional(),
          source: z.enum(['discovery', 'manual']).optional(),
          sourceQuery: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const id = await createProspect(input);
          return { id };
        }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          businessName: z.string().optional(),
          contactName: z.string().nullable().optional(),
          contactEmail: z.string().nullable().optional(),
          contactPhone: z.string().nullable().optional(),
          linkedinUrl: z.string().nullable().optional(),
          instagramHandle: z.string().nullable().optional(),
          website: z.string().nullable().optional(),
          industry: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          status: z.enum(['new', 'in_sequence', 'replied', 'converted', 'unsubscribed']).optional(),
          notes: z.string().nullable().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await updateProspect(id, data);
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await deleteProspect(input.id);
          return { success: true };
        }),

      discover: adminProcedure
        .input(z.object({ criteria: z.string().min(1) }))
        .mutation(async ({ input }) => {
          const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

          // Use AI to extract structured search params
          const extraction = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: `Extract search parameters from this outreach criteria: "${input.criteria}"
Return a JSON object with: { searchQuery: string, location: string | null }
searchQuery should be suitable for Google Places textSearch (e.g. "coffee shops").
Only return JSON, no explanation.`,
            }],
          });

          let searchQuery = input.criteria;
          let locationHint = '';
          try {
            const raw = (extraction.content[0] as { type: string; text: string }).text;
            const parsed = JSON.parse(raw);
            searchQuery = parsed.searchQuery ?? input.criteria;
            locationHint = parsed.location ?? '';
          } catch { /* use raw criteria */ }

          if (!ENV.googlePlacesApiKey) {
            return { candidates: [], error: 'Google Places API key not configured' };
          }

          const query = locationHint ? `${searchQuery} in ${locationHint}` : searchQuery;
          const placesRes = await fetch(
            'https://places.googleapis.com/v1/places:searchText',
            {
              method: 'POST',
              signal: AbortSignal.timeout(15_000),
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': ENV.googlePlacesApiKey,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.businessStatus',
              },
              body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
            },
          );
          const placesData = await placesRes.json() as { places?: Array<{ displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string }> };

          const candidates = (placesData.places ?? []).map((place) => ({
            businessName: place.displayName?.text ?? '',
            location: place.formattedAddress ?? '',
            website: place.websiteUri ?? '',
            phone: place.nationalPhoneNumber ?? '',
          }));

          return { candidates, sourceQuery: input.criteria };
        }),

      generateMessage: adminProcedure
        .input(z.object({ prospectId: z.number(), stepId: z.number() }))
        .mutation(async ({ input }) => {
          const prospect = await getProspectById(input.prospectId);
          if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });

          const db_steps = await getSequenceStepById(input.stepId);
          if (!db_steps) throw new TRPCError({ code: 'NOT_FOUND', message: 'Step not found' });

          const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
          const channelCtx = db_steps.channel === 'email' ? 'a professional email' : `a ${db_steps.channel} direct message`;

          const result = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: `Write ${channelCtx} for cold outreach on behalf of GRO Digital, a South African digital marketing agency.

Prospect details:
- Business: ${prospect.businessName}
- Contact: ${prospect.contactName ?? 'the owner'}
- Location: ${prospect.location ?? 'South Africa'}
- Industry: ${prospect.industry ?? 'unknown'}
- Website: ${prospect.website ?? 'unknown'}

Template to personalise:
${db_steps.messageTemplate}

${db_steps.subjectTemplate ? `Subject template: ${db_steps.subjectTemplate}\n` : ''}
Return JSON: { "subject": "...", "message": "..." }
For non-email channels, subject can be empty string.
Only return JSON.`,
            }],
          });

          try {
            const raw = (result.content[0] as { type: string; text: string }).text;
            const parsed = JSON.parse(raw);
            return { subject: parsed.subject ?? '', message: parsed.message ?? '' };
          } catch {
            return { subject: '', message: (result.content[0] as { type: string; text: string }).text };
          }
        }),
    }),

    sequence: router({
      list: adminProcedure.query(async () => {
        return getSequences();
      }),

      create: adminProcedure
        .input(z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          targetDescription: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const id = await createSequence(input);
          return { id };
        }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().nullable().optional(),
          targetDescription: z.string().nullable().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await updateSequence(id, data);
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await deleteSequence(input.id);
          return { success: true };
        }),

      steps: router({
        list: adminProcedure
          .input(z.object({ sequenceId: z.number() }))
          .query(async ({ input }) => {
            return getSequenceSteps(input.sequenceId);
          }),

        create: adminProcedure
          .input(z.object({
            sequenceId: z.number(),
            stepNumber: z.number(),
            delayDays: z.number().default(0),
            channel: z.enum(['email', 'linkedin', 'instagram']),
            subjectTemplate: z.string().optional(),
            messageTemplate: z.string().min(1),
          }))
          .mutation(async ({ input }) => {
            const id = await createSequenceStep(input);
            return { id };
          }),

        update: adminProcedure
          .input(z.object({
            id: z.number(),
            stepNumber: z.number().optional(),
            delayDays: z.number().optional(),
            channel: z.enum(['email', 'linkedin', 'instagram']).optional(),
            subjectTemplate: z.string().nullable().optional(),
            messageTemplate: z.string().optional(),
          }))
          .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await updateSequenceStep(id, data);
            return { success: true };
          }),

        delete: adminProcedure
          .input(z.object({ id: z.number() }))
          .mutation(async ({ input }) => {
            await deleteSequenceStep(input.id);
            return { success: true };
          }),
      }),
    }),

    send: router({
      list: adminProcedure
        .input(z.object({ prospectId: z.number().optional() }))
        .query(async ({ input }) => {
          return getSends(input.prospectId);
        }),

      enqueueSequence: adminProcedure
        .input(z.object({ prospectId: z.number(), sequenceId: z.number() }))
        .mutation(async ({ input }) => {
          const steps = await getSequenceSteps(input.sequenceId);
          if (steps.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sequence has no steps' });

          const now = new Date();
          for (const step of steps) {
            const scheduledAt = new Date(now.getTime() + step.delayDays * 24 * 60 * 60 * 1000);
            await createSend({
              prospectId: input.prospectId,
              sequenceId: input.sequenceId,
              stepId: step.id,
              channel: step.channel,
              subject: step.subjectTemplate ?? null,
              message: step.messageTemplate,
              status: 'draft',
              scheduledAt,
            });
          }

          await updateProspect(input.prospectId, { status: 'in_sequence' });
          return { success: true, count: steps.length };
        }),

      approveDraft: adminProcedure
        .input(z.object({ id: z.number(), subject: z.string().optional(), message: z.string().optional() }))
        .mutation(async ({ input }) => {
          const { id, ...updates } = input;
          await updateSend(id, { status: 'approved', ...updates });
          return { success: true };
        }),

      sendEmail: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const sends = await getSends();
          const send = sends.find(s => s.id === input.id);
          if (!send) throw new TRPCError({ code: 'NOT_FOUND', message: 'Send not found' });
          if (send.channel !== 'email') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not an email send' });

          const prospect = await getProspectById(send.prospectId);
          if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });
          if (!prospect.contactEmail) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Prospect has no email address' });

          const resend = new Resend(ENV.resendApiKey);
          const { data, error } = await resend.emails.send({
            from: 'GRO Digital <outreach@grodigital.co.za>',
            to: [prospect.contactEmail],
            subject: send.subject ?? '(No subject)',
            html: `<p>${(send.message ?? '').replace(/\n/g, '<br>')}</p>`,
          });

          if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

          await updateSend(input.id, { status: 'sent', sentAt: new Date(), resendMessageId: data?.id ?? null });
          return { success: true };
        }),

      markReplied: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const sends = await getSends();
          const send = sends.find(s => s.id === input.id);
          if (!send) throw new TRPCError({ code: 'NOT_FOUND', message: 'Send not found' });

          await updateSend(input.id, { status: 'replied' });

          const prospect = await getProspectById(send.prospectId);
          if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });

          await updateProspect(send.prospectId, { status: 'replied' });

          if (!prospect.leadId) {
            const leadId = await createLead({
              name: prospect.businessName,
              contactName: prospect.contactName ?? undefined,
              contactEmail: prospect.contactEmail ?? undefined,
              contactPhone: prospect.contactPhone ?? undefined,
              stage: 'prospect',
              notes: 'Auto-created from outreach reply',
            });
            await updateProspect(send.prospectId, { leadId });
            return { success: true, leadId };
          }

          return { success: true, leadId: prospect.leadId };
        }),
    }),
  }),

  // ── Client portal — scoped to the logged-in client's own data ──
  clientPortal: router({
    getProfile: clientProcedure.query(async ({ ctx }) => {
      return getClientProfile(ctx.clientSlug);
    }),

    getCampaigns: clientProcedure.query(async ({ ctx }) => {
      return getCampaignsByClientSlug(ctx.clientSlug);
    }),

    getCampaign: clientProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign || campaign.clientSlug !== ctx.clientSlug) return null;
        return campaign;
      }),

    getCampaignPosts: clientProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.clientSlug !== ctx.clientSlug) return [];
        return getPostsByCampaign(input.campaignId);
      }),

    getCampaignMailers: clientProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.clientSlug !== ctx.clientSlug) return [];
        return getCampaignMailers(input.campaignId);
      }),

    getInvoices: clientProcedure.query(async ({ ctx }) => {
      return getInvoicesByClientSlug(ctx.clientSlug);
    }),
  }),

  // ── Admin: portal user management ──
  portalUsers: router({
    listByClient: superAdminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        const users = await getClientUsersBySlug(input.clientSlug);
        return users.map(u => ({
          id: u.id,
          openId: u.openId,
          name: u.name,
          email: u.email,
          createdAt: u.createdAt,
          lastSignedIn: u.lastSignedIn,
        }));
      }),

    create: superAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        clientSlug: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { nanoid } = await import("nanoid");
        const openId = `client_${nanoid(16)}`;
        const passwordHash = await hashPassword(input.password);
        await createClientUser({
          openId,
          name: input.name,
          email: input.email.toLowerCase().trim(),
          passwordHash,
          clientSlug: input.clientSlug,
        });
        return { success: true, openId };
      }),

    resetPassword: superAdminProcedure
      .input(z.object({
        openId: z.string(),
        password: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const passwordHash = await hashPassword(input.password);
        await updateUserPasswordHash(input.openId, passwordHash);
        return { success: true };
      }),

    delete: superAdminProcedure
      .input(z.object({ openId: z.string() }))
      .mutation(async ({ input }) => {
        await deleteClientUser(input.openId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
