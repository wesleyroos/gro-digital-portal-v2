import type { Express, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { sdk } from './_core/sdk';
import { ENV } from './_core/env';
import * as db from './db';
import { generateAndStorePostImage } from './image-gen';
import type { ImageModel, AspectRatio } from './_core/imageGeneration';

// ── In-memory state keyed by campaignId ────────────────────────────────────────
const pendingApprovals = new Map<number, (response: string) => void>();
const pendingUserMessages = new Map<number, string[]>();

// ── SSE helpers ────────────────────────────────────────────────────────────────
type SseEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: string; success: boolean }
  | { type: 'approval_required'; question: string }
  | { type: 'agent_message'; text: string }
  | { type: 'user_message_echoed'; text: string }
  | { type: 'data_changed' }
  | { type: 'complete'; summary: string }
  | { type: 'error'; message: string };

function sendSse(res: Response, event: SseEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── Anthropic tool definitions ─────────────────────────────────────────────────
const JARVIS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'browse_website',
    description: 'Fetch and read the text content of a public website URL to understand the business brand, offerings, tone, and identity.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full URL including https://' } },
      required: ['url'],
    },
  },
  {
    name: 'send_message',
    description: 'Send a message to the user in the chat panel. Use this to introduce yourself, ask questions, share decisions, or explain what you are about to do.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'save_preferences',
    description: "Save the user's image generation preferences for future campaigns.",
    input_schema: {
      type: 'object',
      properties: {
        imageModel: { type: 'string', description: 'Image model: dall-e-3, gpt-image-1, or nano-banana-2' },
        imageStyle: { type: 'string', description: 'Image style e.g. photorealistic, illustration, cinematic' },
        imageAspectRatio: { type: 'string', description: 'Aspect ratio: 1:1, 4:5, 9:16' },
      },
      required: [],
    },
  },
  {
    name: 'save_brand_info',
    description: 'Save brand voice, target audience, content themes, cadence, and campaign dates.',
    input_schema: {
      type: 'object',
      properties: {
        brandVoice: { type: 'string' },
        targetAudience: { type: 'string' },
        contentThemes: { type: 'array', items: { type: 'string' } },
        postsPerWeek: { type: 'number', description: 'Default 3' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['brandVoice', 'targetAudience', 'contentThemes'],
    },
  },
  {
    name: 'save_strategy',
    description: 'Save the finalised 400-700 word content strategy document.',
    input_schema: {
      type: 'object',
      properties: { strategyText: { type: 'string' } },
      required: ['strategyText'],
    },
  },
  {
    name: 'generate_calendar',
    description: 'Generate the full post calendar (drafts) for the campaign.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'generate_post_image',
    description: 'Generate an image for a specific post by 0-based index.',
    input_schema: {
      type: 'object',
      properties: { postIndex: { type: 'number', description: '0-based index into the post list' } },
      required: ['postIndex'],
    },
  },
  {
    name: 'approve_post',
    description: 'Approve a specific post by 0-based index.',
    input_schema: {
      type: 'object',
      properties: { postIndex: { type: 'number' } },
      required: ['postIndex'],
    },
  },
  {
    name: 'approve_all_posts',
    description: 'Approve all draft posts in the campaign.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'activate_campaign',
    description: 'Set the campaign status to active.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_mailer',
    description: 'Create a new email mailer record for the campaign.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'generate_mailer',
    description: 'Generate HTML content for the mailer using AI.',
    input_schema: {
      type: 'object',
      properties: { purpose: { type: 'string', description: 'Purpose of the mailer' } },
      required: ['purpose'],
    },
  },
  {
    name: 'request_approval',
    description: 'Pause and ask the human operator for approval or a decision. Use sparingly.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question'],
    },
  },
  {
    name: 'complete',
    description: 'Mark this Jarvis run as complete and provide a summary.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];

// ── Context ────────────────────────────────────────────────────────────────────
interface JarvisContext {
  campaignId: number;
  postIds: number[];
  mailerId: number | null;
  savedPrefs: { imageModel?: string; imageStyle?: string; imageAspectRatio?: string };
}

// ── Tool executor ──────────────────────────────────────────────────────────────
async function executeJarvisTool(
  name: string,
  args: Record<string, unknown>,
  ctx: JarvisContext,
  res: Response,
  aiModel: string,
): Promise<string> {
  try {
    if (name === 'browse_website') {
      const url = args.url as string;
      if (!url?.startsWith('http')) return 'Error: URL must start with http:// or https://';
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GRODigital-Jarvis/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return `Error: HTTP ${response.status} fetching ${url}`;
      const html = await response.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
      return `Content from ${url}:\n\n${text}`;
    }

    if (name === 'send_message') {
      sendSse(res, { type: 'agent_message', text: args.text as string });
      // Persist assistant message
      await db.appendCampaignMessages(ctx.campaignId, [{ role: 'assistant', content: args.text as string }]);
      return 'Message sent.';
    }

    if (name === 'save_preferences') {
      const saves: Promise<void>[] = [];
      if (args.imageModel) saves.push(db.setSetting('agentPref_imageModel', args.imageModel as string));
      if (args.imageStyle) saves.push(db.setSetting('agentPref_imageStyle', args.imageStyle as string));
      if (args.imageAspectRatio) saves.push(db.setSetting('agentPref_imageAspectRatio', args.imageAspectRatio as string));
      await Promise.all(saves);
      await db.updateCampaign(ctx.campaignId, {
        imageModel: args.imageModel as string ?? undefined,
        imageStyle: args.imageStyle as string ?? undefined,
        imageAspectRatio: args.imageAspectRatio as string ?? undefined,
      });
      sendSse(res, { type: 'data_changed' });
      return 'Preferences saved.';
    }

    if (name === 'save_brand_info') {
      const themes = Array.isArray(args.contentThemes)
        ? (args.contentThemes as string[]).join(', ')
        : String(args.contentThemes ?? '');
      await db.updateCampaign(ctx.campaignId, {
        brandVoice: args.brandVoice as string,
        targetAudience: args.targetAudience as string,
        contentThemes: themes,
        postsPerWeek: typeof args.postsPerWeek === 'number' ? args.postsPerWeek : 3,
        startDate: (args.startDate as string) || null,
        endDate: (args.endDate as string) || null,
        status: 'strategy',
      });
      sendSse(res, { type: 'data_changed' });
      return 'Brand info saved.';
    }

    if (name === 'save_strategy') {
      await db.updateCampaign(ctx.campaignId, {
        strategy: args.strategyText as string,
        status: 'strategy',
      });
      sendSse(res, { type: 'data_changed' });
      return 'Strategy saved.';
    }

    if (name === 'generate_calendar') {
      const campaign = await db.getCampaignById(ctx.campaignId);
      if (!campaign) return 'Error: campaign not found.';

      const postsPerWeek = campaign.postsPerWeek ?? 3;
      const totalPosts = postsPerWeek * 4;
      const today = new Date().toISOString().slice(0, 10);

      const scheduledDates: string[] = [];
      const postDays = [1, 3, 5];
      const postTimes = ['09:00:00', '12:00:00', '18:00:00'];
      const baseDate = new Date();
      baseDate.setHours(9, 0, 0, 0);

      let weekOffset = 0;
      let dayIndex = 0;
      while (scheduledDates.length < totalPosts) {
        for (const dayOfWeek of postDays) {
          if (scheduledDates.length >= totalPosts) break;
          const d = new Date(baseDate);
          d.setDate(d.getDate() + (weekOffset * 7) + ((dayOfWeek - d.getDay() + 7) % 7));
          if (d <= baseDate && weekOffset === 0) d.setDate(d.getDate() + 7);
          const time = postTimes[dayIndex % postTimes.length];
          scheduledDates.push(`${d.toISOString().slice(0, 10)}T${time}`);
          dayIndex++;
        }
        weekOffset++;
      }

      const assets = await db.getCampaignAssets(ctx.campaignId);
      const assetsWithDesc = assets.filter(a => a.aiDescription);
      const hasProductRefs = assetsWithDesc.length > 0;
      const assetsPromptSection = hasProductRefs
        ? `\nBRAND REFERENCE IMAGES:\n${assetsWithDesc.map((a, i) => `- ${a.label || `Reference ${i + 1}`}: ${a.aiDescription}`).join('\n')}`
        : '';

      const calPrompt = `You are generating a social media content calendar for a marketing campaign.

CAMPAIGN: ${campaign.name}
CLIENT: ${campaign.clientSlug}
TODAY: ${today}
BRAND VOICE: ${campaign.brandVoice ?? 'Not specified'}
TARGET AUDIENCE: ${campaign.targetAudience ?? 'Not specified'}
CONTENT THEMES: ${campaign.contentThemes ?? 'Not specified'}
POSTS PER WEEK: ${postsPerWeek}${assetsPromptSection}
STRATEGY:
${campaign.strategy ?? 'No strategy saved — use brand info above to guide content.'}

Generate exactly ${totalPosts} posts.
Use these scheduled datetimes in order: ${scheduledDates.join(', ')}

Return ONLY a valid JSON array — no explanation, no preamble, no markdown code blocks:
[
  {
    "scheduledAt": "YYYY-MM-DDTHH:MM:SS",
    "caption": "engaging on-brand caption, 1-3 sentences",
    "hashtags": "#tag1 #tag2 #tag3 (10-20 hashtags, mix broad and niche)",
    "imagePrompt": "${hasProductRefs ? 'describe ONLY the scene/environment/lighting/mood — the product from the brand reference images will be placed into this scene automatically, so do NOT describe the product itself' : 'cinematic visual description: subject, lighting, mood, colour palette, style'}",
    "theme": "which content pillar this belongs to"
  }
]`;

      const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
      const calMsg = await anthropic.messages.create({
        model: aiModel,
        max_tokens: 8192,
        system: 'You are a JSON generator. Return only valid JSON arrays, no other text.',
        messages: [{ role: 'user', content: calPrompt }],
      });

      const rawText = calMsg.content[0]?.type === 'text' ? calMsg.content[0].text : '';
      const match = rawText.match(/\[[\s\S]*\]/);
      if (!match) return 'Error: model did not return a valid JSON array.';

      type PostInput = { scheduledAt?: string; caption?: string; hashtags?: string; imagePrompt?: string; theme?: string };
      let posts: PostInput[];
      try { posts = JSON.parse(match[0]) as PostInput[]; }
      catch { return 'Error: could not parse calendar JSON.'; }

      await db.createPosts(
        posts.map((p, i) => ({
          campaignId: ctx.campaignId,
          scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
          caption: p.caption ?? '',
          hashtags: p.hashtags ?? '',
          imagePrompt: p.imagePrompt ?? '',
          theme: p.theme ?? null,
          status: 'draft' as const,
          sortOrder: i + 1,
        }))
      );
      await db.updateCampaign(ctx.campaignId, { status: 'approval' });

      const createdPosts = await db.getPostsByCampaign(ctx.campaignId);
      ctx.postIds = createdPosts.map(p => p.id);

      sendSse(res, { type: 'data_changed' });
      return `Generated ${posts.length} posts. Campaign status set to approval.`;
    }

    if (name === 'generate_post_image') {
      const postIndex = args.postIndex as number;
      const postId = ctx.postIds[postIndex];
      if (!postId) return `Error: no post at index ${postIndex} (total posts: ${ctx.postIds.length}).`;

      const [campaign, allPosts] = await Promise.all([
        db.getCampaignById(ctx.campaignId),
        db.getPostsByCampaign(ctx.campaignId),
      ]);
      const post = allPosts.find(p => p.id === postId);
      if (!post) return `Error: post ${postId} not found.`;

      const imageModel = (campaign?.imageModel ?? ctx.savedPrefs.imageModel ?? 'dall-e-3') as ImageModel;
      const style = campaign?.imageStyle ?? ctx.savedPrefs.imageStyle ?? undefined;
      const aspectRatio = (campaign?.imageAspectRatio ?? ctx.savedPrefs.imageAspectRatio ?? '1:1') as AspectRatio;
      const url = await generateAndStorePostImage(post.imagePrompt ?? '', postId, imageModel, style, aspectRatio);
      sendSse(res, { type: 'data_changed' });
      return `Image generated for post ${postIndex}: ${url}`;
    }

    if (name === 'approve_post') {
      const postIndex = args.postIndex as number;
      const postId = ctx.postIds[postIndex];
      if (!postId) return `Error: no post at index ${postIndex}.`;
      await db.updatePostStatus(postId, 'approved');
      sendSse(res, { type: 'data_changed' });
      return `Post ${postIndex} approved.`;
    }

    if (name === 'approve_all_posts') {
      await db.approveAllPosts(ctx.campaignId);
      sendSse(res, { type: 'data_changed' });
      return 'All draft posts approved.';
    }

    if (name === 'activate_campaign') {
      await db.updateCampaign(ctx.campaignId, { status: 'active' });
      sendSse(res, { type: 'data_changed' });
      return 'Campaign activated.';
    }

    if (name === 'create_mailer') {
      const mailer = await db.createCampaignMailer(ctx.campaignId);
      ctx.mailerId = mailer.id;
      sendSse(res, { type: 'data_changed' });
      return `Mailer created with ID ${mailer.id}.`;
    }

    if (name === 'generate_mailer') {
      if (!ctx.mailerId) return 'Error: create_mailer must be called first.';
      const campaign = await db.getCampaignById(ctx.campaignId);
      if (!campaign) return 'Error: campaign not found.';
      const purpose = (args.purpose as string) || 'Campaign launch announcement';

      const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
      const campaignContext = `CAMPAIGN: ${campaign.name}
CLIENT: ${campaign.clientSlug}
BRAND VOICE: ${campaign.brandVoice ?? 'Not specified'}
TARGET AUDIENCE: ${campaign.targetAudience ?? 'Not specified'}
CONTENT THEMES: ${campaign.contentThemes ?? 'Not specified'}
STRATEGY: ${campaign.strategy?.slice(0, 800) ?? 'Not specified'}
MAILER PURPOSE: ${purpose}`;

      let subject = `${campaign.name} — ${new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`;
      let previewText: string | undefined;
      try {
        const metaMsg = await anthropic.messages.create({
          model: aiModel,
          max_tokens: 200,
          system: 'Return ONLY valid JSON with keys "subject" (max 80 chars) and "previewText" (max 140 chars). No explanation.',
          messages: [{ role: 'user', content: `${campaignContext}\n\nWrite the subject line and preview text for this email mailer.` }],
        });
        const metaText = metaMsg.content[0]?.type === 'text' ? metaMsg.content[0].text.trim() : '{}';
        const metaJson = metaText.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(metaJson) as { subject?: string; previewText?: string };
        if (parsed.subject) subject = parsed.subject;
        if (parsed.previewText) previewText = parsed.previewText;
      } catch { /* keep defaults */ }

      const logoHtml = `<span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:inherit;">${campaign.clientSlug}</span>`;
      const htmlPrompt = `You are a world-class HTML email designer. Create a beautiful, clean, mobile-responsive HTML email.

${campaignContext}

LOGO HTML TO USE IN HEADER (use exactly as-is): ${logoHtml}
HERO: No hero image — use a clean white header with the logo, followed by a bold headline section.
DESIGN: Max width 600px, centred, clean white content area. Complete HTML document, all CSS inlined + <style> for media queries.
FOOTER: Include "View in browser" link href="__VIEW_IN_BROWSER_URL__" and unsubscribe href="{{{RESEND_UNSUBSCRIBE_URL}}}"
Return ONLY raw HTML. No markdown. No code fences. Start with <!DOCTYPE html>.`;

      const htmlMsg = await anthropic.messages.create({
        model: aiModel,
        max_tokens: 8192,
        system: 'Output only raw HTML. No markdown. No code fences. No explanations.',
        messages: [{ role: 'user', content: htmlPrompt }],
      });

      let html = htmlMsg.content[0]?.type === 'text' ? htmlMsg.content[0].text.trim() : '';
      html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();
      const baseUrl = ENV.portalUrl ?? 'https://app.grodigital.co.za';
      const finalHtml = html.replace(/__VIEW_IN_BROWSER_URL__/g, `${baseUrl}/m/${ctx.mailerId}`);

      await db.updateCampaignMailer(ctx.mailerId, { subject, previewText: previewText ?? null, htmlContent: finalHtml });
      sendSse(res, { type: 'data_changed' });
      return `Mailer generated. Subject: "${subject}"`;
    }

    if (name === 'request_approval') {
      const question = args.question as string;
      sendSse(res, { type: 'approval_required', question });
      // Persist as assistant message so it shows in chat
      await db.appendCampaignMessages(ctx.campaignId, [{ role: 'assistant', content: question }]);

      const response = await Promise.race<string>([
        new Promise<string>(resolve => pendingApprovals.set(ctx.campaignId, resolve)),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10 * 60 * 1000)),
      ]).catch(() => 'timeout — proceeding automatically');

      pendingApprovals.delete(ctx.campaignId);
      return `Human responded: ${response}`;
    }

    if (name === 'complete') {
      sendSse(res, { type: 'complete', summary: args.summary as string });
      await db.appendCampaignMessages(ctx.campaignId, [{ role: 'assistant', content: `✅ ${args.summary as string}` }]);
      return '__COMPLETE__';
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    console.error(`[Jarvis] Tool ${name} error:`, e);
    return `Error executing ${name}: ${String(e)}`;
  }
}

