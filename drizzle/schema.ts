import { boolean, date, decimal, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["client", "admin", "superAdmin"]).default("client").notNull(),
  clientSlug: varchar("clientSlug", { length: 128 }),
  passwordHash: text("passwordHash"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  googleRefreshToken: text("googleRefreshToken"),
  googleConnectedEmail: varchar("googleConnectedEmail", { length: 320 }),
  assignedClients: text("assignedClients"),
  lastSeenAt: timestamp("lastSeenAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Invoices table – stores invoice header info.
 */
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 32 }).notNull().unique(),
  clientSlug: varchar("clientSlug", { length: 128 }).notNull().default(""),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientContact: varchar("clientContact", { length: 255 }),
  clientPhone: varchar("clientPhone", { length: 64 }),
  clientEmail: varchar("clientEmail", { length: 320 }),
  projectName: varchar("projectName", { length: 255 }),
  projectSummary: text("projectSummary"),
  invoiceType: mysqlEnum("invoiceType", ["once-off", "monthly", "annual"]).default("once-off").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "paid", "overdue"]).default("sent").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  amountDue: decimal("amountDue", { precision: 12, scale: 2 }).notNull(),
  paymentTerms: varchar("paymentTerms", { length: 255 }).default("Due upon receipt"),
  paymentReference: varchar("paymentReference", { length: 128 }),
  paymentUrl: varchar("paymentUrl", { length: 512 }),
  paymentToken: varchar("paymentToken", { length: 128 }),
  bankName: varchar("bankName", { length: 128 }),
  accountHolder: varchar("accountHolder", { length: 128 }),
  accountNumber: varchar("accountNumber", { length: 64 }),
  accountType: varchar("accountType", { length: 64 }),
  branchCode: varchar("branchCode", { length: 32 }),
  notes: text("notes"),
  clientAddress: text("clientAddress"),
  shareToken: varchar("shareToken", { length: 21 }).unique(),
  mandateId: int("mandateId"),
  invoiceDate: timestamp("invoiceDate").notNull(),
  dueDate: timestamp("dueDate"),
  scheduledSendDate: date("scheduledSendDate"),
  repeatMonthly: tinyint("repeatMonthly").default(0),
  // When the invoice was last actually emailed to the client. NULL means it has
  // never been sent. `status` alone cannot answer this: a draft can be marked
  // sent by hand, and a scheduled draft looks identical to one already out.
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Invoice line items – individual billable items on an invoice.
 */
