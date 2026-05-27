import { storagePut } from 'server/storage';
import { ENV } from './env';

export type ImageModel = 'dall-e-3' | 'nano-banana-2' | 'gpt-image-1' | 'flux-2-pro' | 'ideogram-v3';

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

const DALLE_SIZES: Record<AspectRatio, string> = {
  '1:1':  '1024x1024',
  '4:5':  '1024x1792', // closest DALL-E portrait to 4:5
  '9:16': '1024x1792',
  '16:9': '1792x1024',
};

// gpt-image-1 supports auto, 1024x1024, 1536x1024, 1024x1536
const GPT_IMAGE_SIZES: Record<AspectRatio, string> = {
  '1:1':  '1024x1024',
  '4:5':  '1024x1536',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

const GEMINI_RATIO_HINTS: Record<AspectRatio, string> = {
  '1:1':  'square 1:1 aspect ratio',
  '4:5':  'portrait 4:5 aspect ratio',
  '9:16': 'vertical 9:16 aspect ratio',
  '16:9': 'landscape 16:9 aspect ratio',
};

const FLUX_IMAGE_SIZES: Record<AspectRatio, string | { width: number; height: number }> = {
  '1:1':  'square_hd',
  '4:5':  { width: 820, height: 1024 },
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
};

const IDEOGRAM_ASPECT_RATIOS: Record<AspectRatio, string> = {
  '1:1':  '1:1',
  '4:5':  '4:5',
  '9:16': '9:16',
  '16:9': '16:9',
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
  if (model === 'gpt-image-1') {
    return generateWithGptImage1(options.prompt, ratio, options.referenceImages);
  }
  if (model === 'flux-2-pro') {
    return generateWithFlux2Pro(options.prompt, ratio);
  }
  if (model === 'ideogram-v3') {
    return generateWithIdeogram(options.prompt, ratio);
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
 * Generates using gpt-image-1.
 * - With reference images: uses the /edits endpoint (product photo → new scene).
 *   Auto-writes the scene prompt via GPT-4o vision so no manual prompting needed.
 * - Without reference images: uses /generations like DALL-E but with gpt-image-1.
 */
async function generateWithGptImage1(prompt: string, aspectRatio: AspectRatio, referenceImages?: { url: string; description: string }[]): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) throw new Error('OPENAI_API_KEY is not configured');

  const size = GPT_IMAGE_SIZES[aspectRatio];
  const hasRefs = referenceImages && referenceImages.length > 0;

  if (hasRefs) {
    // Step 1: use GPT-4o vision to write a scene prompt from the product + post context
    const descriptions = referenceImages!.map(r => r.description).filter(Boolean).join('; ');
    const scenePromptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.openAiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'You write image generation prompts for professional product photography. Given a product description and a scene/theme, write a single prompt (no preamble, no quotes) that describes placing the product in a beautiful, editorial-quality scene. Describe the environment, lighting, mood, and composition only — do not re-describe the product itself.',
          },
          {
            role: 'user',
            content: `Product: ${descriptions}\nScene/theme: ${prompt}\n\nWrite the image generation prompt:`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const sceneData = scenePromptRes.ok
      ? await scenePromptRes.json() as { choices: Array<{ message: { content: string } }> }
      : null;
    const scenePrompt = sceneData?.choices[0]?.message?.content?.trim() ?? prompt;

    // Step 2: fetch the first reference image
    const ref = referenceImages![0];
    const imgRes = await fetch(ref.url, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) throw new Error('Could not fetch reference image for editing');
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';

    // Step 3: call /v1/images/edits with multipart form data
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image[]', new Blob([imgBuffer], { type: mimeType }), `product.${ext}`);
    form.append('prompt', `Professional product photography. ${scenePrompt}. Keep the product exactly as shown in the reference image but place it in a completely new, beautiful scene. Do not copy the original background.`);
    form.append('size', size);
    form.append('n', '1');

    const editRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.openAiApiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    if (!editRes.ok) {
      const detail = await editRes.text().catch(() => '');
      throw new Error(`gpt-image-1 edit failed (${editRes.status}): ${detail}`);
    }

    const editResult = await editRes.json() as { data: Array<{ b64_json?: string; url?: string }> };
    const b64 = editResult.data[0]?.b64_json;
    if (!b64) throw new Error('gpt-image-1 returned no image data');

    const buffer = Buffer.from(b64, 'base64');
    const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, 'image/png');
    return { url };
  }

  // No reference images — straight text-to-image with gpt-image-1
  const genRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.openAiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!genRes.ok) {
    const detail = await genRes.text().catch(() => '');
    throw new Error(`gpt-image-1 generation failed (${genRes.status}): ${detail}`);
  }

  const genResult = await genRes.json() as { data: Array<{ b64_json?: string }> };
  const b64 = genResult.data[0]?.b64_json;
  if (!b64) throw new Error('gpt-image-1 returned no image data');

  const buffer = Buffer.from(b64, 'base64');
  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, 'image/png');
  return { url };
}

async function generateWithFlux2Pro(prompt: string, aspectRatio: AspectRatio): Promise<GenerateImageResponse> {
  if (!ENV.falApiKey) throw new Error('FAL_API_KEY is not configured');

  const response = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
    method: 'POST',
    headers: {
      Authorization: `Key ${ENV.falApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: FLUX_IMAGE_SIZES[aspectRatio],
      num_images: 1,
      safety_tolerance: '2',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`FLUX 2 Pro generation failed (${response.status}): ${detail}`);
  }

  const result = await response.json() as { images: Array<{ url: string; content_type?: string }> };
  const imageUrl = result.images[0]?.url;
  if (!imageUrl) throw new Error('fal.ai returned no image');

  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error('Could not fetch generated image from fal.ai');
  const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const { url } = await storagePut(`generated/${Date.now()}.${ext}`, buffer, mimeType);
  return { url };
}

async function generateWithIdeogram(prompt: string, aspectRatio: AspectRatio): Promise<GenerateImageResponse> {
  if (!ENV.falApiKey) throw new Error('FAL_API_KEY is not configured');

  const response = await fetch('https://fal.run/fal-ai/ideogram/v3', {
    method: 'POST',
    headers: {
      Authorization: `Key ${ENV.falApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: IDEOGRAM_ASPECT_RATIOS[aspectRatio],
      rendering_speed: 'QUALITY',
      magic_prompt_option: 'AUTO',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Ideogram v3 generation failed (${response.status}): ${detail}`);
  }

  const result = await response.json() as { images: Array<{ url: string; content_type?: string }> };
  const imageUrl = result.images[0]?.url;
  if (!imageUrl) throw new Error('fal.ai returned no image');

  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error('Could not fetch generated image from fal.ai');
  const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const buffer = Buffer.from(await imgRes.arrayBuffer());
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
