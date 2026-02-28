import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ENV } from './_core/env';

function getClient() {
  if (!ENV.r2Endpoint || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey) {
    throw new Error('R2 storage credentials not configured (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: ENV.r2Endpoint,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array,
  contentType = 'application/octet-stream',
): Promise<{ key: string; url: string }> {
  if (!ENV.r2Bucket) throw new Error('R2_BUCKET not configured');
  if (!ENV.r2PublicUrl) throw new Error('R2_PUBLIC_URL not configured');

  const key = relKey.replace(/^\/+/, '');
  const client = getClient();

  await client.send(new PutObjectCommand({
    Bucket: ENV.r2Bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));

  const url = `${ENV.r2PublicUrl.replace(/\/+$/, '')}/${key}`;
  return { key, url };
}
