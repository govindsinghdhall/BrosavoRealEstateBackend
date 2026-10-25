
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import {
  createPropertyImageKey,
  getPropertyImagePublicUrl,
  type PropertyImageMetadata,
  type PropertyImageUpload,
} from '../utils/propertyImages.utils.js'
import { compressPropertyImage } from '../utils/imageCompression.utils.js'

function requiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is not configured`)
  }

  return value
}

const accountId = requiredEnv('CLOUDFLARE_R2_ACCOUNT_ID')

const r2Client = new S3Client({
  region: 'auto',
  endpoint:
    process.env.CLOUDFLARE_R2_ENDPOINT ||
    `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
  },
})

const bucketName = requiredEnv('CLOUDFLARE_R2_BUCKET_NAME')

export async function uploadPropertyImageToR2(
  file: PropertyImageUpload,
  organizationId: string,
  propertyId: string,
  isPrimary = false,
): Promise<PropertyImageMetadata> {
  // Compress the image to ensure it's under 100KB
  const compressedImage = await compressPropertyImage(file.buffer, file.originalname);
  
  const key = createPropertyImageKey(
    organizationId,
    propertyId,
    file.originalname,
  )

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: compressedImage.buffer,
      ContentType: `image/${compressedImage.format}`,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return {
    key,
    url: getPropertyImagePublicUrl(key),
    filename: file.originalname,
    mimetype: `image/${compressedImage.format}`,
    size: compressedImage.size,
    isPrimary,
    uploadedAt: new Date(),
  }
}

export async function uploadPropertyImagesToR2(
  files: PropertyImageUpload[],
  organizationId: string,
  propertyId: string,
  makeFirstPrimary = false,
): Promise<PropertyImageMetadata[]> {
  const uploaded: PropertyImageMetadata[] = []

  try {
    // Sequential uploads simplify rollback if a later upload fails.
    for (const [index, file] of files.entries()) {
      const image = await uploadPropertyImageToR2(
        file,
        organizationId,
        propertyId,
        makeFirstPrimary && index === 0,
      )

      uploaded.push(image)
    }

    return uploaded
  } catch (error) {
    // Prevent orphaned objects when a batch upload partially fails.
    try {
      await deletePropertyImagesFromR2(uploaded.map(image => image.key))
    } catch (cleanupError) {
      console.error('R2 upload rollback failed:', cleanupError)
    }

    throw error
  }
}

export async function deletePropertyImagesFromR2(
  keys: string[],
): Promise<void> {
  if (!keys.length) return

  // DeleteObjects accepts up to 1,000 objects per request.
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)

    const result = await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: chunk.map(Key => ({ Key })),
          Quiet: false,
        },
      }),
    )

    if (result.Errors?.length) {
      throw new Error(
        `Failed to delete ${result.Errors.length} Cloudflare R2 object(s)`,
      )
    }
  }
}
