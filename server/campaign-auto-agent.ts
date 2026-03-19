import type { Express, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { sdk } from './_core/sdk';
import { ENV } from './_core/env';
import * as db from './db';
import { generateAndStorePostImage } from './image-gen';
import type { ImageModel, AspectRatio } from './_core/imageGeneration';

// ── In-memory state ────────────────────────────────────────────────────────────
const pendingApprovals = new Map<string, (response: string) => void>();
const pendingUserMessages = new Map<string, string[]>();

// ── SSE helpers ────────────────────────────────────────────────────────────────
type SseEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: string; success: boolean }
  | { type: 'approval_required'; question: string }
  | { type: 'complete'; summary: string; campaignId: number }
  | { type: 'error'; message: string }
  | { type: 'agent_message'; text: string }
  | { type: 'user_message_echoed'; text: string };

function sendSse(res: Response, event: SseEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── Anthropic tool definitions ─────────────────────────────────────────────────
const AUTO_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'browse_website',
    description: 'Fetch and read the text content of a public website URL to understand the business brand, offerings, tone, and identity. Use this before setting brand info.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL including https://' },
      },
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
    name: 'create_campaign',
    description: 'Create a new marketing campaign for the client.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name (e.g. Q2 2026 Instagram Campaign)' },
        postToInstagram: { type: 'boolean', description: 'Whether to post to Instagram' },
        postToFacebook: { type: 'boolean', description: 'Whether to post to Facebook' },
        imageModel: { type: 'string', description: 'Image model to use' },
        imageStyle: { type: 'string', description: 'Image style' },
        imageAspectRatio: { type: 'string', description: 'Aspect ratio for images' },
      },
      required: ['name'],
    },
  },
  {
    name: 'save_brand_info',
    description: 'Save brand voice, target audience, content themes, cadence, and campaign dates.',
    input_schema: {
      type: 'object',
      properties: {
        brandVoice: { type: 'string', description: 'The brand voice and tone' },
        targetAudience: { type: 'string', description: 'Description of the target audience' },
        contentThemes: { type: 'array', items: { type: 'string' }, description: 'Content themes or pillars' },
        postsPerWeek: { type: 'number', description: 'Number of posts per week (default 3)' },
        startDate: { type: 'string', description: 'Campaign start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'Campaign end date in YYYY-MM-DD format' },
      },
      required: ['brandVoice', 'targetAudience', 'contentThemes'],
    },
  },
  {
    name: 'save_strategy',
    description: 'Save the finalised 400-700 word content strategy document.',
    input_schema: {
      type: 'object',
      properties: {
        strategyText: { type: 'string', description: 'The full content strategy document' },
      },
      required: ['strategyText'],
    },
  },
  {
    name: 'generate_calendar',
    description: 'Generate the full post calendar (drafts) for the campaign. Must call save_brand_info and save_strategy first.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'generate_post_image',
    description: 'Generate an image for a specific post by 0-based index.',
    input_schema: {
      type: 'object',
      properties: {
        postIndex: { type: 'number', description: '0-based index into the post list' },
      },
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
    description: 'Generate HTML content for the mailer using AI. Must call create_mailer first.',
    input_schema: {
      type: 'object',
      properties: {
        purpose: { type: 'string', description: 'Purpose of the mailer (e.g. "Campaign launch announcement")' },
      },
      required: ['purpose'],
    },
  },
  {
    name: 'request_approval',
    description: 'Pause and ask the human operator for approval or a decision. Use sparingly.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question or decision that needs human input' },
      },
      required: ['question'],
    },
  },
  {
    name: 'complete',
    description: 'Mark the agent run as complete and provide a summary.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was accomplished' },
      },
      required: ['summary'],
    },
  },
];

// ── Context carried between rounds ─────────────────────────────────────────────
interface AgentContext {
  clientSlug: string;
  campaignId: number | null;
  postIds: number[];
  mailerId: number | null;
  savedPrefs: { imageModel?: string; imageStyle?: string; imageAspectRatio?: string };
}

