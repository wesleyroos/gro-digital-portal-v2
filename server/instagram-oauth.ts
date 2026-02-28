import type { Express, Request, Response } from 'express';
import { sdk } from './_core/sdk';
import { ENV } from './_core/env';
import { storeInstagramTokens } from './db';
import { exchangeForLongLivedToken, getIgUserInfo } from './instagram';

// In-memory CSRF state store: state nonce → { expiry, clientSlug }
const stateStore = new Map<string, { expiry: number; clientSlug: string }>();

export function registerInstagramOAuthRoutes(app: Express) {
  // Initiate Instagram OAuth consent flow (admin only)
  app.get('/api/auth/instagram/init/:clientSlug', async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!ENV.instagramAppId || !ENV.instagramRedirectUri) {
      res.status(503).json({ error: 'Instagram OAuth not configured' });
      return;
    }

    const { clientSlug } = req.params;
    const state = crypto.randomUUID();
    stateStore.set(state, { expiry: Date.now() + 10 * 60 * 1000, clientSlug });

    const authUrl = new URL('https://api.instagram.com/oauth/authorize');
    authUrl.searchParams.set('client_id', ENV.instagramAppId);
    authUrl.searchParams.set('redirect_uri', ENV.instagramRedirectUri);
    authUrl.searchParams.set('scope', 'instagram_basic,instagram_content_publish,pages_read_engagement');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    res.redirect(302, authUrl.toString());
  });

  // Handle Instagram OAuth callback
  app.get('/api/auth/instagram/callback', async (req: Request, res: Response) => {
    const state = req.query.state as string;
    const code = req.query.code as string;

    const stored = stateStore.get(state);
    if (!stored || Date.now() > stored.expiry) {
      res.status(400).json({ error: 'Invalid or expired state' });
      return;
    }
    stateStore.delete(state);
    const { clientSlug } = stored;

    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      // Exchange code for short-lived token
      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: ENV.instagramAppId,
          client_secret: ENV.instagramAppSecret,
          grant_type: 'authorization_code',
          redirect_uri: ENV.instagramRedirectUri,
          code,
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; user_id?: string; error_message?: string };
      if (!tokenData.access_token || !tokenData.user_id) {
        throw new Error(`Short-lived token exchange failed: ${tokenData.error_message ?? JSON.stringify(tokenData)}`);
      }

      // Upgrade to long-lived token
      const longToken = await exchangeForLongLivedToken(tokenData.access_token);

      // Get user info
      const { username } = await getIgUserInfo(longToken);

      // Store in DB
      await storeInstagramTokens(clientSlug, tokenData.user_id, longToken, username);

      res.redirect(302, `/marketing?instagram=connected&client=${encodeURIComponent(clientSlug)}`);
    } catch (error) {
      console.error('[Instagram OAuth] Callback error:', error);
      res.redirect(302, `/settings?instagram=error`);
    }
  });
}
