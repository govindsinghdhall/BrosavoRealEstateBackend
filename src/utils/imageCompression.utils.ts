import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MAX_PROPERTY_IMAGE_SIZE } from './propertyImages.utils.js';

export interface CompressedImageResult {
  buffer: Buffer;
  size: number;
  format: string;
}

/**
 * Compresses an image to meet the target size requirement (100KB or less)
 * @param buffer The original image buffer
 * @param filename Original filename for format detection
 * @returns Compressed image buffer and metadata
 */
export async function compressPropertyImage(
  buffer: Buffer,
  filename: string
): Promise<CompressedImageResult> {
  const targetSize = 100 * 1024; // 100KB in bytes
  
  // If already under the limit, return as-is
  if (buffer.length <= targetSize) {
    return {
      buffer,
      size: buffer.length,
      format: 'jpeg' // Default fallback format
    };
  }

  // Determine the output format based on the original file extension
  const ext = filename.split('.').pop()?.toLowerCase();
  let format: 'jpeg' | 'png' | 'webp' | 'avif' = 'jpeg';
  
  if (ext === 'png') {
    format = 'png';
  } else if (ext === 'webp') {
    format = 'webp';
  } else if (ext === 'avif') {
    format = 'avif';
  }
  
  try {
    // Try to get the image dimensions for better optimization
    let image = sharp(buffer);
    
    const metadata = await image.metadata();
    
    // For better optimization, resize large images to appropriate dimensions
    const maxWidth = 1920;
    const maxHeight = 1080;
    
    if (metadata.width && metadata.height) {
      // If image is larger than max dimensions, resize it
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        image = image.resize(maxWidth, maxHeight, {
          fit: 'cover',
          position: 'center'
        });
      }
    }
    
    // Strategy 1: Try WebP format first as it's typically more efficient
    if (format !== 'webp') {
      try {
        const webpBuffer = await image.webp({ quality: 80 }).toBuffer();
        if (webpBuffer.length <= targetSize) {
          return {
            buffer: webpBuffer,
            size: webpBuffer.length,
            format: 'webp'
          };
        }
      } catch (error) {
        // If WebP fails, continue with other strategies
      }
    }
    
    // Strategy 2: Try JPEG compression with varying quality levels
    if (format !== 'png') {
      const qualities = [85, 75, 65, 55, 45];
      
      for (const quality of qualities) {
        try {
          const jpegBuffer = await image.jpeg({ quality }).toBuffer();
          if (jpegBuffer.length <= targetSize) {
            return {
              buffer: jpegBuffer,
              size: jpegBuffer.length,
              format: 'jpeg'
            };
          }
        } catch (error) {
          // Continue with next quality level
        }
      }
    }
    
    // Strategy 3: Try PNG compression if needed
    if (format !== 'jpeg') {
      try {
        const pngBuffer = await image.png({ compressionLevel: 9 }).toBuffer();
        if (pngBuffer.length <= targetSize) {
          return {
            buffer: pngBuffer,
            size: pngBuffer.length,
            format: 'png'
          };
        }
      } catch (error) {
        // Continue with next strategy
      }
    }
    
    // Strategy 4: If still too large, reduce quality further or resize
    try {
      // If we get here, the image is still too big. Try to force compression.
      if (format === 'jpeg') {
        const finalBuffer = await image.jpeg({ quality: 30 }).toBuffer();
        return {
          buffer: finalBuffer,
          size: finalBuffer.length,
          format: 'jpeg'
        };
      } else if (format === 'png') {
        const finalBuffer = await image.png({ compressionLevel: 9 }).toBuffer();
        return {
          buffer: finalBuffer,
          size: finalBuffer.length,
          format: 'png'
        };
      } else {
        // Fallback to WebP with low quality
        const finalBuffer = await image.webp({ quality: 30 }).toBuffer();
        return {
          buffer: finalBuffer,
          size: finalBuffer.length,
          format: 'webp'
        };
      }
    } catch (error) {
      // If all compression strategies fail, explicitly throw an error
      // This ensures oversized images are not silently uploaded
      throw new Error(`Failed to compress image below 100KB threshold. Original size: ${buffer.length} bytes`);
    }
  } catch (error) {
    // Handle any errors in the compression process
    console.error('Error during image compression:', error);
    throw error;
  }
}

/**
 * Checks if an image is already under 100KB
 */
export function isImageUnder100KB(buffer: Buffer): boolean {
  return buffer.length <= 100 * 1024;
}

/**
 * Calculates the size of a compressed image in KB
 */
export function getCompressedSizeInKB(buffer: Buffer): number {
  return Math.round(buffer.length / 1024);
}