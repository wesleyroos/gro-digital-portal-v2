import { Resend } from 'resend';
import { buildAndSendRecurringInvoice, runMandateBillingTick } from './scheduler';
import sharp from 'sharp';
import { COOKIE_NAME } from "@shared/const";
import { isInternalEmail, isValidEmail, normalisePhone } from "@shared/contacts";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { adminProcedure, clientProcedure, protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";
import { z } from "zod";
import {
  deleteInvoice,
  duplicateInvoice,
  getInvoiceByNumber,
  getInvoiceByShareToken,
  getRecurringInvoiceConfig,
  upsertRecurringInvoiceConfig,
  getNextInvoiceNumber,
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
  sendWelcomeEmail,
  updateInvoice,
  setInvoiceSchedule,
  getLeads,
  createLead,
  getOrganisations,
  getOrganisationBySlug,
  upsertOrganisation,
  updateOrganisation,
  getContacts,
  getContactById,
  findContactByEmail,
  findContactByPhone,
  createContact,
  updateContact,
  deleteContact,
  updateLead,
  deleteLead,
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
  setPostNotes,
  maybeSendBatchCompleteEmail,
  sendPostRejectedEmail,
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
  storeLinkedinTokens,
  clearLinkedinTokens,
  getLinkedinTokens,
  updateLinkedinTokens,
  updatePostLinkedinId,
  setLinkedinPostTarget,
  updatePostLinkedinCaption,
  getCampaignAssets,
  getCampaignAssetById,
  insertCampaignAsset,
  deleteCampaignAsset,
  updateCampaignAssetDescription,
  getCampaignMailers,
  getPastScheduledMailers,
  markMailerAsSent,
  createCampaignMailer,
  updateCampaignMailer,
  deleteCampaignMailer,
  getCampaignMailerById,
  getResendSegmentId,
  setResendSegmentId,
  getMailchimpApiKey,
  setMailchimpApiKey,
  getSetting,
  setSetting,
  getCompanyInfo,
  setCompanyInfo,
  getMailerChatMessages,
  insertMailerChatMessage,
  clearMailerChatMessages,
  insertMailerEvent,
  getMailerAnalytics,
  getMediaFiles,
  insertMediaFile,
  deleteMediaFile,
  getProspects,
  getProspectById,
  createProspect,
  updateProspect,
  deleteProspect,
  bulkCreateProspects,
  getClientUsersBySlug,
  createClientUser,
  deleteClientUser,
  updateUserPasswordHash,
  updateUserProfile,
  getCampaignsByClientSlug,
  getAllUsers,
  updateUserAssignedClients,
  updateUserRole,
  logUserActivity,
  getUserActivity,
  touchUserSeen,
  insertAiInteraction,
  getAiInteractions,
  getProjects,
  upsertProject,
  upsertProjectFromSource,
  getQuotes,
  getQuoteByToken,
  createQuote,
  updateQuote,
  deleteQuote,
  signQuote,
  createMandate,
  getMandateByToken,
  getMandateById,
  getMandatesByClientSlug,
  getMandateLineItems,
  updateMandateStatus,
  replaceMandateLineItems,
  listFlyAppMappings,
  upsertFlyAppMapping,
  deleteFlyAppMapping,
  listManualApps,
  upsertManualApp,
  deleteManualApp,
} from "./db";
import { hashPassword } from "./_core/oauth";
import { initializeTransaction, randsToCents, getPaystackKeys } from "./paystack";
import Anthropic from "@anthropic-ai/sdk";
import { describeImageForBrand } from "./_core/imageGeneration";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { generateAndStorePostImage } from "./image-gen";
import { storagePut, storageDelete } from "./storage";
import { createMediaContainer, createVideoMediaContainer, publishMedia, getIgUserInfo, getPostInsights } from "./instagram";
import { getFacebookPostInsights, postImageToPage, postVideoToPage } from "./facebook";
import { getPendingFacebookPages, confirmFacebookPage } from "./facebook-oauth";
import { ensureFreshToken as ensureLinkedinToken, initializeImageUpload, uploadImageBinary, createImagePost as createLinkedinImagePost, createTextPost as createLinkedinTextPost, getPostAnalytics as getLinkedinPostAnalytics } from "./linkedin";
import { getCalendarEvents } from "./calendar";

function instrumentMailerHtml(html: string, mailerId: number, baseUrl: string): string {
  // Rewrite all http(s) links through our click-tracking redirect, skipping system links
  const withClicks = html.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url: string) => {
    if (
      url.includes('{{{RESEND_UNSUBSCRIBE_URL}}}') ||
      url.includes('/r?') ||
      url.includes('/unsubscribe') ||
      url.includes(`/m/${mailerId}`)
    ) return `href="${url}"`;
    const encoded = Buffer.from(url).toString('base64url');
    return `href="${baseUrl}/r?m=${mailerId}&u=${encoded}"`;
  });
  // Inject 1x1 open-tracking pixel before </body>
  const pixel = `<img src="${baseUrl}/o?m=${mailerId}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" alt="" />`;
  return withClicks.replace(/<\/body>/i, `${pixel}</body>`);
}

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

