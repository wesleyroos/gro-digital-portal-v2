import { getPostsDueForPublishing, getCampaignById, getInstagramTokens, getFacebookTokens, getLinkedinTokens, updatePostStatus, updatePostFacebookId, updatePostLinkedinId, setPostNotes, getAllConnectedInstagramClients, updateInstagramAccessToken, getAllEnabledRecurringConfigs, getInvoiceForClientInMonth, getClientProfile, createInvoice, getInvoiceByNumber, updateRecurringInvoiceLastSent, sendInvoiceEmail, getNextInvoiceNumber, getDueMandateLineItems, getMandateById, getMandateLineItems, createMandateInvoiceForItems, getUnpaidMandateInvoice, updateMandateStatus, getInvoicesDueForScheduledSend, clearInvoiceScheduledSendDate, updateInvoiceStatus, getInvoiceItems, cloneInvoiceAsDraft } from './db';
import { chargeAuthorization, randsToCents } from './paystack';
import { ENV } from './_core/env';
import { createMediaContainer, createVideoMediaContainer, publishMedia, refreshLongLivedToken } from './instagram';
import { postImageToPage, postVideoToPage } from './facebook';
import { ensureFreshToken, initializeImageUpload, uploadImageBinary, createImagePost, createTextPost } from './linkedin';

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
      const platformErrors: string[] = [];

      // ── Instagram ──────────────────────────────────────────────────────────
      if (campaign.postToInstagram !== false) {
        try {
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
        } catch (igErr) {
          const msg = igErr instanceof Error ? igErr.message : String(igErr);
          console.error(`[Scheduler] Instagram failed for post ${post.id}:`, igErr);
          platformErrors.push(`Instagram: ${msg}`);
        }
      }

      // ── Facebook ───────────────────────────────────────────────────────────
      if (campaign.postToFacebook) {
        try {
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
        } catch (fbErr) {
          const msg = fbErr instanceof Error ? fbErr.message : String(fbErr);
          console.error(`[Scheduler] Facebook failed for post ${post.id}:`, fbErr);
          platformErrors.push(`Facebook: ${msg}`);
        }
      }

      // ── LinkedIn ───────────────────────────────────────────────────────────
      if ((campaign as any).postToLinkedin) {
        try {
          const liToken = await ensureFreshToken(campaign.clientSlug);
          const liTokens = await getLinkedinTokens(campaign.clientSlug);
          if (!liTokens) {
            console.warn(`[Scheduler] No LinkedIn tokens for ${campaign.clientSlug}, skipping LI for post ${post.id}`);
          } else {
            const authorUrn = liTokens.postTarget === 'organization' && liTokens.orgId
              ? liTokens.orgId
              : liTokens.personUrn;

            const liCaption = (post as any).linkedinCaption || caption;

            let linkedinPostId: string;
            if (!isVideo && mediaUrl) {
              const imgRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
              if (imgRes.ok) {
                const buffer = Buffer.from(await imgRes.arrayBuffer());
                const { uploadUrl, imageUrn } = await initializeImageUpload(authorUrn, liToken);
                await uploadImageBinary(uploadUrl, buffer, liToken);
                linkedinPostId = await createImagePost(authorUrn, liCaption, imageUrn, liToken);
              } else {
                linkedinPostId = await createTextPost(authorUrn, liCaption, liToken);
              }
            } else {
              linkedinPostId = await createTextPost(authorUrn, liCaption, liToken);
            }

            await updatePostLinkedinId(post.id, linkedinPostId);
            console.log(`[Scheduler] Post ${post.id} → LinkedIn ${linkedinPostId}`);
            published = true;
          }
        } catch (liErr) {
          const msg = liErr instanceof Error ? liErr.message : String(liErr);
          console.error(`[Scheduler] LinkedIn failed for post ${post.id}:`, liErr);
          platformErrors.push(`LinkedIn: ${msg}`);
        }
      }

      if (published) {
        if (campaign.postToInstagram === false) {
          await updatePostStatus(post.id, 'posted');
        }
        if (platformErrors.length > 0) {
          await setPostNotes(post.id, platformErrors.join('\n'));
        }
      } else if (platformErrors.length > 0) {
        await updatePostStatus(post.id, 'failed', { notes: platformErrors.join('\n') });
      }
    } catch (e) {
      console.error(`[Scheduler] Unexpected error for post ${post.id}:`, e);
      try {
        await updatePostStatus(post.id, 'failed', { notes: e instanceof Error ? e.message : String(e) });
      } catch { /* ignore secondary error */ }
    }
  }
}