// ── Tool executor ──────────────────────────────────────────────────────────────
async function executeAutoTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
  agentId: string,
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
      return 'Message sent to user.';
    }

    if (name === 'save_preferences') {
      const saves: Promise<void>[] = [];
      if (args.imageModel) saves.push(db.setSetting('agentPref_imageModel', args.imageModel as string));
      if (args.imageStyle) saves.push(db.setSetting('agentPref_imageStyle', args.imageStyle as string));
      if (args.imageAspectRatio) saves.push(db.setSetting('agentPref_imageAspectRatio', args.imageAspectRatio as string));
      await Promise.all(saves);
      // Also update campaign image settings
      if (ctx.campaignId) {
        await db.updateCampaign(ctx.campaignId, {
          imageModel: args.imageModel as string ?? undefined,
          imageStyle: args.imageStyle as string ?? undefined,
          imageAspectRatio: args.imageAspectRatio as string ?? undefined,
        });
      }
      return `Preferences saved.`;
    }

    if (name === 'create_campaign') {
      const imageModel = (args.imageModel as string) ?? ctx.savedPrefs.imageModel ?? undefined;
      const imageStyle = (args.imageStyle as string) ?? ctx.savedPrefs.imageStyle ?? undefined;
      const imageAspectRatio = (args.imageAspectRatio as string) ?? ctx.savedPrefs.imageAspectRatio ?? undefined;

      const campaignId = await db.createCampaign({
        clientSlug: ctx.clientSlug,
        name: args.name as string,
        createdBy: 'auto-agent',
      });
      ctx.campaignId = campaignId;
      await db.updateCampaign(campaignId, {
        postToInstagram: args.postToInstagram !== false,
        postToFacebook: args.postToFacebook === true,
        ...(imageModel ? { imageModel } : {}),
        ...(imageStyle ? { imageStyle } : {}),
        ...(imageAspectRatio ? { imageAspectRatio } : {}),
      });
      return `Campaign created with ID ${campaignId}.`;
    }

    if (name === 'save_brand_info') {
      if (!ctx.campaignId) return 'Error: create_campaign must be called first.';
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
      return 'Brand info saved. Status updated to strategy.';
    }

    if (name === 'save_strategy') {
      if (!ctx.campaignId) return 'Error: create_campaign must be called first.';
      await db.updateCampaign(ctx.campaignId, {
        strategy: args.strategyText as string,
        status: 'strategy',
      });
      return 'Strategy saved.';
    }

    if (name === 'generate_calendar') {
      if (!ctx.campaignId) return 'Error: create_campaign must be called first.';
      const campaign = await db.getCampaignById(ctx.campaignId);
      if (!campaign) return 'Error: campaign not found.';

      const postsPerWeek = campaign.postsPerWeek ?? 3;
      const totalPosts = postsPerWeek * 4;
      const today = new Date().toISOString().slice(0, 10);

      // Build schedule: Mon/Wed/Fri over 4 weeks (same logic as marketing-agent.ts)
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
${(campaign as any).postToLinkedin ? `\nThis campaign also posts to LinkedIn. For each post, include a "linkedinCaption" field: a professional thought-leadership version (2-4 paragraphs, conversational but authoritative, ends with a question or CTA, max 3-5 hashtags).` : ''}
Return ONLY a valid JSON array — no explanation, no preamble, no markdown code blocks:
[
  {
    "scheduledAt": "YYYY-MM-DDTHH:MM:SS",
    "caption": "engaging on-brand caption, 1-3 sentences",
    "hashtags": "#tag1 #tag2 #tag3 (10-20 hashtags, mix broad and niche)",
    "imagePrompt": "${hasProductRefs ? 'describe ONLY the scene/environment/lighting/mood — the product from the brand reference images will be placed into this scene automatically, so do NOT describe the product itself' : 'cinematic visual description: subject, lighting, mood, colour palette, style'}",
    "theme": "which content pillar this belongs to"${(campaign as any).postToLinkedin ? `,\n    "linkedinCaption": "professional thought-leadership version for LinkedIn"` : ''}
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

      type PostInput = { scheduledAt?: string; caption?: string; hashtags?: string; imagePrompt?: string; theme?: string; linkedinCaption?: string };
      let posts: PostInput[];
      try {
        posts = JSON.parse(match[0]) as PostInput[];
      } catch {
        return 'Error: could not parse calendar JSON.';
      }

      await db.createPosts(
        posts.map((p, i) => ({
          campaignId: ctx.campaignId!,
          scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
          caption: p.caption ?? '',
          hashtags: p.hashtags ?? '',
          imagePrompt: p.imagePrompt ?? '',
          theme: p.theme ?? null,
          linkedinCaption: p.linkedinCaption ?? null,
          status: 'draft' as const,
          sortOrder: i + 1,
        }))
      );
      await db.updateCampaign(ctx.campaignId, { status: 'approval' });

      const createdPosts = await db.getPostsByCampaign(ctx.campaignId);
      ctx.postIds = createdPosts.map(p => p.id);

      return `Generated ${posts.length} posts. Campaign status set to approval.`;
    }

    if (name === 'generate_post_image') {
      const postIndex = args.postIndex as number;
      if (!ctx.campaignId) return 'Error: no campaign.';
      const postId = ctx.postIds[postIndex];
      if (!postId) return `Error: no post at index ${postIndex} (total posts: ${ctx.postIds.length}).`;

      const [campaign, allPosts] = await Promise.all([
        db.getCampaignById(ctx.campaignId),
        db.getPostsByCampaign(ctx.campaignId),
      ]);
      const post = allPosts.find(p => p.id === postId);
      if (!post) return `Error: post ${postId} not found.`;

      const imageModel = (campaign?.imageModel ?? 'dall-e-3') as ImageModel;
      const style = campaign?.imageStyle ?? undefined;
      const aspectRatio = (campaign?.imageAspectRatio ?? '1:1') as AspectRatio;
      const url = await generateAndStorePostImage(post.imagePrompt ?? '', postId, imageModel, style, aspectRatio);
      return `Image generated for post ${postIndex}: ${url}`;
    }

    if (name === 'approve_post') {
      const postIndex = args.postIndex as number;
      const postId = ctx.postIds[postIndex];
      if (!postId) return `Error: no post at index ${postIndex}.`;
      await db.updatePostStatus(postId, 'approved');
      return `Post ${postIndex} approved.`;
    }

    if (name === 'approve_all_posts') {
      if (!ctx.campaignId) return 'Error: no campaign.';
      await db.approveAllPosts(ctx.campaignId);
      return 'All draft posts approved.';
    }

    if (name === 'activate_campaign') {
      if (!ctx.campaignId) return 'Error: no campaign.';
      await db.updateCampaign(ctx.campaignId, { status: 'active' });
      return 'Campaign activated.';
    }

    if (name === 'create_mailer') {
      if (!ctx.campaignId) return 'Error: no campaign.';
      const mailer = await db.createCampaignMailer(ctx.campaignId);
      ctx.mailerId = mailer.id;
      return `Mailer created with ID ${mailer.id}.`;
    }

    if (name === 'generate_mailer') {
      if (!ctx.campaignId || !ctx.mailerId) return 'Error: create_mailer must be called first.';
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

      // Step 1: generate subject + previewText
      let subject = `${campaign.name} — ${new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`;
      let previewText: string | undefined;
      try {
        const metaMsg = await anthropic.messages.create({
          model: aiModel,
          max_tokens: 200,
          system: 'You write compelling email subject lines and preview text for marketing campaigns. Return ONLY valid JSON with keys "subject" (max 80 chars) and "previewText" (max 140 chars). No explanation.',
          messages: [{ role: 'user', content: `${campaignContext}\n\nWrite the subject line and preview text for this email mailer.` }],
        });
        const metaText = metaMsg.content[0]?.type === 'text' ? metaMsg.content[0].text.trim() : '{}';
        const metaJson = metaText.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(metaJson) as { subject?: string; previewText?: string };
        if (parsed.subject) subject = parsed.subject;
        if (parsed.previewText) previewText = parsed.previewText;
      } catch { /* keep defaults */ }

      // Step 2: generate HTML
      const logoHtml = `<span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:inherit;">${campaign.clientSlug}</span><!-- REPLACE WITH LOGO -->`;
      const htmlPrompt = `You are a world-class HTML email designer. Create a beautiful, clean, mobile-responsive HTML email.

${campaignContext}

LOGO HTML TO USE IN HEADER (use exactly as-is):
${logoHtml}

HERO: No hero image — use a clean white header with the logo, followed by a bold headline section.

DESIGN REQUIREMENTS:
- Complete HTML document, all CSS inlined PLUS a <style> block for media queries
- Max width 600px, centred, clean white (#ffffff) content area throughout
- Outer wrapper: very light grey background (#f8f8f8)
- HEADER: white background, logo centred or left-aligned, clean minimal padding (30px), no dark colours
- HERO: bold headline section on white/very light background
- CONTENT SECTIONS: 2-3 distinct sections with clear visual hierarchy:
    • Strong opening headline (24-32px bold)
    • Body copy in brand voice (16px, line-height 1.6)
    • 2-3 feature/benefit callouts — use a light grey (#f4f4f4) or thin-bordered card style with Unicode icons (✦ ◆ ✓ →)
- CTA BUTTON: large, minimum 200px wide, bold text, brand accent colour, 6px border-radius, centred, generous whitespace around it
- TYPOGRAPHY: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif. Body 16px line-height 1.6. Muted text #777, 13px.
- COLOUR PALETTE: white base with one accent colour derived from the brand. Keep it restrained and clean.
- SPACING: generous padding (40px sections, 30px sides). Lots of white space.
- FOOTER: white or very light grey (#f8f8f8), small muted text, copyright "© ${new Date().getFullYear()} ${campaign.clientSlug}", a "View in browser" link with href="__VIEW_IN_BROWSER_URL__" and an unsubscribe link with href="{{{RESEND_UNSUBSCRIBE_URL}}}" (use these exact placeholders — they are replaced automatically)
- Mobile: @media max-width 600px — padding 20px sides, font sizes adjust, images 100% width
- Return ONLY the raw HTML document. No explanation. No markdown. No code fences. Start with <!DOCTYPE html>.`;

      const htmlMsg = await anthropic.messages.create({
        model: aiModel,
        max_tokens: 8192,
        system: 'You are an expert HTML email developer. Output only raw HTML with no markdown, no code fences, no explanations.',
        messages: [{ role: 'user', content: htmlPrompt }],
      });

      let html = htmlMsg.content[0]?.type === 'text' ? htmlMsg.content[0].text.trim() : '';
      html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();
      const baseUrl = ENV.portalUrl ?? 'https://app.grodigital.co.za';
      const finalHtml = html.replace(/__VIEW_IN_BROWSER_URL__/g, `${baseUrl}/m/${ctx.mailerId}`);

      await db.updateCampaignMailer(ctx.mailerId, { subject, previewText: previewText ?? null, htmlContent: finalHtml });
      return `Mailer generated. Subject: "${subject}"`;
    }

    if (name === 'request_approval') {
      const question = args.question as string;
      sendSse(res, { type: 'approval_required', question });

      // Wait for human response (10-minute timeout)
      const response = await Promise.race<string>([
        new Promise<string>(resolve => pendingApprovals.set(agentId, resolve)),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10 * 60 * 1000)),
      ]).catch(() => 'timeout — proceeding automatically');

      pendingApprovals.delete(agentId);
      return `Human responded: ${response}`;
    }

    if (name === 'complete') {
      return `__COMPLETE__:${JSON.stringify({ summary: args.summary as string })}`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    console.error(`[AutoAgent] Tool ${name} error:`, e);
    return `Error executing ${name}: ${String(e)}`;
  }
}