/** Throws FORBIDDEN if a client user tries to access a campaign that isn't theirs. Enforces assignedClients for admin role. */
function assertCampaignAccess(user: { role: string; clientSlug?: string | null; assignedClients?: string | null }, campaignClientSlug: string) {
  if (user.role === 'client' && user.clientSlug !== campaignClientSlug) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
  if (user.role === 'admin') {
    const assigned: string[] = user.assignedClients ? JSON.parse(user.assignedClients) : [];
    if (!assigned.includes(campaignClientSlug)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
  }
}

/** Throws FORBIDDEN if a client user tries to access another client's slug. Enforces assignedClients for admin role. */
function assertClientSlugAccess(user: { role: string; clientSlug?: string | null; assignedClients?: string | null }, clientSlug: string) {
  if (user.role === 'client' && user.clientSlug !== clientSlug) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
  if (user.role === 'admin') {
    const assigned: string[] = user.assignedClients ? JSON.parse(user.assignedClients) : [];
    if (!assigned.includes(clientSlug)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
  }
}

/**
 * Transition past-scheduled mailers to sent.
 * - Mailers WITH a resendBroadcastId: verify with Resend API first; only mark sent if Resend confirms.
 * - Mailers WITHOUT a resendBroadcastId (old records): transition based on time alone as a fallback.
 */
async function recoverMissingSentCount(campaignId: number, clientSlug: string): Promise<void> {
  if (!ENV.resendApiKey) return;
  const allMailers = await getCampaignMailers(campaignId);
  const missing = allMailers.filter(m => m.status === 'sent' && !m.sentCount);
  if (missing.length === 0) return;
  try {
    const segmentId = await getResendSegmentId(clientSlug);
    if (!segmentId) return;
    const resend = new Resend(ENV.resendApiKey);
    const res = await resend.contacts.list({ segmentId, limit: 1000 });
    const sentCount = res?.data?.data?.length ?? 0;
    if (sentCount > 0) {
      await Promise.all(missing.map(m => updateCampaignMailer(m.id, { sentCount })));
    }
  } catch { /* best effort */ }
}

async function resolveScheduledMailers(campaignId: number): Promise<void> {
  const candidates = await getPastScheduledMailers(campaignId);
  if (candidates.length === 0) return;

  for (const m of candidates) {
    if (m.resendBroadcastId && ENV.resendApiKey) {
      try {
        const resend = new Resend(ENV.resendApiKey);
        const result = await (resend.broadcasts as any).get(m.resendBroadcastId);
        const status: string = result?.data?.status ?? result?.status ?? '';
        if (status === 'sent') {
          await markMailerAsSent(m.id, m.scheduledAt ?? new Date());
        }
        // If status is anything other than 'sent' (e.g. 'sending', 'failed'), leave as-is
      } catch { /* best effort — leave as scheduled if Resend is unreachable */ }
    } else {
      // No broadcastId stored (pre-fix record) — fall back to time-based transition
      await markMailerAsSent(m.id, m.scheduledAt ?? new Date());
    }
  }
}

/**
 * Run the same website health checks used during prospect discovery against a
 * single website URL. Returns a fresh issues list, mobile PageSpeed score and
 * a best-effort lead-score adjustment tied to the website's condition. Used by
 * the prospect update mutation so adding/changing a website re-evaluates the
 * prospect instead of leaving stale "No website" issues in place.
 */
async function recomputeWebsiteHealth(
  website: string | null | undefined,
  existingIssues: string[],
): Promise<{ issues: string[]; pageSpeedScore: number | null; websiteScoreContribution: number }> {
  // Strip issues that are website-derived; keep everything else (e.g. review-based).
  const preservedIssues = existingIssues.filter(
    i => i !== 'No website' && i !== 'No SSL' && !i.startsWith('Score:'),
  );

  if (!website) {
    return {
      issues: [...preservedIssues, 'No website'],
      pageSpeedScore: null,
      websiteScoreContribution: 30,
    };
  }

  const issues = [...preservedIssues];
  let pageSpeedScore: number | null = null;

  try {
    const psRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(website)}&strategy=mobile`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (psRes.ok) {
      const psData = await psRes.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
      const raw = psData.lighthouseResult?.categories?.performance?.score;
      if (typeof raw === 'number') {
        pageSpeedScore = Math.round(raw * 100);
        if (pageSpeedScore < 50) issues.push(`Score: ${pageSpeedScore}/100`);
      }
    }
  } catch { /* ignore */ }

  try {
    const headRes = await fetch(website, { method: 'HEAD', signal: AbortSignal.timeout(5_000), redirect: 'follow' });
    if (!headRes.url.startsWith('https://')) issues.push('No SSL');
  } catch { /* ignore */ }

  let websiteScoreContribution = 0;
  if (pageSpeedScore !== null && pageSpeedScore < 30) websiteScoreContribution += 25;
  else if (pageSpeedScore !== null && pageSpeedScore < 50) websiteScoreContribution += 10;
  if (issues.includes('No SSL')) websiteScoreContribution += 15;

  return { issues, pageSpeedScore, websiteScoreContribution };
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

    // Admin-only: list all invoices (filtered to assigned clients for admin role)
    list: adminProcedure.query(async ({ ctx }) => {
      const all = await getAllInvoices();
      if (ctx.user.role === 'admin') {
        const assigned: string[] = ctx.user.assignedClients ? JSON.parse(ctx.user.assignedClients) : [];
        return all.filter(i => assigned.includes(i.clientSlug));
      }
      return all;
    }),

    delete: adminProcedure
      .input(z.object({ invoiceNumber: z.string() }))
      .mutation(async ({ input }) => {
        await deleteInvoice(input.invoiceNumber);
        return { success: true };
      }),

    duplicate: adminProcedure
      .input(z.object({ invoiceNumber: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const result = await duplicateInvoice(input.invoiceNumber);
        if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        logUserActivity({ openId: ctx.user.openId, action: "duplicate_invoice", meta: `${input.invoiceNumber} → ${result.invoiceNumber}` }).catch(() => {});
        return result;
      }),

    bulkDelete: adminProcedure
      .input(z.object({ invoiceNumbers: z.array(z.string()).min(1) }))
      .mutation(async ({ input }) => {
        for (const invoiceNumber of input.invoiceNumbers) {
          await deleteInvoice(invoiceNumber);
        }
        return { success: true, deleted: input.invoiceNumbers.length };
      }),

    // Admin-only: list invoices for a specific client
    listByClient: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        return getInvoicesByClientSlug(input.clientSlug);
      }),

    // Admin-only: list all distinct clients (filtered to assigned clients for admin role)
    clients: adminProcedure.query(async ({ ctx }) => {
      const all = await getDistinctClients();
      if (ctx.user.role === 'admin') {
        const assigned: string[] = ctx.user.assignedClients ? JSON.parse(ctx.user.assignedClients) : [];
        return all.filter(c => assigned.includes(c.clientSlug));
      }
      return all;
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
        scheduledSendDate: z.string().nullish(),
        repeatMonthly: z.boolean().default(false),
        items: z.array(z.object({
          description: z.string().min(1),
          frequency: z.string().default('Once Off'),
          vat: z.string().default('No VAT'),
          unitPrice: z.number().min(0),
          quantity: z.number().int().min(1).default(1),
          discountPercent: z.number().min(0).max(100).default(0),
          lineTotal: z.number().min(0),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items, invoiceDate, dueDate, scheduledSendDate, repeatMonthly, ...invoiceData } = input;
        const result = await createInvoice(
          {
            ...invoiceData,
            invoiceDate: new Date(invoiceDate),
            dueDate: dueDate ? new Date(dueDate) : null,
            scheduledSendDate: scheduledSendDate || null,
            repeatMonthly: repeatMonthly ? 1 : 0,
          },
          items,
        );
        logUserActivity({ openId: ctx.user.openId, action: "create_invoice", meta: invoiceData.invoiceNumber }).catch(() => {});
        return result;
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
        scheduledSendDate: z.string().nullish(),
        repeatMonthly: z.boolean().default(false),
        items: z.array(z.object({
          description: z.string().min(1),
          frequency: z.string(),
          vat: z.string(),
          unitPrice: z.number().min(0),
          quantity: z.number().int().min(1),
          discountPercent: z.number().min(0).max(100).default(0),
          lineTotal: z.number().min(0),
        })),
      }))
      .mutation(async ({ input }) => {
        const { invoiceNumber, items, invoiceDate, dueDate, scheduledSendDate, repeatMonthly, ...rest } = input;
        await updateInvoice(
          invoiceNumber,
          { ...rest, invoiceDate: new Date(invoiceDate), dueDate: dueDate ? new Date(dueDate) : null, scheduledSendDate: scheduledSendDate || null, repeatMonthly: repeatMonthly ? 1 : 0 },
          items,
        );
        return { success: true };
      }),

    // Admin-only: send invoice by email
    sendEmail: adminProcedure
      .input(z.object({
        invoiceId: z.number(),
        recipientEmail: z.string().refine(
          (val) => val.split(',').map(s => s.trim()).filter(Boolean).every(e => z.string().email().safeParse(e).success),
          { message: "Invalid email address" }
        ),
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

    setScheduledSendDate: adminProcedure
      .input(z.object({
        invoiceNumber: z.string(),
        scheduledSendDate: z.string().nullable(),
        repeatMonthly: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        await setInvoiceSchedule(input.invoiceNumber, input.scheduledSendDate, input.repeatMonthly);
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
      .mutation(async ({ ctx, input }) => {
        await createTask(input.text, input.clientSlug, input.clientName, {
          status: input.status ?? undefined,
          dueDate: input.dueDate,
          priority: input.priority,
          notes: input.notes,
        });
        logUserActivity({ openId: ctx.user.openId, action: "create_task", meta: input.text.slice(0, 255) }).catch(() => {});
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
      .mutation(async ({ ctx, input }) => {
        await createLead(input);
        logUserActivity({ openId: ctx.user.openId, action: "create_lead", meta: input.name }).catch(() => {});
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

  organisation: router({
    list: adminProcedure.query(async () => getOrganisations()),

    getBySlug: adminProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => getOrganisationBySlug(input.slug)),

    upsert: adminProcedure
      .input(z.object({
        slug: z.string().min(1),
        name: z.string().min(1),
        stage: z.enum(['prospect', 'lead', 'client', 'past_client']).default('prospect'),
        website: z.string().nullish(),
        industry: z.string().nullish(),
        address: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const id = await upsertOrganisation(input);
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        slug: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        stage: z.enum(['prospect', 'lead', 'client', 'past_client']).optional(),
        website: z.string().nullish(),
        industry: z.string().nullish(),
        address: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateOrganisation(id, data);
        return { success: true };
      }),
  }),

  contact: router({
    list: adminProcedure.query(async () => getContacts()),

    create: adminProcedure
      .input(z.object({
        organisationId: z.number().nullish(),
        firstName: z.string().nullish(),
        lastName: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        role: z.string().nullish(),
        isPrimary: z.boolean().default(false),
        isInternal: z.boolean().default(false),
        consentBasis: z.enum(['none', 'existing_customer', 'explicit_optin']).default('none'),
        consentSource: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email ? input.email.trim().toLowerCase() : null;
        const phone = normalisePhone(input.phone);
        if (input.phone && !phone) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `"${input.phone}" is not a usable phone number` });
        }
        if (email && !isValidEmail(email)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `"${email}" is not a valid email address` });
        }
        if (!email && !phone) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A contact needs an email address or a phone number' });
        }
        // Unique indexes would reject these anyway; naming the existing contact
        // turns a constraint error into something actionable.
        if (email) {
          const clash = await findContactByEmail(email);
          if (clash) throw new TRPCError({ code: 'CONFLICT', message: `${email} already belongs to contact #${clash.id}` });
        }
        if (phone) {
          const clash = await findContactByPhone(phone);
          if (clash) throw new TRPCError({ code: 'CONFLICT', message: `${phone} already belongs to contact #${clash.id}` });
        }
        const id = await createContact({
          ...input,
          email,
          phone,
          isInternal: input.isInternal || isInternalEmail(email),
          consentAt: input.consentBasis === 'none' ? null : new Date(),
        });
        logUserActivity({ openId: ctx.user.openId, action: 'create_contact', meta: email ?? phone ?? String(id) }).catch(() => {});
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        organisationId: z.number().nullish(),
        firstName: z.string().nullish(),
        lastName: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        role: z.string().nullish(),
        isPrimary: z.boolean().optional(),
        isInternal: z.boolean().optional(),
        consentBasis: z.enum(['none', 'existing_customer', 'explicit_optin']).optional(),
        consentSource: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        const existing = await getContactById(id);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });

        const data: Record<string, unknown> = { ...rest };
        if ('email' in rest) {
          const email = rest.email ? rest.email.trim().toLowerCase() : null;
          if (email && !isValidEmail(email)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `"${email}" is not a valid email address` });
          }
          if (email && email !== existing.email) {
            const clash = await findContactByEmail(email);
            if (clash) throw new TRPCError({ code: 'CONFLICT', message: `${email} already belongs to contact #${clash.id}` });
          }
          data.email = email;
        }
        if ('phone' in rest) {
          const phone = normalisePhone(rest.phone);
          if (rest.phone && !phone) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `"${rest.phone}" is not a usable phone number` });
          }
          if (phone && phone !== existing.phone) {
            const clash = await findContactByPhone(phone);
            if (clash) throw new TRPCError({ code: 'CONFLICT', message: `${phone} already belongs to contact #${clash.id}` });
          }
          data.phone = phone;
        }
        // Recording a basis records when — an undated consent claim is not one.
        if (rest.consentBasis && rest.consentBasis !== existing.consentBasis) {
          data.consentAt = rest.consentBasis === 'none' ? null : new Date();
        }
        await updateContact(id, data);
        return { success: true };
      }),

    setOptOut: adminProcedure
      .input(z.object({ id: z.number(), optedOut: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateContact(input.id, { optedOutAt: input.optedOut ? new Date() : null });
        return { success: true };
      }),

    setWhatsappOptIn: adminProcedure
      .input(z.object({ id: z.number(), optedIn: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateContact(input.id, { whatsappOptInAt: input.optedIn ? new Date() : null });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteContact(input.id);
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
    getPaystackMode: adminProcedure.query(async () => {
      const mode = (await getSetting('paystack_mode')) ?? 'live';
      return { mode: mode as 'live' | 'test' };
    }),
    setPaystackMode: adminProcedure
      .input(z.object({ mode: z.enum(['live', 'test']) }))
      .mutation(async ({ input }) => {
        await setSetting('paystack_mode', input.mode);
        return { mode: input.mode };
      }),
    getCompanyInfo: publicProcedure.query(async () => {
      return getCompanyInfo();
    }),
    setCompanyInfo: adminProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(200),
        addressLine1: z.string().trim().max(200),
        addressLine2: z.string().trim().max(200),
        email: z.string().trim().max(200),
        website: z.string().trim().max(200),
      }))
      .mutation(async ({ input }) => {
        await setCompanyInfo(input);
        return input;
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

  quote: router({
    list: adminProcedure.query(async () => getQuotes()),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const quote = await getQuoteByToken(input.token);
        if (!quote) return null;
        return quote;
      }),

    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        clientName: z.string().min(1),
        clientEmail: z.string().email().optional(),
        htmlContent: z.string().min(1),
        status: z.enum(['draft', 'sent']).default('draft'),
      }))
      .mutation(async ({ input }) => {
        const token = await createQuote(input);
        return { token };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        title: z.string().min(1).optional(),
        clientName: z.string().min(1).optional(),
        clientEmail: z.string().email().optional(),
        htmlContent: z.string().min(1).optional(),
        status: z.enum(['draft', 'sent', 'signed']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateQuote(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteQuote(input.id);
        return { success: true };
      }),

    sign: publicProcedure
      .input(z.object({ token: z.string(), signedBy: z.string().min(1), signedCompany: z.string().min(1), signerEmail: z.string().email().optional() }))
      .mutation(async ({ input, ctx }) => {
        const quote = await getQuoteByToken(input.token);
        if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
        if (quote.status === 'signed') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Quote already signed' });
        const ip = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? ctx.req.socket?.remoteAddress ?? 'unknown';
        await signQuote(input.token, input.signedBy, input.signedCompany, ip, input.signerEmail);

        if (ENV.resendApiKey) {
          const resend = new Resend(ENV.resendApiKey);
          const signedAt = new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
          const quoteUrl = `${ctx.req.headers['origin'] ?? 'https://portal.grodigital.co.za'}/quotes`;
          const from = ENV.resendFromEmail || 'GRO Digital <noreply@grodigital.co.za>';

          const internalHtml = `
            <p>A quote has been signed.</p>
            <table style="border-collapse:collapse;margin-top:16px;">
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Quote</td><td style="font-size:14px;font-weight:600;">${quote.title}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Signed by</td><td style="font-size:14px;">${input.signedBy}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Company</td><td style="font-size:14px;">${input.signedCompany}</td></tr>
              ${input.signerEmail ? `<tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Email</td><td style="font-size:14px;">${input.signerEmail}</td></tr>` : ''}
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Time</td><td style="font-size:14px;">${signedAt} SAST</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">IP</td><td style="font-size:14px;">${ip}</td></tr>
            </table>
            <p style="margin-top:24px;"><a href="${quoteUrl}" style="background:#111;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">View in portal</a></p>
          `;

          const clientHtml = `
            <p>Hi ${input.signedBy},</p>
            <p>This email confirms that you have electronically signed and accepted the following quote from Gro Digital.</p>
            <table style="border-collapse:collapse;margin-top:16px;">
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Quote</td><td style="font-size:14px;font-weight:600;">${quote.title}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Signed by</td><td style="font-size:14px;">${input.signedBy}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Company</td><td style="font-size:14px;">${input.signedCompany}</td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#666;font-size:14px;">Date</td><td style="font-size:14px;">${signedAt} SAST</td></tr>
            </table>
            <p style="margin-top:24px;color:#666;font-size:13px;">If you did not sign this quote or have any questions, please reply to this email or contact wesley@grodigital.co.za.</p>
            <p style="color:#666;font-size:13px;">— Gro Digital (Pty) Ltd</p>
          `;

          await Promise.all([
            resend.emails.send({ from, to: 'wesley@grodigital.co.za', subject: `Quote signed: ${quote.title}`, html: internalHtml }),
            ...(input.signerEmail ? [resend.emails.send({ from, to: input.signerEmail, subject: `Signed: ${quote.title} — Gro Digital`, html: clientHtml })] : []),
          ]).catch(() => { /* best effort */ });
        }

        return { success: true };
      }),
  }),

  campaign: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      let campaigns;
      if (ctx.user.role === 'client') campaigns = await getCampaignsByClientSlug(ctx.user.clientSlug!);
      else if (ctx.user.role === 'admin') {
        const assigned: string[] = ctx.user.assignedClients ? JSON.parse(ctx.user.assignedClients) : [];
        campaigns = (await getCampaigns()).filter(c => assigned.includes(c.clientSlug));
      } else {
        campaigns = await getCampaigns();
      }
      return Promise.all(campaigns.map(async c => {
        const posts = await getPostsByCampaign(c.id);
        const dates = posts.map(p => p.scheduledAt ? new Date(p.scheduledAt).getTime() : null).filter((d): d is number => d !== null);
        return {
          ...c,
          firstPostDate: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
          lastPostDate: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        };
      }));
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
      .input(z.object({
        clientSlug: z.string().min(1),
        name: z.string().min(1),
        postToInstagram: z.boolean().optional(),
        postToFacebook: z.boolean().optional(),
        postToLinkedin: z.boolean().optional(),
        postToEmail: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const clientSlug = ctx.user.role === 'client' ? ctx.user.clientSlug! : input.clientSlug;
        const id = await createCampaign({
          clientSlug,
          name: input.name,
          createdBy: ctx.user.name ?? ctx.user.email ?? null,
          postToInstagram: input.postToInstagram,
          postToFacebook: input.postToFacebook,
          postToLinkedin: input.postToLinkedin,
          postToEmail: input.postToEmail,
        });
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
        imageModel: z.enum(['dall-e-3', 'nano-banana-2', 'gpt-image-1', 'flux-2-pro', 'ideogram-v3']),
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
          if (input.notes) {
            const profile = await getClientProfile(campaign.clientSlug);
            sendPostRejectedEmail({
              campaignId: campaign.id,
              campaignName: campaign.name,
              clientName: profile?.name ?? campaign.clientSlug,
              postTheme: post.theme,
              notes: input.notes,
            }).catch(() => {});
          }
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
          const model = (campaign.imageModel ?? 'dall-e-3') as 'dall-e-3' | 'nano-banana-2' | 'gpt-image-1' | 'flux-2-pro' | 'ideogram-v3';
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
          const model = (campaign.imageModel ?? 'dall-e-3') as 'dall-e-3' | 'nano-banana-2' | 'gpt-image-1' | 'flux-2-pro' | 'ideogram-v3';
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
          insertAiInteraction({ source: 'campaign_image_prompt', toolName: 'regenerateImagePrompt', inputSummary: `postId:${input.postId} theme:${post.theme ?? ''}`, clientSlug: campaign.clientSlug }).catch(() => {});
          return { prompt };
        }),

      updateContent: protectedProcedure
        .input(z.object({
          postId: z.number().int(),
          caption: z.string().optional(),
          hashtags: z.string().optional(),
          imagePrompt: z.string().optional(),
          scheduledAt: z.string().nullable().optional(),
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
            scheduledAt: input.scheduledAt,
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

      reorder: protectedProcedure
        .input(z.object({ campaignId: z.number().int(), order: z.array(z.number().int()) }))
        .mutation(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          await Promise.all(input.order.map((postId, idx) => updatePostContent(postId, { sortOrder: idx })));
          return { success: true };
        }),

      rescheduleAll: protectedProcedure
        .input(z.object({ campaignId: z.number().int(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
        .mutation(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const posts = await getPostsByCampaign(input.campaignId);
          if (posts.length === 0) return { count: 0 };
          const sorted = [...posts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const postDays = new Set([1, 3, 5]); // Mon, Wed, Fri
          const postTimes = ['09:00:00', '12:00:00', '18:00:00'];
          const cursor = new Date(input.startDate + 'T00:00:00');
          const newDates: string[] = [];
          while (newDates.length < sorted.length) {
            if (postDays.has(cursor.getDay())) {
              newDates.push(`${cursor.toISOString().slice(0, 10)}T${postTimes[newDates.length % postTimes.length]}`);
            }
            cursor.setDate(cursor.getDate() + 1);
          }
          await Promise.all(sorted.map((post, i) => updatePostContent(post.id, { scheduledAt: newDates[i] })));
          return { count: sorted.length };
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

      getPerformanceByShareToken: publicProcedure
        .input(z.object({ token: z.string(), password: z.string().optional() }))
        .query(async ({ input }) => {
          const campaign = await getCampaignByShareToken(input.token);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          if (campaign.sharePassword) {
            const provided = input.password
              ? createHash('sha256').update(input.password).digest('hex')
              : null;
            if (provided !== campaign.sharePassword) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });
          }
          const posts = await getPostsByCampaign(campaign.id);
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
                if (full) { fbInsights = full; fbInsightsSource = 'full'; } else { fbError = 'token_invalid'; }
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
        .input(z.object({
          postId: z.number().int(),
          platforms: z.object({
            instagram: z.boolean().optional(),
            facebook: z.boolean().optional(),
            linkedin: z.boolean().optional(),
          }).optional(),
        }))
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

          const doIG = input.platforms ? !!input.platforms.instagram : campaign.postToInstagram !== false;
          const doFB = input.platforms ? !!input.platforms.facebook : !!campaign.postToFacebook;
          const doLI = input.platforms ? !!input.platforms.linkedin : !!(campaign as any).postToLinkedin;

          const postedTo: string[] = [];
          const errors: string[] = [];
          let anyPosted = false;

          // ── Instagram ──
          if (doIG) {
            try {
              const tokens = await getInstagramTokens(campaign.clientSlug);
              if (!tokens) throw new Error('Instagram not connected for this client');
              const creationId = isVideo
                ? await createVideoMediaContainer(tokens.businessId, tokens.accessToken, mediaUrl, caption)
                : await createMediaContainer(tokens.businessId, tokens.accessToken, mediaUrl, caption);
              const instagramPostId = await publishMedia(tokens.businessId, tokens.accessToken, creationId);
              await updatePostStatus(input.postId, 'posted', { instagramPostId });
              postedTo.push('Instagram');
              anyPosted = true;
            } catch (e) {
              errors.push(`Instagram: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          // ── Facebook ──
          if (doFB) {
            try {
              const fbTokens = await getFacebookTokens(campaign.clientSlug);
              if (!fbTokens) throw new Error('Facebook not connected for this client');
              const facebookPostId = isVideo
                ? await postVideoToPage(fbTokens.pageId, fbTokens.pageAccessToken, mediaUrl, caption)
                : await postImageToPage(fbTokens.pageId, fbTokens.pageAccessToken, mediaUrl, caption);
              await updatePostFacebookId(input.postId, facebookPostId);
              if (!doIG) await updatePostStatus(input.postId, 'posted');
              postedTo.push('Facebook');
              anyPosted = true;
            } catch (e) {
              errors.push(`Facebook: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          // ── LinkedIn ──
          if (doLI) {
            try {
              const liToken = await ensureLinkedinToken(campaign.clientSlug);
              const liTokens = await getLinkedinTokens(campaign.clientSlug);
              if (!liTokens) throw new Error('LinkedIn not connected for this client');
              const authorUrn = liTokens.postTarget === 'organization' && liTokens.orgId
                ? liTokens.orgId
                : liTokens.personUrn;
              const liCaption = (post as any).linkedinCaption || caption;
              let linkedinPostId: string;
              if (!isVideo && mediaUrl) {
                const imgRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
                if (imgRes.ok) {
                  const buffer = Buffer.from(await imgRes.arrayBuffer());
                  const { uploadUrl, imageUrn } = await initializeImageUpload(authorUrn, liToken);
                  await uploadImageBinary(uploadUrl, buffer, liToken);
                  linkedinPostId = await createLinkedinImagePost(authorUrn, liCaption, imageUrn, liToken);
                } else {
                  linkedinPostId = await createLinkedinTextPost(authorUrn, liCaption, liToken);
                }
              } else {
                linkedinPostId = await createLinkedinTextPost(authorUrn, liCaption, liToken);
              }
              await updatePostLinkedinId(input.postId, linkedinPostId);
              if (!doIG && !doFB) await updatePostStatus(input.postId, 'posted');
              postedTo.push('LinkedIn');
              anyPosted = true;
            } catch (e) {
              errors.push(`LinkedIn: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          if (anyPosted && errors.length > 0) {
            await setPostNotes(input.postId, errors.join('\n'));
          } else if (!anyPosted && errors.length > 0) {
            await updatePostStatus(input.postId, 'failed', { notes: errors.join('\n') });
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: errors.join('\n') });
          }

          return { postedTo, errors };
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
          maybeSendBatchCompleteEmail(campaign.id, campaign).catch(() => {});
          return { success: true };
        }),

      // Repurpose a post's caption as a LinkedIn thought-leadership article
      repurposeForLinkedin: protectedProcedure
        .input(z.object({ postId: z.number().int() }))
        .mutation(async ({ ctx, input }) => {
          const post = await getPostById(input.postId);
          if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
          const campaign = await getCampaignById(post.campaignId);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          if (!ENV.anthropicApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Anthropic API key not configured' });
          const originalCaption = [post.caption ?? '', post.hashtags ?? ''].filter(Boolean).join('\n\n');
          if (!originalCaption.trim()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Post has no caption to repurpose' });
          const model = (await getSetting('aiModel')) ?? 'claude-sonnet-4-6';
          const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
          const message = await anthropic.messages.create({
            model,
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: `Rewrite the following social media caption as a LinkedIn thought-leadership post for ${campaign.brandVoice ? `a brand with this voice: ${campaign.brandVoice}` : 'a professional business'}.

Original caption:
${originalCaption}

Instructions:
- Write 2-4 paragraphs in a conversational but authoritative tone
- Start with a strong hook or insight
- Expand on the idea with professional context or a brief story
- End with a question or call-to-action to drive engagement
- NO excessive hashtags (maximum 3-5, only if relevant)
- Sound human and genuine, not like marketing copy
- Return ONLY the LinkedIn post text, nothing else`,
              },
            ],
          });
          const linkedinCaption = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
          if (!linkedinCaption) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI did not return a LinkedIn caption' });
          await updatePostLinkedinCaption(input.postId, linkedinCaption);
          insertAiInteraction({ source: 'campaign_strategy_chat', toolName: 'repurposeToLinkedin', inputSummary: `postId:${input.postId}`, clientSlug: campaign.clientSlug }).catch(() => {});
          return { linkedinCaption };
        }),

      // Public — reject a post via share token
      rejectByToken: publicProcedure
        .input(z.object({ token: z.string(), postId: z.number().int(), password: z.string().optional(), notes: z.string().min(1) }))
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
          const profile = await getClientProfile(campaign.clientSlug);
          sendPostRejectedEmail({
            campaignId: campaign.id,
            campaignName: campaign.name,
            clientName: profile?.name ?? campaign.clientSlug,
            postTheme: post.theme,
            notes: input.notes,
          }).catch(() => {});
          maybeSendBatchCompleteEmail(campaign.id, campaign).catch(() => {});
          return { success: true };
        }),

    }),

    setPlatforms: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        postToInstagram: z.boolean(),
        postToFacebook: z.boolean(),
        postToLinkedin: z.boolean().optional(),
        linkedinPostsPerWeek: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCampaignAccess(ctx.user, campaign.clientSlug);
        const updates: Record<string, unknown> = {
          postToInstagram: input.postToInstagram,
          postToFacebook: input.postToFacebook,
        };
        if (input.postToLinkedin !== undefined) updates.postToLinkedin = input.postToLinkedin;
        if (input.linkedinPostsPerWeek !== undefined) updates.linkedinPostsPerWeek = input.linkedinPostsPerWeek;
        await updateCampaign(input.id, updates as any);
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
          await resolveScheduledMailers(input.campaignId);
          if (campaign) await recoverMissingSentCount(input.campaignId, campaign.clientSlug);
          return getCampaignMailers(input.campaignId);
        }),

      getAnalytics: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (campaign) assertCampaignAccess(ctx.user, campaign.clientSlug);
          await resolveScheduledMailers(input.campaignId);
          if (campaign) await recoverMissingSentCount(input.campaignId, campaign.clientSlug);
          return getMailerAnalytics(input.campaignId);
        }),

      getAnalyticsByShareToken: publicProcedure
        .input(z.object({ token: z.string() }))
        .query(async ({ input }) => {
          const campaign = await getCampaignByShareToken(input.token);
          if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
          return getMailerAnalytics(campaign.id);
        }),

      getMailchimpReportsByShareToken: publicProcedure
        .input(z.object({ token: z.string(), password: z.string().optional() }))
        .query(async ({ input }) => {
          const campaign = await getCampaignByShareToken(input.token);
          if (!campaign) return { campaigns: [] };
          if (campaign.sharePassword) {
            const provided = input.password
              ? createHash('sha256').update(input.password).digest('hex')
              : null;
            if (provided !== campaign.sharePassword) throw new TRPCError({ code: 'UNAUTHORIZED' });
          }
          const apiKey = await getMailchimpApiKey(campaign.clientSlug);
          if (!apiKey) return { campaigns: [] };
          const parts = apiKey.split('-');
          const dc = parts[parts.length - 1];
          if (!dc) return { campaigns: [] };
          const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64');
          try {
            const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/reports?count=100&sort_field=send_time&sort_dir=DESC`, {
              headers: { Authorization: auth },
              signal: AbortSignal.timeout(15_000),
            });
            const json = await res.json() as any;
            return {
              campaigns: ((json.reports ?? []) as any[]).map(r => ({
                id: r.id as string,
                subject: (r.subject_line || r.campaign_title || '(No subject)') as string,
                title: (r.campaign_title ?? '') as string,
                sendTime: (r.send_time ?? null) as string | null,
                emailsSent: (r.emails_sent ?? 0) as number,
                opens: (r.opens?.unique_opens ?? 0) as number,
                openRate: (r.opens?.open_rate ?? 0) as number,
                clicks: (r.clicks?.unique_clicks ?? 0) as number,
                clickRate: (r.clicks?.click_rate ?? 0) as number,
              })),
            };
          } catch {
            return { campaigns: [] };
          }
        }),

      getMailchimpReports: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) return { campaigns: [] };
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const apiKey = await getMailchimpApiKey(campaign.clientSlug);
          if (!apiKey) return { campaigns: [] };
          const parts = apiKey.split('-');
          const dc = parts[parts.length - 1];
          if (!dc) return { campaigns: [] };
          const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64');
          try {
            const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/reports?count=100&sort_field=send_time&sort_dir=DESC`, {
              headers: { Authorization: auth },
              signal: AbortSignal.timeout(15_000),
            });
            const json = await res.json() as any;
            return {
              campaigns: ((json.reports ?? []) as any[]).map(r => ({
                id: r.id as string,
                subject: (r.subject_line || r.campaign_title || '(No subject)') as string,
                title: (r.campaign_title ?? '') as string,
                sendTime: (r.send_time ?? null) as string | null,
                emailsSent: (r.emails_sent ?? 0) as number,
                opens: (r.opens?.unique_opens ?? 0) as number,
                openRate: (r.opens?.open_rate ?? 0) as number,
                clicks: (r.clicks?.unique_clicks ?? 0) as number,
                clickRate: (r.clicks?.click_rate ?? 0) as number,
              })),
            };
          } catch {
            return { campaigns: [] };
          }
        }),

      getMailchimpUpcoming: protectedProcedure
        .input(z.object({ campaignId: z.number().int() }))
        .query(async ({ ctx, input }) => {
          const campaign = await getCampaignById(input.campaignId);
          if (!campaign) return { campaigns: [] };
          assertCampaignAccess(ctx.user, campaign.clientSlug);
          const apiKey = await getMailchimpApiKey(campaign.clientSlug);
          if (!apiKey) return { campaigns: [] };
          const parts = apiKey.split('-');
          const dc = parts[parts.length - 1];
          if (!dc) return { campaigns: [] };
          const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64');
          const base = `https://${dc}.api.mailchimp.com/3.0/campaigns?count=100&sort_field=create_time&sort_dir=DESC`;
          try {
            const [r1, r2] = await Promise.all([
              fetch(`${base}&status=schedule`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(15_000) }),
              fetch(`${base}&status=save`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(15_000) }),
            ]);
            const [j1, j2] = await Promise.all([r1.json() as Promise<any>, r2.json() as Promise<any>]);
            const all = [...(j1.campaigns ?? []), ...(j2.campaigns ?? [])];
            return {
              campaigns: all.map(c => ({
                id: c.id as string,
                status: c.status as string,
                subject: (c.settings?.subject_line || c.settings?.title || '(No subject)') as string,
                scheduledFor: (c.send_time ?? null) as string | null,
                listName: (c.recipients?.list_name ?? null) as string | null,
                recipientCount: (c.recipients?.recipient_count ?? 0) as number,
              })),
            };
          } catch {
            return { campaigns: [] };
          }
        }),

      setMailchimpApiKey: adminProcedure
        .input(z.object({ clientSlug: z.string(), apiKey: z.string() }))
        .mutation(async ({ input }) => {
          await setMailchimpApiKey(input.clientSlug, input.apiKey);
          return { ok: true };
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

          // If this mailer is scheduled in Resend, push updated HTML/subject so
          // the scheduled send uses the latest content.
          let broadcastUpdated = false;
          let cannotSyncToResend = false;
          if (mailer?.status === 'scheduled' && ENV.resendApiKey) {
            if (mailer.resendBroadcastId) {
              try {
                const resend = new Resend(ENV.resendApiKey);
                const htmlToSync = input.htmlContent ?? mailer.htmlContent;
                await (resend.broadcasts as any).update(mailer.resendBroadcastId, {
                  ...(htmlToSync ? { html: instrumentMailerHtml(htmlToSync, input.id, ENV.portalUrl ?? 'https://app.grodigital.co.za') } : {}),
                  ...(input.subject ? { subject: input.subject } : {}),
                });
                broadcastUpdated = true;
              } catch (e) {
                console.warn('[Mailer update] Failed to update Resend broadcast:', e);
              }
            } else {
              // Scheduled in Resend before we started tracking broadcast IDs —
              // we don't know which broadcast to update.
              cannotSyncToResend = true;
            }
          }

          await updateCampaignMailer(input.id, {
            subject: input.subject,
            previewText: input.previewText,
            htmlContent: input.htmlContent,
            status: input.status,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : input.scheduledAt === null ? null : undefined,
            notes: input.notes,
          });
          return { success: true, broadcastUpdated, cannotSyncToResend };
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
- FOOTER: white or very light grey (#f8f8f8), small muted text, copyright "© ${new Date().getFullYear()} ${campaign.clientSlug}", a "View in browser" link with href="__VIEW_IN_BROWSER_URL__" and an unsubscribe link with href="{{{RESEND_UNSUBSCRIBE_URL}}}" (use these exact placeholders — they are replaced automatically), clean and minimal
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
          const baseUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
          const finalHtml = html.replace(/__VIEW_IN_BROWSER_URL__/g, `${baseUrl}/m/${mailer.id}`);
          await updateCampaignMailer(mailer.id, { subject, previewText: previewText ?? null, htmlContent: finalHtml });
          insertAiInteraction({ source: 'mailer_chat', toolName: 'mailer.generate', inputSummary: `campaignId:${input.campaignId} subject:${subject.slice(0, 80)}`, clientSlug: campaign.clientSlug }).catch(() => {});
          return { ...mailer, subject, previewText: previewText ?? null, htmlContent: finalHtml };
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

          // Compress any large images referenced in the HTML before sending, then instrument tracking
          const baseUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
          const html = instrumentMailerHtml(await compressMailerImages(mailer.htmlContent), input.mailerId, baseUrl);

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
            let total = 0;
            let after: string | undefined;
            do {
              const page = await resend.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) });
              if (page.error || !page.data?.data) break;
              total += page.data.data.length;
              after = page.data.has_more ? page.data.data[page.data.data.length - 1]?.id : undefined;
            } while (after);
            return { segmentId, subscriberCount: total };
          } catch (e) {
            console.error('[getSegmentStatus] Exception:', e);
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
            const all: { id: string; email: string; first_name: string; last_name: string; unsubscribed: boolean; created_at: string }[] = [];
            let after: string | undefined;
            do {
              const page = await resend.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) });
              if (page.error || !page.data?.data) break;
              all.push(...(page.data.data as typeof all));
              after = page.data.has_more ? page.data.data[page.data.data.length - 1]?.id : undefined;
            } while (after);
            return all;
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

            // Strip base64 data URIs from HTML before including in context (they bloat the prompt massively).
            // Stores originals so they can be re-injected into the AI's response.
            const base64Map: string[] = [];
            function stripBase64(html: string | null | undefined): string {
              if (!html) return '(empty)';
              return html
                .replace(/src="(data:[^"]{100,})"/g, (_match, data) => {
                  const idx = base64Map.indexOf(data);
                  const id = idx >= 0 ? idx : base64Map.push(data) - 1;
                  return `src="__BASE64_${id}__"`;
                })
                .replace(/url\((data:[^)]{100,})\)/g, (_match, data) => {
                  const idx = base64Map.indexOf(data);
                  const id = idx >= 0 ? idx : base64Map.push(data) - 1;
                  return `url(__BASE64_${id}__)`;
                });
            }
            function restoreBase64(html: string): string {
              return html
                .replace(/src="__BASE64_(\d+)__"/g, (_m, i) => `src="${base64Map[parseInt(i)] ?? ''}"`)
                .replace(/url\(__BASE64_(\d+)__\)/g, (_m, i) => `url(${base64Map[parseInt(i)] ?? ''})`);
            }

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
              ? `\n\nOTHER MAILERS IN THIS SEQUENCE:\n${otherMailers.map((m, i) => `Email ${i + 1}: "${m.subject || 'Untitled'}"\n${m.htmlContent ? stripBase64(m.htmlContent).slice(0, 600) + (m.htmlContent.length > 600 ? '...' : '') : '(no content)'}`).join('\n\n')}`
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
${stripBase64(mailer.htmlContent)}

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
- IMPORTANT: The HTML shown above has base64 images replaced with placeholders like __BASE64_0__. When outputting updated HTML, preserve these placeholders exactly as-is (e.g. src="__BASE64_0__"). They will be automatically substituted back with the real image data.
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

            const rawReply = response.content[0]?.type === 'text' ? response.content[0].text : '';
            // Restore any base64 placeholders that Claude echoed back
            const replyText = base64Map.length > 0 ? restoreBase64(rawReply) : rawReply;

            // Save assistant reply
            await insertMailerChatMessage(input.mailerId, 'assistant', replyText);
            insertAiInteraction({ source: 'mailer_chat', toolName: 'mailer.chat.send', inputSummary: input.message.slice(0, 512), clientSlug: campaign?.clientSlug ?? undefined }).catch(() => {});

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
            name: mailer.subject,
            segmentId,
            from: ENV.resendFromEmail,
            subject: mailer.subject,
            html: instrumentMailerHtml(mailer.htmlContent, input.mailerId, ENV.portalUrl ?? 'https://app.grodigital.co.za'),
            send: true,
            click_tracking: false,
            ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
          });

          const broadcastId: string = res?.data?.id ?? res?.id;
          if (!broadcastId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Broadcast creation failed' });

          await updateCampaignMailer(input.mailerId, {
            status: input.scheduledAt ? 'scheduled' : 'sent',
            sentAt: input.scheduledAt ? null : new Date(),
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
            resendBroadcastId: input.scheduledAt ? broadcastId : null,
          });

          // Record how many were sent to
          try {
            const countRes = await resend.contacts.list({ segmentId, limit: 1000 });
            const sentCount = countRes?.data?.data?.length ?? 0;
            if (sentCount > 0) await updateCampaignMailer(input.mailerId, { sentCount });
          } catch { /* best effort */ }

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

  linkedin: router({
    getStatus: protectedProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        const tokens = await getLinkedinTokens(input.clientSlug);
        if (!tokens) return { connected: false, personUrn: null, orgName: null, orgId: null, postTarget: 'personal' as const };
        return {
          connected: true,
          personUrn: tokens.personUrn,
          orgName: tokens.orgName,
          orgId: tokens.orgId,
          postTarget: tokens.postTarget,
        };
      }),

    disconnect: protectedProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        await clearLinkedinTokens(input.clientSlug);
        return { success: true };
      }),

    setPostTarget: protectedProcedure
      .input(z.object({ clientSlug: z.string(), target: z.enum(['personal', 'organization']) }))
      .mutation(async ({ ctx, input }) => {
        assertClientSlugAccess(ctx.user, input.clientSlug);
        await setLinkedinPostTarget(input.clientSlug, input.target);
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
          website: z.string().optional(),
          address: z.string().optional(),
          industry: z.string().optional(),
          pageSpeedScore: z.number().nullable().optional(),
          issues: z.string().optional(),
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
          website: z.string().nullable().optional(),
          address: z.string().nullable().optional(),
          industry: z.string().nullable().optional(),
          pageSpeedScore: z.number().nullable().optional(),
          issues: z.string().nullable().optional(),
          businessContext: z.string().nullable().optional(),
          leadScore: z.number().nullable().optional(),
          googleRating: z.string().nullable().optional(),
          googleReviewCount: z.number().nullable().optional(),
          status: z.enum(['new', 'emailed', 'replied', 'converted']).optional(),
          notes: z.string().nullable().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;

          // When the website changes (added, updated or removed), re-run the
          // website health checks so the prospect's issues/score/leadScore no
          // longer reflect the old URL. We only trigger this when the caller
          // explicitly passed `website` and it differs from what's stored, to
          // avoid hitting PageSpeed on unrelated edits.
          if ('website' in data) {
            const existing = await getProspectById(id);
            const currentWebsite = existing?.website ?? null;
            const nextWebsite = data.website ?? null;
            if (existing && currentWebsite !== nextWebsite) {
              const existingIssues = existing.issues ? JSON.parse(existing.issues) as string[] : [];
              const { issues, pageSpeedScore, websiteScoreContribution } = await recomputeWebsiteHealth(nextWebsite, existingIssues);

              // Recompute lead score: keep non-website signals from the stored
              // score by subtracting the old website contribution and adding
              // the fresh one. If no previous score exists, start from 0.
              const hadNoWebsite = existingIssues.includes('No website');
              const oldContribution = hadNoWebsite
                ? 30
                : (() => {
                    let c = 0;
                    const oldScore = existing.pageSpeedScore;
                    if (oldScore !== null && oldScore !== undefined) {
                      if (oldScore < 30) c += 25;
                      else if (oldScore < 50) c += 10;
                    }
                    if (existingIssues.includes('No SSL')) c += 15;
                    return c;
                  })();
              const prevLeadScore = existing.leadScore ?? 0;
              const nextLeadScore = Math.max(0, Math.min(100, prevLeadScore - oldContribution + websiteScoreContribution));

              data.issues = JSON.stringify(issues);
              data.pageSpeedScore = pageSpeedScore;
              data.leadScore = nextLeadScore;
            }
          }

          await updateProspect(id, data);
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await deleteProspect(input.id);
          return { success: true };
        }),

      refreshChecks: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const existing = await getProspectById(input.id);
          if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });

          const existingIssues = existing.issues ? JSON.parse(existing.issues) as string[] : [];
          const { issues, pageSpeedScore, websiteScoreContribution } = await recomputeWebsiteHealth(existing.website, existingIssues);

          const hadNoWebsite = existingIssues.includes('No website');
          const oldContribution = hadNoWebsite
            ? 30
            : (() => {
                let c = 0;
                const oldScore = existing.pageSpeedScore;
                if (oldScore !== null && oldScore !== undefined) {
                  if (oldScore < 30) c += 25;
                  else if (oldScore < 50) c += 10;
                }
                if (existingIssues.includes('No SSL')) c += 15;
                return c;
              })();
          const prevLeadScore = existing.leadScore ?? 0;
          const nextLeadScore = Math.max(0, Math.min(100, prevLeadScore - oldContribution + websiteScoreContribution));

          await updateProspect(input.id, {
            issues: JSON.stringify(issues),
            pageSpeedScore,
            leadScore: nextLeadScore,
          });

          return { success: true, issues, pageSpeedScore, leadScore: nextLeadScore };
        }),
    }),

    discover: adminProcedure
      .input(z.object({ criteria: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

        // Extract structured search params from natural language
        const extraction = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: `Extract search parameters from this outreach criteria: "${input.criteria}"
Return a JSON object with: { searchQuery: string, location: string | null }
searchQuery should be suitable for Google Places textSearch (e.g. "coffee shops").
Only return JSON, no explanation.`,
          }],
        });

        insertAiInteraction({ source: 'outreach_discover', toolName: 'outreach.discover', inputSummary: input.criteria.slice(0, 512) }).catch(() => {});
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
              'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount',
            },
            body: JSON.stringify({
              textQuery: query,
              maxResultCount: 20,
              locationRestriction: {
                rectangle: {
                  low: { latitude: -35.0, longitude: 16.0 },
                  high: { latitude: -22.0, longitude: 33.0 },
                },
              },
            }),
          },
        );
        const placesData = await placesRes.json() as { places?: Array<{ displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string; rating?: number; userRatingCount?: number }> };
        const places = placesData.places ?? [];

        // Enrich each place: PageSpeed score + Firecrawl scrape + email + business context (in parallel, best-effort)
        const enriched = await Promise.all(places.map(async (place) => {
          const website = place.websiteUri ?? '';
          let pageSpeedScore: number | null = null;
          let contactEmail = '';
          let businessContext = '';
          const issues: string[] = [];
          const googleRating = place.rating ?? null;
          const googleReviewCount = place.userRatingCount ?? null;

          if (!website) {
            issues.push('No website');
          } else {
            // PageSpeed Insights (free, no key needed)
            try {
              const psRes = await fetch(
                `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(website)}&strategy=mobile`,
                { signal: AbortSignal.timeout(10_000) },
              );
              if (psRes.ok) {
                const psData = await psRes.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
                const raw = psData.lighthouseResult?.categories?.performance?.score;
                if (typeof raw === 'number') {
                  pageSpeedScore = Math.round(raw * 100);
                  if (pageSpeedScore < 50) {
                    issues.push(`Score: ${pageSpeedScore}/100`);
                  }
                }
              }
            } catch { /* ignore timeout / fetch errors */ }

            // SSL check via HEAD request
            try {
              const headRes = await fetch(website, { method: 'HEAD', signal: AbortSignal.timeout(5_000), redirect: 'follow' });
              if (!headRes.url.startsWith('https://')) {
                issues.push('No SSL');
              }
            } catch { /* ignore */ }

            // Firecrawl scrape for rich content (falls back to raw fetch if unavailable)
            let scrapedContent = '';
            if (ENV.firecrawlApiKey) {
              try {
                const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                  method: 'POST',
                  signal: AbortSignal.timeout(20_000),
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ENV.firecrawlApiKey}`,
                  },
                  body: JSON.stringify({ url: website, formats: ['markdown'] }),
                });
                if (fcRes.ok) {
                  const fcData = await fcRes.json() as { data?: { markdown?: string } };
                  scrapedContent = fcData.data?.markdown ?? '';
                }
              } catch { /* ignore timeout */ }
            }

            // Fallback to raw fetch if Firecrawl unavailable or failed
            if (!scrapedContent) {
              try {
                const homeRes = await fetch(website, { signal: AbortSignal.timeout(5_000) });
                if (homeRes.ok) scrapedContent = await homeRes.text();
              } catch { /* ignore */ }
            }

            // Extract emails from scraped content
            if (scrapedContent) {
              const emails = scrapedContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
              const filtered = emails.filter(e =>
                !e.includes('.png') && !e.includes('.jpg') && !e.includes('.gif') &&
                !e.includes('w3.org') && !e.includes('schema.org') && !e.includes('example.')
              );
              if (filtered.length > 0) contactEmail = filtered[0];
            }

            // Claude summarizes Firecrawl content → business context (only if we have meaningful content)
            if (scrapedContent && scrapedContent.length > 100 && ENV.firecrawlApiKey) {
              try {
                const summary = await anthropic.messages.create({
                  model: 'claude-sonnet-4-6',
                  max_tokens: 200,
                  messages: [{
                    role: 'user',
                    content: `Summarize this business website in 2-3 sentences. What do they do, who do they serve, and what services/products do they offer? Be specific and concise.\n\n${scrapedContent.slice(0, 4000)}`,
                  }],
                });
                businessContext = (summary.content[0] as { type: string; text: string }).text.trim();
              } catch { /* ignore */ }
            }
          }

          // Compute lead score (0-100)
          let leadScore = 0;
          // Reviews: up to 30 pts (log scale: 10+ reviews=10pts, 50+=20pts, 200+=30pts)
          if (googleReviewCount) {
            if (googleReviewCount >= 200) leadScore += 30;
            else if (googleReviewCount >= 50) leadScore += 20;
            else if (googleReviewCount >= 10) leadScore += 10;
            else leadScore += 5;
          }
          // Rating: 10 pts for the "sweet spot" (3.5-4.5 = established but imperfect)
          if (googleRating) {
            if (googleRating >= 3.5 && googleRating <= 4.5) leadScore += 10;
            else if (googleRating > 4.5) leadScore += 5;
          }
          // Website issues severity
          if (issues.includes('No website')) leadScore += 30;
          else {
            if (pageSpeedScore !== null && pageSpeedScore < 30) leadScore += 25;
            else if (pageSpeedScore !== null && pageSpeedScore < 50) leadScore += 10;
            if (issues.includes('No SSL')) leadScore += 15;
          }
          // Actionability signals
          if (contactEmail) leadScore += 10;
          if (place.nationalPhoneNumber) leadScore += 5;
          if (businessContext) leadScore += 10;

          return {
            businessName: place.displayName?.text ?? '',
            address: place.formattedAddress ?? '',
            phone: place.nationalPhoneNumber ?? '',
            website,
            pageSpeedScore,
            contactEmail,
            issues,
            businessContext,
            leadScore,
            googleRating,
            googleReviewCount,
          };
        }));

        const candidates = enriched.filter(Boolean).sort((a, b) => (b!.leadScore ?? 0) - (a!.leadScore ?? 0));
        return { candidates };
      }),

    importProspects: adminProcedure
      .input(z.object({
        prospects: z.array(z.object({
          businessName: z.string().min(1),
          address: z.string().optional(),
          contactPhone: z.string().optional(),
          contactEmail: z.string().optional(),
          website: z.string().optional(),
          pageSpeedScore: z.number().nullable().optional(),
          issues: z.string().optional(),
          businessContext: z.string().optional(),
          leadScore: z.number().optional(),
          googleRating: z.string().optional(),
          googleReviewCount: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        if (input.prospects.length === 0) return { count: 0 };
        await bulkCreateProspects(input.prospects);
        return { count: input.prospects.length };
      }),

    hunterLookup: adminProcedure
      .input(z.object({ prospectId: z.number() }))
      .mutation(async ({ input }) => {
        if (!ENV.hunterApiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Hunter.io API key not configured' });
        const prospect = await getProspectById(input.prospectId);
        if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });
        if (!prospect.website) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Prospect has no website' });

        let domain: string;
        try {
          domain = new URL(prospect.website).hostname.replace(/^www\./, '');
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid website URL' });
        }

        const hunterRes = await fetch(
          `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${ENV.hunterApiKey}&limit=5`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (!hunterRes.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Hunter.io request failed' });

        const hunterData = await hunterRes.json() as {
          data?: {
            emails?: Array<{ value: string; first_name?: string; last_name?: string; position?: string; confidence?: number }>;
          };
          meta?: { results?: number };
        };

        const emails = hunterData.data?.emails ?? [];
        if (emails.length === 0) return { found: false, email: null, contactName: null };

        const ranked = [...emails].sort((a, b) => {
          const score = (e: typeof emails[0]) => {
            const pos = (e.position ?? '').toLowerCase();
            if (pos.includes('owner') || pos.includes('founder') || pos.includes('ceo') || pos.includes('director')) return 3;
            if (pos.includes('manager') || pos.includes('head')) return 2;
            return 1;
          };
          return score(b) - score(a) || (b.confidence ?? 0) - (a.confidence ?? 0);
        });

        const best = ranked[0];
        const contactName = [best.first_name, best.last_name].filter(Boolean).join(' ') || null;
        await updateProspect(input.prospectId, {
          contactEmail: best.value,
          ...(contactName ? { contactName } : {}),
        });
        return { found: true, email: best.value, contactName };
      }),

    crawlDirectory: adminProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input }) => {
        if (!ENV.firecrawlApiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Firecrawl API key not configured' });
        const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

        // Scrape the directory page to get its content
        let markdown = '';
        try {
          const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            signal: AbortSignal.timeout(30_000),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ENV.firecrawlApiKey}`,
            },
            body: JSON.stringify({ url: input.url, formats: ['markdown'], onlyMainContent: false }),
          });
          if (fcRes.ok) {
            const fcData = await fcRes.json() as { success?: boolean; data?: { markdown?: string } };
            if (fcData.success !== false) markdown = fcData.data?.markdown ?? '';
          }
        } catch { /* ignore timeout */ }

        // Fallback: raw fetch if Firecrawl failed or returned nothing
        if (!markdown) {
          try {
            const raw = await fetch(input.url, { signal: AbortSignal.timeout(15_000) });
            if (raw.ok) markdown = await raw.text();
          } catch { /* ignore */ }
        }

        if (!markdown) throw new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: 'Could not extract content from that URL — the site may be unreachable, heavily JS-rendered, or behind bot protection. Try a different directory page.' });

        // Claude extracts business listings from the directory markdown
        const extraction = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: `Extract all business listings from this directory page. Return a JSON array of objects with:
{ name: string, website?: string, phone?: string, address?: string }

Only include businesses where you can extract at least a name. If no website is visible, omit it.
Return JSON array only — no markdown, no explanation.

Directory content:
${markdown.slice(0, 8000)}`,
          }],
        });

        let listings: Array<{ name: string; website?: string; phone?: string; address?: string }> = [];
        try {
          const raw = (extraction.content[0] as { type: string; text: string }).text;
          const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
          listings = JSON.parse(stripped);
        } catch {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse business listings from directory' });
        }

        if (!Array.isArray(listings) || listings.length === 0) {
          return { candidates: [] };
        }

        // Enrich each listing: first look up on Google Places to get website/rating/reviews,
        // then run PageSpeed + Firecrawl pipeline on whatever website we find
        const enriched = await Promise.all(listings.slice(0, 20).map(async (listing) => {
          let website = listing.website ?? '';
          let phone = listing.phone ?? '';
          let address = listing.address ?? '';
          let googleRating: number | null = null;
          let googleReviewCount: number | null = null;
          let pageSpeedScore: number | null = null;
          let contactEmail = '';
          let businessContext = '';
          const issues: string[] = [];

          // Look up on Google Places to fill in missing website/phone/rating
          if (ENV.googlePlacesApiKey) {
            try {
              const query = [listing.name, listing.address].filter(Boolean).join(' ');
              const plRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                signal: AbortSignal.timeout(8_000),
                headers: {
                  'Content-Type': 'application/json',
                  'X-Goog-Api-Key': ENV.googlePlacesApiKey,
                  'X-Goog-FieldMask': 'places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.rating,places.userRatingCount',
                },
                body: JSON.stringify({
                  textQuery: query,
                  maxResultCount: 1,
                  locationBias: { circle: { center: { latitude: -29.0, longitude: 25.0 }, radius: 1_500_000 } },
                }),
              });
              if (plRes.ok) {
                const plData = await plRes.json() as { places?: Array<{ websiteUri?: string; nationalPhoneNumber?: string; formattedAddress?: string; rating?: number; userRatingCount?: number }> };
                const place = plData.places?.[0];
                if (place) {
                  if (place.websiteUri && !website) website = place.websiteUri;
                  if (place.nationalPhoneNumber && !phone) phone = place.nationalPhoneNumber;
                  if (place.formattedAddress && !address) address = place.formattedAddress;
                  if (typeof place.rating === 'number') googleRating = place.rating;
                  if (typeof place.userRatingCount === 'number') googleReviewCount = place.userRatingCount;
                }
              }
            } catch { /* ignore */ }
          }

          if (!website) {
            issues.push('No website');
          } else {
            try {
              const psRes = await fetch(
                `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(website)}&strategy=mobile`,
                { signal: AbortSignal.timeout(10_000) },
              );
              if (psRes.ok) {
                const psData = await psRes.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
                const rawScore = psData.lighthouseResult?.categories?.performance?.score;
                if (typeof rawScore === 'number') {
                  pageSpeedScore = Math.round(rawScore * 100);
                  if (pageSpeedScore < 50) issues.push(`Score: ${pageSpeedScore}/100`);
                }
              }
            } catch { /* ignore */ }

            try {
              const headRes = await fetch(website, { method: 'HEAD', signal: AbortSignal.timeout(5_000), redirect: 'follow' });
              if (!headRes.url.startsWith('https://')) issues.push('No SSL');
            } catch { /* ignore */ }

            let scrapedContent = '';
            if (ENV.firecrawlApiKey) {
              try {
                const fcScrape = await fetch('https://api.firecrawl.dev/v1/scrape', {
                  method: 'POST',
                  signal: AbortSignal.timeout(20_000),
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ENV.firecrawlApiKey}` },
                  body: JSON.stringify({ url: website, formats: ['markdown'] }),
                });
                if (fcScrape.ok) {
                  const d = await fcScrape.json() as { success?: boolean; data?: { markdown?: string } };
                  if (d.success !== false) scrapedContent = d.data?.markdown ?? '';
                }
              } catch { /* ignore */ }
            }

            if (!scrapedContent) {
              try {
                const homeRes = await fetch(website, { signal: AbortSignal.timeout(5_000) });
                if (homeRes.ok) scrapedContent = await homeRes.text();
              } catch { /* ignore */ }
            }

            if (scrapedContent) {
              const emails = scrapedContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
              const filtered = emails.filter(e => !e.includes('.png') && !e.includes('.jpg') && !e.includes('w3.org') && !e.includes('schema.org') && !e.includes('example.'));
              if (filtered.length > 0) contactEmail = filtered[0];
            }

            if (scrapedContent && scrapedContent.length > 100) {
              try {
                const summary = await anthropic.messages.create({
                  model: 'claude-sonnet-4-6',
                  max_tokens: 200,
                  messages: [{ role: 'user', content: `Summarize this business website in 2-3 sentences. What do they do, who do they serve, and what services do they offer?\n\n${scrapedContent.slice(0, 4000)}` }],
                });
                businessContext = (summary.content[0] as { type: string; text: string }).text.trim();
              } catch { /* ignore */ }
            }
          }

          let leadScore = 0;
          if (googleReviewCount) {
            if (googleReviewCount >= 200) leadScore += 30;
            else if (googleReviewCount >= 50) leadScore += 20;
            else if (googleReviewCount >= 10) leadScore += 10;
            else leadScore += 5;
          }
          if (googleRating) {
            if (googleRating >= 3.5 && googleRating <= 4.5) leadScore += 10;
            else if (googleRating > 4.5) leadScore += 5;
          }
          if (issues.includes('No website')) leadScore += 30;
          else {
            if (pageSpeedScore !== null && pageSpeedScore < 30) leadScore += 25;
            else if (pageSpeedScore !== null && pageSpeedScore < 50) leadScore += 10;
            if (issues.includes('No SSL')) leadScore += 15;
          }
          if (contactEmail) leadScore += 10;
          if (phone) leadScore += 5;
          if (businessContext) leadScore += 10;

          return {
            businessName: listing.name,
            address,
            phone,
            website,
            pageSpeedScore,
            contactEmail,
            issues,
            businessContext,
            leadScore,
            googleRating,
            googleReviewCount,
          };
        }));

        const candidates = enriched.filter(Boolean).sort((a, b) => (b!.leadScore ?? 0) - (a!.leadScore ?? 0));
        return { candidates };
      }),

    findDirectories: adminProcedure
      .input(z.object({ criteria: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `For the outreach criteria "${input.criteria}", suggest 6 Google search queries that would find online directories or listing pages for these businesses in South Africa.

Focus on queries that would surface:
- South African business directories (yellowpages.co.za, helloPeter, bizdb.co.za)
- Industry association member directories
- Regional/city business listing pages
- B2B supplier directories

Return a JSON array of objects with: { title: string, query: string, description: string }
Where "query" is the exact Google search string (e.g. 'site:yellowpages.co.za "industrial suppliers" Gauteng').
Return JSON only — no markdown, no explanation.`,
          }],
        });

        try {
          const raw = (result.content[0] as { type: string; text: string }).text;
          const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
          const dirs = JSON.parse(stripped) as Array<{ title: string; query: string; description: string }>;
          return { directories: Array.isArray(dirs) ? dirs.map(d => ({
            title: d.title,
            url: `https://www.google.com/search?q=${encodeURIComponent(d.query)}`,
            description: d.description,
            isSearchQuery: true,
            query: d.query,
          })) : [] };
        } catch {
          return { directories: [] };
        }
      }),

    draftEmail: adminProcedure
      .input(z.object({ prospectId: z.number(), isFollowUp: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const prospect = await getProspectById(input.prospectId);
        if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });

        const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
        const issues = prospect.issues ? JSON.parse(prospect.issues) as string[] : [];

        const isFollowUp = input.isFollowUp && !!prospect.lastEmailSubject;
        
        const userName = ctx.user?.name || 'the team';
        const userFirstName = userName.split(' ')[0];
        const userRole = ctx.user?.role ?? 'admin';
        const senderIntro = userRole === 'superAdmin'
          ? `I'm the founder of GRO Digital, a boutique web development agency based in Pretoria`
          : `I'm part of the team at GRO Digital, a boutique web development agency based in Pretoria`;
        const senderSelfDescription = userRole === 'superAdmin'
          ? `${userName} is the founder of GRO Digital.`
          : `${userName} works at GRO Digital as part of the team.`;

        const systemPrompt = `You are writing a cold outreach email on behalf of GRO Digital — a boutique web development agency in Pretoria, South Africa. The email is signed by ${userName}. ${senderSelfDescription} Write warm, genuine emails that sound exactly like the example.

CRITICAL: The sender's name is "${userName}". Do NOT use any other name. Never write "Wesley" unless ${userFirstName} literally is "Wesley". The first-name opener and sign-off must both use "${userFirstName}".

EXAMPLE EMAIL (match this tone and structure exactly — substituting ${userFirstName} for the sender name):
Subject: quick question about Kal-Gard's website
"Hi Kevin,

I hope you're well. My name is ${userFirstName} and ${senderIntro}.

We love supporting local businesses like yours and in my research I noticed your website could really use some help — it scored 18/100 on mobile speed, which means most people visiting on their phones are likely leaving before the page even loads. It also doesn't have an SSL certificate, which browsers flag as "Not Secure".

I'd love to do a free audit and show you exactly what's holding it back. No strings attached — just a genuine look at what we can improve.

Would that be something you'd be open to?

Best,
${userFirstName}
GRO Digital"

RULES:
- The sender is ${userFirstName}. Never substitute another name.
- The sender's self-introduction MUST read exactly: "My name is ${userFirstName} and ${senderIntro}." Do not paraphrase.
- Always greet by first name if available, otherwise use their business name
- Keep it warm and genuine — a local team supporting local businesses, not a corporate agency
- List the specific issues you actually found (mobile speed score, no SSL, no website etc.) — don't be vague
- Offer the free audit with "no strings attached"
- End with a soft yes/no question
- Sign off: Best, ${userFirstName} / GRO Digital

SUBJECT LINE RULES:
- Always include the business name — never just "website" or "your website" alone
- Lowercase only; no title case, no exclamation marks
- 3–7 words
- Pick a pattern that matches the email's angle, for example:
  - "quick question about {businessName}'s website"
  - "{businessName}'s website — a quick note"
  - "noticed something on {businessName}'s site"
  - "your website at {businessName}" (only if the angle is specifically about the site)
- Never make up issues — only mention what was actually found`;



        const reviewContext = prospect.googleReviewCount
          ? `They have ${prospect.googleReviewCount} Google reviews${prospect.googleRating ? ` at ${prospect.googleRating} stars` : ''} — an established business.`
          : '';

        const userPrompt = isFollowUp
          ? `Write a follow-up email. I emailed ${prospect.businessName} before (subject: "${prospect.lastEmailSubject}") and got no reply.

2-3 sentences max. Don't apologise for following up — just bump it naturally. One sentence recap of why it matters, one question. Under 50 words total. Subject line should be "re: [original subject]" — lowercase.

Return JSON only — no markdown, no code fences: { "subject": "re: ${prospect.lastEmailSubject}", "body": "..." }`
          : `Write a cold outreach email using the style and rules above.

Business: ${prospect.businessName}
Contact name: ${prospect.contactName ?? 'unknown — use the business name'}
${prospect.address ? `Location: ${prospect.address}` : ''}
${prospect.website ? `Website: ${prospect.website}` : 'No website — they have no online presence at all.'}
Issues found: ${issues.length ? issues.join(', ') : 'none detected'}
${reviewContext}
${prospect.businessContext ? `What they do: ${prospect.businessContext}` : ''}

List all the issues found. Use the contact's first name in the greeting if available.

Return JSON only — no markdown, no code fences: { "subject": "...", "body": "..." }`;

        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        insertAiInteraction({ source: 'outreach_email_draft', toolName: 'outreach.draftEmail', inputSummary: `prospect:${prospect.businessName}` }).catch(() => {});

        try {
          const raw = (result.content[0] as { type: string; text: string }).text;
          // Strip any markdown code fences Claude might add despite instructions
          const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
          const parsed = JSON.parse(stripped);
          return { subject: parsed.subject ?? '', body: parsed.body ?? '' };
        } catch {
          return { subject: 'Quick question about your website', body: (result.content[0] as { type: string; text: string }).text };
        }
      }),

    saveGmailDraft: adminProcedure
      .input(z.object({ prospectId: z.number(), subject: z.string().min(1), body: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const prospect = await getProspectById(input.prospectId);
        if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });
        const toEmail = prospect.contactEmail?.trim();
        if (!toEmail) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add an email address to this prospect first' });

        const tokenData = await getGoogleRefreshToken(ctx.user!.openId);
        if (!tokenData) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Connect your Google account in Settings first' });

        const { google } = await import('googleapis');
        const oauthClient = new google.auth.OAuth2(ENV.googleClientId, ENV.googleClientSecret, ENV.googleRedirectUri);
        oauthClient.setCredentials({ refresh_token: tokenData.refreshToken });

        const gmail = google.gmail({ version: 'v1', auth: oauthClient });

        // Build RFC 2822 message — encode subject as UTF-8 encoded-word (RFC 2047)
        // so non-ASCII characters (em dash, etc.) render correctly in Gmail
        const encodedSubject = `=?UTF-8?B?${Buffer.from(input.subject).toString('base64')}?=`;
        const rawMessage = [
          `To: ${toEmail}`,
          `Subject: ${encodedSubject}`,
          'Content-Type: text/plain; charset=utf-8',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          input.body,
        ].join('\r\n');

        const encoded = Buffer.from(rawMessage).toString('base64url');

        await gmail.users.drafts.create({
          userId: 'me',
          requestBody: { message: { raw: encoded } },
        });

        await updateProspect(input.prospectId, {
          status: 'emailed',
          lastEmailSubject: input.subject,
          lastEmailBody: input.body,
          lastEmailSentAt: new Date(),
        });
        return { success: true };
      }),

    markReplied: adminProcedure
      .input(z.object({ prospectId: z.number() }))
      .mutation(async ({ input }) => {
        await updateProspect(input.prospectId, { status: 'replied' });
        return { success: true };
      }),

    convertToLead: adminProcedure
      .input(z.object({ prospectId: z.number() }))
      .mutation(async ({ input }) => {
        const prospect = await getProspectById(input.prospectId);
        if (!prospect) throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });

        if (prospect.leadId) {
          return { success: true, leadId: prospect.leadId };
        }

        const leadId = await createLead({
          name: prospect.businessName,
          contactName: prospect.contactName ?? undefined,
          contactEmail: prospect.contactEmail ?? undefined,
          contactPhone: prospect.contactPhone ?? undefined,
          stage: 'prospect',
          notes: `Converted from outreach. Issues: ${prospect.issues ?? 'none'}`,
        });
        await updateProspect(input.prospectId, { status: 'converted', leadId });
        return { success: true, leadId };
      }),
  }),

  // ── Client portal — scoped to the logged-in client's own data ──
  clientPortal: router({
    getProfile: clientProcedure.query(async ({ ctx }) => {
      return getClientProfile(ctx.clientSlug);
    }),

    getCampaigns: clientProcedure.query(async ({ ctx }) => {
      const campaigns = await getCampaignsByClientSlug(ctx.clientSlug);
      const enriched = await Promise.all(campaigns.map(async c => {
        const posts = await getPostsByCampaign(c.id);
        const dates = posts.map(p => p.scheduledAt ? new Date(p.scheduledAt).getTime() : null).filter((d): d is number => d !== null);
        return {
          ...c,
          firstPostDate: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
          lastPostDate: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        };
      }));
      return enriched;
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
        await resolveScheduledMailers(input.campaignId);
        return getCampaignMailers(input.campaignId);
      }),

    getInvoices: clientProcedure.query(async ({ ctx }) => {
      return getInvoicesByClientSlug(ctx.clientSlug);
    }),

    createCampaign: clientProcedure
      .input(z.object({ name: z.string().min(1).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const id = await createCampaign({ clientSlug: ctx.clientSlug, name: input.name });
        return { id };
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
      .mutation(async ({ input, ctx }) => {
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
        // Send welcome email (non-blocking — don't fail the mutation if email fails)
        const portalUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
        sendWelcomeEmail({
          name: input.name,
          email: input.email.toLowerCase().trim(),
          password: input.password,
          portalUrl,
        }).catch((err) => console.error('[sendWelcomeEmail]', err));
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

  // ── Super-admin: full user management ──
  users: router({
    list: superAdminProcedure.query(async () => {
      const all = await getAllUsers();
      return all.map(u => ({
        openId: u.openId,
        name: u.name,
        email: u.email,
        role: u.role,
        clientSlug: u.clientSlug,
        assignedClients: u.assignedClients ? JSON.parse(u.assignedClients) as string[] : [],
        lastSignedIn: u.lastSignedIn,
        lastSeenAt: u.lastSeenAt,
        createdAt: u.createdAt,
      }));
    }),

    create: superAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["superAdmin", "admin", "client"]),
        clientSlug: z.string().optional(),
        assignedClients: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { nanoid } = await import("nanoid");
        const openId = `user_${nanoid(16)}`;
        const passwordHash = await hashPassword(input.password);
        await createClientUser({
          openId,
          name: input.name,
          email: input.email.toLowerCase().trim(),
          passwordHash,
          clientSlug: input.clientSlug ?? null,
          role: input.role,
        });
        if (input.assignedClients?.length) {
          await updateUserAssignedClients(openId, input.assignedClients);
        }
        const portalUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
        sendWelcomeEmail({
          name: input.name,
          email: input.email.toLowerCase().trim(),
          password: input.password,
          portalUrl,
        }).catch((err) => console.error('[sendWelcomeEmail]', err));
        return { success: true, openId };
      }),

    updateRole: superAdminProcedure
      .input(z.object({
        openId: z.string(),
        role: z.enum(["superAdmin", "admin", "client"]),
        clientSlug: z.string().optional().nullable(),
        assignedClients: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.openId, input.role);
        if (input.assignedClients !== undefined) {
          await updateUserAssignedClients(input.openId, input.assignedClients);
        }
        return { success: true };
      }),

    resetPassword: superAdminProcedure
      .input(z.object({ openId: z.string(), password: z.string().min(8) }))
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

  activity: router({
    ping: protectedProcedure
      .input(z.object({ path: z.string().max(255) }))
      .mutation(async ({ ctx, input }) => {
        logUserActivity({ openId: ctx.user.openId, action: "page_view", path: input.path }).catch(() => {});
        touchUserSeen(ctx.user.openId).catch(() => {});
        return { ok: true };
      }),

    getForUser: superAdminProcedure
      .input(z.object({ openId: z.string(), limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        return getUserActivity(input.openId, input.limit);
      }),
  }),
  recurringInvoice: router({
    getConfig: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        return getRecurringInvoiceConfig(input.clientSlug);
      }),

    getNextNumber: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        return getNextInvoiceNumber(input.clientSlug);
      }),

    setConfig: adminProcedure
      .input(z.object({
        clientSlug: z.string(),
        enabled: z.boolean(),
        amount: z.number().min(0),
        description: z.string().min(1).max(512),
        recipientEmail: z.string().nullish().refine(
          v => !v || v.split(',').map(s => s.trim()).filter(Boolean).every(e => /^\S+@\S+\.\S+$/.test(e)),
          { message: 'One or more emails are invalid' }
        ),
        sendDay: z.number().int().min(1).max(28),
        paymentTerms: z.string().default('Due upon receipt'),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const { clientSlug, ...fields } = input;
        await upsertRecurringInvoiceConfig(clientSlug, {
          ...fields,
          amount: String(fields.amount),
          recipientEmail: fields.recipientEmail ?? null,
          notes: fields.notes ?? null,
        });
        return { success: true };
      }),

    sendNow: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ input }) => {
        const config = await getRecurringInvoiceConfig(input.clientSlug);
        if (!config) throw new TRPCError({ code: 'NOT_FOUND', message: 'No recurring config for this client' });
        const invoiceNumber = await getNextInvoiceNumber(input.clientSlug);
        const baseUrl = ENV.appUrl || process.env.PORTAL_URL || '';
        const shareToken = await buildAndSendRecurringInvoice(config, {
          invoiceNumber,
          status: 'sent',
          sendEmail: true,
          baseUrl,
        });
        return { shareToken, alreadySent: false };
      }),

    generateInvoice: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .mutation(async ({ input }) => {
        const config = await getRecurringInvoiceConfig(input.clientSlug);
        if (!config) throw new TRPCError({ code: 'NOT_FOUND', message: 'No recurring config for this client' });
        const invoiceNumber = await getNextInvoiceNumber(input.clientSlug);
        const baseUrl = ENV.appUrl || process.env.PORTAL_URL || '';
        const shareToken = await buildAndSendRecurringInvoice(config, {
          invoiceNumber,
          status: 'draft',
          sendEmail: false,
          baseUrl,
        });
        return { shareToken, invoiceNumber };
      }),
  }),

  ai: router({
    logInteraction: adminProcedure
      .input(z.object({
        source: z.string().default("mcp"),
        toolName: z.string(),
        inputSummary: z.string().optional(),
        isError: z.boolean().optional(),
        clientSlug: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await insertAiInteraction(input);
        return { success: true };
      }),

    getInteractions: adminProcedure
      .input(z.object({ limit: z.number().min(1).max(1000).default(200) }))
      .query(async ({ input }) => {
        return getAiInteractions(input.limit);
      }),
  }),

  projects: router({
    list: adminProcedure.query(async () => {
      return getProjects();
    }),

    update: adminProcedure
      .input(z.object({
        repoPath: z.string(),
        status: z.enum(["active", "paused", "done"]).optional(),
        currentFocus: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const name = input.repoPath.split("/").pop() ?? input.repoPath;
        await upsertProject({ name, repoPath: input.repoPath, currentFocus: input.currentFocus });
        return { success: true };
      }),

    syncFromGitHub: adminProcedure
      .mutation(async () => {
        const { fetchGitHubReposForSync } = await import("./github-sync");
        let repos;
        try {
          repos = await fetchGitHubReposForSync();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }

        const active = repos.filter(r => !r.isArchived);
        for (const repo of active) {
          await upsertProjectFromSource({
            name: repo.name,
            repoPath: repo.repoPath,
            lastCommitMessage: repo.lastCommitMessage,
            lastCommitAt: repo.lastCommitAt,
            branch: repo.branch,
          });
        }

        return { synced: active.length, skipped: repos.length - active.length };
      }),
  }),

  infrastructure: router({
    listApps: superAdminProcedure.query(async () => {
      const { fetchAllAppsAcrossOrgs } = await import("./fly-client");
      const { sumEstimates } = await import("./fly-pricing");
      const { cacheGet, cacheSet } = await import("./fly-cache");

      type CachedRow = {
        appName: string; orgSlug: string; clientSlug: string | null; label: string | null;
        status: string; regions: string[]; machineCount: number; runningCount: number;
        vmSize: string | null; volumesGb: number; estimatedMtdCents: number; isEstimate: true;
      };

      const CACHE_KEY = "apps:all";
      const cached = cacheGet<{ rows: CachedRow[]; fetchedAt: string }>(CACHE_KEY);
      if (cached) return cached;

      let details;
      try {
        details = await fetchAllAppsAcrossOrgs();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }

      const mappings = await listFlyAppMappings();
      const mappingMap = new Map(mappings.map(m => [m.appName, m]));
      const now = new Date();

      const rows: CachedRow[] = details.map(({ orgSlug, app, machines, volumes }) => {
        const mapping = mappingMap.get(app.name);
        const regions = [...new Set(
          (machines as Array<{ region?: string }>).map(m => m.region).filter((r): r is string => !!r)
        )];
        const vmSize = (() => {
          const running = (machines as Array<{ state?: string; config?: { guest?: { cpu_kind?: string; cpus?: number } } }>)
            .find(m => m.state === "started");
          if (!running?.config?.guest) return null;
          const g = running.config.guest;
          return `${g.cpu_kind ?? "shared"}-cpu-${g.cpus ?? 1}x`;
        })();
        const volumesGb = volumes.reduce((sum, v) => sum + ((v as { size_gb?: number }).size_gb ?? 0), 0);
        const { totalCents } = sumEstimates(machines, volumes, now);
        return {
          appName: app.name,
          orgSlug,
          clientSlug: mapping?.clientSlug ?? null,
          label: mapping?.label ?? null,
          status: app.status,
          regions,
          machineCount: machines.length,
          runningCount: machines.filter((m: { state?: string }) => m.state === "started").length,
          vmSize,
          volumesGb,
          estimatedMtdCents: totalCents,
          isEstimate: true as const,
        };
      });

      const result = { rows, fetchedAt: now.toISOString() };
      cacheSet(CACHE_KEY, result);
      return result;
    }),

    summary: superAdminProcedure.query(async () => {
      const { getOrgCreditBalances } = await import("./fly-client");
      const { ENV } = await import("./_core/env");
      const orgSlugs = ENV.flyOrgSlugs.split(",").map(s => s.trim()).filter(Boolean);
      let credits;
      try {
        credits = await getOrgCreditBalances(orgSlugs);
      } catch {
        credits = orgSlugs.map(s => ({ orgSlug: s, creditBalanceFormatted: null }));
      }
      return { credits };
    }),

    appDetail: superAdminProcedure
      .input(z.object({ appName: z.string() }))
      .query(async ({ input }) => {
        const { fetchAllAppsAcrossOrgs } = await import("./fly-client");
        const { estimateMachineMtdCost, estimateVolumeMtdCost } = await import("./fly-pricing");
        const { cacheGet, cacheSet } = await import("./fly-cache");

        const CACHE_KEY = `app:${input.appName}:detail`;
        const cached = cacheGet(CACHE_KEY);
        if (cached) return cached;

        let all;
        try {
          all = await fetchAllAppsAcrossOrgs();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }

        const found = all.find(d => d.app.name === input.appName);
        if (!found) throw new TRPCError({ code: "NOT_FOUND", message: `App ${input.appName} not found` });

        const now = new Date();
        const machineDetails = found.machines.map(m => ({
          ...m,
          estimate: estimateMachineMtdCost(m, now),
        }));
        const volumeDetails = found.volumes.map(v => ({
          ...v,
          estimateCents: estimateVolumeMtdCost(v, now),
        }));

        const result = { app: found.app, orgSlug: found.orgSlug, machines: machineDetails, volumes: volumeDetails };
        cacheSet(CACHE_KEY, result);
        return result;
      }),

    assignClient: superAdminProcedure
      .input(z.object({
        appName: z.string(),
        orgSlug: z.string(),
        clientSlug: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { cacheGet, cacheSet } = await import("./fly-cache");
        await upsertFlyAppMapping({
          appName: input.appName,
          orgSlug: input.orgSlug,
          clientSlug: input.clientSlug ?? null,
          label: input.label ?? null,
          notes: input.notes ?? null,
        });
        // Patch the cached rows in place — a client assignment is just a label,
        // so there's no need to re-hit the Fly API for every org.
        const cached = cacheGet<{ rows: Array<{ appName: string; clientSlug: string | null; label: string | null }>; fetchedAt: string }>("apps:all");
        if (cached) {
          const row = cached.rows.find(r => r.appName === input.appName);
          if (row) {
            row.clientSlug = input.clientSlug ?? null;
            row.label = input.label ?? null;
            cacheSet("apps:all", cached);
          }
        }
        return { success: true };
      }),

    refresh: superAdminProcedure.mutation(async () => {
      const { cacheBust } = await import("./fly-cache");
      cacheBust();
      return { success: true };
    }),

    listManualApps: superAdminProcedure.query(async () => {
      return listManualApps();
    }),

    saveManualApp: superAdminProcedure.input(z.object({
      id: z.number().optional(),
      name: z.string().min(1),
      provider: z.string().min(1),
      clientSlug: z.string().nullable(),
      label: z.string().nullable(),
      monthlyCostUsd: z.number().min(0),
      notes: z.string().nullable(),
    })).mutation(async ({ input }) => {
      try {
        return await upsertManualApp({
          id: input.id,
          name: input.name,
          provider: input.provider,
          clientSlug: input.clientSlug,
          label: input.label,
          monthlyCostUsd: String(input.monthlyCostUsd),
          notes: input.notes,
        });
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
      }
    }),

    deleteManualApp: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await deleteManualApp(input.id);
      return { success: true };
    }),

    listBackups: superAdminProcedure.query(async () => {
      const { cacheGet, cacheSet } = await import("./fly-cache");
      const CACHE_KEY = "backups:all";
      const cached = cacheGet<unknown>(CACHE_KEY);
      if (cached) return cached;
      const { listDbBackups } = await import("./fly-client");
      try {
        const data = await listDbBackups();
        cacheSet(CACHE_KEY, data);
        return data;
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
      }
    }),

    takeSnapshot: superAdminProcedure.input(z.object({
      appName: z.string(),
      volumeId: z.string(),
      orgSlug: z.string(),
    })).mutation(async ({ input }) => {
      const { createVolumeSnapshot } = await import("./fly-client");
      const { cacheBust } = await import("./fly-cache");
      try {
        const snap = await createVolumeSnapshot(input.appName, input.volumeId, input.orgSlug);
        cacheBust("backups:");
        return snap;
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
      }
    }),

    exchangeRate: superAdminProcedure.query(async () => {
      try {
        const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=ZAR", {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return { rate: null };
        const data = await res.json() as { rates?: { ZAR?: number } };
        return { rate: data?.rates?.ZAR ?? null };
      } catch {
        return { rate: null };
      }
    }),
  }),

  // Retainer SLA reporting for the Fundi Monthly Report (CSS-2026-01 clause 15.2).
  // superAdmin only: this is GD's own performance against its own contract, and the
  // registry behind it covers every GD-hosted platform across all clients.
  retainer: router({
    sla: superAdminProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
      .query(async ({ input }) => {
        const { buildSlaSection } = await import("./retainer-sla");
        try {
          return await buildSlaSection(input.month);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),
  }),

  mandate: router({
    create: adminProcedure
      .input(z.object({
        clientSlug: z.string(),
        clientName: z.string(),
        clientEmail: z.string().email(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        chargeOnSetup: z.boolean().default(true),
        notes: z.string().optional(),
        lineItems: z.array(z.object({
          description: z.string().min(1),
          amount: z.string(),
          interval: z.enum(["monthly", "annual"]),
          nextBillingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const { id, shareToken } = await createMandate(
          {
            clientSlug: input.clientSlug,
            clientName: input.clientName,
            clientEmail: input.clientEmail,
            startDate: input.startDate,
            chargeOnSetup: input.chargeOnSetup,
            notes: input.notes,
          },
          input.lineItems.map((item, i) => ({ ...item, sortOrder: i + 1 }))
        );
        return { id, shareToken };
      }),

    get: adminProcedure
      .input(z.object({ clientSlug: z.string() }))
      .query(async ({ input }) => {
        const mandates = await getMandatesByClientSlug(input.clientSlug);
        const active = mandates.find(m => m.status !== "cancelled") ?? mandates[0] ?? null;
        if (!active) return null;
        const items = await getMandateLineItems(active.id);
        return { ...active, lineItems: items };
      }),

    pause: adminProcedure
      .input(z.object({ mandateId: z.number() }))
      .mutation(async ({ input }) => {
        await updateMandateStatus(input.mandateId, "paused");
        return { success: true };
      }),

    resume: adminProcedure
      .input(z.object({ mandateId: z.number() }))
      .mutation(async ({ input }) => {
        await updateMandateStatus(input.mandateId, "active");
        return { success: true };
      }),

    retryCharge: adminProcedure
      .input(z.object({ mandateId: z.number() }))
      .mutation(async ({ input }) => {
        await updateMandateStatus(input.mandateId, "active");
        await runMandateBillingTick();
        const mandate = await getMandateById(input.mandateId);
        return { success: true, status: mandate?.status ?? "active" };
      }),

    cancel: adminProcedure
      .input(z.object({ mandateId: z.number() }))
      .mutation(async ({ input }) => {
        await updateMandateStatus(input.mandateId, "cancelled");
        return { success: true };
      }),

    updateLineItems: adminProcedure
      .input(z.object({
        mandateId: z.number(),
        lineItems: z.array(z.object({
          description: z.string().min(1),
          amount: z.string(),
          interval: z.enum(["monthly", "annual"]),
          nextBillingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })),
      }))
      .mutation(async ({ input }) => {
        await replaceMandateLineItems(
          input.mandateId,
          input.lineItems.map((item, i) => ({ ...item, sortOrder: i + 1 }))
        );
        return { success: true };
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const mandate = await getMandateByToken(input.token);
        if (!mandate) return null;
        const items = await getMandateLineItems(mandate.id);
        return {
          id: mandate.id,
          clientName: mandate.clientName,
          status: mandate.status,
          cardLast4: mandate.cardLast4,
          cardBrand: mandate.cardBrand,
          startDate: mandate.startDate,
          chargeOnSetup: mandate.chargeOnSetup !== 0,
          lineItems: items.map(item => ({
            id: item.id,
            description: item.description,
            amount: item.amount,
            interval: item.interval,
            nextBillingDate: item.nextBillingDate,
          })),
        };
      }),

    initializeCardSetup: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const mandate = await getMandateByToken(input.token);
        if (!mandate) throw new TRPCError({ code: "NOT_FOUND", message: "Mandate not found" });
        if (mandate.status !== "pending_card") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Mandate is not awaiting card setup" });
        }

        const items = await getMandateLineItems(mandate.id);
        const chargeOnSetup = mandate.chargeOnSetup !== 0;
        const totalRands = chargeOnSetup
          ? items.reduce((sum, item) => sum + parseFloat(String(item.amount)), 0)
          : 0;
        // Paystack minimum is R1 — use it as a card verification fee when skipping initial charge
        const amountCents = chargeOnSetup ? randsToCents(totalRands) : 100;
        const reference = `m_${mandate.id}_setup_${Date.now()}`;

        const { access_code } = await initializeTransaction({
          email: mandate.clientEmail,
          amount: amountCents,
          reference,
          metadata: { mandateId: mandate.id, type: "mandate_setup" },
        });

        const { publicKey, mode } = await getPaystackKeys();
        return { accessCode: access_code, publicKey, mode };
      }),

    sendSetupEmail: adminProcedure
      .input(z.object({ mandateId: z.number(), email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const mandate = await getMandateById(input.mandateId);
        if (!mandate) throw new TRPCError({ code: "NOT_FOUND" });
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const baseUrl = `${ctx.req.protocol}://${ctx.req.get("host")}`;
        const setupUrl = `${baseUrl}/billing/${mandate.shareToken}`;
        const items = await getMandateLineItems(input.mandateId);
        const lineItemsHtml = items.map(item =>
          `<tr><td style="padding:8px 0;font-size:14px;color:#111;">${item.description}</td><td style="padding:8px 0;font-size:14px;color:#111;text-align:right;">R${parseFloat(String(item.amount)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}/${item.interval === "monthly" ? "mo" : "yr"}</td></tr>`
        ).join("");
        await resend.emails.send({
          from: "Wesley @ Gro Digital <wesley@grodigital.co.za>",
          to: input.email,
          subject: "Set up your billing with Gro Digital",
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
              <div style="background:#fff;padding:28px 32px 20px;border:1px solid #e5e7eb;border-bottom:3px solid #2286c2;border-radius:12px 12px 0 0;">
                <img src="https://pub-7689bb2e0fe5474fb166518d32366c41.r2.dev/media/1773557375019-ei1drt50gii.png" alt="Gro Digital" height="32" style="height:32px;width:auto;display:block;" />
              </div>
              <div style="padding:36px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                <p style="font-size:16px;font-weight:600;margin:0 0 6px;color:#111;">Hi ${mandate.clientName.split(" ")[0]},</p>
                <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px;">Please click the button below to securely enter your card details and set up recurring billing for your Gro Digital services.</p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
                  <thead><tr><th style="text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">Service</th><th style="text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">Amount</th></tr></thead>
                  <tbody>${lineItemsHtml}</tbody>
                </table>
                <a href="${setupUrl}" style="display:inline-block;background:#2286c2;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:32px;">Set up billing →</a>
                <p style="font-size:12px;color:#9ca3af;margin:0;padding-top:24px;border-top:1px solid #f3f4f6;">Your card details are secured by Paystack. Questions? Email <a href="mailto:wesley@grodigital.co.za" style="color:#2286c2;text-decoration:none;">wesley@grodigital.co.za</a></p>
              </div>
            </div>
          `,
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
