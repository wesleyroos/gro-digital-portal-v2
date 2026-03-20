import type { Express, Request, Response } from 'express';
import { sdk } from './_core/sdk';
import { ENV } from './_core/env';
import { storeLinkedinTokens } from './db';
import { getManagedOrganizations } from './linkedin';

// CSRF state store: nonce → { expiry, clientSlug, returnPath }
const stateStore = new Map<string, { expiry: number; clientSlug: string; returnPath: string }>();

export function registerLinkedinOAuthRoutes(app: Express) {
  // Initiate LinkedIn OAuth consent flow
  app.get('/api/auth/linkedin/init/:clientSlug', async (req: Request, res: Response) => {
    let returnPath = '/settings';
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role === 'client') {
        if (user.clientSlug !== req.params.clientSlug) { res.status(403).json({ error: 'Forbidden' }); return; }
        returnPath = '/portal/settings';
      } else if (user.role !== 'admin' && user.role !== 'superAdmin') {
        res.status(403).json({ error: 'Forbidden' }); return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    if (!ENV.linkedinClientId || !ENV.linkedinRedirectUri) {
      res.status(503).json({ error: 'LinkedIn OAuth not configured (LINKEDIN_CLIENT_ID or LINKEDIN_REDIRECT_URI missing)' });
      return;
    }

    const { clientSlug } = req.params;
    const state = crypto.randomUUID();
    stateStore.set(state, { expiry: Date.now() + 10 * 60 * 1000, clientSlug, returnPath });

    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', ENV.linkedinClientId);
    authUrl.searchParams.set('redirect_uri', ENV.linkedinRedirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'openid profile w_member_social w_organization_social');

    res.redirect(302, authUrl.toString());
  });

  // Handle LinkedIn OAuth callback
  app.get('/api/auth/linkedin/callback', async (req: Request, res: Response) => {
    const state = req.query.state as string;
    const code = req.query.code as string;
    const error = req.query.error as string | undefined;

    if (error) {
      console.error('[LinkedIn OAuth] Auth denied:', req.query.error_description);
      res.redirect(302, '/settings?linkedin=error');
      return;
    }

    const stored = stateStore.get(state);
    if (!stored || Date.now() > stored.expiry) {
      res.status(400).json({ error: 'Invalid or expired state' }); return;
    }
    stateStore.delete(state);
    const { clientSlug, returnPath } = stored;

    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role === 'client') {
        if (user.clientSlug !== clientSlug) { res.status(403).json({ error: 'Forbidden' }); return; }
      } else if (user.role !== 'admin' && user.role !== 'superAdmin') {
        res.status(403).json({ error: 'Forbidden' }); return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    try {
      // Exchange code for access token
      const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: ENV.linkedinRedirectUri,
          client_id: ENV.linkedinClientId,
          client_secret: ENV.linkedinClientSecret,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const tokenData = await tokenRes.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };

      if (!tokenData.access_token) {
        throw new Error(`Token exchange failed: ${tokenData.error_description ?? JSON.stringify(tokenData)}`);
      }

      const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000);

      // Fetch the person URN via OpenID Connect userinfo endpoint
      const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const userInfo = await userInfoRes.json() as { sub?: string; name?: string };
      const personUrn = userInfo.sub ? `urn:li:person:${userInfo.sub}` : '';

      if (!personUrn) throw new Error('Could not determine LinkedIn person URN');

      // Try to fetch managed organizations (best-effort)
      let orgId: string | undefined;
      let orgName: string | undefined;
      try {
        const orgs = await getManagedOrganizations(tokenData.access_token);
        if (orgs.length > 0) {
          orgId = orgs[0].id;
          orgName = orgs[0].name;
        }
      } catch (e) {
        console.warn('[LinkedIn OAuth] Could not fetch orgs:', e);
      }

      await storeLinkedinTokens(
        clientSlug,
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        expiresAt,
        personUrn,
        orgId,
        orgName,
      );

      res.redirect(302, `${returnPath}?linkedin=connected&client=${encodeURIComponent(clientSlug)}`);
    } catch (error) {
      console.error('[LinkedIn OAuth] Callback error:', error);
      res.redirect(302, `${returnPath}?linkedin=error`);
    }
  });
}
