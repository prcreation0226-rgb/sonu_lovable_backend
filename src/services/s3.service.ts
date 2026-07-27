// Radiantilyk EMR — AWS S3 Service Wrapper
// Handles all file operations for PHI documents, patient photos, and scribe audio.
// All files stored with SSE-S3 encryption. Access via presigned URLs only — no public URLs.
//
// HIPAA §164.312(a)(2)(iv): Implement encryption for ePHI.
// HIPAA §164.312(e)(2)(ii): Encrypt ePHI in transit.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ---- S3 Client Singleton ----
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // Falls back to IAM role in production
  });

  return s3Client;
}

// ---- File Key Generators ----

export function generatePatientDocumentKey(patientId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `patients/${patientId}/documents/${timestamp}_${sanitizedName}`;
}

export function generatePatientPhotoKey(patientId: string, encounterId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `patients/${patientId}/photos/${encounterId}/${timestamp}_${sanitizedName}`;
}

export function generateScribeAudioKey(sessionId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `scribe/audio/${sessionId}/${timestamp}_${sanitizedName}`;
}

export function generateExportKey(userId: string, exportType: string): string {
  const timestamp = Date.now();
  return `exports/${userId}/${exportType}_${timestamp}.zip`;
}

// ---- Core S3 Operations ----

/**
 * Generate a presigned URL for uploading a file to S3.
 * Files are encrypted at rest with SSE-S3.
 */
export async function getPresignedUploadUrl(
  fileKey: string,
  contentType: string,
  expiresIn: number = env.S3_PRESIGNED_EXPIRY_SECONDS
): Promise<string> {
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: fileKey,
    ContentType: contentType,
    ServerSideEncryption: 'AES256', // SSE-S3 encryption
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  logger.info(`[S3] Generated presigned upload URL for key=${fileKey}`);
  return url;
}

/**
 * Generate a presigned URL for downloading a file from S3.
 */
export async function getPresignedDownloadUrl(
  fileKey: string,
  expiresIn: number = env.S3_PRESIGNED_EXPIRY_SECONDS
): Promise<string> {
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: fileKey,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  logger.info(`[S3] Generated presigned download URL for key=${fileKey}`);
  return url;
}

/**
 * Delete a file from S3.
 * Used for audio purge (30-day lifecycle) and PHI deletion requests.
 */
export async function deleteS3Object(fileKey: string): Promise<void> {
  const client = getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: fileKey,
  });

  await client.send(command);
  logger.info(`[S3] Deleted object key=${fileKey}`);
}

/**
 * Check if a file exists in S3.
 */
export async function s3ObjectExists(fileKey: string): Promise<boolean> {
  const client = getS3Client();

  try {
    const command = new HeadObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: fileKey,
    });
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}
