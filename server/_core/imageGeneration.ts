import { storagePut } from 'server/storage';
import { ENV } from './env';

export type ImageModel = 'dall-e-3' | 'nano-banana-2';

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

const DALLE_SIZES: Record<AspectRatio, string> = {
  '1:1':  '1024x1024',
  '4:5':  '1024x1792', // closest DALL-E portrait to 4:5
  '9:16': '1024x1792',
  '16:9': '1792x1024',
};

const GEMINI_RATIO_HINTS: Record<AspectRatio, string> = {
  '1:1':  'square 1:1 aspect ratio',
  '4:5':  'portrait 4:5 aspect ratio',
  '9:16': 'vertical 9:16 aspect ratio',
  '16:9': 'landscape 16:9 aspect ratio',
};

export type GenerateImageOptions = {
  prompt: string;
  model?: ImageModel;
  aspectRatio?: AspectRatio;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  const model = options.model ?? 'dall-e-3';
  const ratio = options.aspectRatio ?? '1:1';

  if (model === 'nano-banana-2') {
    return generateWithGemini(options.prompt, ratio);
  }
  return generateWithDallE(options.prompt, ratio);
}

async function generateWithDallE(prompt: string, aspectRatio: AspectRatio): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: DALLE_SIZES[aspectRatio],
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI image generation failed (${response.status}): ${detail}`);
  }

  const result = await response.json() as { data: Array<{ b64_json: string }> };
  const b64 = result.data[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image data');

  const buffer = Buffer.from(b64, 'base64');
  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, 'image/png');
  return { url };
}

async function generateWithGemini(prompt: string, aspectRatio: AspectRatio): Promise<GenerateImageResponse> {
  if (!ENV.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  const modelId = 'gemini-3.1-flash-image-preview';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${ENV.geminiApiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${GEMINI_RATIO_HINTS[aspectRatio]}. ${prompt}` }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini image generation failed (${response.status}): ${detail}`);
  }

  const result = await response.json() as {
    candidates: Array<{
      content: { parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
    }>;
  };

  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart?.inlineData) throw new Error('Gemini returned no image data');

  const { mimeType, data } = imagePart.inlineData;
  const ext = mimeType.split('/')[1] ?? 'png';
  const buffer = Buffer.from(data, 'base64');
  const { url } = await storagePut(`generated/${Date.now()}.${ext}`, buffer, mimeType);
  return { url };
}
