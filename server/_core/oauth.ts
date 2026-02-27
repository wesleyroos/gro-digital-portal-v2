import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { registerGoogleOAuthRoutes } from "../google-oauth";

async function buildHenrySystemMessage(): Promise<string> {
  const [outstanding, tasks, clients] = await Promise.all([
    db.getOutstandingInvoices(),
    db.getTasks(),
    db.getDistinctClients(),
  ]);

  const invoiceLines = outstanding.length === 0
    ? "None"
    : outstanding.map(inv => {
        const amount = `R${parseFloat(String(inv.amountDue)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
        const due = inv.dueDate ? ` (due ${new Date(inv.dueDate).toLocaleDateString("en-ZA")})` : "";
        return `  - ${inv.invoiceNumber} | ${inv.clientName}${inv.projectName ? ` — ${inv.projectName}` : ""} | ${amount} | ${inv.status}${due}`;
      }).join("\n");

  const openTasks = tasks.filter(t => t.status !== "done");
  const taskLines = openTasks.length === 0
    ? "None"
    : openTasks.map(t => {
        const due = t.dueDate ? ` | due ${new Date(t.dueDate).toISOString().slice(0, 10)}` : "";
        const pri = t.priority ? ` | ${t.priority}` : "";
        const client = t.clientName ? ` | ${t.clientName}` : "";
        return `  - [id:${t.id}] ${t.text} | ${t.status}${pri}${due}${client}`;
      }).join("\n");

  const clientLines = clients.length === 0
    ? "None"
    : clients.map(c => `  - ${c.clientName} (slug: ${c.clientSlug})`).join("\n");

  return `You are Henry, the AI assistant for GRO Digital — a web design and digital marketing agency run by Wes Roos in South Africa. You help Wes manage his business efficiently through the GRO Digital portal.

Today's date: ${new Date().toISOString().slice(0, 10)}

OUTSTANDING INVOICES (sent/overdue):
${invoiceLines}

OPEN TASKS:
${taskLines}

CLIENTS:
${clientLines}

Guidelines:
- Be concise and practical
- Use South African currency format (R)
- You have real-time portal data above — use it to answer business questions accurately
- If asked about something not in the data above, say so clearly
- Do not use markdown formatting. No **, *, #, or - bullet symbols. Write in plain text with line breaks for structure.
- When creating or updating tasks, use the available tools. Always confirm what you did after using a tool.
- For dueDate, use YYYY-MM-DD format. Status values: todo, in_progress, blocked, done. Priority values: low, medium, high.
- Before creating a task, if the request is vague or missing important details (like what the task is for, which client, or when it's due), ask Wes for clarification first rather than guessing. Only proceed once you have enough information.
- You have three specialist agents available on the Agents page: Finance (invoices, payments, MRR/ARR, payment chasing), Marketing (leads pipeline, upsells, content strategy), and Ops (task management, client delivery, annual renewals). If Wes asks about something that falls clearly in their domain, handle it yourself or suggest he switch to the relevant agent for deeper focus.`;
}

const HENRY_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new task in the portal",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The task description (required)" },
          status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"], description: "Task status (default: todo)" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority (optional)" },
          dueDate: { type: "string", description: "Due date in YYYY-MM-DD format (optional)" },
          clientSlug: { type: "string", description: "Client slug to associate the task with (optional, must match a known client)" },
          notes: { type: "string", description: "Additional notes (optional)" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: "Update an existing task by its id",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The task id (from the OPEN TASKS list)" },
          text: { type: "string", description: "New task description" },
          status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"], description: "New status" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority" },
          dueDate: { type: "string", description: "New due date in YYYY-MM-DD format" },
          clientSlug: { type: "string", description: "New client slug" },
          notes: { type: "string", description: "New notes" },
        },
        required: ["id", "text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_task_done",
      description: "Mark a task as done or reopen it",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The task id" },
          done: { type: "boolean", description: "true to mark done, false to reopen" },
        },
        required: ["id", "done"],
      },
    },
  },
] as const;

async function executeHenryTool(name: string, args: Record<string, unknown>, clients: { clientSlug: string; clientName: string }[]): Promise<string> {
  try {
    if (name === "create_task") {
      const clientSlug = args.clientSlug as string | undefined;
      const client = clientSlug ? clients.find(c => c.clientSlug === clientSlug) : null;
      await db.createTask(
        args.text as string,
        client?.clientSlug ?? null,
        client?.clientName ?? null,
        {
          status: args.status as string | undefined,
          dueDate: args.dueDate as string | null | undefined,
          priority: args.priority as string | null | undefined,
          notes: args.notes as string | null | undefined,
        },
      );
      return `Task created: "${args.text}"`;
    }

    if (name === "update_task") {
      const clientSlug = args.clientSlug as string | undefined;
      const client = clientSlug ? clients.find(c => c.clientSlug === clientSlug) : null;
      await db.updateTask(
        args.id as number,
        args.text as string,
        client?.clientSlug ?? null,
        client?.clientName ?? null,
        {
          status: args.status as string | undefined,
          dueDate: args.dueDate as string | null | undefined,
          priority: args.priority as string | null | undefined,
          notes: args.notes as string | null | undefined,
        },
      );
      return `Task ${args.id} updated`;
    }

    if (name === "set_task_done") {
      await db.setTaskDone(args.id as number, args.done as boolean);
      return `Task ${args.id} marked as ${args.done ? "done" : "open"}`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error executing ${name}: ${String(e)}`;
  }
}

// ── Finance agent ─────────────────────────────────────────────────────────────

async function buildFinanceSystemMessage(): Promise<string> {
  const [allInvoices, subs, clients] = await Promise.all([
    db.getAllInvoices(),
    db.getSubscriptions(),
    db.getDistinctClients(),
  ]);

  const fmt = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
  };

  const overdue = allInvoices.filter(i => i.status === "overdue");
  const sent = allInvoices.filter(i => i.status === "sent");
  const overdueTotal = overdue.reduce((sum, i) => sum + parseFloat(String(i.amountDue)), 0);
  const sentTotal = sent.reduce((sum, i) => sum + parseFloat(String(i.amountDue)), 0);

  const activeSubs = subs.filter(s => s.status === "active");
  const mrr = activeSubs.filter(s => s.type === "monthly").reduce((sum, s) => sum + parseFloat(String(s.amount)), 0);
  const annualRecurring = activeSubs.filter(s => s.type === "annual").reduce((sum, s) => sum + parseFloat(String(s.amount)), 0);
  const arr = mrr * 12 + annualRecurring;

  const invoiceLine = (inv: (typeof allInvoices)[0]) => {
    const due = inv.dueDate ? ` | due ${new Date(inv.dueDate).toLocaleDateString("en-ZA")}` : "";
    const email = inv.clientEmail ? ` | email: ${inv.clientEmail}` : "";
    const contact = inv.clientContact ? ` | contact: ${inv.clientContact}` : "";
    return `  - [id:${inv.id}] ${inv.invoiceNumber} | ${inv.clientName} | ${fmt(inv.amountDue)}${due}${email}${contact}`;
  };

  const clientLines = clients.length
    ? clients.map(c => `  - ${c.clientName} (slug: ${c.clientSlug})`).join("\n")
    : "None";

  return `You are the Finance agent for GRO Digital — a web design and digital marketing agency run by Wes Roos in South Africa.

Your role: manage financial operations — payment collection, invoice follow-ups, subscription health, and cash flow analysis.

Today's date: ${new Date().toISOString().slice(0, 10)}

CASH FLOW SUMMARY:
  Overdue: ${fmt(overdueTotal)} across ${overdue.length} invoice${overdue.length !== 1 ? "s" : ""}
  Outstanding (sent): ${fmt(sentTotal)} across ${sent.length} invoice${sent.length !== 1 ? "s" : ""}

RECURRING REVENUE:
  MRR: ${fmt(mrr)} (${activeSubs.filter(s => s.type === "monthly").length} active monthly subscriptions)
  Annual Recurring: ${fmt(annualRecurring)} (${activeSubs.filter(s => s.type === "annual").length} active annual subscriptions)
  ARR: ${fmt(arr)}

OVERDUE INVOICES:
${overdue.length ? overdue.map(invoiceLine).join("\n") : "  None"}

OUTSTANDING INVOICES (sent, awaiting payment):
${sent.length ? sent.map(invoiceLine).join("\n") : "  None"}

ACTIVE SUBSCRIPTIONS:
${activeSubs.length ? activeSubs.map(s => `  - [id:${s.id}] ${s.clientName} | ${s.description || "Service"} | ${fmt(s.amount)}/${s.type === "monthly" ? "mo" : "yr"} | ${s.status}`).join("\n") : "  None"}

CLIENTS:
${clientLines}

Guidelines:
- Be direct and action-oriented. Your priority is collecting outstanding money and protecting recurring revenue.
- Use South African currency format (R)
- Invoice IDs are shown as [id:X] — use these when calling update_invoice_status or send_invoice_reminder
- When chasing an overdue payment, send a reminder AND create a follow-up task so Wes can track it
- Do not use markdown. Plain text with line breaks only.
- Invoice status values: sent, paid, overdue. Task status: todo, in_progress, blocked, done. Priority: low, medium, high.
- For dueDate use YYYY-MM-DD format.`;
}

const FINANCE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a follow-up task in the portal",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Task description (required)" },
          status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          clientSlug: { type: "string", description: "Client slug (must match a known client)" },
          notes: { type: "string" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_invoice_status",
      description: "Update the status of an invoice (e.g. mark as paid or overdue)",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "number", description: "Invoice id from the INVOICES list ([id:X])" },
          status: { type: "string", enum: ["sent", "paid", "overdue"], description: "New status" },
        },
        required: ["invoiceId", "status"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_invoice_reminder",
      description: "Send a payment reminder email for an invoice",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "number", description: "Invoice id from the INVOICES list ([id:X])" },
          recipientEmail: { type: "string", description: "Email address to send reminder to" },
        },
        required: ["invoiceId", "recipientEmail"],
      },
    },
  },
] as const;

