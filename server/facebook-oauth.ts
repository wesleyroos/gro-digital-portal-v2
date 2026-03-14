import type { Express, Request, Response } from 'express';
import { sdk } from './_core/sdk';
import { ENV } from './_core/env';
import { storeFacebookPage } from './db';
import { exchangeForLongLivedToken, getFacebookPages } from './facebook';

// CSRF state store: nonce → { expiry, clientSlug, returnPath }
const stateStore = new Map<string, { expiry: number; clientSlug: string; returnPath: string }>();

// Page selection store: nonce → { expiry, clientSlug, pages, returnPath }
// Used when a user manages multiple pages and needs to pick one.
const pageSelectionStore = new Map<string, {
  expiry: number;
  clientSlug: string;
  pages: Array<{ id: string; name: string; access_token: string }>;
  userToken?: string;
  returnPath: string;
}>();

/** Called from tRPC to get the pending pages list for UI selection. */
export function getPendingFacebookPages(state: string) {
  const entry = pageSelectionStore.get(state);
  if (!entry || Date.now() > entry.expiry) return null;
  return { clientSlug: entry.clientSlug, pages: entry.pages };
}

/** Called from tRPC after the user picks a page — saves to DB and clears store. */
export async function confirmFacebookPage(state: string, pageId: string) {
  const entry = pageSelectionStore.get(state);
  if (!entry || Date.now() > entry.expiry) throw new Error('Selection expired — please reconnect');
  const page = entry.pages.find(p => p.id === pageId);
  if (!page) throw new Error('Page not found');
  pageSelectionStore.delete(state);
  await storeFacebookPage(entry.clientSlug, page.id, page.access_token, page.name, entry.userToken);
}

export function registerFacebookOAuthRoutes(app: Express) {
  // Initiate Facebook OAuth consent flow (admin or client for own slug)
  app.get('/api/auth/facebook/init/:clientSlug', async (req: Request, res: Response) => {
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

    if (!ENV.facebookAppId || !ENV.facebookRedirectUri) {
      res.status(503).json({ error: 'Facebook OAuth not configured (FACEBOOK_APP_ID or FACEBOOK_REDIRECT_URI missing)' });
      return;
    }

    const { clientSlug } = req.params;
    const state = crypto.randomUUID();
    stateStore.set(state, { expiry: Date.now() + 10 * 60 * 1000, clientSlug, returnPath });

    const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    authUrl.searchParams.set('client_id', ENV.facebookAppId);
    authUrl.searchParams.set('redirect_uri', ENV.facebookRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'pages_show_list,pages_manage_posts,pages_read_engagement');
    authUrl.searchParams.set('auth_type', 'rerequest'); // force re-consent even if previously authorized
    authUrl.searchParams.set('state', state);

    res.redirect(302, authUrl.toString());
  });

  // Handle Facebook OAuth callback
  app.get('/api/auth/facebook/callback', async (req: Request, res: Response) => {
    const state = req.query.state as string;
    const code = req.query.code as string;

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
      // Exchange code for short-lived user access token
      const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', ENV.facebookAppId);
      tokenUrl.searchParams.set('client_secret', ENV.facebookAppSecret);
      tokenUrl.searchParams.set('redirect_uri', ENV.facebookRedirectUri);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
      if (!tokenData.access_token) {
        throw new Error(`Token exchange failed: ${tokenData.error?.message ?? JSON.stringify(tokenData)}`);
      }

      // Exchange short-lived user token for long-lived token (~60 days).
      // Page tokens obtained via /me/accounts from a long-lived user token never expire.
      const longLivedToken = await exchangeForLongLivedToken(
        tokenData.access_token,
        ENV.facebookAppId,
        ENV.facebookAppSecret,
      );

      // Log exactly which permissions were granted on this token
      const permsRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(longLivedToken)}`);
      const permsData = await permsRes.json() as { data?: Array<{ permission: string; status: string }> };
      console.log('[Facebook OAuth] Granted permissions:', JSON.stringify(permsData?.data ?? []));

      // Get the list of Pages this user manages (each with its own non-expiring page access token)
      const pages = await getFacebookPages(longLivedToken);
      if (pages.length === 0) throw new Error('No Facebook Pages found for this account');

      // Auto-select if only one page
      if (pages.length === 1) {
        await storeFacebookPage(clientSlug, pages[0].id, pages[0].access_token, pages[0].name, longLivedToken);
        res.redirect(302, `${returnPath}?facebook=connected&client=${encodeURIComponent(clientSlug)}`);
        return;
      }

      // Multiple pages — store for selection in Settings UI
      const selectionState = crypto.randomUUID();
      pageSelectionStore.set(selectionState, {
        expiry: Date.now() + 15 * 60 * 1000,
        clientSlug,
        pages,
        userToken: longLivedToken,
        returnPath,
      });
      res.redirect(302, `${returnPath}?facebook=select&state=${selectionState}&client=${encodeURIComponent(clientSlug)}`);
    } catch (error) {
      console.error('[Facebook OAuth] Callback error:', error);
      res.redirect(302, `${returnPath}?facebook=error`);
    }
  });
}
