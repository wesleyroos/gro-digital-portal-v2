import { generateImage, type ImageModel, type AspectRatio } from './_core/imageGeneration';
import { updatePostImageUrl } from './db';

export async function generateAndStorePostImage(
  prompt: string,
  postId: number,
  model?: ImageModel,
  style?: string,
  aspectRatio?: AspectRatio,
  referenceImages?: { url: string; description: string }[],
): Promise<string> {
  const fullPrompt = style ? `${style}. ${prompt}` : prompt;
  const { url } = await generateImage({ prompt: fullPrompt, model, aspectRatio, referenceImages });
  if (!url) throw new Error('Image generation returned no URL');
  await updatePostImageUrl(postId, url);
  return url;
}
