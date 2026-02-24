import { boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  done: boolean("done").default(false).notNull(),
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
