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
- Before creating a task, if the request is vague or missing important details (like what the task is for, which client, or when it's due), ask Wes for clarification first rather than guessing. Only proceed once you have enough information.`;
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
