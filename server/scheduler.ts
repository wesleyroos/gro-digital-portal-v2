import { getPostsDueForPublishing, getCampaignById, getInstagramTokens, updatePostStatus } from './db';
import { createMediaContainer, createVideoMediaContainer, publishMedia } from './instagram';

async function runSchedulerTick() {
  let posts: Awaited<ReturnType<typeof getPostsDueForPublishing>>;
  try {
    posts = await getPostsDueForPublishing();
  } catch (e) {
    console.error('[Scheduler] Failed to query posts:', e);
    return;
  }

  for (const post of posts) {
    try {
      const campaign = await getCampaignById(post.campaignId);
      if (!campaign) {
        console.warn(`[Scheduler] Campaign ${post.campaignId} not found for post ${post.id}`);
        continue;
      }

      if (campaign.status !== 'active') {
        // Don't publish unless campaign is active
        continue;
      }

      const tokens = await getInstagramTokens(campaign.clientSlug);
      if (!tokens) {
        console.warn(`[Scheduler] No Instagram tokens for ${campaign.clientSlug}, skipping post ${post.id}`);
        continue;
      }

      const isVideo = post.mediaType === 'video';
      const mediaUrl = isVideo ? post.videoUrl : post.imageUrl;

      if (!mediaUrl) {
        console.warn(`[Scheduler] Post ${post.id} has no ${isVideo ? 'video' : 'image'} URL, skipping`);
        continue;
      }

      const caption = [post.caption ?? '', post.hashtags ?? ''].filter(Boolean).join('\n\n');

      // Videos (Reels) use a different container type; the waitForContainer polling
      // inside publishMedia handles the async processing (can take 30-90s for video).
      const creationId = isVideo
        ? await createVideoMediaContainer(tokens.businessId, tokens.accessToken, mediaUrl, caption)
        : await createMediaContainer(tokens.businessId, tokens.accessToken, mediaUrl, caption);

      const instagramPostId = await publishMedia(tokens.businessId, tokens.accessToken, creationId);

      await updatePostStatus(post.id, 'posted', { instagramPostId });
      console.log(`[Scheduler] Post ${post.id} (${isVideo ? 'video' : 'image'}) published → Instagram ID ${instagramPostId}`);
    } catch (e) {
      console.error(`[Scheduler] Failed to publish post ${post.id}:`, e);
      try {
        await updatePostStatus(post.id, 'failed', { notes: String(e) });
      } catch { /* ignore secondary error */ }
    }
  }
}

export function startScheduler() {
  // Run once immediately, then every 60 seconds
  runSchedulerTick().catch(console.error);
  setInterval(() => runSchedulerTick().catch(console.error), 60_000);
  console.log('[Scheduler] Started');
}
