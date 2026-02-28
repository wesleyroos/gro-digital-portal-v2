import { generateImage } from './_core/imageGeneration';
import { updatePostImageUrl } from './db';

/**
 * Generate an image for a post using the Forge ImageService,
 * store the resulting URL in the DB, and return it.
 */
export async function generateAndStorePostImage(prompt: string, postId: number): Promise<string> {
  const { url } = await generateImage({ prompt });
  if (!url) throw new Error('Image generation returned no URL');
  await updatePostImageUrl(postId, url);
  return url;
}
