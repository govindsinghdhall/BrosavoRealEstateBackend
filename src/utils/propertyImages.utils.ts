
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { AppError } from '../utils/errors'

export const MAX_PROPERTY_IMAGE_SIZE = 10 * 1024 * 1024
export const MAX_PROPERTY_IMAGES = 20
export const TARGET_IMAGE_SIZE = 100 * 1024 // 100KB in bytes

export const ALLOWED_PROPERTY_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export interface PropertyImageUpload {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export interface PropertyImageMetadata {
  key: string
  url: string
  filename: string
  mimetype: string
  size: number
  isPrimary: boolean
  uploadedAt: Date
}

export function validatePropertyImages(
  files: PropertyImageUpload[],
): void {
  if (!files.length) {
    throw new AppError('Please select at least one property image', 400)
  }

  if (files.length > MAX_PROPERTY_IMAGES) {
    throw new AppError(
      `You can upload a maximum of ${MAX_PROPERTY_IMAGES} images at once`,
      400,
    )
  }

  for (const file of files) {
    if (!ALLOWED_PROPERTY_IMAGE_TYPES.includes(
      file.mimetype as (typeof ALLOWED_PROPERTY_IMAGE_TYPES)[number],
    )) {
      throw new AppError(`Unsupported image type: ${file.originalname}`, 400)
    }

    if (file.size > MAX_PROPERTY_IMAGE_SIZE) {
      throw new AppError(
        `${file.originalname} exceeds the 10 MB size limit`,
        400,
      )
    }

    if (!file.buffer?.length) {
      throw new AppError(`Empty image file: ${file.originalname}`, 400)
    }
  }
}

export function createPropertyImageKey(
  organizationId: string,
  propertyId: string,
  originalFilename: string,
): string {
  const extension = path.extname(originalFilename).toLowerCase()

  // Use an opaque filename instead of trusting a user-supplied path.
  return [
    'organizations',
    organizationId,
    'properties',
    propertyId,
    `${randomUUID()}${extension}`,
  ].join('/')
}

export function getPropertyImagePublicUrl(
  key: string,
): string {
  const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/+$/, '')

  if (!baseUrl) {
    throw new Error('CLOUDFLARE_R2_PUBLIC_URL is not configured')
  }

  return `${baseUrl}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

/**
 * Checks if an image needs to be compressed (if it's larger than the target size)
 */
export function needsCompression(imageSize: number): boolean {
  return imageSize > TARGET_IMAGE_SIZE;
}
