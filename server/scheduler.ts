import { getPostsDueForPublishing, getCampaignById, getInstagramTokens, getFacebookTokens, updatePostStatus, updatePostFacebookId, getAllEnabledRecurringConfigs, getInvoiceForClientInMonth, getClientProfile, createInvoice, getInvoiceByNumber, updateRecurringInvoiceLastSent, sendInvoiceEmail } from './db';
import { ENV } from './_core/env';
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

export async function runRecurringInvoiceTick() {
  const now = new Date();
  const todayDay = now.getDate();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  let configs: Awaited<ReturnType<typeof getAllEnabledRecurringConfigs>>;
  try {
    configs = await getAllEnabledRecurringConfigs();
  } catch (e) {
    console.error('[RecurringInvoice] Failed to fetch configs:', e);
    return;
  }

  for (const config of configs) {
    if (config.sendDay !== todayDay) continue;

    try {
      const existing = await getInvoiceForClientInMonth(config.clientSlug, currentYear, currentMonth);
      if (existing) {
        console.log(`[RecurringInvoice] Already sent for ${config.clientSlug} in ${currentYear}-${currentMonth}, skipping`);
        continue;
      }

      const profile = await getClientProfile(config.clientSlug);
      if (!profile) {
        console.warn(`[RecurringInvoice] No client profile for ${config.clientSlug}, skipping`);
        continue;
      }

      const monthStr = String(currentMonth).padStart(2, '0');
      const invoiceNumber = `REC-${config.clientSlug.toUpperCase()}-${currentYear}-${monthStr}`;
      const amount = parseFloat(String(config.amount));
      const amountStr = String(amount);

      await createInvoice(
        {
          invoiceNumber,
          clientSlug: config.clientSlug,
          clientName: profile.name ?? config.clientSlug,
          clientContact: profile.contact ?? null,
          clientPhone: profile.phone ?? null,
          clientEmail: config.recipientEmail ?? profile.email ?? null,
          projectName: config.description,
          invoiceType: 'monthly',
          status: 'sent',
          subtotal: amountStr,
          discountPercent: '0',
          discountAmount: '0',
          totalAmount: amountStr,
          amountDue: amountStr,
          paymentTerms: config.paymentTerms,
          notes: config.notes ?? null,
          clientAddress: profile.address ?? null,
          invoiceDate: now,
          dueDate: null,
          bankName: 'FNB/RMB',
          accountHolder: 'Gro Digital',
          accountNumber: '62842244725',
          accountType: 'Gold Business Account',
          branchCode: '250655',
        },
        [{
          description: config.description,
          frequency: 'Monthly',
          vat: 'No VAT',
          unitPrice: amountStr,
          quantity: 1,
          lineTotal: amountStr,
        }]
      );

      const recipientEmail = config.recipientEmail ?? profile.email;
      if (recipientEmail) {
        const invoice = await getInvoiceByNumber(invoiceNumber);
        if (invoice) {
          const baseUrl = ENV.appUrl || process.env.PORTAL_URL || '';
          await sendInvoiceEmail(invoice.id, recipientEmail, baseUrl);
        }
      }

      await updateRecurringInvoiceLastSent(config.clientSlug, now);
      console.log(`[RecurringInvoice] Sent invoice ${invoiceNumber} for ${config.clientSlug}`);
    } catch (e) {
      console.error(`[RecurringInvoice] Failed for ${config.clientSlug}:`, e);
    }
  }
}
