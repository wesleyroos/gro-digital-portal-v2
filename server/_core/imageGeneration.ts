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
  referenceImages?: { url: string; description: string }[];
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  const model = options.model ?? 'dall-e-3';
  const ratio = options.aspectRatio ?? '1:1';

  if (model === 'nano-banana-2') {
    return generateWithGemini(options.prompt, ratio, options.referenceImages);
  }
  return generateWithDallE(options.prompt, ratio, options.referenceImages);
}

async function generateWithDallE(prompt: string, aspectRatio: AspectRatio, referenceImages?: { url: string; description: string }[]): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) throw new Error('OPENAI_API_KEY is not configured');

  let fullPrompt = prompt;
  if (referenceImages && referenceImages.length > 0) {
    const refText = referenceImages.map(r => r.description).join('. ');
    fullPrompt = `${prompt} The product to feature is described as follows — keep it accurate to this description but place it in a completely new professional scene: ${refText}`;
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
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

async function generateWithGemini(prompt: string, aspectRatio: AspectRatio, referenceImages?: { url: string; description: string }[]): Promise<GenerateImageResponse> {
  if (!ENV.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  const modelId = 'gemini-3.1-flash-image-preview';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${ENV.geminiApiKey}`;

  // Build request parts: reference images as inlineData + text prompt
  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
  const requestParts: GeminiPart[] = [];
  const hasRefs = referenceImages && referenceImages.length > 0;
  if (hasRefs) {
    requestParts.push({
      text: 'The following image(s) are brand reference photos showing the actual product(s). Study the product carefully — its shape, colours, materials, and details. You will place this exact product into a completely new, professional scene. Do NOT copy the background, setting, or environment from the reference. Generate an entirely new environment around the product.',
    });
    for (const ref of referenceImages!) {
      try {
        const imgRes = await fetch(ref.url, { signal: AbortSignal.timeout(15_000) });
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          const b64 = Buffer.from(arrayBuf).toString('base64');
          const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
          requestParts.push({ inlineData: { mimeType, data: b64 } });
        }
      } catch {
        // skip unreachable reference images
      }
    }
    requestParts.push({
      text: `Now generate a professional product photograph. Place the product from the reference image(s) into this scene: ${prompt}. ${GEMINI_RATIO_HINTS[aspectRatio]}. The product must look real and three-dimensional — same object, completely new environment.`,
    });
  } else {
    requestParts.push({ text: `${GEMINI_RATIO_HINTS[aspectRatio]}. ${prompt}` });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: requestParts }],
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

/**
 * Uses GPT-4o vision to auto-describe a brand reference image.
 */
export async function describeImageForBrand(imageUrl: string): Promise<string> {
  if (!ENV.openAiApiKey) return '';
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.openAiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: 'Describe this image concisely for use as a visual reference in social media content generation. Focus on: style, colors, mood, subject matter, and any brand elements. 2-3 sentences max.',
          },
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: imageUrl } }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return '';
    const result = await response.json() as { choices: Array<{ message: { content: string } }> };
    return result.choices[0]?.message?.content?.trim() ?? '';
  } catch {
    return '';
  }
}