// ── Agent runner ───────────────────────────────────────────────────────────────
async function runJarvis(campaignId: number, goals: string | undefined, res: Response) {
  const [campaign, posts, prefModel, prefStyle, prefRatio] = await Promise.all([
    db.getCampaignById(campaignId),
    db.getPostsByCampaign(campaignId),
    db.getSetting('agentPref_imageModel'),
    db.getSetting('agentPref_imageStyle'),
    db.getSetting('agentPref_imageAspectRatio'),
  ]);

  if (!campaign) {
    sendSse(res, { type: 'error', message: 'Campaign not found.' });
    return;
  }

  const [clientProfile, allCampaigns] = await Promise.all([
    db.getClientProfile(campaign.clientSlug),
    db.getCampaignsByClientSlug(campaign.clientSlug),
  ]);

  const aiModel = (await db.getSetting('aiModel')) ?? 'claude-sonnet-4-6';

  const igConnected = !!clientProfile?.instagramBusinessId && !!clientProfile?.instagramAccessToken;
  const fbConnected = !!clientProfile?.facebookPageId && !!clientProfile?.facebookPageAccessToken;

  const savedPrefs = {
    imageModel: prefModel ?? undefined,
    imageStyle: prefStyle ?? undefined,
    imageAspectRatio: prefRatio ?? undefined,
  };

  // Apply saved prefs to campaign if they're missing — this ensures generate_post_image
  // uses the correct model/style/ratio even when save_preferences is skipped on resume
  if (savedPrefs.imageModel && !campaign.imageModel) {
    await db.updateCampaign(campaignId, {
      imageModel: savedPrefs.imageModel,
      imageStyle: savedPrefs.imageStyle,
      imageAspectRatio: savedPrefs.imageAspectRatio,
    });
  }

  const ctx: JarvisContext = {
    campaignId,
    postIds: posts.map(p => p.id),
    mailerId: null,
    savedPrefs,
  };

  const allPrefsSet = savedPrefs.imageModel && savedPrefs.imageStyle && savedPrefs.imageAspectRatio;
  const prefsDisplay = allPrefsSet
    ? `Image model: ${savedPrefs.imageModel}, Style: ${savedPrefs.imageStyle}, Aspect ratio: ${savedPrefs.imageAspectRatio}`
    : 'None saved yet';

  const systemPrompt = `You are Jarvis, an autonomous marketing campaign agent for GRO Digital.
You communicate with the user via send_message and request_approval.
Keep send_message text brief (1-2 sentences, conversational).

TODAY: ${new Date().toISOString().slice(0, 10)}
CAMPAIGN: ${campaign.name} (ID: ${campaignId})
STATUS: ${campaign.status}
CLIENT: ${clientProfile?.name ?? campaign.clientSlug} (slug: ${campaign.clientSlug})
Instagram: ${igConnected ? 'connected' : 'NOT CONNECTED'}
Facebook: ${fbConnected ? 'connected' : 'NOT CONNECTED'}
Client notes: ${clientProfile?.notes?.slice(0, 200) ?? 'none'}
Total campaigns for this client: ${allCampaigns.length}
Goals: ${goals ?? 'None specified'}

CAMPAIGN STATE:
- Brand voice: ${campaign.brandVoice ? 'set' : 'NOT SET'}
- Strategy: ${campaign.strategy ? 'written' : 'NOT WRITTEN'}
- Posts: ${posts.length} (${posts.filter(p => p.status === 'draft').length} draft, ${posts.filter(p => p.status === 'approved').length} approved)
- Image settings: model=${campaign.imageModel ?? 'not set'}, style=${campaign.imageStyle ?? 'not set'}, ratio=${campaign.imageAspectRatio ?? 'not set'}

SAVED PREFERENCES (from previous runs):
${prefsDisplay}

WHAT TO DO:
Look at the campaign state above and continue from where things left off. Skip any steps already done.

FULL LIFECYCLE (only execute steps not yet done):
1. send_message — introduce yourself and state what you're going to do
2. browse_website — if you can find a URL from the client notes or infer one, browse it now
3. ${allPrefsSet ? 'SKIP (image prefs already saved)' : 'request_approval — ask about image preferences (recommend nano-banana-2/photorealistic/9:16)'}
4. ${allPrefsSet ? 'SKIP' : 'save_preferences'}
5. ${campaign.brandVoice ? 'SKIP (brand info already set)' : 'save_brand_info — derive from website + context'}
6. ${campaign.strategy ? 'SKIP (strategy already written)' : 'save_strategy — 400-700 words, then send_message with 2-3 sentence summary'}
7. ${posts.length > 0 ? 'SKIP (calendar already generated)' : 'generate_calendar'}
8. ${posts.length === 0 ? 'SKIP until calendar exists' : posts.filter(p => !p.imageUrl).length === 0 ? 'SKIP (all images generated)' : `generate_post_image for posts 0, 1, 2 (sample batch) — then request_approval to continue with remaining ${posts.length - 3} posts`}
9. ${posts.every(p => p.status === 'approved') ? 'SKIP (all approved)' : 'approve_all_posts'}
10. create_mailer → generate_mailer (purpose: "Campaign launch announcement")
11. request_approval — "Everything is ready. Shall I activate the campaign?" — ALWAYS ask before activating, never activate automatically
12. ${campaign.status === 'active' ? 'SKIP (already active)' : 'activate_campaign — only if approved in step 11'}
13. complete

RULES:
- Use send_message to narrate — never just think out loud
- NEVER activate the campaign without explicit human approval via request_approval first
- Use request_approval for: image batch continuation, campaign activation
- If Instagram not connected, set postToInstagram=false when relevant
- Never make up brand info — explain what context you used`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Begin. Inspect the campaign state and continue from where things left off.' },
  ];

  const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
  let done = false;

  for (let round = 0; round < 30 && !done; round++) {
    // Drain queued user messages
    const queuedMsgs = pendingUserMessages.get(campaignId) ?? [];
    pendingUserMessages.set(campaignId, []);
    for (const msg of queuedMsgs) {
      messages.push({ role: 'user', content: msg });
      sendSse(res, { type: 'user_message_echoed', text: msg });
      await db.appendCampaignMessages(campaignId, [{ role: 'user', content: msg }]);
    }

    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

    const stream = anthropic.messages.stream({
      model: aiModel,
      max_tokens: 8192,
      system: systemPrompt,
      tools: JARVIS_TOOLS,
      messages,
    });

    stream.on('text', (text) => {
      sendSse(res, { type: 'thinking', text });
    });

    const finalMsg = await stream.finalMessage();

    for (const block of finalMsg.content) {
      if (block.type === 'tool_use') toolUseBlocks.push(block);
    }

    if (finalMsg.stop_reason === 'end_turn' && toolUseBlocks.length === 0) break;

    messages.push({ role: 'assistant', content: finalMsg.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const toolArgs = (toolUse.input ?? {}) as Record<string, unknown>;
      sendSse(res, { type: 'tool_call', tool: toolUse.name, args: toolArgs });

      const result = await executeJarvisTool(toolUse.name, toolArgs, ctx, res, aiModel);

      if (result === '__COMPLETE__') {
        done = true;
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Done.' });
        break;
      }

      const success = !result.startsWith('Error:');
      sendSse(res, { type: 'tool_result', tool: toolUse.name, result, success });
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
    }

    if (!done && toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }
}

// ── Route registration ─────────────────────────────────────────────────────────
export function registerCampaignJarvisRoutes(app: Express) {
  // Launch Jarvis for a specific campaign — streams SSE
  app.post('/api/agent/jarvis/:campaignId', async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (!authedUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    } catch {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    if (authedUser.role !== 'superAdmin') {
      res.status(403).json({ error: 'Forbidden: superAdmin only' }); return;
    }

    const campaignId = parseInt(req.params.campaignId ?? '', 10);
    if (!campaignId) { res.status(400).json({ error: 'Invalid campaignId' }); return; }

    const { goals } = req.body as { goals?: string };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const keepalive = setInterval(() => { res.write(': keepalive\n\n'); }, 30_000);

    req.on('close', () => {
      clearInterval(keepalive);
      pendingApprovals.delete(campaignId);
      pendingUserMessages.delete(campaignId);
    });

    try {
      await runJarvis(campaignId, goals, res);
    } catch (e) {
      console.error('[Jarvis] Fatal error:', e);
      sendSse(res, { type: 'error', message: String(e) });
    } finally {
      clearInterval(keepalive);
      res.end();
    }
  });

  // Human approval response
  app.post('/api/agent/jarvis/:campaignId/respond', (req: Request, res: Response) => {
    const campaignId = parseInt(req.params.campaignId ?? '', 10);
    const { response } = req.body as { response: string };
    if (!campaignId || response === undefined) {
      res.status(400).json({ error: 'campaignId and response are required' }); return;
    }
    const resolve = pendingApprovals.get(campaignId);
    if (resolve) {
      resolve(response);
      pendingApprovals.delete(campaignId);
    }
    res.json({ ok: true });
  });

  // User chat message
  app.post('/api/agent/jarvis/:campaignId/message', async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (!authedUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    } catch {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    const campaignId = parseInt(req.params.campaignId ?? '', 10);
    const { message } = req.body as { message: string };
    if (!campaignId || !message?.trim()) {
      res.status(400).json({ error: 'campaignId and message required' }); return;
    }

    const queue = pendingUserMessages.get(campaignId) ?? [];
    queue.push(message.trim());
    pendingUserMessages.set(campaignId, queue);

    // Persist user message immediately so it shows in chat history
    await db.appendCampaignMessages(campaignId, [{ role: 'user', content: message.trim() }]);

    res.json({ ok: true });
  });
}