async function runInstagramTokenRefreshTick() {
  const clients = await getAllConnectedInstagramClients().catch(() => []);
  for (const { clientSlug, instagramAccessToken } of clients) {
    try {
      const newToken = await refreshLongLivedToken(instagramAccessToken);
      await updateInstagramAccessToken(clientSlug, newToken);
      console.log(`[Scheduler] Refreshed Instagram token for ${clientSlug}`);
    } catch (e) {
      console.error(`[Scheduler] Instagram token refresh failed for ${clientSlug}:`, e);
    }
  }
}

export function startScheduler() {
  runSchedulerTick().catch(console.error);
  setInterval(() => runSchedulerTick().catch(console.error), 60_000);

  // Refresh Instagram long-lived tokens daily (tokens last 60 days; refreshing weekly keeps them alive indefinitely)
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  runInstagramTokenRefreshTick().catch(console.error);
  setInterval(() => runInstagramTokenRefreshTick().catch(console.error), ONE_DAY_MS);

  console.log('[Scheduler] Started');
}

export async function runMandateBillingTick() {
  const todayStr = new Date().toISOString().slice(0, 10);

  let dueRows: Awaited<ReturnType<typeof getDueMandateLineItems>>;
  try {
    dueRows = await getDueMandateLineItems(todayStr);
  } catch (e) {
    console.error('[MandateBilling] Failed to fetch due items:', e);
    return;
  }

  if (dueRows.length === 0) return;

  // Group by mandateId — charge all due items for a mandate in one invoice
  const byMandate = new Map<number, typeof dueRows>();
  for (const row of dueRows) {
    const id = row.mandate.id;
    if (!byMandate.has(id)) byMandate.set(id, []);
    byMandate.get(id)!.push(row);
  }

  for (const [mandateId, rows] of byMandate) {
    try {
      const mandate = rows[0].mandate;
      if (!mandate.paystackAuthCode) {
        console.warn(`[MandateBilling] Mandate ${mandateId} has no auth code, skipping`);
        continue;
      }

      const items = rows.map(r => r.item);
      const totalRands = items.reduce((sum, item) => sum + parseFloat(String(item.amount)), 0);

      const fullMandate = await getMandateById(mandateId);

      // Reuse the unpaid invoice from a previous failed attempt — a retry must
      // never create a duplicate invoice
      const existingInvoice = await getUnpaidMandateInvoice(mandateId);
      let invoiceId: number;
      let invoiceNumber: string;
      if (existingInvoice) {
        invoiceId = existingInvoice.id;
        invoiceNumber = existingInvoice.invoiceNumber;
      } else {
        invoiceNumber = await getNextInvoiceNumber(mandate.clientSlug);
        ({ invoiceId } = await createMandateInvoiceForItems(fullMandate, items, invoiceNumber));
      }

      // Build reference that encodes mandateId and invoiceId for webhook reconciliation.
      // Paystack rejects duplicate references, so each attempt gets a unique suffix —
      // the webhook only parses the m_{id} and inv_{id} tokens.
      const reference = `m_${mandateId}_inv_${invoiceId}_t${Date.now()}`;

      const chargeResult = await chargeAuthorization({
        authCode: mandate.paystackAuthCode,
        email: mandate.clientEmail,
        amount: randsToCents(totalRands),
        reference,
        metadata: { mandateId, invoiceId, itemIds: items.map(i => i.id) },
      });

      if (chargeResult.status === 'success') {
        // Advance billing dates for all charged items (webhook also does this as fallback)
        const { updateInvoiceStatus, advanceLineItemNextBillingDate } = await import('./db');
        await updateInvoiceStatus(invoiceId, 'paid');
        for (const item of items) {
          await advanceLineItemNextBillingDate(item.id, item.interval as 'monthly' | 'annual');
        }
        console.log(`[MandateBilling] Charged mandate ${mandateId} R${totalRands} — invoice ${invoiceNumber}`);
      } else if (chargeResult.status === 'failed') {
        // Declined synchronously — stop retrying until the mandate is resumed manually
        await updateInvoiceStatus(invoiceId, 'overdue');
        await updateMandateStatus(mandateId, 'failed');
        console.warn(`[MandateBilling] Charge declined for mandate ${mandateId}: ${chargeResult.gateway_response}`);

        const ownerEmail = process.env.OWNER_EMAIL || 'wesley@grodigital.co.za';
        if (fullMandate) {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          resend.emails.send({
            from: 'Gro Digital Portal <wesley@grodigital.co.za>',
            to: ownerEmail,
            subject: `Charge failed: ${fullMandate.clientName}`,
            html: `<p>The recurring charge for <strong>${fullMandate.clientName}</strong> (invoice ${invoiceNumber}) was declined: ${chargeResult.gateway_response}.</p><p>The mandate has been marked as failed — no further charge attempts will be made until you resume it in the portal.</p>`,
          }).catch(() => {});
        }
      } else {
        console.warn(`[MandateBilling] Charge ${chargeResult.status} for mandate ${mandateId}: ${chargeResult.gateway_response}`);
      }
    } catch (e) {
      console.error(`[MandateBilling] Failed for mandate ${mandateId}:`, e);
      try {
        await updateMandateStatus(mandateId, 'failed');
      } catch { /* ignore secondary error */ }
    }
  }
}

