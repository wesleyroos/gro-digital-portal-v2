import type { Express, Request, Response } from 'express';
import { sdk } from './_core/sdk';
import * as db from './db';

type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
type AnyMessage = Record<string, unknown>;

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
  {
    type: 'function' as const,
    function: {
      name: 'generate_content_calendar',
      description: 'Generate the content calendar by creating all post records. Sets status to "generating".',
      parameters: {
        type: 'object',
        properties: {
          posts: {
            type: 'array',
            description: 'Array of posts to create',
            items: {
              type: 'object',
              properties: {
                scheduledAt: { type: 'string', description: 'ISO datetime string for when to publish' },
                caption: { type: 'string', description: 'The post caption' },
                hashtags: { type: 'string', description: 'Space-separated hashtags (e.g. #brand #marketing)' },
                imagePrompt: { type: 'string', description: 'Detailed prompt for AI image generation' },
                theme: { type: 'string', description: 'Content theme/pillar for this post' },
              },
              required: ['caption', 'imagePrompt'],
            },
          },
        },
        required: ['posts'],
      },
    },
  },
] as const;

async function buildCampaignSystemMessage(campaignId: number): Promise<string> {
  const campaign = await db.getCampaignById(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const statusFlow = 'discovery → strategy → generating → approval → active → completed';

  const brandSection = campaign.brandVoice
    ? `\nBRAND INFO:\n  Voice: ${campaign.brandVoice}\n  Audience: ${campaign.targetAudience ?? 'Not set'}\n  Themes: ${campaign.contentThemes ?? 'Not set'}\n  Posts/week: ${campaign.postsPerWeek ?? 3}`
    : '\nBRAND INFO: Not yet collected — start by asking discovery questions.';

  const strategySection = campaign.strategy
    ? `\nSTRATEGY:\n${campaign.strategy}`
    : '\nSTRATEGY: Not yet defined.';

  return `You are a specialist marketing campaign agent for GRO Digital. You are managing a specific Instagram marketing campaign.

Today's date: ${new Date().toISOString().slice(0, 10)}

CAMPAIGN: ${campaign.name}
CLIENT: ${campaign.clientSlug}
STATUS: ${campaign.status}
WORKFLOW: ${statusFlow}
${brandSection}
${strategySection}

INSTRUCTIONS BY STATUS:

discovery — Your first priority is to ask warm, conversational questions to learn:
  1. What does this brand do and who are their customers?
  2. What's the brand personality and tone of voice?
  3. What topics and content would resonate with their audience?
  4. How often should they post (default: 3x per week)?
  5. Campaign dates (optional)?
  Once you have enough, call save_brand_info.

strategy — Review the brand info and craft a clear content strategy. Include:
  - Positioning statement
  - 3-5 content pillars with descriptions
  - Recommended post types (educational, entertaining, promotional)
  - Tone and style guidelines
  Then call save_strategy.

generating — After strategy is approved by the user, call generate_content_calendar with a full set of posts (typically 4 weeks). Each post needs a caption, hashtag list, AI image prompt, and scheduled datetime.

approval — Posts are being reviewed. You can answer questions about any post or suggest edits.

active/completed — Campaign is running or done. You can discuss performance and next steps.

IMPORTANT:
- Be warm and conversational. This is a collaborative process.
- Never rush — ask questions one step at a time if needed.
- Image prompts must be detailed and visual (lighting, style, mood, subject).
- Hashtags should be relevant and a mix of broad and niche.
- Plain text only, no markdown in responses.`;
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

    if (name === 'generate_content_calendar') {
      type PostInput = {
        scheduledAt?: string;
        caption?: string;
        hashtags?: string;
        imagePrompt?: string;
        theme?: string;
      };
      const posts = (args.posts as PostInput[]) ?? [];
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
      return `Created ${posts.length} posts. Campaign status updated to "approval".`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error executing ${name}: ${String(e)}`;
  }
}

export function registerCampaignAgentRoutes(app: Express) {
  app.post('/api/agent/campaign/:campaignId', async (req: Request, res: Response) => {
    let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      authedUser = await sdk.authenticateRequest(req);
      if (authedUser.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) {
      res.status(400).json({ error: 'Invalid campaignId' });
      return;
    }

    const gatewayUrl = process.env.HENRY_GATEWAY_URL?.trim();
    const gatewayToken = process.env.HENRY_GATEWAY_TOKEN?.trim();
    if (!gatewayUrl || !gatewayToken) {
      res.status(503).json({ error: 'Agent gateway not configured' });
      return;
    }

    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const [systemMessage, history] = await Promise.all([
      buildCampaignSystemMessage(campaignId),
      db.getCampaignMessages(campaignId),
    ]);

    // Build messages: convert DB history (which may include tool roles) to AnyMessage
    const messages: AnyMessage[] = [
      { role: 'system', content: systemMessage },
      ...history.map(m => {
        if (m.role === 'tool') {
          return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
        }
        return { role: m.role, content: m.content };
      }),
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
            'x-openclaw-agent-id': 'campaign',
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

        // Execute each tool and append results
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

      // Persist: user message + tool calls + assistant reply
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
}
