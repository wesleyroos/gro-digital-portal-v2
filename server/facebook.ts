const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Get all Facebook Pages managed by the authenticated user.
 * Each page has its own long-lived page access token.
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
 */
export async function getFacebookPostInsights(postId: string, pageToken: string): Promise<{
  impressions: number;
  reach: number;
  reactions: number;
  clicks: number;
  shares: number;
  videoViews: number;
}> {
  const metrics = 'post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks,post_shares,post_video_views';
  const res = await fetch(
    `${GRAPH_BASE}/${postId}/insights?metric=${metrics}&access_token=${encodeURIComponent(pageToken)}`
  );
  const data = await res.json() as {
    data?: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }>;
    error?: { message: string };
  };
  if (!res.ok || !data.data) {
    throw new Error(`getFacebookPostInsights failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }

  const get = (name: string): number => {
    const item = data.data!.find(d => d.name === name);
    const val = item?.values?.[0]?.value ?? 0;
    if (typeof val === 'object') return Object.values(val).reduce((s, v) => s + (v as number), 0);
    return val as number;
  };

  return {
    impressions: get('post_impressions'),
    reach:       get('post_impressions_unique'),
    reactions:   get('post_reactions_by_type_total'),
    clicks:      get('post_clicks'),
    shares:      get('post_shares'),
    videoViews:  get('post_video_views'),
  };
}
