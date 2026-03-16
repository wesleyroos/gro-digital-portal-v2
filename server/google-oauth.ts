import { google } from "googleapis";
import type { Express, Request, Response } from "express";
import { decodeJwt } from "jose";
import { sdk } from "./_core/sdk";
import { storeGoogleTokens } from "./db";
import { ENV } from "./_core/env";

// In-memory CSRF state store: state nonce → { expiry, openId }
const stateStore = new Map<string, { expiry: number; openId: string }>();

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function registerGoogleOAuthRoutes(app: Express) {
  // Initiate Google OAuth consent flow (admin only)
  app.get("/api/auth/google/init", async (req: Request, res: Response) => {
    let openId: string;
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin" && user.role !== "superAdmin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      openId = user.openId;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const state = crypto.randomUUID();
    stateStore.set(state, { expiry: Date.now() + 10 * 60 * 1000, openId });

    const oauthClient = createOAuthClient();
    const authUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state,
    });

    res.redirect(302, authUrl);
  });

  // Handle Google OAuth callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const state = req.query.state as string;
    const code = req.query.code as string;

    // Verify CSRF state nonce
    const stateData = stateStore.get(state);
    if (!stateData || Date.now() > stateData.expiry) {
      res.status(400).json({ error: "Invalid or expired state" });
      return;
    }
    stateStore.delete(state);

    // openId was stored when the flow started — no need to re-read session cookie
    // (Google's redirect may not carry SameSite=Strict cookies)
    const openId = stateData.openId;

    try {
      const oauthClient = createOAuthClient();
      const { tokens } = await oauthClient.getToken(code);

      // Extract email from the id_token (a JWT with email claim)
      let email = "";
      if (tokens.id_token) {
        const payload = decodeJwt(tokens.id_token);
        email = (payload.email as string) || "";
      }

      if (!tokens.refresh_token) {
        console.error("[Google OAuth] No refresh token returned — user may have already connected previously");
        const base = ENV.appUrl || '';
        res.redirect(302, `${base}/settings?google=connected`);
        return;
      }

      await storeGoogleTokens(openId, tokens.refresh_token, email);
      const base = ENV.appUrl || '';
      res.redirect(302, `${base}/settings?google=connected`);
    } catch (error) {
      console.error("[Google OAuth] Callback error:", error);
      res.status(500).json({ error: "Google OAuth callback failed" });
    }
  });
}
