import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

async function buildHenrySystemMessage(): Promise<string> {
  const outstanding = await db.getOutstandingInvoices();
  const invoiceLines = outstanding.length === 0
    ? "None"
    : outstanding.map(inv => {
        const amount = `R${parseFloat(String(inv.amountDue)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
        const due = inv.dueDate ? ` (due ${new Date(inv.dueDate).toLocaleDateString("en-ZA")})` : "";
        return `  - ${inv.invoiceNumber} | ${inv.clientName}${inv.projectName ? ` — ${inv.projectName}` : ""} | ${amount} | ${inv.status}${due}`;
      }).join("\n");

  return `You are Henry, the AI assistant for GRO Digital — a web design and digital marketing agency run by Wes Roos in South Africa. You help Wes manage his business efficiently through the GRO Digital portal.

OUTSTANDING INVOICES (sent/overdue):
${invoiceLines}

Guidelines:
- Be concise and practical
- Use South African currency format (R)
- You have real-time portal data above — use it to answer business questions accurately
- If asked about something not in the data above, say so clearly`;
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

    const [systemMessage, history] = await Promise.all([
      buildHenrySystemMessage(),
      db.getHenryHistory(authedUser.openId),
    ]);

    const messages = [
      { role: "system", content: systemMessage },
      ...history,
      { role: "user", content: message.trim() },
    ];

    try {
      const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${gatewayToken}`,
          "Content-Type": "application/json",
          "x-openclaw-agent-id": "main",
        },
        body: JSON.stringify({ model: "openclaw", messages }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!upstream.ok) {
        const text = await upstream.text();
        console.error(`[Henry] Gateway error ${upstream.status}:`, text);
        res.status(502).json({ error: "Henry unavailable" });
        return;
      }
      const data = await upstream.json() as { choices: Array<{ message: { content: string } }> };
      const reply = data.choices[0].message.content;
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
