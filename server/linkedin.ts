import { ENV } from './_core/env';
import { getLinkedinTokens, updateLinkedinTokens } from './db';

const LI_BASE = 'https://api.linkedin.com';
const LI_VERSION = '202501';

function liHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': LI_VERSION,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

/**
 * Ensure the stored access token is still valid; refresh if it expires within 5 minutes.
 * Returns the current valid access token.
 */
export async function ensureFreshToken(clientSlug: string): Promise<string> {
  const tokens = await getLinkedinTokens(clientSlug);
  if (!tokens) throw new Error('LinkedIn not connected for this client');

  const fiveMinutesMs = 5 * 60 * 1000;
  const expiresAt = tokens.tokenExpiresAt ? new Date(tokens.tokenExpiresAt).getTime() : 0;
  if (expiresAt > Date.now() + fiveMinutesMs) {
    return tokens.accessToken;
  }

  // Refresh the token
  if (!tokens.refreshToken) throw new Error('LinkedIn refresh token not available — please reconnect');

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: ENV.linkedinClientId,
      client_secret: ENV.linkedinClientSecret,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(`LinkedIn token refresh failed: ${data.error_description ?? JSON.stringify(data)}`);
  }

  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await updateLinkedinTokens(clientSlug, data.access_token, data.refresh_token ?? tokens.refreshToken, newExpiresAt);

  return data.access_token;
}

/**
 * Initialize an image upload — returns the uploadUrl and the image URN.
 */
export async function initializeImageUpload(authorUrn: string, token: string): Promise<{ uploadUrl: string; imageUrn: string }> {
  const res = await fetch(`${LI_BASE}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers: liHeaders(token),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json() as {
    value?: { uploadUrl?: string; image?: string };
    message?: string;
  };

  if (!res.ok || !data.value?.uploadUrl || !data.value?.image) {
    throw new Error(`LinkedIn initializeImageUpload failed: ${data.message ?? JSON.stringify(data)}`);
  }

  return { uploadUrl: data.value.uploadUrl, imageUrn: data.value.image };
}

/**
 * Upload the actual image binary to the pre-signed URL.
 */
export async function uploadImageBinary(uploadUrl: string, buffer: Buffer, token: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: buffer as unknown as BodyInit,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn uploadImageBinary failed (${res.status}): ${text}`);
  }
}

/**
 * Create a text-only post on LinkedIn.
 */
export async function createTextPost(authorUrn: string, commentary: string, token: string): Promise<string> {
  const res = await fetch(`${LI_BASE}/rest/posts`, {
    method: 'POST',
    headers: liHeaders(token),
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: commentary },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  // LinkedIn returns 201 with the post URN in the x-linkedin-id header (or body for REST API)
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn createTextPost failed (${res.status}): ${text}`);
  }

  // REST posts API returns postUrn in body
  const data = await res.json().catch(() => ({})) as { id?: string };
  const postUrn = data.id ?? res.headers.get('x-linkedin-id') ?? '';
  return postUrn;
}

/**
 * Create an image post on LinkedIn using a pre-uploaded image URN.
 */
export async function createImagePost(authorUrn: string, commentary: string, imageUrn: string, token: string): Promise<string> {
  const res = await fetch(`${LI_BASE}/rest/posts`, {
    method: 'POST',
    headers: liHeaders(token),
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: commentary },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              media: imageUrn,
            },
          ],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn createImagePost failed (${res.status}): ${text}`);
  }

  const data = await res.json().catch(() => ({})) as { id?: string };
  const postUrn = data.id ?? res.headers.get('x-linkedin-id') ?? '';
  return postUrn;
}

/**
 * Fetch basic engagement stats for a LinkedIn post.
 */
export async function getPostAnalytics(postUrn: string, token: string): Promise<{
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
}> {
  const encoded = encodeURIComponent(postUrn);
  const res = await fetch(`${LI_BASE}/rest/socialActions/${encoded}`, {
    headers: { ...liHeaders(token), 'Content-Type': undefined as unknown as string },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn getPostAnalytics failed (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { totalFirstLevelComments?: number };
    sharesSummary?: { totalShares?: number };
  };

  return {
    likes:       data.likesSummary?.totalLikes ?? 0,
    comments:    data.commentsSummary?.totalFirstLevelComments ?? 0,
    shares:      data.sharesSummary?.totalShares ?? 0,
    impressions: 0, // requires analytics API with separate permissions
  };
}

/**
 * Fetch all organizations the authenticated user admins.
 * Returns array of { id, name }.
 */
export async function getManagedOrganizations(token: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(
    `${LI_BASE}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&fields=organization`,
    {
      headers: liHeaders(token),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) return [];

  const data = await res.json() as {
    elements?: Array<{ organization?: string }>;
  };

  const orgUrns = (data.elements ?? []).map(e => e.organization).filter(Boolean) as string[];
  if (orgUrns.length === 0) return [];

  const orgs: Array<{ id: string; name: string }> = [];
  for (const urn of orgUrns) {
    const encoded = encodeURIComponent(urn);
    const orgRes = await fetch(`${LI_BASE}/rest/organizations/${encoded}?fields=id,localizedName`, {
      headers: liHeaders(token),
      signal: AbortSignal.timeout(15_000),
    });
    if (!orgRes.ok) continue;
    const orgData = await orgRes.json() as { id?: number; localizedName?: string };
    if (orgData.id && orgData.localizedName) {
      orgs.push({ id: urn, name: orgData.localizedName });
    }
  }

  return orgs;
}
