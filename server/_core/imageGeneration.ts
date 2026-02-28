import { storagePut } from 'server/storage';
import { ENV } from './env';

export type ImageModel = 'dall-e-3' | 'nano-banana-2';

export type GenerateImageOptions = {
  prompt: string;
  model?: ImageModel;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  const model = options.model ?? 'dall-e-3';

  if (model === 'nano-banana-2') {
    return generateWithGemini(options.prompt);
  }
  return generateWithDallE(options.prompt);
}

async function generateWithDallE(prompt: string): Promise<GenerateImageResponse> {
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
      size: '1024x1024',
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

async function generateWithGemini(prompt: string): Promise<GenerateImageResponse> {
  if (!ENV.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  const modelId = 'gemini-3.1-flash-image-preview';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${ENV.geminiApiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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
