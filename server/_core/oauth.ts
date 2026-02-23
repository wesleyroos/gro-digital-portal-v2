import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

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
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin") {
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

    console.log(`[Henry] token len=${gatewayToken.length} chars=${[...gatewayToken].map(c => c.charCodeAt(0)).slice(0, 6).join(',')}`);
    const { messages } = req.body as { messages: Array<{ role: string; content: string }> };
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
      res.json({ reply: data.choices[0].message.content });
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
