import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { trpcMutation, trpcQuery } from "./api-client.js";

const server = new McpServer({
  name: "GRO Digital Portal",
  version: "1.0.0",
});

// ── Read Tools ──────────────────────────────────────────────────────────

server.tool("get_clients", "List all clients with name, contact info, and linked profiles", {}, async () => {
  const clients = await trpcQuery<any[]>("invoice.clients");
  return {
    content: [{ type: "text", text: JSON.stringify(clients, null, 2) }],
  };
});

server.tool(
  "get_client_profile",
  "Get detailed profile for a specific client including contact info and social connections",
  { client_slug: z.string().describe("The client's slug identifier (e.g. 'acme-corp')") },
  async ({ client_slug }) => {
    const profile = await trpcQuery("client.getProfile", { clientSlug: client_slug });
    return {
      content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
    };
  }
);

server.tool(
  "get_leads",
  "List all leads in the pipeline with stage, source, value, and contact info",
  {},
  async () => {
    const leads = await trpcQuery<any[]>("lead.list");
    return {
      content: [{ type: "text", text: JSON.stringify(leads, null, 2) }],
    };
  }
);

server.tool(
  "get_invoices",
  "List all invoices. Optionally filter by client slug",
  {
    client_slug: z.string().optional().describe("Filter by client slug (optional)"),
  },
  async ({ client_slug }) => {
    let invoices: any[];
    if (client_slug) {
      invoices = await trpcQuery("invoice.listByClient", { clientSlug: client_slug });
    } else {
      invoices = await trpcQuery("invoice.list");
    }
    return {
      content: [{ type: "text", text: JSON.stringify(invoices, null, 2) }],
    };
  }
);

