import { ENV } from './_core/env';

const GRAPH_BASE = 'https://graph.instagram.com/v21.0';

/**
 * Create a media container (image post) on Instagram.
 * Returns the creation ID needed for publishMedia().
 */
export async function createMediaContainer(
  igUserId: string,
  token: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const url = `${GRAPH_BASE}/${igUserId}/media`;
  const body = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`createMediaContainer failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.id;
}

/**
 * Create a video (Reel) media container on Instagram.
 * Returns the creation ID needed for publishMedia().
 * Note: the video must be publicly accessible via videoUrl (R2 public URL).
 */
export async function createVideoMediaContainer(
  igUserId: string,
  token: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  const url = `${GRAPH_BASE}/${igUserId}/media`;
  const body = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`createVideoMediaContainer failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.id;
}

/**
 * Poll a media container until its status_code is FINISHED (ready to publish).
 * Instagram requires this wait between container creation and media_publish.
 */
async function waitForContainer(creationId: string, token: string, maxWaitMs = 30_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${GRAPH_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const data = await res.json() as { status_code?: string; error?: { message: string } };
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Media container processing failed on Instagram');
    if (data.status_code === 'EXPIRED') throw new Error('Media container expired before publishing');
    // IN_PROGRESS or undefined — wait and retry
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timed out waiting for Instagram media container to become ready');
}

/**
 * Publish a previously created media container.
 * Polls until the container is ready, then publishes.
 * Returns the Instagram media ID of the published post.
 */
export async function publishMedia(
  igUserId: string,
  token: string,
  creationId: string,
): Promise<string> {
  // Must wait for container to finish processing before publishing
  await waitForContainer(creationId, token);

  const url = `${GRAPH_BASE}/${igUserId}/media_publish`;
  const body = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`publishMedia failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.id;
}

/**
 * Exchange a short-lived token for a long-lived token (60 days).
 */
export async function exchangeForLongLivedToken(shortToken: string): Promise<string> {
  const url = `https://graph.instagram.com/access_token?${new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: ENV.instagramAppSecret,
    access_token: shortToken,
  })}`;

  const res = await fetch(url);
  const data = await res.json() as { access_token?: string; error?: { message: string } };
  if (!res.ok || !data.access_token) {
    throw new Error(`exchangeForLongLivedToken failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Fetch insights for a published post.
 * Automatically selects the right metric set based on media_type.
 * Note: the Instagram Login for Business API does not support `impressions`
 * for any media type — use `reach` instead.
 */
export async function getPostInsights(igMediaId: string, token: string): Promise<{
  mediaType: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  plays: number | null;
  totalInteractions: number;
  profileVisits: number | null;
  follows: number | null;
}> {
  // Fetch media type first so we know which metrics are supported
  const typeRes = await fetch(`${GRAPH_BASE}/${igMediaId}?fields=media_type&access_token=${encodeURIComponent(token)}`);
  const typeData = await typeRes.json() as { media_type?: string; error?: { message: string } };
  const mediaType = typeData.media_type ?? 'IMAGE';

  const isReel = mediaType === 'REELS';
  const isVideo = mediaType === 'VIDEO';

  // Base metrics supported by all types
  const metricList = ['reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
  // Plays for video/reels
  if (isReel || isVideo) metricList.push('plays');
  // Profile engagement only for feed posts
  if (!isReel) metricList.push('profile_visits', 'follows');

  const url = `${GRAPH_BASE}/${igMediaId}/insights?metric=${metricList.join(',')}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json() as {
    data?: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
    error?: { message: string };
  };
  if (!res.ok || !data.data) {
    throw new Error(`getPostInsights failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  const get = (name: string): number | null => {
    const item = data.data!.find(d => d.name === name);
    if (!item) return null;
    return item.value ?? item.values?.[0]?.value ?? 0;
  };
  return {
    mediaType,
    reach:             get('reach') ?? 0,
    likes:             get('likes') ?? 0,
    comments:          get('comments') ?? 0,
    shares:            get('shares') ?? 0,
    saved:             get('saved') ?? 0,
    plays:             (isReel || isVideo) ? get('plays') : null,
    totalInteractions: get('total_interactions') ?? 0,
    profileVisits:     isReel ? null : get('profile_visits'),
    follows:           isReel ? null : get('follows'),
  };
}

/**
 * Fetch basic user info (id + username) for the token holder.
 */
export async function getIgUserInfo(token: string): Promise<{ id: string; username: string }> {
  const url = `${GRAPH_BASE}/me?fields=id,username&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json() as { id?: string; username?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`getIgUserInfo failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return { id: data.id, username: data.username ?? '' };
}
