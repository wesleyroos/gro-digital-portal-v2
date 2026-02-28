import { ENV } from './_core/env';

const GRAPH_BASE = 'https://graph.instagram.com';

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
 * Publish a previously created media container.
 * Returns the Instagram media ID of the published post.
 */
export async function publishMedia(
  igUserId: string,
  token: string,
  creationId: string,
): Promise<string> {
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