// ── Agent runner ───────────────────────────────────────────────────────────────
async function runCampaignAutoAgent(
  agentId: string,
  clientSlug: string,
  campaignName: string | undefined,
  goals: string | undefined,
  res: Response,
) {
  const [clientProfile, existingCampaigns, prefModel, prefStyle, prefRatio] = await Promise.all([
    db.getClientProfile(clientSlug),
    db.getCampaignsByClientSlug(clientSlug),
    db.getSetting('agentPref_imageModel'),
    db.getSetting('agentPref_imageStyle'),
    db.getSetting('agentPref_imageAspectRatio'),
  ]);

  const savedPrefs = {
    imageModel: prefModel ?? undefined,
    imageStyle: prefStyle ?? undefined,
    imageAspectRatio: prefRatio ?? undefined,
  };

  const aiModel = (await db.getSetting('aiModel')) ?? 'claude-sonnet-4-6';
  const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

  const igConnected = !!clientProfile?.instagramBusinessId && !!clientProfile?.instagramAccessToken;
  const fbConnected = !!clientProfile?.facebookPageId && !!clientProfile?.facebookPageAccessToken;

  const allPrefsSet = savedPrefs.imageModel && savedPrefs.imageStyle && savedPrefs.imageAspectRatio;
  const prefsDisplay = allPrefsSet
    ? `Image model: ${savedPrefs.imageModel}, Style: ${savedPrefs.imageStyle}, Aspect ratio: ${savedPrefs.imageAspectRatio}`
    : 'None saved yet';

  const systemPrompt = `You are Jarvis, an autonomous marketing campaign agent for GRO Digital.
You communicate with the user via the chat panel using send_message and request_approval.
Use send_message to introduce yourself, share decisions, and narrate progress (keep it concise, 1-2 sentences).
Use request_approval when you need a decision or confirmation before proceeding.

TODAY: ${new Date().toISOString().slice(0, 10)}
CLIENT: ${clientProfile?.name ?? clientSlug} (slug: ${clientSlug})
Instagram: ${igConnected ? 'connected' : 'NOT CONNECTED'}
Facebook: ${fbConnected ? 'connected' : 'NOT CONNECTED'}
Client notes: ${clientProfile?.notes?.slice(0, 200) ?? 'none'}
Existing campaigns: ${existingCampaigns.length}
Goals: ${goals ?? 'None specified'}
Campaign name: ${campaignName ?? 'Generate appropriate Q+year name'}

SAVED PREFERENCES (from previous runs):
${prefsDisplay}

LIFECYCLE — execute in order:
1. send_message — introduce yourself, briefly confirm the client and goals
2. browse_website — if you can find a URL in the client notes or infer one from the client name/slug, browse it now to understand their brand, offerings, and tone. Tell the user what you found via send_message.
3. request_approval — ask about image preferences: show options with nano-banana-2/photorealistic/9:16 as recommendation. SKIP if all 3 prefs are already saved above.
4. save_preferences — save their image preferences
5. create_campaign — use confirmed name and channel settings
6. send_message — briefly explain what context you used to derive brand voice (website, notes, goals)
7. save_brand_info — derive confidently from website content + context
8. save_strategy — write 400-700 word strategy, then send_message with 2-3 sentence summary
9. generate_calendar
10. generate_post_image for posts 0, 1, 2 (sample batch)
11. send_message — tell the user 3 sample images are ready and share what you can see about them
12. request_approval — "Shall I generate images for all remaining posts?"
    → if yes, generate remaining; if no, skip
13. approve_all_posts
14. activate_campaign
15. create_mailer → generate_mailer
16. complete

RULES:
- Keep send_message text brief (1-2 sentences, conversational tone)
- Never make up brand info — explain what context you used
- Use saved preferences; only ask about images if not all 3 are saved
- If Instagram not connected, set postToInstagram=false
- After each tool call, do NOT narrate in thinking text — use send_message instead`;

  const agentCtx: AgentContext = {
    clientSlug,
    campaignId: null,
    postIds: [],
    mailerId: null,
    savedPrefs,
  };

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Begin. Execute the full campaign setup lifecycle autonomously.' },
  ];

  let done = false;

  for (let round = 0; round < 25 && !done; round++) {
    // Drain queued user messages
    const queuedMsgs = pendingUserMessages.get(agentId) ?? [];
    pendingUserMessages.set(agentId, []);
    for (const msg of queuedMsgs) {
      messages.push({ role: 'user', content: msg });
      sendSse(res, { type: 'user_message_echoed', text: msg });
    }

    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

    // Stream text deltas as thinking events
    const stream = anthropic.messages.stream({
      model: aiModel,
      max_tokens: 8192,
      system: systemPrompt,
      tools: AUTO_AGENT_TOOLS,
      messages,
    });

    stream.on('text', (text) => {
      sendSse(res, { type: 'thinking', text });
    });

    const finalMsg = await stream.finalMessage();

    // Collect tool_use blocks
    for (const block of finalMsg.content) {
      if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    // If end_turn with no tool calls, agent is finished
    if (finalMsg.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
      break;
    }

    // Append assistant message for next round
    messages.push({ role: 'assistant', content: finalMsg.content });

    // Execute tools
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const toolArgs = (toolUse.input ?? {}) as Record<string, unknown>;
      sendSse(res, { type: 'tool_call', tool: toolUse.name, args: toolArgs });

      const result = await executeAutoTool(toolUse.name, toolArgs, agentCtx, agentId, res, aiModel);

      // Check for complete signal
      if (result.startsWith('__COMPLETE__:')) {
        const payload = JSON.parse(result.slice('__COMPLETE__:'.length)) as { summary: string };
        sendSse(res, { type: 'complete', summary: payload.summary, campaignId: agentCtx.campaignId ?? 0 });
        done = true;
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Campaign setup complete.' });
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
export function registerCampaignAutoAgentRoutes(app: Express) {
  // Launch agent — streams SSE
  app.post('/api/agent/campaign-auto', async (req: Request, res: Response) => {
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

    const { clientSlug, campaignName, goals } = req.body as {
      clientSlug: string;
      campaignName?: string;
      goals?: string;
    };
    if (!clientSlug) { res.status(400).json({ error: 'clientSlug is required' }); return; }

    const agentId = crypto.randomUUID();

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Agent-Id', agentId);
    res.flushHeaders();

    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30_000);

    req.on('close', () => {
      clearInterval(keepalive);
      pendingApprovals.delete(agentId);
      pendingUserMessages.delete(agentId);
    });

    db.insertAiInteraction({ source: 'campaign_auto_agent', toolName: 'autoAgent.run', inputSummary: goals?.slice(0, 512) ?? `client:${clientSlug}`, clientSlug }).catch(() => {});

    try {
      await runCampaignAutoAgent(agentId, clientSlug, campaignName, goals, res);
    } catch (e) {
      console.error('[AutoAgent] Fatal error:', e);
      sendSse(res, { type: 'error', message: String(e) });
    } finally {
      clearInterval(keepalive);
      res.end();
    }
  });

  // Human approval response
  app.post('/api/agent/campaign-auto/respond', (req: Request, res: Response) => {
    const { agentId, response } = req.body as { agentId: string; response: string };
    if (!agentId || response === undefined) {
      res.status(400).json({ error: 'agentId and response are required' }); return;
    }
    const resolve = pendingApprovals.get(agentId);
    if (resolve) {
      resolve(response);
      pendingApprovals.delete(agentId);
    }
    res.json({ ok: true });
  });

  // User chat message
  app.post('/api/agent/campaign-auto/message', (req: Request, res: Response) => {
    const { agentId, message } = req.body as { agentId: string; message: string };
    if (!agentId || !message?.trim()) { res.status(400).json({ error: 'agentId and message required' }); return; }
    const queue = pendingUserMessages.get(agentId) ?? [];
    queue.push(message.trim());
    pendingUserMessages.set(agentId, queue);
    res.json({ ok: true });
  });
}
