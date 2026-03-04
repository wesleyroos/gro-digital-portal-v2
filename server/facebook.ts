const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Exchange a short-lived user access token for a long-lived one (valid ~60 days).
 * Page tokens obtained from /me/accounts after this exchange never expire.
 */
export async function exchangeForLongLivedToken(shortToken: string, appId: string, appSecret: string): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(url.toString());
  const data = await res.json() as { access_token?: string; error?: { message: string } };
  if (!res.ok || !data.access_token) {
    throw new Error(`exchangeForLongLivedToken failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Get all Facebook Pages managed by the authenticated user.
 * Pass a long-lived user token to get non-expiring page access tokens.
 */
export async function getFacebookPages(userToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const res = await fetch(`${GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(userToken)}`);
  const data = await res.json() as { data?: Array<{ id: string; name: string; access_token: string }>; error?: { message: string } };
  if (!res.ok || !data.data) {
    throw new Error(`getFacebookPages failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.data;
}

/**
 * Post an image to a Facebook Page.
 * Returns the post ID.
 */
export async function postImageToPage(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  message: string,
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: 'POST',
    body: new URLSearchParams({ url: imageUrl, message, access_token: pageToken, published: 'true' }),
  });
  const data = await res.json() as { id?: string; post_id?: string; error?: { message: string } };
  if (!res.ok || (!data.id && !data.post_id)) {
    throw new Error(`postImageToPage failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  // post_id is the feed post ID; id is the photo node ID
  return data.post_id ?? data.id!;
}

/**
 * Post a video to a Facebook Page.
 * Returns the video post ID.
 */
export async function postVideoToPage(
  pageId: string,
  pageToken: string,
  videoUrl: string,
  message: string,
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/videos`, {
    method: 'POST',
    body: new URLSearchParams({ file_url: videoUrl, description: message, access_token: pageToken }),
  });
  const data = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`postVideoToPage failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.id;
}

/**
 * Fetch basic engagement counts for a Facebook post using simple field reads.
 * Works with any page access token — no insights permission required.
 * Use as a fallback when getFacebookPostInsights fails.
 */
export async function getFacebookPostBasicMetrics(postId: string, pageToken: string): Promise<{
  impressions: number;
  reach: number;
  reactions: number;
  clicks: number;
  shares: number;
  videoViews: number;
}> {
  const res = await fetch(
    `${GRAPH_BASE}/${postId}?fields=reactions.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(pageToken)}`
  );
  const data = await res.json() as {
    reactions?: { summary: { total_count: number } };
    comments?: { summary: { total_count: number } };
    shares?: { count: number };
    error?: { message: string };
  };
  if (!res.ok || data.error) {
    throw new Error(`getFacebookPostBasicMetrics failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return {
    impressions: 0,
    reach: 0,
    reactions: data.reactions?.summary?.total_count ?? 0,
    clicks: data.comments?.summary?.total_count ?? 0, // repurpose clicks column for comments
    shares: data.shares?.count ?? 0,
    videoViews: 0,
  };
}

/**
 * Fetch insights for a Facebook Page post.
 * Uses post_engaged_users for reactions (post_reactions_by_type_total is deprecated for photo posts).
 */
export async function getFacebookPostInsights(postId: string, pageToken: string): Promise<{
  impressions: number;
  reach: number;
  reactions: number;
  clicks: number;
  shares: number;
  videoViews: number;
}> {
  // Note: post-level insights are not accessible via Facebook Login for Business (FLOB) apps.
  // The /{post-id}/insights endpoint returns #100 regardless of metrics or approach used.
  // This function is kept for future use with a standard Facebook Login app.
  throw new Error('Facebook post insights are not available for this app type');
}
