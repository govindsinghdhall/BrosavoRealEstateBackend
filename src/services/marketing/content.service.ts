import fs from 'fs/promises'
import path from 'path'
import mongoose from 'mongoose'
import { env } from '../../config/env'
import { AppError, NotFoundError } from '../../utils/errors'
import { ContentRepository } from '../../repositories/marketing.repository'
import { logMarketingActivity } from './activityLog.service'
import type { MarketingContentStatus, MarketingContentType } from '../../models/MarketingContent'
import type { MarketingProvider } from '../../models/MarketingProviderAccount'

async function ensureUploadDir() {
  const dir = path.resolve(process.cwd(), env.MARKETING_UPLOAD_DIR)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export class ContentService {
  static async upload(
    organizationId: number,
    userId: number,
    file: Express.Multer.File,
    input: {
      title?: string
      description?: string
      contentType?: MarketingContentType
      provider?: MarketingProvider
    },
  ) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.mimetype)) {
      throw new AppError('Only JPG, PNG, and WEBP images are supported', 400)
    }

    const dir = await ensureUploadDir()
    const ext = path.extname(file.originalname) || '.jpg'
    const filename = `${organizationId}-${Date.now()}${ext}`
    const fullPath = path.join(dir, filename)
    await fs.writeFile(fullPath, file.buffer)

    const publicUrl = `/uploads/marketing/${filename}`
    const content = await ContentRepository.create({
      organizationId,
      provider: input.provider || 'google',
      contentType: input.contentType || 'photo',
      title: input.title?.trim() || file.originalname,
      description: input.description?.trim() || null,
      imageUrl: publicUrl,
      thumbnailUrl: publicUrl,
      status: 'draft',
      createdBy: userId,
    })

    await logMarketingActivity({
      organizationId,
      module: 'content',
      action: 'uploaded',
      description: `Uploaded content "${content.title}"`,
      performedBy: userId,
    })

    return content
  }

  static list(
    organizationId: number,
    status?: MarketingContentStatus,
  ): Promise<Array<Record<string, unknown>>> {
    return ContentRepository.list(organizationId, status ? { status } : {})
  }

  static async get(organizationId: number, id: number) {
    const content = await ContentRepository.findById(organizationId, id)
    if (!content) throw new NotFoundError('Content not found')
    return content
  }

  static async update(
    organizationId: number,
    id: number,
    userId: number,
    data: {
      title?: string
      description?: string | null
      contentType?: MarketingContentType
      status?: MarketingContentStatus
    },
  ) {
    const content = await this.get(organizationId, id)
    if (data.title !== undefined) content.title = data.title
    if (data.description !== undefined) content.description = data.description
    if (data.contentType !== undefined) content.contentType = data.contentType
    if (data.status !== undefined) content.status = data.status
    await content.save()

    await logMarketingActivity({
      organizationId,
      module: 'content',
      action: 'updated',
      description: `Updated content #${id}`,
      performedBy: userId,
    })

    return content
  }

  static async remove(organizationId: number, id: number, userId: number) {
    const content = await this.get(organizationId, id)
    await content.deleteOne()

    await logMarketingActivity({
      organizationId,
      module: 'content',
      action: 'deleted',
      description: `Deleted content "${content.title}"`,
      performedBy: userId,
    })

    return { id }
  }

  static async schedule(
    organizationId: number,
    id: number,
    userId: number,
    scheduleAt: Date,
  ) {
    const content = await this.get(organizationId, id)
    content.scheduleAt = scheduleAt
    content.status = 'scheduled'
    await content.save()

    await logMarketingActivity({
      organizationId,
      module: 'content',
      action: 'scheduled',
      description: `Scheduled content #${id} for ${scheduleAt.toISOString()}`,
      performedBy: userId,
    })

    return content
  }

  static async publish(organizationId: number, id: number, userId: number) {
    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      const content = await this.get(organizationId, id)
      content.status = 'published'
      content.publishedAt = new Date()
      await content.save({ session })

      await logMarketingActivity({
        organizationId,
        module: 'content',
        action: 'published',
        description: `Published content "${content.title}"`,
        performedBy: userId,
      })

      await session.commitTransaction()
      return content
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }
  }

  static async publishDueContent() {
    const due = await ContentRepository.dueScheduled(new Date())
    let published = 0
    for (const content of due) {
      try {
        content.status = 'published'
        content.publishedAt = new Date()
        await content.save()
        published += 1
      } catch {
        content.status = 'failed'
        await content.save()
      }
    }
    return { published, scanned: due.length }
  }
}
