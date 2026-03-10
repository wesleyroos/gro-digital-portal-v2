# GRO Digital Portal — MCP Server

A custom [Model Context Protocol](https://modelcontextprotocol.io/) server that gives Claude (and other MCP-compatible AI assistants) access to your GRO Digital Portal business data.

## Architecture

```
Claude.ai ──(MCP/HTTP)──> MCP Server (Railway) ──(tRPC/HTTP)──> GD Portal (Railway)
                               │
                          Bearer token auth
```

The MCP server acts as a bridge: it receives tool calls from Claude via the MCP protocol, translates them into tRPC API calls to your portal, and returns the results.

## Available Tools

### Read Tools
| Tool | Description |
|------|-------------|
| `get_clients` | List all clients with name and contact info |
| `get_client_profile` | Get detailed profile for a specific client |
| `get_leads` | Pipeline view with stage, value, last contact |
| `get_invoices` | List invoices, optionally filtered by client |
| `get_invoice_detail` | Get specific invoice with line items |
| `get_proposals` | List proposals, optionally filtered by client |
| `get_tasks` | All tasks with status, due dates, priority |
| `get_subscriptions` | Recurring revenue subscriptions (MRR/ARR) |
| `get_revenue_summary` | Monthly revenue, MRR, ARR, outstanding amounts |
| `get_campaigns` | Marketing campaigns with status and dates |

### Write Tools
| Tool | Description |
|------|-------------|
| `update_lead_status` | Move a lead to a new pipeline stage |
| `create_invoice` | Create a new invoice with line items |
| `create_task` | Create a task, optionally linked to a client |
| `update_invoice_status` | Change invoice status (draft/sent/paid/overdue) |
| `create_lead` | Add a new lead to the pipeline |
| `complete_task` | Mark a task as done or not done |

## Setup

### 1. Generate an API Key

Generate a secure random key:

```bash
openssl rand -hex 32
```

### 2. Configure the Portal

Add `MCP_API_KEY` to your portal's environment variables (on Railway or in `.env`):

```
MCP_API_KEY=<your-generated-key>
```

Redeploy the portal so it accepts Bearer token auth.

### 3. Deploy the MCP Server

Deploy this directory as a **separate Railway service** in the same project.

Set these environment variables on the MCP server service:

| Variable | Value |
|----------|-------|
| `PORTAL_URL` | Your portal's internal or public URL (e.g. `https://gro-digital-portal-production.up.railway.app`) |
| `MCP_API_KEY` | The same key you set on the portal |
| `PORT` | `8080` (Railway sets this automatically) |

### 4. Add as Claude.ai Custom Connector

1. Go to [claude.ai](https://claude.ai) → Settings → Integrations
2. Click **"Add custom integration"**
3. Enter your MCP server URL: `https://<your-mcp-service>.up.railway.app/mcp`
4. Save and enable

Claude will now have access to all the tools listed above.

## Local Development

```bash
cd mcp-server
npm install

# Set env vars
export PORTAL_URL=http://localhost:3000
export MCP_API_KEY=dev-test-key

# Run
npm run dev
```

## Security Notes

- The `MCP_API_KEY` acts as a shared secret between the portal and MCP server
- The MCP server authenticates as a synthetic admin user — it has full access to all admin procedures
- Keep the API key secret; rotate it if compromised
- Consider using Railway's private networking to keep portal-to-MCP traffic internal