server.tool(
  "get_invoice_detail",
  "Get a specific invoice with line items by invoice number",
  { invoice_number: z.string().describe("The invoice number (e.g. 'INV-001')") },
  async ({ invoice_number }) => {
    const result = await trpcQuery("invoice.getByNumber", { invoiceNumber: invoice_number });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "get_proposals",
  "List all proposals. Optionally filter by client slug",
  {
    client_slug: z.string().optional().describe("Filter by client slug (optional)"),
  },
  async ({ client_slug }) => {
    let proposals: any[];
    if (client_slug) {
      proposals = await trpcQuery("proposal.listByClient", { clientSlug: client_slug });
    } else {
      proposals = await trpcQuery("proposal.list");
    }
    return {
      content: [{ type: "text", text: JSON.stringify(proposals, null, 2) }],
    };
  }
);

server.tool(
  "get_tasks",
  "List all tasks with status, due dates, priority, and assigned client",
  {},
  async () => {
    const tasks = await trpcQuery<any[]>("task.list");
    return {
      content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
    };
  }
);

server.tool(
  "get_subscriptions",
  "List all recurring subscriptions (MRR/ARR tracking) with amount, type, and status",
  {},
  async () => {
    const subs = await trpcQuery<any[]>("subscription.list");
    return {
      content: [{ type: "text", text: JSON.stringify(subs, null, 2) }],
    };
  }
);

server.tool(
  "get_revenue_summary",
  "Get comprehensive revenue metrics: MRR, ARR, monthly breakdown, outstanding invoices, project fees",
  {},
  async () => {
    const metrics = await trpcQuery("invoice.metrics");
    return {
      content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
    };
  }
);

server.tool(
  "get_campaigns",
  "List all marketing campaigns with status, client, and date range",
  {},
  async () => {
    const campaigns = await trpcQuery<any[]>("campaign.list");
    return {
      content: [{ type: "text", text: JSON.stringify(campaigns, null, 2) }],
    };
  }
);

// ── Write Tools ─────────────────────────────────────────────────────────

server.tool(
  "update_lead_status",
  "Move a lead to a new pipeline stage",
  {
    lead_id: z.number().describe("The lead's numeric ID"),
    stage: z.enum(["prospect", "proposal", "negotiation"]).describe("New pipeline stage"),
  },
  async ({ lead_id, stage }) => {
    await trpcMutation("lead.update", { id: lead_id, stage });
    return {
      content: [{ type: "text", text: `Lead ${lead_id} moved to "${stage}" stage.` }],
    };
  }
);

server.tool(
  "create_invoice",
  "Create a new invoice for a client with line items",
  {
    client_slug: z.string().describe("Client slug identifier"),
    client_name: z.string().describe("Client display name"),
    client_email: z.string().describe("Client email address"),
    project_name: z.string().describe("Project or service name"),
    invoice_type: z.enum(["once-off", "monthly", "annual"]).describe("Billing type"),
    items: z.array(z.object({
      description: z.string(),
      unitPrice: z.number(),
      quantity: z.number(),
      vat: z.boolean().optional(),
    })).describe("Line items for the invoice"),
    due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    notes: z.string().optional().describe("Additional notes"),
  },
  async ({ client_slug, client_name, client_email, project_name, invoice_type, items, due_date, notes }) => {
    const result = await trpcMutation("invoice.create", {
      clientSlug: client_slug,
      clientName: client_name,
      clientEmail: client_email,
      clientContact: client_name,
      projectName: project_name,
      invoiceType: invoice_type,
      items: items.map((item, i) => ({
        ...item,
        lineTotal: item.unitPrice * item.quantity,
        sortOrder: i,
        frequency: "once-off" as const,
        vat: item.vat ?? false,
      })),
      dueDate: due_date ? new Date(due_date).toISOString() : undefined,
      notes,
    });
    return {
      content: [{ type: "text", text: `Invoice created: ${JSON.stringify(result, null, 2)}` }],
    };
  }
);

server.tool(
  "create_task",
  "Create a new task, optionally linked to a client",
  {
    text: z.string().describe("Task description"),
    client_slug: z.string().optional().describe("Client slug to link to (optional)"),
    due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    priority: z.string().optional().describe("Priority level (e.g. 'high', 'medium', 'low')"),
    notes: z.string().optional().describe("Additional notes"),
  },
  async ({ text, client_slug, due_date, priority, notes }) => {
    await trpcMutation("task.create", {
      text,
      clientSlug: client_slug,
      dueDate: due_date,
      priority,
      notes,
    });
    return {
      content: [{ type: "text", text: `Task created: "${text}"` }],
    };
  }
);

server.tool(
  "update_invoice_status",
  "Change an invoice's status (draft, sent, paid, overdue)",
  {
    invoice_id: z.number().describe("The invoice's numeric ID"),
    status: z.enum(["draft", "sent", "paid", "overdue"]).describe("New status"),
  },
  async ({ invoice_id, status }) => {
    await trpcMutation("invoice.updateStatus", { invoiceId: invoice_id, status });
    return {
      content: [{ type: "text", text: `Invoice ${invoice_id} status updated to "${status}".` }],
    };
  }
);

server.tool(
  "create_lead",
  "Create a new lead in the pipeline",
  {
    name: z.string().describe("Lead/company name"),
    contact_name: z.string().describe("Contact person's name"),
    contact_email: z.string().optional().describe("Contact email"),
    contact_phone: z.string().optional().describe("Contact phone"),
    monthly_value: z.number().optional().describe("Estimated monthly value"),
    once_off_value: z.number().optional().describe("Estimated once-off value"),
    stage: z.enum(["prospect", "proposal", "negotiation"]).default("prospect").describe("Pipeline stage"),
    notes: z.string().optional().describe("Notes about the lead"),
  },
  async ({ name, contact_name, contact_email, contact_phone, monthly_value, once_off_value, stage, notes }) => {
    await trpcMutation("lead.create", {
      name,
      contactName: contact_name,
      contactEmail: contact_email ?? "",
      contactPhone: contact_phone ?? "",
      monthlyValue: monthly_value ?? 0,
      onceOffValue: once_off_value ?? 0,
      stage,
      notes: notes ?? "",
    });
    return {
      content: [{ type: "text", text: `Lead "${name}" created in "${stage}" stage.` }],
    };
  }
);

server.tool(
  "complete_task",
  "Mark a task as done or not done",
  {
    task_id: z.number().describe("The task's numeric ID"),
    done: z.boolean().describe("true to mark done, false to mark not done"),
  },
  async ({ task_id, done }) => {
    await trpcMutation("task.setDone", { id: task_id, done });
    return {
      content: [{ type: "text", text: `Task ${task_id} marked as ${done ? "done" : "not done"}.` }],
    };
  }
);

// ── Express + MCP Transport ─────────────────────────────────────────────

const app = express();
app.use(express.json());

// Store transports by session ID for session management
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Existing session — reuse transport
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  // New session — create transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
  });

  transport.onclose = () => {
    const id = [...transports.entries()].find(([, t]) => t === transport)?.[0];
    if (id) transports.delete(id);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res);
});

// Handle GET for SSE stream (long-polling for server→client notifications)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// Handle DELETE for session cleanup
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
  } else {
    res.status(204).end();
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gro-digital-mcp-server" });
});

const port = parseInt(process.env.PORT || "8080");
app.listen(port, () => {
  console.log(`MCP server running on http://localhost:${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
});
