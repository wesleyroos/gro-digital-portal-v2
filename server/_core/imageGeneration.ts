import { storagePut } from 'server/storage';
import { ENV } from './env';

export type GenerateImageOptions = {
  prompt: string;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Call OpenAI DALL-E 3
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: options.prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI image generation failed (${response.status}): ${detail}`);
  }

  const result = await response.json() as {
    data: Array<{ b64_json: string }>;
  };

  const b64 = result.data[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image data');

  const buffer = Buffer.from(b64, 'base64');
  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, 'image/png');

  return { url };
}