export const invoiceItems = mysqlTable("invoiceItems", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  frequency: varchar("frequency", { length: 64 }).default("Once Off"),
  vat: varchar("vat", { length: 32 }).default("No VAT"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  quantity: int("quantity").default(1),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

/**
 * Admin tasks – internal reminders and follow-ups.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 512 }).notNull(),
  clientSlug: varchar("clientSlug", { length: 128 }),
  clientName: varchar("clientName", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("todo"),
  dueDate: date("dueDate"),
  priority: varchar("priority", { length: 16 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Client profiles — notes and metadata per client slug.
 */
export const clientProfiles = mysqlTable("clientProfiles", {
  clientSlug: varchar("clientSlug", { length: 128 }).primaryKey(),
  notes: text("notes"),
  address: text("address"),
  name: varchar("name", { length: 255 }),
  contact: varchar("contact", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  analyticsEmbed: text("analyticsEmbed"),
  analyticsToken: varchar("analyticsToken", { length: 21 }).unique(),
  instagramBusinessId: varchar("instagramBusinessId", { length: 255 }),
  instagramAccessToken: text("instagramAccessToken"),
  instagramUsername: varchar("instagramUsername", { length: 255 }),
  facebookPageId: varchar("facebookPageId", { length: 128 }),
  facebookPageAccessToken: text("facebookPageAccessToken"),
  facebookPageName: varchar("facebookPageName", { length: 255 }),
  facebookUserToken: text("facebookUserToken"),
  linkedinAccessToken: text("linkedinAccessToken"),
  linkedinRefreshToken: text("linkedinRefreshToken"),
  linkedinTokenExpiresAt: timestamp("linkedinTokenExpiresAt"),
  linkedinPersonUrn: varchar("linkedinPersonUrn", { length: 128 }),
  linkedinOrganizationId: varchar("linkedinOrganizationId", { length: 128 }),
  linkedinOrganizationName: varchar("linkedinOrganizationName", { length: 255 }),
  linkedinPostTarget: mysqlEnum("linkedinPostTarget", ["personal", "organization"]).default("personal"),
  resendSegmentId: varchar("resendSegmentId", { length: 255 }),
  mailchimpApiKey: varchar("mailchimpApiKey", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientProfile = typeof clientProfiles.$inferSelect;

/**
 * Leads / prospects pipeline.
 */
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  organisationId: int("organisationId"),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  monthlyValue: decimal("monthlyValue", { precision: 12, scale: 2 }),
  onceOffValue: decimal("onceOffValue", { precision: 12, scale: 2 }),
  stage: mysqlEnum("stage", ["prospect", "proposal", "negotiation", "cold"]).default("prospect").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * Subscriptions — recurring contract values used for MRR/ARR metrics.
 * One record per service per client. Invoices are billing documents only.
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  clientSlug: varchar("clientSlug", { length: 128 }).notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["monthly", "annual"]).notNull().default("monthly"),
  status: mysqlEnum("status", ["active", "paused", "cancelled"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Henry chat history – persists portal conversations per user.
 */
export const henryMessages = mysqlTable("henry_messages", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HenryMessage = typeof henryMessages.$inferSelect;

/**
 * Agent chat history – persists conversations for specialist agents (finance, marketing, etc.).
 */
export const agentMessages = mysqlTable("agent_messages", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull(),
  agentSlug: varchar("agentSlug", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentMessage = typeof agentMessages.$inferSelect;

/**
 * Proposals — shareable client-facing proposal documents (HTML blobs).
 */
export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 21 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  htmlContent: mediumtext("htmlContent").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "viewed", "accepted", "declined"]).default("draft").notNull(),
  assignedType: mysqlEnum("assignedType", ["client", "lead", "none"]).default("none").notNull(),
  assignedName: varchar("assignedName", { length: 255 }),
  clientSlug: varchar("clientSlug", { length: 128 }),
  leadId: int("leadId"),
  externalEmail: varchar("externalEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  sentAt: timestamp("sentAt"),
  viewedAt: timestamp("viewedAt"),
  acceptedAt: timestamp("acceptedAt"),
  acceptedBy: varchar("acceptedBy", { length: 320 }),
  viewerIp: varchar("viewerIp", { length: 45 }),
  viewerLocation: varchar("viewerLocation", { length: 255 }),
});

export type Proposal = typeof proposals.$inferSelect;

export const proposalViews = mysqlTable("proposalViews", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
  viewerIp: varchar("viewerIp", { length: 45 }),
  viewerLocation: varchar("viewerLocation", { length: 255 }),
});
export type InsertProposal = typeof proposals.$inferInsert;

/**
 * Marketing campaigns — one per client engagement.
 */
export const marketingCampaigns = mysqlTable("marketing_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  clientSlug: varchar("clientSlug", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["discovery", "strategy", "generating", "approval", "active", "completed"]).default("discovery").notNull(),
  strategy: text("strategy"),
  brandVoice: text("brandVoice"),
  targetAudience: text("targetAudience"),
  contentThemes: text("contentThemes"),
  postsPerWeek: int("postsPerWeek").default(3),
  startDate: date("startDate"),
  endDate: date("endDate"),
  imageModel: varchar("imageModel", { length: 64 }).default("dall-e-3"),
  imageStyle: varchar("imageStyle", { length: 128 }).default(""),
  imageAspectRatio: varchar("imageAspectRatio", { length: 16 }).default("1:1"),
  shareToken: varchar("shareToken", { length: 21 }).unique(),
  sharePassword: varchar("sharePassword", { length: 255 }),
  postToInstagram: boolean("postToInstagram").default(true).notNull(),
  postToFacebook: boolean("postToFacebook").default(false).notNull(),
  postToLinkedin: boolean("postToLinkedin").default(false).notNull(),
  postToEmail: boolean("postToEmail").default(false).notNull(),
  linkedinPostsPerWeek: int("linkedinPostsPerWeek").default(2),
  createdBy: varchar("createdBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = typeof marketingCampaigns.$inferInsert;

/**
 * Marketing posts — individual scheduled Instagram posts within a campaign.
 */
export const marketingPosts = mysqlTable("marketing_posts", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  caption: text("caption"),
  hashtags: text("hashtags"),
  imagePrompt: text("imagePrompt"),
  imageUrl: text("imageUrl"),
  mediaType: mysqlEnum("mediaType", ["image", "video"]).default("image").notNull(),
  videoUrl: text("videoUrl"),
  status: mysqlEnum("status", ["draft", "approved", "rejected", "scheduled", "posted", "failed"]).default("draft").notNull(),
  instagramPostId: varchar("instagramPostId", { length: 128 }),
  facebookPostId: varchar("facebookPostId", { length: 128 }),
  linkedinPostId: varchar("linkedinPostId", { length: 128 }),
  linkedinCaption: text("linkedinCaption"),
  theme: varchar("theme", { length: 255 }),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketingPost = typeof marketingPosts.$inferSelect;
export type InsertMarketingPost = typeof marketingPosts.$inferInsert;

/**
 * Campaign messages — chat history per campaign (includes tool role for agentic loop).
 */
export const campaignMessages = mysqlTable("campaign_messages", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  role: varchar("role", { length: 32 }).notNull(), // user | assistant | tool
  content: text("content").notNull(),
  toolCallId: varchar("toolCallId", { length: 128 }),
  toolName: varchar("toolName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignMessage = typeof campaignMessages.$inferSelect;

/**
 * Campaign brand assets — uploaded reference images per campaign.
 */
export const campaignAssets = mysqlTable('campaignAssets', {
  id: int('id').autoincrement().primaryKey(),
  campaignId: int('campaignId').notNull(),
  url: text('url').notNull(),
  label: varchar('label', { length: 255 }),
  aiDescription: text('aiDescription'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export type CampaignAsset = typeof campaignAssets.$inferSelect;

/**
 * Campaign mailers — HTML email drafts attached to a campaign.
 */
export const campaignMailers = mysqlTable('campaignMailers', {
  id: int('id').autoincrement().primaryKey(),
  campaignId: int('campaignId').notNull(),
  subject: varchar('subject', { length: 255 }).notNull().default(''),
  previewText: varchar('previewText', { length: 255 }),
  htmlContent: mediumtext('htmlContent').notNull(),
  status: mysqlEnum('status', ['draft', 'scheduled', 'sent']).default('draft').notNull(),
  scheduledAt: timestamp('scheduledAt'),
  sentAt: timestamp('sentAt'),
  sentCount: int('sentCount').default(0).notNull(),
  resendBroadcastId: varchar('resendBroadcastId', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export type CampaignMailer = typeof campaignMailers.$inferSelect;
export type InsertCampaignMailer = typeof campaignMailers.$inferInsert;


/**
 * Mailer chat messages — per-mailer AI conversation history.
 */
export const mailerChatMessages = mysqlTable('mailerChatMessages', {
  id: int('id').autoincrement().primaryKey(),
  mailerId: int('mailerId').notNull(),
  role: mysqlEnum('role', ['user', 'assistant']).notNull(),
  content: mediumtext('content').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export type MailerChatMessage = typeof mailerChatMessages.$inferSelect;

export const mailerEvents = mysqlTable('mailerEvents', {
  id: int('id').autoincrement().primaryKey(),
  mailerId: int('mailerId').notNull(),
  type: mysqlEnum('type', ['open', 'click']).notNull(),
  url: text('url'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export type MailerEvent = typeof mailerEvents.$inferSelect;

/**
 * Media library — uploaded images/files stored in R2.
 */
export const mediaFiles = mysqlTable("mediaFiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  key: varchar("key", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  size: int("size").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediaFile = typeof mediaFiles.$inferSelect;
export type InsertMediaFile = typeof mediaFiles.$inferInsert;

/**
 * Outreach prospects — businesses discovered via Places + PageSpeed enrichment,
 * emailed directly and optionally converted to leads.
 */
export const outreachProspects = mysqlTable("outreachProspects", {
  id: int("id").autoincrement().primaryKey(),
  organisationId: int("organisationId"),
  businessName: varchar("businessName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  website: varchar("website", { length: 512 }),
  address: varchar("address", { length: 512 }),
  industry: varchar("industry", { length: 255 }),
  pageSpeedScore: int("pageSpeedScore"),
  issues: text("issues"),
  businessContext: text("businessContext"),
  leadScore: int("leadScore"),
  googleRating: decimal("googleRating", { precision: 2, scale: 1 }),
  googleReviewCount: int("googleReviewCount"),
  status: mysqlEnum("status", ["new", "emailed", "replied", "converted"]).default("new").notNull(),
  lastEmailSubject: varchar("lastEmailSubject", { length: 512 }),
  lastEmailBody: text("lastEmailBody"),
  lastEmailSentAt: timestamp("lastEmailSentAt"),
  notes: text("notes"),
  leadId: int("leadId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutreachProspect = typeof outreachProspects.$inferSelect;
export type InsertOutreachProspect = typeof outreachProspects.$inferInsert;

/**
 * Portal-wide settings — key/value store for admin-configurable options.
 */
export const portalSettings = mysqlTable("portal_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
});

export type PortalSetting = typeof portalSettings.$inferSelect;

/**
 * Recurring invoice config — one row per client, drives monthly auto-invoicing.
 */
export const recurringInvoiceConfig = mysqlTable("recurringInvoiceConfig", {
  id: int("id").autoincrement().primaryKey(),
  clientSlug: varchar("clientSlug", { length: 128 }).notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  description: varchar("description", { length: 512 }).notNull().default("Monthly Services"),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  sendDay: int("sendDay").notNull().default(25),
  paymentTerms: varchar("paymentTerms", { length: 255 }).notNull().default("Due upon receipt"),
  notes: text("notes"),
  lastSentAt: timestamp("lastSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecurringInvoiceConfig = typeof recurringInvoiceConfig.$inferSelect;
export type InsertRecurringInvoiceConfig = typeof recurringInvoiceConfig.$inferInsert;

/**
 * AI interaction log — every MCP tool call, for feedback loop analysis.
 */
export const aiInteractions = mysqlTable("aiInteractions", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 64 }).notNull().default("mcp"),
  toolName: varchar("toolName", { length: 128 }).notNull(),
  inputSummary: text("inputSummary"),
  isError: boolean("isError").notNull().default(false),
  clientSlug: varchar("clientSlug", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiInteraction = typeof aiInteractions.$inferSelect;
export type InsertAiInteraction = typeof aiInteractions.$inferInsert;

/**
 * Projects — tracks active Claude Code / VS Code sessions and their build progress.
 * Auto-updated via git post-commit hook from any project repo.
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  repoPath: varchar("repoPath", { length: 512 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "paused", "done"]).default("active").notNull(),
  currentFocus: text("currentFocus"),
  lastCommitMessage: text("lastCommitMessage"),
  lastCommitAt: timestamp("lastCommitAt"),
  branch: varchar("branch", { length: 255 }),
  commitCount: int("commitCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * User activity log — login events, page views, and key actions.
 */
export const userActivity = mysqlTable("userActivity", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  path: varchar("path", { length: 255 }),
  meta: varchar("meta", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserActivity = typeof userActivity.$inferSelect;

export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 21 }).unique().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),
  htmlContent: mediumtext("htmlContent").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "signed"]).default("draft").notNull(),
  signedBy: varchar("signedBy", { length: 255 }),
  signedCompany: varchar("signedCompany", { length: 255 }),
  signerEmail: varchar("signerEmail", { length: 320 }),
  signedAt: timestamp("signedAt"),
  signerIp: varchar("signerIp", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

/**
 * Billing mandates — one per client, stores tokenised Paystack card and drives
 * auto-charging across multiple billing intervals (monthly + annual).
 */
export const billingMandates = mysqlTable("billingMandates", {
  id: int("id").autoincrement().primaryKey(),
  clientSlug: varchar("clientSlug", { length: 128 }).notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }).notNull(),
  shareToken: varchar("shareToken", { length: 32 }).notNull().unique(),
  status: mysqlEnum("status", ["pending_card", "active", "paused", "cancelled", "failed"]).default("pending_card").notNull(),
  paystackAuthCode: varchar("paystackAuthCode", { length: 128 }),
  paystackCustomerCode: varchar("paystackCustomerCode", { length: 128 }),
  cardLast4: varchar("cardLast4", { length: 4 }),
  cardBrand: varchar("cardBrand", { length: 32 }),
  cardExpMonth: varchar("cardExpMonth", { length: 2 }),
  cardExpYear: varchar("cardExpYear", { length: 4 }),
  startDate: date("startDate").notNull(),
  chargeOnSetup: tinyint("chargeOnSetup").default(1).notNull(),
  activatedAt: timestamp("activatedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BillingMandate = typeof billingMandates.$inferSelect;
export type InsertBillingMandate = typeof billingMandates.$inferInsert;

/**
 * Mandate line items — individual billable services within a mandate,
 * each with its own interval and next billing date.
 */
export const mandateLineItems = mysqlTable("mandateLineItems", {
  id: int("id").autoincrement().primaryKey(),
  mandateId: int("mandateId").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  interval: mysqlEnum("interval", ["monthly", "annual"]).notNull(),
  status: mysqlEnum("status", ["active", "paused"]).default("active").notNull(),
  nextBillingDate: date("nextBillingDate").notNull(),
  lastBilledAt: timestamp("lastBilledAt"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MandateLineItem = typeof mandateLineItems.$inferSelect;
export type InsertMandateLineItem = typeof mandateLineItems.$inferInsert;

/**
 * Autonomous feedback pipeline — tracks feedback submissions that can be
 * approved or dismissed via email and, on approval, are handed to a Claude
 * Code GitHub Action to implement and (if safe) auto-merge.
 */
export const feedbackApprovals = mysqlTable("feedbackApprovals", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId"),
  type: varchar("type", { length: 16 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  currentUrl: varchar("currentUrl", { length: 1024 }),
  userName: varchar("userName", { length: 255 }),
  userRole: varchar("userRole", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  commitSha: varchar("commitSha", { length: 64 }),
  prNumber: int("prNumber"),
  prUrl: varchar("prUrl", { length: 512 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
  completedAt: timestamp("completedAt"),
});

export type FeedbackApproval = typeof feedbackApprovals.$inferSelect;
export type InsertFeedbackApproval = typeof feedbackApprovals.$inferInsert;

export const flyApps = mysqlTable("flyApps", {
  appName: varchar("appName", { length: 128 }).primaryKey(),
  orgSlug: varchar("orgSlug", { length: 128 }).notNull(),
  clientSlug: varchar("clientSlug", { length: 128 }),
  label: varchar("label", { length: 256 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FlyApp = typeof flyApps.$inferSelect;
export type InsertFlyApp = typeof flyApps.$inferInsert;

export const manualApps = mysqlTable("manualApps", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  clientSlug: varchar("clientSlug", { length: 128 }),
  label: varchar("label", { length: 256 }),
  monthlyCostUsd: decimal("monthlyCostUsd", { precision: 10, scale: 2 }).notNull().default("0.00"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ManualApp = typeof manualApps.$inferSelect;
export type InsertManualApp = typeof manualApps.$inferInsert;

/**
 * Organisations — the company, whatever stage it is at.
 *
 * Before this table a company had no record of its own: clients were an
 * aggregate over invoice headers (see getDistinctClients), while leads and
 * outreachProspects each carried their own free-text business name. A company
 * that moved prospect → lead → client therefore existed as three unrelated
 * rows, which is why Bison, IGL, Addex, Exotic Jams and Fundi each appear
 * twice. One row per company, and stage moves.
 *
 * clientSlug stays the join key for the twelve tables that already use it, so
 * this is additive: slug matches clientProfiles.clientSlug where the company is
 * a client, and is generated for the ones that are not.
 */
export const organisations = mysqlTable("organisations", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  stage: mysqlEnum("stage", ["prospect", "lead", "client", "past_client"]).default("prospect").notNull(),
  // A standing "never market to this company". Kept here rather than as a
  // per-campaign segment rule, because a rule you have to remember every time is
  // one you will eventually forget — and the client who must not be marketed to
  // is exactly the one where forgetting matters.
  excludeFromMarketing: boolean("excludeFromMarketing").default(false).notNull(),
  website: varchar("website", { length: 512 }),
  industry: varchar("industry", { length: 255 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Organisation = typeof organisations.$inferSelect;
export type InsertOrganisation = typeof organisations.$inferInsert;

/**
 * Contacts — people. The master list every channel sends to.
 *
 * email and phone are unique so a duplicate is a decision at import time
 * rather than a double-send later. phone is stored E.164 (+27…) because that
 * is what WhatsApp and SMS require and because four different formats were in
 * use, one of them wrapped in Unicode direction marks.
 *
 * Consent is recorded as a basis with a source and a date, not a boolean:
 * - existing_customer — POPIA s69(3)(a), marketing to an existing customer for
 *   similar services, lawful while every message carries an opt-out
 * - explicit_optin — they asked to hear from us
 * whatsappOptInAt is separate and stricter: Meta requires a WhatsApp-specific
 * opt-in for marketing templates and enforces it through quality rating, so a
 * lawful basis under POPIA is not on its own enough to send one.
 */
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  email: varchar("email", { length: 320 }).unique(),
  phone: varchar("phone", { length: 32 }).unique(),
  isInternal: boolean("isInternal").default(false).notNull(),
  consentBasis: mysqlEnum("consentBasis", ["none", "existing_customer", "explicit_optin"]).default("none").notNull(),
  consentSource: varchar("consentSource", { length: 255 }),
  consentAt: timestamp("consentAt"),
  whatsappOptInAt: timestamp("whatsappOptInAt"),
  optedOutAt: timestamp("optedOutAt"),
  doNotContact: boolean("doNotContact").default(false).notNull(),
  source: varchar("source", { length: 64 }),
  engageContactId: varchar("engageContactId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

/**
 * Which companies a person acts for. Many-to-many because one person genuinely
 * acts for several: the admin who runs reception for both the ENT and the
 * audiologist at the same practice, and Wesley, who is the named contact on Gro
 * Digital, Proply and Better Home Group.
 *
 * The alternative was one contact row per company, which would have meant
 * dropping the unique index on email — and then sending that admin every
 * campaign twice. Deduplication for sending and accuracy for the CRM are the
 * same requirement, met by one row per person and a link per company.
 *
 * role lives here rather than on the contact: the same person is "practice
 * manager" at one and "bookkeeper" at another.
 */
export const contactOrganisations = mysqlTable("contactOrganisations", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  organisationId: int("organisationId").notNull(),
  role: varchar("role", { length: 128 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactOrganisation = typeof contactOrganisations.$inferSelect;
export type InsertContactOrganisation = typeof contactOrganisations.$inferInsert;
