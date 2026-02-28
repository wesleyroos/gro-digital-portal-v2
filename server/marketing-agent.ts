import type { Express, Request, Response } from 'express';
import { sdk } from './_core/sdk';
import * as db from './db';

type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
type AnyMessage = Record<string, unknown>;

// Only 2 tools in the chat agent — calendar generation is a separate endpoint
const CAMPAIGN_AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'save_brand_info',
      description: 'Save brand voice, target audience, content themes, cadence, and campaign dates collected during discovery.',
      parameters: {
        type: 'object',
        properties: {
          brandVoice: { type: 'string', description: 'The brand voice and tone (e.g. bold, playful, professional)' },
          targetAudience: { type: 'string', description: 'Description of the target audience' },
          contentThemes: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of content themes or pillars (e.g. "behind the scenes", "product showcases")',
          },
          postsPerWeek: { type: 'number', description: 'Number of posts per week (default 3)' },
          startDate: { type: 'string', description: 'Campaign start date in YYYY-MM-DD format (optional)' },
          endDate: { type: 'string', description: 'Campaign end date in YYYY-MM-DD format (optional)' },
        },
        required: ['brandVoice', 'targetAudience', 'contentThemes'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_strategy',
      description: 'Save the finalised content strategy and move the campaign to strategy status.',
      parameters: {
        type: 'object',
        properties: {
          strategyText: { type: 'string', description: 'The full content strategy document' },
        },
        required: ['strategyText'],
      },
    },
  },
];