async function executeFinanceTool(
  name: string,
  args: Record<string, unknown>,
  clients: { clientSlug: string; clientName: string }[],
  baseUrl: string,
): Promise<string> {
  try {
    if (name === "create_task") {
      const clientSlug = args.clientSlug as string | undefined;
      const client = clientSlug ? clients.find(c => c.clientSlug === clientSlug) : null;
      await db.createTask(args.text as string, client?.clientSlug ?? null, client?.clientName ?? null, {
        status: args.status as string | undefined,
        dueDate: args.dueDate as string | null | undefined,
        priority: args.priority as string | null | undefined,
        notes: args.notes as string | null | undefined,
      });
      return `Task created: "${args.text}"`;
    }

    if (name === "update_invoice_status") {
      await db.updateInvoiceStatus(args.invoiceId as number, args.status as "draft" | "sent" | "paid" | "overdue");
      return `Invoice ${args.invoiceId} status updated to ${args.status}`;
    }

    if (name === "send_invoice_reminder") {
      await db.sendInvoiceEmail(args.invoiceId as number, args.recipientEmail as string, baseUrl);
      return `Reminder email sent to ${args.recipientEmail} for invoice ${args.invoiceId}`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error executing ${name}: ${String(e)}`;
  }
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Password login – works in all environments when ADMIN_PASSWORD is set
  app.post("/api/auth/password-login", async (req: Request, res: Response) => {
    try {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        console.error("[Auth] ADMIN_PASSWORD env var is not set");
        res.status(500).json({ error: "No admin password configured" });
        return;
      }
      const { password } = req.body as { password?: string };
      if (!password || password !== adminPassword) {
        res.status(401).json({ error: "Invalid password" });
        return;
      }
      const ownerOpenId = process.env.OWNER_OPEN_ID || "admin";
      await db.upsertUser({
        openId: ownerOpenId,
        name: "Admin",
        email: null,
        loginMethod: "password",
        role: "admin",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(ownerOpenId, {
        name: "Admin",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Password login error:", error);
      res.status(500).json({ error: "Login failed, check server logs" });
    }
  });

  // Henry AI relay — proxies requests to the Henry gateway (admin only)
  app.post("/api/henry", async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) {
      res.status(503).json({ error: "Henry not configured" });
      return;
    }

    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const [systemMessage, history, clients] = await Promise.all([
      buildHenrySystemMessage(),
      db.getHenryHistory(authedUser.openId),
      db.getDistinctClients(),
    ]);

    type AnyMessage = Record<string, unknown>;
    const messages: AnyMessage[] = [
      { role: "system", content: systemMessage },
      ...history,
      { role: "user", content: message.trim() },
    ];

    try {
      let reply = "";
      // Agentic loop — max 5 rounds to handle tool calls
      for (let round = 0; round < 5; round++) {
        const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
            "x-openclaw-agent-id": "main",
          },
          body: JSON.stringify({ model: "openclaw", messages, tools: HENRY_TOOLS }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          console.error(`[Henry] Gateway error ${upstream.status}:`, text);
          res.status(502).json({ error: "Henry unavailable" });
          return;
        }

        type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
        const data = await upstream.json() as {
          choices: Array<{
            message: { role: string; content: string | null; tool_calls?: ToolCall[] };
            finish_reason: string;
          }>;
        };

        const assistantMsg = data.choices[0].message;
        messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

        // No tool calls — we have the final reply
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          reply = assistantMsg.content ?? "";
          break;
        }

        // Execute each tool call and append results
        for (const toolCall of assistantMsg.tool_calls) {
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
          const result = await executeHenryTool(toolCall.function.name, toolArgs, clients);
          console.log(`[Henry] Tool ${toolCall.function.name}(${toolCall.function.arguments}) → ${result}`);
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        }
      }

      if (!reply) reply = "Done.";

      await db.appendHenryMessages(authedUser.openId, [
        { role: "user", content: message.trim() },
        { role: "assistant", content: reply },
      ]);
      res.json({ reply });
    } catch (e) {
      console.error("[Henry] Relay error:", e);
      res.status(502).json({ error: "Henry unavailable" });
    }
  });

  // Finance agent relay — proxies requests to the gateway with finance context (admin only)
  app.post("/api/agent/finance", async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) {
      res.status(503).json({ error: "Agent gateway not configured" });
      return;
    }

    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const [systemMessage, history, clients] = await Promise.all([
      buildFinanceSystemMessage(),
      db.getAgentHistory(authedUser.openId, "finance"),
      db.getDistinctClients(),
    ]);

    type AnyMessage = Record<string, unknown>;
    const messages: AnyMessage[] = [
      { role: "system", content: systemMessage },
      ...history,
      { role: "user", content: message.trim() },
    ];

    try {
      let reply = "";
      for (let round = 0; round < 5; round++) {
        const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
            "x-openclaw-agent-id": "finance",
          },
          body: JSON.stringify({ model: "openclaw", messages, tools: FINANCE_TOOLS }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          console.error(`[Finance] Gateway error ${upstream.status}:`, text);
          res.status(502).json({ error: "Finance agent unavailable" });
          return;
        }

        type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
        const data = await upstream.json() as {
          choices: Array<{
            message: { role: string; content: string | null; tool_calls?: ToolCall[] };
            finish_reason: string;
          }>;
        };

        const assistantMsg = data.choices[0].message;
        messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          reply = assistantMsg.content ?? "";
          break;
        }

        for (const toolCall of assistantMsg.tool_calls) {
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
          const result = await executeFinanceTool(toolCall.function.name, toolArgs, clients, baseUrl);
          console.log(`[Finance] Tool ${toolCall.function.name}(${toolCall.function.arguments}) → ${result}`);
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        }
      }

      if (!reply) reply = "Done.";

      await db.appendAgentMessages(authedUser.openId, "finance", [
        { role: "user", content: message.trim() },
        { role: "assistant", content: reply },
      ]);
      res.json({ reply });
    } catch (e) {
      console.error("[Finance] Relay error:", e);
      res.status(502).json({ error: "Finance agent unavailable" });
    }
  });

  // Marketing agent relay (admin only)
  app.post("/api/agent/marketing", async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    } catch { res.status(401).json({ error: "Unauthorized" }); return; }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) { res.status(503).json({ error: "Agent gateway not configured" }); return; }

    const { message } = req.body as { message: string };
    if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

    const [leads, clients, subs] = await Promise.all([
      db.getLeads(),
      db.getDistinctClients(),
      db.getSubscriptions(),
    ]);

    const fmt = (v: string | number) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
    };

    const activeSubs = subs.filter(s => s.status === "active");
    const mrr = activeSubs.filter(s => s.type === "monthly").reduce((sum, s) => sum + parseFloat(String(s.amount)), 0);

    const leadLines = leads.length
      ? leads.map(l => {
          const val = l.monthlyValue ? ` | MRR potential: ${fmt(l.monthlyValue)}/mo` : l.onceOffValue ? ` | once-off: ${fmt(l.onceOffValue)}` : "";
          const contact = l.contactName ? ` | contact: ${l.contactName}` : "";
          const email = l.contactEmail ? ` | ${l.contactEmail}` : "";
          return `  - [id:${l.id}] ${l.name} | ${l.stage}${val}${contact}${email}`;
        }).join("\n")
      : "  None";

    const clientLines = clients.length
      ? clients.map(c => `  - ${c.clientName} (slug: ${c.clientSlug})`).join("\n")
      : "  None";

    const subLines = activeSubs.length
      ? activeSubs.map(s => `  - ${s.clientName} | ${s.description || "Service"} | ${fmt(s.amount)}/${s.type === "monthly" ? "mo" : "yr"}`).join("\n")
      : "  None";

    const systemMessage = `You are the Marketing agent for GRO Digital — a web design and digital marketing agency run by Wes Roos in South Africa.

Your role: grow the agency — new client acquisition, lead nurturing, upsell opportunities with existing clients, content strategy, and brand positioning.

Today's date: ${new Date().toISOString().slice(0, 10)}

CURRENT MRR: ${fmt(mrr)} from ${activeSubs.filter(s => s.type === "monthly").length} active subscriptions

LEADS PIPELINE:
${leadLines}

EXISTING CLIENTS (upsell/cross-sell opportunities):
${clientLines}

ACTIVE SERVICES (what we currently sell):
${subLines}

Guidelines:
- Be strategic and creative. Focus on growing recurring revenue and winning new clients.
- Use South African currency format (R)
- Lead stages: prospect → proposal → negotiation
- When you identify an opportunity or action, create a task so it gets tracked
- Do not use markdown. Plain text with line breaks only.
- Task status: todo, in_progress, blocked, done. Priority: low, medium, high. dueDate: YYYY-MM-DD.`;

    const MARKETING_TOOLS = [
      {
        type: "function" as const,
        function: {
          name: "create_task",
          description: "Create a marketing or follow-up task",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" },
              status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              dueDate: { type: "string", description: "YYYY-MM-DD" },
              clientSlug: { type: "string" },
              notes: { type: "string" },
            },
            required: ["text"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_lead",
          description: "Add a new prospect to the leads pipeline",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Company or person name (required)" },
              contactName: { type: "string" },
              contactEmail: { type: "string" },
              contactPhone: { type: "string" },
              monthlyValue: { type: "number", description: "Estimated monthly recurring value in ZAR" },
              onceOffValue: { type: "number", description: "Estimated once-off value in ZAR" },
              stage: { type: "string", enum: ["prospect", "proposal", "negotiation"] },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "update_lead",
          description: "Update a lead's stage or details",
          parameters: {
            type: "object",
            properties: {
              id: { type: "number", description: "Lead id from the LEADS PIPELINE list ([id:X])" },
              stage: { type: "string", enum: ["prospect", "proposal", "negotiation"] },
              notes: { type: "string" },
              monthlyValue: { type: "number" },
              onceOffValue: { type: "number" },
            },
            required: ["id"],
          },
        },
      },
    ] as const;

    const [history] = await Promise.all([db.getAgentHistory(authedUser.openId, "marketing")]);

    type AnyMessage = Record<string, unknown>;
    const messages: AnyMessage[] = [
      { role: "system", content: systemMessage },
      ...history,
      { role: "user", content: message.trim() },
    ];

    try {
      let reply = "";
      for (let round = 0; round < 5; round++) {
        const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${gatewayToken}`, "Content-Type": "application/json", "x-openclaw-agent-id": "marketing" },
          body: JSON.stringify({ model: "openclaw", messages, tools: MARKETING_TOOLS }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!upstream.ok) { const text = await upstream.text(); console.error(`[Marketing] Gateway error ${upstream.status}:`, text); res.status(502).json({ error: "Marketing agent unavailable" }); return; }

        type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
        const data = await upstream.json() as { choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }> };
        const assistantMsg = data.choices[0].message;
        messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) { reply = assistantMsg.content ?? ""; break; }

        for (const toolCall of assistantMsg.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
          let result = "";
          try {
            if (toolCall.function.name === "create_task") {
              const client = args.clientSlug ? clients.find(c => c.clientSlug === args.clientSlug) : null;
              await db.createTask(args.text as string, client?.clientSlug ?? null, client?.clientName ?? null, { status: args.status as string | undefined, dueDate: args.dueDate as string | null | undefined, priority: args.priority as string | null | undefined, notes: args.notes as string | null | undefined });
              result = `Task created: "${args.text}"`;
            } else if (toolCall.function.name === "create_lead") {
              await db.createLead({ name: args.name as string, contactName: args.contactName as string | null, contactEmail: args.contactEmail as string | null, contactPhone: args.contactPhone as string | null, monthlyValue: args.monthlyValue as number | null, onceOffValue: args.onceOffValue as number | null, stage: (args.stage as "prospect" | "proposal" | "negotiation") ?? "prospect", notes: args.notes as string | null });
              result = `Lead created: "${args.name}"`;
            } else if (toolCall.function.name === "update_lead") {
              const { id, ...data } = args as { id: number; [key: string]: unknown };
              await db.updateLead(id, data as Parameters<typeof db.updateLead>[1]);
              result = `Lead ${id} updated`;
            } else {
              result = `Unknown tool: ${toolCall.function.name}`;
            }
          } catch (e) { result = `Error: ${String(e)}`; }
          console.log(`[Marketing] Tool ${toolCall.function.name}(${toolCall.function.arguments}) → ${result}`);
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        }
      }

      if (!reply) reply = "Done.";
      await db.appendAgentMessages(authedUser.openId, "marketing", [{ role: "user", content: message.trim() }, { role: "assistant", content: reply }]);
      res.json({ reply });
    } catch (e) {
      console.error("[Marketing] Relay error:", e);
      res.status(502).json({ error: "Marketing agent unavailable" });
    }
  });

  // Ops agent relay (admin only)
  app.post("/api/agent/ops", async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    } catch { res.status(401).json({ error: "Unauthorized" }); return; }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) { res.status(503).json({ error: "Agent gateway not configured" }); return; }

    const { message } = req.body as { message: string };
    if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

    const [allTasks, subs, clients] = await Promise.all([
      db.getTasks(),
      db.getSubscriptions(),
      db.getDistinctClients(),
    ]);

    const fmt = (v: string | number) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
    };

    const openTasks = allTasks.filter(t => t.status !== "done");
    const blockedTasks = openTasks.filter(t => t.status === "blocked");
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());

    const taskLine = (t: (typeof allTasks)[0]) => {
      const due = t.dueDate ? ` | due ${new Date(t.dueDate).toISOString().slice(0, 10)}` : "";
      const pri = t.priority ? ` | ${t.priority}` : "";
      const client = t.clientName ? ` | ${t.clientName}` : "";
      return `  - [id:${t.id}] ${t.text} | ${t.status}${pri}${due}${client}`;
    };

    const activeSubs = subs.filter(s => s.status === "active");
    const annualSubs = activeSubs.filter(s => s.type === "annual");

    const clientLines = clients.length
      ? clients.map(c => `  - ${c.clientName} (slug: ${c.clientSlug})`).join("\n")
      : "  None";

    const systemMessage = `You are the Ops agent for GRO Digital — a web design and digital marketing agency run by Wes Roos in South Africa.

Your role: keep client delivery on track — manage tasks, spot bottlenecks, track subscription renewals, and make sure nothing falls through the cracks.

Today's date: ${new Date().toISOString().slice(0, 10)}

TASK SUMMARY:
  Open: ${openTasks.length} tasks (${blockedTasks.length} blocked, ${overdueTasks.length} overdue)

OPEN TASKS:
${openTasks.length ? openTasks.map(taskLine).join("\n") : "  None"}

ANNUAL SUBSCRIPTIONS (renewal tracking):
${annualSubs.length ? annualSubs.map(s => `  - [id:${s.id}] ${s.clientName} | ${s.description || "Service"} | ${fmt(s.amount)}/yr`).join("\n") : "  None"}

CLIENTS:
${clientLines}

Guidelines:
- Be practical and action-oriented. Focus on delivery, deadlines and client satisfaction.
- Use South African currency format (R)
- Task IDs are shown as [id:X] — use these when updating or completing tasks
- Flag blocked or overdue tasks immediately and suggest how to unblock them
- Do not use markdown. Plain text with line breaks only.
- Task status: todo, in_progress, blocked, done. Priority: low, medium, high. dueDate: YYYY-MM-DD.`;

    const OPS_TOOLS = [
      {
        type: "function" as const,
        function: {
          name: "create_task",
          description: "Create a new task",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" },
              status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              dueDate: { type: "string", description: "YYYY-MM-DD" },
              clientSlug: { type: "string" },
              notes: { type: "string" },
            },
            required: ["text"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "update_task",
          description: "Update an existing task by id",
          parameters: {
            type: "object",
            properties: {
              id: { type: "number", description: "Task id from the OPEN TASKS list ([id:X])" },
              text: { type: "string" },
              status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              dueDate: { type: "string", description: "YYYY-MM-DD" },
              clientSlug: { type: "string" },
              notes: { type: "string" },
            },
            required: ["id", "text"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "set_task_done",
          description: "Mark a task as done or reopen it",
          parameters: {
            type: "object",
            properties: {
              id: { type: "number" },
              done: { type: "boolean" },
            },
            required: ["id", "done"],
          },
        },
      },
    ] as const;

    const history = await db.getAgentHistory(authedUser.openId, "ops");

    type AnyMessage = Record<string, unknown>;
    const messages: AnyMessage[] = [
      { role: "system", content: systemMessage },
      ...history,
      { role: "user", content: message.trim() },
    ];

    try {
      let reply = "";
      for (let round = 0; round < 5; round++) {
        const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${gatewayToken}`, "Content-Type": "application/json", "x-openclaw-agent-id": "ops" },
          body: JSON.stringify({ model: "openclaw", messages, tools: OPS_TOOLS }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!upstream.ok) { const text = await upstream.text(); console.error(`[Ops] Gateway error ${upstream.status}:`, text); res.status(502).json({ error: "Ops agent unavailable" }); return; }

        type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
        const data = await upstream.json() as { choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }> };
        const assistantMsg = data.choices[0].message;
        messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) { reply = assistantMsg.content ?? ""; break; }

        for (const toolCall of assistantMsg.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
          let result = "";
          try {
            if (toolCall.function.name === "create_task") {
              const client = args.clientSlug ? clients.find(c => c.clientSlug === args.clientSlug) : null;
              await db.createTask(args.text as string, client?.clientSlug ?? null, client?.clientName ?? null, { status: args.status as string | undefined, dueDate: args.dueDate as string | null | undefined, priority: args.priority as string | null | undefined, notes: args.notes as string | null | undefined });
              result = `Task created: "${args.text}"`;
            } else if (toolCall.function.name === "update_task") {
              const client = args.clientSlug ? clients.find(c => c.clientSlug === args.clientSlug) : null;
              await db.updateTask(args.id as number, args.text as string, client?.clientSlug ?? null, client?.clientName ?? null, { status: args.status as string | undefined, dueDate: args.dueDate as string | null | undefined, priority: args.priority as string | null | undefined, notes: args.notes as string | null | undefined });
              result = `Task ${args.id} updated`;
            } else if (toolCall.function.name === "set_task_done") {
              await db.setTaskDone(args.id as number, args.done as boolean);
              result = `Task ${args.id} marked as ${args.done ? "done" : "open"}`;
            } else {
              result = `Unknown tool: ${toolCall.function.name}`;
            }
          } catch (e) { result = `Error: ${String(e)}`; }
          console.log(`[Ops] Tool ${toolCall.function.name}(${toolCall.function.arguments}) → ${result}`);
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        }
      }

      if (!reply) reply = "Done.";
      await db.appendAgentMessages(authedUser.openId, "ops", [{ role: "user", content: message.trim() }, { role: "assistant", content: reply }]);
      res.json({ reply });
    } catch (e) {
      console.error("[Ops] Relay error:", e);
      res.status(502).json({ error: "Ops agent unavailable" });
    }
  });

  // Accept proposal — POST /api/proposals/:token/accept
  app.post("/api/proposals/:token/accept", async (req: Request, res: Response) => {
    const { token } = req.params;
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    const result = await db.acceptProposal(token, email.trim().toLowerCase());
    if (!result.ok) {
      const msg = result.reason === 'already_accepted' ? 'This proposal has already been accepted.'
        : result.reason === 'not_found' ? 'Proposal not found.'
        : result.reason === 'not_sent' ? 'This proposal cannot be accepted yet.'
        : 'Something went wrong.';
      res.status(400).json({ error: msg });
      return;
    }
    res.json({ success: true });
  });

  // Public proposal view — /p/:token
  app.get("/p/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const proposal = await db.getProposalByToken(token);
    if (!proposal) {
      res.status(404).send(`<!DOCTYPE html><html><head><title>Not found</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#555"><p>Proposal not found.</p></body></html>`);
      return;
    }
    // Capture IP + geo for every view, log to view history
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
      || req.socket?.remoteAddress
      || null;
    let location: string | undefined;
    if (ip && ip !== '::1' && ip !== '127.0.0.1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      try {
        const geo = await Promise.race([
          fetch(`http://ip-api.com/json/${ip}?fields=city,country,status`).then(r => r.json()) as Promise<{ status: string; city?: string; country?: string }>,
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        if (geo && (geo as { status: string }).status === 'success') {
          const parts = [(geo as { city?: string }).city, (geo as { country?: string }).country].filter(Boolean);
          location = parts.join(', ') || undefined;
        }
      } catch { /* geo lookup failed or timed out */ }
    }
    // Log every view to the view history
    await db.logProposalView(proposal.id, ip ?? undefined, location);
    // Change status on first view only (sent → viewed)
    if (proposal.status === 'sent') {
      await db.markProposalViewed(token, ip ?? undefined, location);
    }
    // Inject favicon + OG tags into <head> and print button before </body>
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const headInject = `<link rel="icon" type="image/jpeg" href="/logo.jpg" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${proposal.title}" />
<meta property="og:description" content="Proposal prepared by GRO Digital" />
<meta property="og:image" content="${baseUrl}/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${proposal.title}" />
<meta name="twitter:description" content="Proposal prepared by GRO Digital" />
<meta name="twitter:image" content="${baseUrl}/og-image.jpg" />`;
    const alreadyAccepted = proposal.status === 'accepted';
    const acceptedLabel = `Accepted${proposal.acceptedBy ? ' by ' + proposal.acceptedBy : ''}`;
    // Desktop accept element
    const acceptDesktop = alreadyAccepted
      ? `<div style="display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1.5px solid #86efac;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#15803d;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${acceptedLabel}</div>`
      : `<button id="gd-accept-btn" onclick="document.getElementById('gd-accept-modal').style.display='flex'" style="background:#16a34a;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.18);letter-spacing:-0.01em;">Accept Proposal</button>`;
    // Mobile dropdown accept item
    const acceptMobile = alreadyAccepted
      ? `<div style="padding:12px 16px;font-size:13px;font-weight:600;color:#15803d;display:flex;align-items:center;gap:8px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${acceptedLabel}</div>`
      : `<button id="gd-accept-btn-m" onclick="document.getElementById('gd-mobile-dropdown').style.display='none';document.getElementById('gd-accept-modal').style.display='flex'" style="display:block;width:100%;padding:13px 16px;text-align:left;background:#fff;border:none;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;cursor:pointer;color:#15803d;">Accept Proposal</button>`;
    const printButton = `
<div class="gd-print-btn" style="position:fixed;top:16px;right:16px;z-index:9999;font-family:'Inter',ui-sans-serif,sans-serif;">
  <!-- Desktop buttons -->
  <div class="gd-desktop" style="display:flex;gap:10px;align-items:center;">
    ${acceptDesktop}
    <button onclick="window.print()" style="background:#1e2235;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.18);letter-spacing:-0.01em;">Save as PDF</button>
  </div>
  <!-- Mobile hamburger -->
  <div class="gd-mobile" style="display:none;position:relative;">
    <button onclick="gdToggleMenu(event)" style="background:#1e2235;color:#fff;border:none;width:42px;height:42px;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <div id="gd-mobile-dropdown" style="display:none;position:absolute;top:50px;right:0;background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.15);border:1px solid #e5e7eb;min-width:210px;overflow:hidden;">
      ${acceptMobile}
      <button onclick="window.print()" style="display:block;width:100%;padding:13px 16px;text-align:left;background:#fff;border:none;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">Save as PDF</button>
    </div>
  </div>
</div>
<div id="gd-accept-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;font-family:'Inter',ui-sans-serif,sans-serif;">
  <div style="background:#fff;border-radius:12px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111;">Accept this proposal</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Please enter your email address to confirm your acceptance.</p>
    <input id="gd-accept-email" type="email" placeholder="your@email.com" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:6px;font-size:14px;outline:none;margin-bottom:8px;" />
    <p id="gd-accept-error" style="color:#dc2626;font-size:12px;margin:0 0 12px;display:none;"></p>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button onclick="document.getElementById('gd-accept-modal').style.display='none'" style="flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;background:#fff;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">Cancel</button>
      <button id="gd-accept-submit" onclick="gdSubmitAccept('${proposal.token}')" style="flex:1;padding:10px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">Confirm Acceptance</button>
    </div>
  </div>
</div>
<script>
function gdToggleMenu(e) {
  e.stopPropagation();
  var d = document.getElementById('gd-mobile-dropdown');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', function() {
  var d = document.getElementById('gd-mobile-dropdown');
  if (d) d.style.display = 'none';
});
function gdSubmitAccept(token) {
  var email = document.getElementById('gd-accept-email').value.trim();
  var errEl = document.getElementById('gd-accept-error');
  var btn = document.getElementById('gd-accept-submit');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Please enter your email address.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Submitting\u2026'; btn.disabled = true;
  fetch('/api/proposals/' + token + '/accept', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.success) {
      document.getElementById('gd-accept-modal').style.display = 'none';
      var btnD = document.getElementById('gd-accept-btn');
      var btnM = document.getElementById('gd-accept-btn-m');
      var accepted = '<div style="display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1.5px solid #86efac;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#15803d;"><svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"16\\" height=\\"16\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2.5\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><polyline points=\\"20 6 9 17 4 12\\"/></svg>Proposal Accepted</div>';
      if (btnD) btnD.outerHTML = accepted;
      if (btnM) btnM.outerHTML = accepted;
    } else {
      errEl.textContent = data.error || 'Something went wrong.'; errEl.style.display = 'block';
      btn.textContent = 'Confirm Acceptance'; btn.disabled = false;
    }
  }).catch(function() {
    errEl.textContent = 'Network error. Please try again.'; errEl.style.display = 'block';
    btn.textContent = 'Confirm Acceptance'; btn.disabled = false;
  });
}
</script>
<style>
@media (max-width: 640px) { .gd-desktop { display: none !important; } .gd-mobile { display: block !important; } }
@media print { .gd-print-btn { display: none !important; } }
</style>`;
    const html = proposal.htmlContent
      .replace(/<\/head>/i, `${headInject}\n</head>`)
      .replace(/<\/body>/i, `${printButton}\n</body>`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // Dev-only login bypass – creates a session without OAuth
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/dev/login", async (req: Request, res: Response) => {
      const devOpenId = process.env.OWNER_OPEN_ID || "dev-admin-openid";
      await db.upsertUser({
        openId: devOpenId,
        name: "Dev Admin",
        email: "dev@local.dev",
        loginMethod: "dev",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(devOpenId, {
        name: "Dev Admin",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    });
  }


  registerGoogleOAuthRoutes(app);

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
