import { date, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  googleRefreshToken: text("googleRefreshToken"),
  googleConnectedEmail: varchar("googleConnectedEmail", { length: 320 }),
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
  invoiceDate: timestamp("invoiceDate").notNull(),
  dueDate: timestamp("dueDate"),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientProfile = typeof clientProfiles.$inferSelect;

/**
 * Leads / prospects pipeline.
 */
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  monthlyValue: decimal("monthlyValue", { precision: 12, scale: 2 }),
  onceOffValue: decimal("onceOffValue", { precision: 12, scale: 2 }),
  stage: mysqlEnum("stage", ["prospect", "proposal", "negotiation"]).default("prospect").notNull(),
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
  htmlContent: text("htmlContent").notNull(),
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
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;
