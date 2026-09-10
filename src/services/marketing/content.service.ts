import fs from 'fs/promises'
import path from 'path'
import mongoose from 'mongoose'
import { env } from '../../config/env'
import { AppError, NotFoundError } from '../../utils/errors'
import { ContentRepository } from '../../repositories/marketing.repository'
import { logMarketingActivity } from './activityLog.service'
import type { MarketingContentStatus, MarketingContentType } from '../../models/MarketingContent'
import type { MarketingProvider } from '../../models/MarketingProviderAccount'
import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import { GoogleTokenService } from './googleToken.service'
import { LocationService } from './location.service'
import { EntitlementService } from './entitlement.service'
import { GOOGLE_BUSINESS_FEATURES } from '../../constants/googleBusinessFeatures'
import { UsageService } from './usage.service'
import { SettingsRepository } from '../../repositories/marketing.repository'
import { getApiOrigin } from '../../config/urls'

async function ensureUploadDir() {
  const dir = path.resolve(process.cwd(), env.MARKETING_UPLOAD_DIR)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function buildPublicImageUrl(imageUrl: string | null | undefined): string | undefined {
  if (!imageUrl) return undefined
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }
  return `${getApiOrigin()}${imageUrl}`
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
      locationIds?: number[]
    },
  ) {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.POSTS,
    )

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.mimetype)) {
      throw new AppError('Only JPG, PNG, and WEBP images are supported', 400)
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new AppError('Image must be 10MB or smaller', 400)
    }

    const dir = await ensureUploadDir()
    const ext = path.extname(file.originalname) || '.jpg'
    const filename = `${organizationId}-${Date.now()}${ext}`
    const fullPath = path.join(dir, filename)
    await fs.writeFile(fullPath, file.buffer)

    const publicUrl = `/uploads/marketing/${filename}`
    const settings = await SettingsRepository.getOrCreate(organizationId)

    const content = await ContentRepository.create({
      organizationId,
      provider: input.provider || 'google',
      contentType: input.contentType || 'photo',
      title: input.title?.trim() || file.originalname,
      description: input.description?.trim() || null,
      imageUrl: publicUrl,
      thumbnailUrl: publicUrl,
      status: 'draft',
      locationIds: input.locationIds || [],
      timezone: settings.defaultTimezone,
      createdBy: userId,
    })

    await UsageService.increment(organizationId, 'postsCreated')

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
      locationIds?: number[]
      timezone?: string
      cta?: string | null
      targetUrl?: string | null
    },
  ) {
    const content = await this.get(organizationId, id)
    if (data.title !== undefined) content.title = data.title
    if (data.description !== undefined) content.description = data.description
    if (data.contentType !== undefined) content.contentType = data.contentType
    if (data.status !== undefined) content.status = data.status
    if (data.locationIds !== undefined) content.locationIds = data.locationIds
    if (data.timezone !== undefined) content.timezone = data.timezone
    if (data.cta !== undefined) content.cta = data.cta
    if (data.targetUrl !== undefined) content.targetUrl = data.targetUrl
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
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.SCHEDULING,
    )
    await UsageService.assertWithinLimit(organizationId, 'postsCreated')

    const content = await this.get(organizationId, id)
    content.scheduleAt = scheduleAt
    content.status = 'scheduled'
    content.lastError = null
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

  static async cancel(organizationId: number, id: number, userId: number) {
    const content = await this.get(organizationId, id)
    if (!['scheduled', 'failed', 'auth_required'].includes(content.status)) {
      throw new AppError('Only scheduled or failed posts can be cancelled', 400)
    }
    content.status = 'cancelled'
    await content.save()

    await logMarketingActivity({
      organizationId,
      module: 'content',
      action: 'cancelled',
      description: `Cancelled content #${id}`,
      performedBy: userId,
    })

    return content
  }

  static async duplicate(organizationId: number, id: number, userId: number) {
    const original = await this.get(organizationId, id)
    const copy = await ContentRepository.create({
      organizationId,
      provider: original.provider,
      contentType: original.contentType,
      title: `${original.title} (copy)`,
      description: original.description,
      imageUrl: original.imageUrl,
      thumbnailUrl: original.thumbnailUrl,
      status: 'draft',
      locationIds: original.locationIds,
      timezone: original.timezone,
      cta: original.cta,
      targetUrl: original.targetUrl,
      createdBy: userId,
    })

    return copy
  }

  static async publishToGoogle(
    content: InstanceType<typeof import('../../models/MarketingContent').MarketingContent>,
    userId?: number,
  ) {
    const { accessToken } = await GoogleTokenService.getValidAccessToken(
      content.organizationId,
    )

    const locationIds = content.locationIds?.length
      ? content.locationIds
      : (await LocationService.getSelectedLocations(content.organizationId)).map(
          (l) => l._id,
        )

    if (!locationIds.length) {
      throw new AppError('No locations selected for this post', 400)
    }

    const locations = await LocationService.getSelectedLocations(content.organizationId)
    const targets = locations.filter((l) => locationIds.includes(l._id))

    if (!targets.length) {
      throw new AppError('Selected locations are invalid for this organization', 403)
    }

    const imageUrl = buildPublicImageUrl(content.imageUrl)
    const googlePostIds: string[] = []

    for (const location of targets) {
      const result = await GoogleBusinessClient.createLocalPost(
        accessToken,
        location.googleAccountId,
        location.googleLocationId,
        {
          summary: content.description || content.title,
          topicType: 'STANDARD',
          callToAction: content.cta
            ? { actionType: content.cta, url: content.targetUrl || undefined }
            : undefined,
          media: imageUrl
            ? [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }]
            : undefined,
        },
      )
      if (result.googlePostId) googlePostIds.push(result.googlePostId)
    }

    content.status = 'published'
    content.publishedAt = new Date()
    content.googlePostId = googlePostIds[0] || null
    content.publishedBy = userId ?? null
    content.lastError = null
    await content.save()

    await UsageService.increment(content.organizationId, 'postsPublished')
  }

  static async publish(organizationId: number, id: number, userId: number) {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.POSTS,
    )

    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      const content = await this.get(organizationId, id)

      const locked = await ContentRepository.findById(organizationId, id)
      if (!locked || ['published', 'processing', 'cancelled'].includes(locked.status)) {
        throw new AppError('Post cannot be published in its current state', 400)
      }

      locked.status = 'processing'
      await locked.save({ session })

      try {
        await this.publishToGoogle(locked, userId)
      } catch (error: any) {
        locked.status = error.statusCode === 401 ? 'auth_required' : 'failed'
        locked.lastError = error.message || 'Publish failed'
        locked.retryCount = (locked.retryCount || 0) + 1
        await locked.save({ session })
        throw error
      }

      await logMarketingActivity({
        organizationId,
        module: 'content',
        action: 'published',
        description: `Published content "${locked.title}"`,
        performedBy: userId,
      })

      await session.commitTransaction()
      return locked
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
    let failed = 0

    for (const content of due) {
      if (content.status !== 'scheduled') continue

      const locked = await ContentRepository.findById(
        content.organizationId,
        content._id,
      )
      if (!locked || locked.status !== 'scheduled') continue

      locked.status = 'processing'
      await locked.save()

      try {
        await this.publishToGoogle(locked)
        published += 1
      } catch (error: any) {
        locked.status = error.statusCode === 401 ? 'auth_required' : 'failed'
        locked.lastError = error.message || 'Scheduled publish failed'
        locked.retryCount = (locked.retryCount || 0) + 1
        await locked.save()
        failed += 1
      }
    }

    return { published, failed, scanned: due.length }
  }
}