async function buildCampaignSystemMessage(campaignId: number): Promise<string> {
  const campaign = await db.getCampaignById(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const brandSection = campaign.brandVoice
    ? `\nBRAND INFO:\n  Voice: ${campaign.brandVoice}\n  Audience: ${campaign.targetAudience ?? 'Not set'}\n  Themes: ${campaign.contentThemes ?? 'Not set'}\n  Posts/week: ${campaign.postsPerWeek ?? 3}`
    : '\nBRAND INFO: Not yet collected — start by asking discovery questions.';

  const strategySection = campaign.strategy
    ? `\nSTRATEGY:\n${campaign.strategy}`
    : '\nSTRATEGY: Not yet defined.';

  const nextAction = (() => {
    if (campaign.status === 'discovery') {
      return 'Ask discovery questions. Once you have enough info, call save_brand_info.';
    }
    if (campaign.status === 'strategy' && !campaign.strategy) {
      return 'Present a content strategy, then immediately call save_strategy with the full strategy text.';
    }
    if (campaign.status === 'strategy' && campaign.strategy) {
      return 'Strategy is saved. Let the user know they can click the "Generate Calendar" button to create all posts.';
    }
    if (campaign.status === 'approval') {
      return 'Posts have been created and are awaiting review in the Content tab. Let the user know they can review and approve posts there.';
    }
    return 'Campaign is active or complete. Discuss performance and next steps.';
  })();

  return `You are a specialist marketing campaign agent for GRO Digital. You are managing a specific Instagram marketing campaign.

Today's date: ${new Date().toISOString().slice(0, 10)}

CAMPAIGN: ${campaign.name}
CLIENT: ${campaign.clientSlug}
STATUS: ${campaign.status}
${brandSection}
${strategySection}

YOUR NEXT ACTION: ${nextAction}

WORKFLOW RULES:

1. DISCOVERY (status = discovery)
   Ask warm questions to learn: brand personality, target audience, content topics, posting frequency, campaign dates.
   Once you have enough, call save_brand_info. Do not ask more questions than needed.

2. STRATEGY (status = strategy, no strategy saved yet)
   Write a full content strategy (positioning, 3-5 content pillars, tone guidelines).
   Call save_strategy immediately after presenting it — do not wait for the user to say "save it".

3. AFTER STRATEGY SAVED (status = strategy, strategy already saved)
   Tell the user their strategy is ready and they can click the "Generate Calendar" button to create the content calendar.
   Do not attempt to list or write out posts yourself.

4. APPROVAL (status = approval)
   Posts are visible in the Content tab. Tell the user to review them there.

Plain text only in responses. No markdown.`;
}

async function executeCampaignTool(
  name: string,
  args: Record<string, unknown>,
  campaignId: number,
): Promise<string> {
  try {
    if (name === 'save_brand_info') {
      const themes = Array.isArray(args.contentThemes)
        ? (args.contentThemes as string[]).join(', ')
        : String(args.contentThemes ?? '');
      await db.updateCampaign(campaignId, {
        brandVoice: args.brandVoice as string,
        targetAudience: args.targetAudience as string,
        contentThemes: themes,
        postsPerWeek: typeof args.postsPerWeek === 'number' ? args.postsPerWeek : 3,
        startDate: (args.startDate as string) || null,
        endDate: (args.endDate as string) || null,
        status: 'strategy',
      });
      return 'Brand info saved. Campaign status updated to "strategy".';
    }

    if (name === 'save_strategy') {
      await db.updateCampaign(campaignId, {
        strategy: args.strategyText as string,
        status: 'strategy',
      });
      return 'Strategy saved.';
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error executing ${name}: ${String(e)}`;
  }
}

export function registerCampaignAgentRoutes(app: Express) {
  // ── Chat endpoint ────────────────────────────────────────────────────────────
  app.post('/api/agent/campaign/:campaignId', async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return; }
    } catch {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) { res.status(400).json({ error: 'Invalid campaignId' }); return; }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) { res.status(503).json({ error: 'Agent gateway not configured' }); return; }

    const { message } = req.body as { message: string };
    if (!message?.trim()) { res.status(400).json({ error: 'message is required' }); return; }

    const [systemMessage, history] = await Promise.all([
      buildCampaignSystemMessage(campaignId),
      db.getCampaignMessages(campaignId),
    ]);

    // Only include user/assistant messages in history — tool messages without
    // their paired assistant tool_calls cause API errors
    const messages: AnyMessage[] = [
      { role: 'system', content: systemMessage },
      ...history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() },
    ];

    try {
      let reply = '';
      const newMessages: Array<{ role: string; content: string; toolCallId?: string | null; toolName?: string | null }> = [];

      for (let round = 0; round < 8; round++) {
        const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
            'Content-Type': 'application/json',
            'x-openclaw-agent-id': 'ops',
          },
          body: JSON.stringify({ model: 'openclaw', messages, tools: CAMPAIGN_AGENT_TOOLS }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          console.error(`[Campaign] Gateway error ${upstream.status}:`, text);
          res.status(502).json({ error: 'Campaign agent unavailable' });
          return;
        }

        const data = await upstream.json() as {
          choices: Array<{
            message: { role: string; content: string | null; tool_calls?: ToolCall[] };
            finish_reason: string;
          }>;
        };

        const assistantMsg = data.choices[0].message;
        messages.push({ role: 'assistant', content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          reply = assistantMsg.content ?? '';
          newMessages.push({ role: 'assistant', content: reply });
          break;
        }

        for (const toolCall of assistantMsg.tool_calls) {
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
          const result = await executeCampaignTool(toolCall.function.name, toolArgs, campaignId);
          console.log(`[Campaign] Tool ${toolCall.function.name}(${toolCall.function.arguments}) → ${result}`);
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
          newMessages.push({ role: 'tool', content: result, toolCallId: toolCall.id, toolName: toolCall.function.name });
        }
      }

      if (!reply) reply = 'Done.';

      await db.appendCampaignMessages(campaignId, [
        { role: 'user', content: message.trim() },
        ...newMessages,
      ]);

      res.json({ reply });
    } catch (e) {
      console.error('[Campaign] Relay error:', e);
      res.status(502).json({ error: 'Campaign agent unavailable' });
    }
  });

  // ── Generate calendar endpoint ───────────────────────────────────────────────
  // Calls the LLM with a strict JSON-only prompt — no tool-calling required.
  app.post('/api/agent/campaign/:campaignId/generate-calendar', async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return; }
    } catch {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) { res.status(400).json({ error: 'Invalid campaignId' }); return; }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) { res.status(503).json({ error: 'Agent gateway not configured' }); return; }

    const campaign = await db.getCampaignById(campaignId);
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

    const postsPerWeek = campaign.postsPerWeek ?? 3;
    const totalPosts = postsPerWeek * 4;
    const today = new Date().toISOString().slice(0, 10);

    // Build schedule: spread posts across weekdays over 4 weeks
    const scheduledDates: string[] = [];
    const postDays = [1, 3, 5]; // Mon, Wed, Fri
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

    const prompt = `You are generating an Instagram content calendar for a marketing campaign.

CAMPAIGN: ${campaign.name}
CLIENT: ${campaign.clientSlug}
TODAY: ${today}
BRAND VOICE: ${campaign.brandVoice ?? 'Not specified'}
TARGET AUDIENCE: ${campaign.targetAudience ?? 'Not specified'}
CONTENT THEMES: ${campaign.contentThemes ?? 'Not specified'}
POSTS PER WEEK: ${postsPerWeek}
STRATEGY:
${campaign.strategy ?? 'No strategy saved — use brand info above to guide content.'}

Generate exactly ${totalPosts} Instagram posts.
Use these scheduled datetimes in order: ${scheduledDates.join(', ')}

Return ONLY a valid JSON array — no explanation, no preamble, no markdown code blocks:
[
  {
    "scheduledAt": "YYYY-MM-DDTHH:MM:SS",
    "caption": "engaging on-brand caption, 1-3 sentences",
    "hashtags": "#tag1 #tag2 #tag3 (10-20 hashtags, mix broad and niche)",
    "imagePrompt": "cinematic visual description: subject, lighting, mood, colour palette, style",
    "theme": "which content pillar this belongs to"
  }
]`;

    try {
      const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          'Content-Type': 'application/json',
          'x-openclaw-agent-id': 'ops',
        },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [
            { role: 'system', content: 'You are a JSON generator. Return only valid JSON arrays, no other text.' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(180_000),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        console.error(`[Campaign/CalGen] Gateway error ${upstream.status}:`, text);
        res.status(502).json({ error: 'Calendar generation failed' });
        return;
      }

      const data = await upstream.json() as {
        choices: Array<{ message: { content: string | null } }>;
      };
      const rawText = data.choices[0].message.content ?? '';
      console.log('[Campaign/CalGen] Raw response length:', rawText.length);

      // Extract the JSON array from the response (strip any surrounding text/markdown)
      const match = rawText.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error('[Campaign/CalGen] No JSON array found in response:', rawText.slice(0, 500));
        res.status(502).json({ error: 'Model did not return a valid calendar' });
        return;
      }

      type PostInput = { scheduledAt?: string; caption?: string; hashtags?: string; imagePrompt?: string; theme?: string };
      let posts: PostInput[];
      try {
        posts = JSON.parse(match[0]) as PostInput[];
      } catch (e) {
        console.error('[Campaign/CalGen] JSON parse error:', e);
        res.status(502).json({ error: 'Could not parse calendar from model response' });
        return;
      }

      await db.createPosts(
        posts.map((p, i) => ({
          campaignId,
          scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
          caption: p.caption ?? '',
          hashtags: p.hashtags ?? '',
          imagePrompt: p.imagePrompt ?? '',
          theme: p.theme ?? null,
          status: 'draft' as const,
          sortOrder: i + 1,
        }))
      );
      await db.updateCampaign(campaignId, { status: 'approval' });

      console.log(`[Campaign/CalGen] Created ${posts.length} posts for campaign ${campaignId}`);
      res.json({ count: posts.length });
    } catch (e) {
      console.error('[Campaign/CalGen] Error:', e);
      res.status(502).json({ error: 'Calendar generation failed' });
    }
  });
}
