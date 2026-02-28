import { generateImage, type ImageModel } from './_core/imageGeneration';
import { updatePostImageUrl } from './db';

export async function generateAndStorePostImage(prompt: string, postId: number, model?: ImageModel, style?: string): Promise<string> {
  const fullPrompt = style ? `${style}. ${prompt}` : prompt;
  const { url } = await generateImage({ prompt: fullPrompt, model });
  if (!url) throw new Error('Image generation returned no URL');
  await updatePostImageUrl(postId, url);
  return url;
}
