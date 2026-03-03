import { getPostsDueForPublishing, getCampaignById, getInstagramTokens, getFacebookTokens, updatePostStatus, updatePostFacebookId } from './db';
import { createMediaContainer, createVideoMediaContainer, publishMedia } from './instagram';
import { postImageToPage, postVideoToPage } from './facebook';

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

      if (campaign.status !== 'active') continue;

      const isVideo = post.mediaType === 'video';
      const mediaUrl = isVideo ? post.videoUrl : post.imageUrl;

      if (!mediaUrl) {
        console.warn(`[Scheduler] Post ${post.id} has no ${isVideo ? 'video' : 'image'} URL, skipping`);
        continue;
      }

      const caption = [post.caption ?? '', post.hashtags ?? ''].filter(Boolean).join('\n\n');
      let published = false;

      // ── Instagram ──────────────────────────────────────────────────────────
      if (campaign.postToInstagram !== false) {
        const igTokens = await getInstagramTokens(campaign.clientSlug);
        if (!igTokens) {
          console.warn(`[Scheduler] No Instagram tokens for ${campaign.clientSlug}, skipping IG for post ${post.id}`);
        } else {
          const creationId = isVideo
            ? await createVideoMediaContainer(igTokens.businessId, igTokens.accessToken, mediaUrl, caption)
            : await createMediaContainer(igTokens.businessId, igTokens.accessToken, mediaUrl, caption);
          const instagramPostId = await publishMedia(igTokens.businessId, igTokens.accessToken, creationId);
          await updatePostStatus(post.id, 'posted', { instagramPostId });
          console.log(`[Scheduler] Post ${post.id} → Instagram ${instagramPostId}`);
          published = true;
        }
      }

      // ── Facebook ───────────────────────────────────────────────────────────
      if (campaign.postToFacebook) {
        const fbTokens = await getFacebookTokens(campaign.clientSlug);
        if (!fbTokens) {
          console.warn(`[Scheduler] No Facebook tokens for ${campaign.clientSlug}, skipping FB for post ${post.id}`);
        } else {
          const facebookPostId = isVideo
            ? await postVideoToPage(fbTokens.pageId, fbTokens.pageAccessToken, mediaUrl, caption)
            : await postImageToPage(fbTokens.pageId, fbTokens.pageAccessToken, mediaUrl, caption);
          await updatePostFacebookId(post.id, facebookPostId);
          console.log(`[Scheduler] Post ${post.id} → Facebook ${facebookPostId}`);
          published = true;
        }
      }

      // Mark as posted if not already done via Instagram path above
      if (published && campaign.postToInstagram === false) {
        await updatePostStatus(post.id, 'posted');
      }
    } catch (e) {
      console.error(`[Scheduler] Failed to publish post ${post.id}:`, e);
      try {
        await updatePostStatus(post.id, 'failed', { notes: String(e) });
      } catch { /* ignore secondary error */ }
    }
  }
}

export function startScheduler() {
  runSchedulerTick().catch(console.error);
  setInterval(() => runSchedulerTick().catch(console.error), 60_000);
  console.log('[Scheduler] Started');
}
