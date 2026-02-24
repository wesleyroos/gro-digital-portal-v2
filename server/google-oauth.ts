import { google } from "googleapis";
import type { Express, Request, Response } from "express";
import { decodeJwt } from "jose";
import { sdk } from "./_core/sdk";
import { storeGoogleTokens } from "./db";

// In-memory CSRF state store: state nonce → expiry timestamp
const stateStore = new Map<string, number>();

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

    const state = crypto.randomUUID();
    stateStore.set(state, Date.now() + 10 * 60 * 1000); // 10-min TTL

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
    const expiry = stateStore.get(state);
    if (!expiry || Date.now() > expiry) {
      res.status(400).json({ error: "Invalid or expired state" });
      return;
    }
    stateStore.delete(state);

    let user;
    try {
      user = await sdk.authenticateRequest(req);
      if (user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

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
        res.redirect(302, "/settings?google=connected");
        return;
      }

      await storeGoogleTokens(user.openId, tokens.refresh_token, email);
      res.redirect(302, "/settings?google=connected");
    } catch (error) {
      console.error("[Google OAuth] Callback error:", error);
      res.status(500).json({ error: "Google OAuth callback failed" });
    }
  });
}
