import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createB2Client(config) {
  const { endpoint, region, keyId, applicationKey, bucket } = config.b2;
  if (!endpoint || !region || !keyId || !applicationKey || !bucket) {
    return null;
  }
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: applicationKey,
    },
  });
}

export async function createPrivateReadUrl(config, objectKey) {
  const client = createB2Client(config);
  if (!client) {
    return null;
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.b2.bucket, Key: objectKey }),
    { expiresIn: config.uploadUrlTtlSeconds }
  );
}

export async function deletePrivateObject(config, objectKey) {
  const client = createB2Client(config);
  if (!client) {
    throw new Error('Private file storage is not configured.');
  }
  await client.send(
    new DeleteObjectCommand({ Bucket: config.b2.bucket, Key: objectKey })
  );
}
