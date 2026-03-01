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