/**
 * Core logic: build and optionally send one recurring invoice for a client.
 * Returns the shareToken so callers can construct a preview URL.
 * `invoiceNumber` and `status` let callers override for preview vs real send.
 */
export async function buildAndSendRecurringInvoice(
  config: Awaited<ReturnType<typeof getAllEnabledRecurringConfigs>>[number],
  opts: { invoiceNumber: string; status: 'draft' | 'sent'; sendEmail: boolean; baseUrl: string }
): Promise<string> {
  const profile = await getClientProfile(config.clientSlug);
  const slugToTitle = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const amount = parseFloat(String(config.amount));
  const amountStr = String(amount);
  const now = new Date();

  const { shareToken } = await createInvoice(
    {
      invoiceNumber: opts.invoiceNumber,
      clientSlug: config.clientSlug,
      clientName: profile?.name ?? slugToTitle(config.clientSlug),
      clientContact: profile?.contact ?? null,
      clientPhone: profile?.phone ?? null,
      clientEmail: config.recipientEmail ?? profile?.email ?? null,
      projectName: config.description,
      invoiceType: 'monthly',
      status: opts.status,
      subtotal: amountStr,
      discountPercent: '0',
      discountAmount: '0',
      totalAmount: amountStr,
      amountDue: amountStr,
      paymentTerms: config.paymentTerms,
      notes: config.notes ?? null,
      clientAddress: profile?.address ?? null,
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

  if (opts.sendEmail) {
    const recipientEmail = config.recipientEmail ?? profile?.email;
    if (recipientEmail) {
      const invoice = await getInvoiceByNumber(opts.invoiceNumber);
      if (invoice) await sendInvoiceEmail(invoice.id, recipientEmail, opts.baseUrl);
    }
  }

  return shareToken;
}

export async function runScheduledInvoiceSendTick() {
  let due: Awaited<ReturnType<typeof getInvoicesDueForScheduledSend>>;
  try {
    due = await getInvoicesDueForScheduledSend();
  } catch (e) {
    console.error('[ScheduledSend] Failed to fetch due invoices:', e);
    return;
  }

  if (due.length === 0) return;

  const baseUrl = ENV.appUrl || process.env.PORTAL_URL || '';

  for (const invoice of due) {
    try {
      const recipientEmail = invoice.clientEmail;
      if (!recipientEmail) {
        console.warn(`[ScheduledSend] Invoice ${invoice.invoiceNumber} has no client email, skipping`);
        await clearInvoiceScheduledSendDate(invoice.id);
        continue;
      }

      await sendInvoiceEmail(invoice.id, recipientEmail, baseUrl);
      await updateInvoiceStatus(invoice.id, 'sent');
      await clearInvoiceScheduledSendDate(invoice.id);
      console.log(`[ScheduledSend] Sent invoice ${invoice.invoiceNumber} to ${recipientEmail}`);

      if (invoice.repeatMonthly) {
        // Advance date by one month (same day)
        const current = new Date(invoice.scheduledSendDate!);
        const next = new Date(current);
        next.setMonth(next.getMonth() + 1);
        const nextDateStr = next.toISOString().slice(0, 10);

        const newNumber = await getNextInvoiceNumber(invoice.clientSlug);
        const items = await getInvoiceItems(invoice.id);
        await cloneInvoiceAsDraft(invoice, items, newNumber, nextDateStr);
        console.log(`[ScheduledSend] Cloned ${invoice.invoiceNumber} → ${newNumber} scheduled ${nextDateStr}`);
      }
    } catch (e) {
      console.error(`[ScheduledSend] Failed for invoice ${invoice.invoiceNumber}:`, e);
    }
  }
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

      const invoiceNumber = await getNextInvoiceNumber(config.clientSlug);
      const baseUrl = ENV.appUrl || process.env.PORTAL_URL || '';

      await buildAndSendRecurringInvoice(config, { invoiceNumber, status: 'sent', sendEmail: true, baseUrl });
      await updateRecurringInvoiceLastSent(config.clientSlug, now);
      console.log(`[RecurringInvoice] Sent invoice ${invoiceNumber} for ${config.clientSlug}`);
    } catch (e) {
      console.error(`[RecurringInvoice] Failed for ${config.clientSlug}:`, e);
    }
  }
}
