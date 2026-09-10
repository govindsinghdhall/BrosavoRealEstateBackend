import { SettingsRepository } from '../../repositories/marketing.repository'
import { Organization } from '../../models/Organization'
import { UsageService } from './usage.service'
import { EntitlementService } from './entitlement.service'
import { GOOGLE_BUSINESS_FEATURES } from '../../constants/googleBusinessFeatures'

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /you are now/i,
  /system prompt/i,
  /reveal (the )?(secret|password|token|key)/i,
  /publish (this|the following) (secret|password)/i,
]

const UNSAFE_REPLY_PATTERNS = [
  /\b(lawsuit|sue you|legal action)\b/i,
  /\b(refund guaranteed|we will refund)\b/i,
  /\b(your (ssn|social security|credit card))\b/i,
]

export interface AiReplyInput {
  organizationId: number
  reviewerName: string
  rating: number
  reviewText: string
  businessName?: string
  tone?: string
  language?: string
  instructions?: string
}

export class GoogleAiService {
  static sanitizeReviewText(text: string): string {
    return String(text || '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .slice(0, 5000)
  }

  static detectPromptInjection(reviewText: string): boolean {
    const text = this.sanitizeReviewText(reviewText)
    return INJECTION_PATTERNS.some((pattern) => pattern.test(text))
  }

  static validateReplySafety(reply: string): { safe: boolean; reason?: string } {
    const trimmed = reply.trim()
    if (!trimmed) return { safe: false, reason: 'Reply is empty' }
    if (trimmed.length > 4000) return { safe: false, reason: 'Reply is too long' }

    for (const pattern of UNSAFE_REPLY_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { safe: false, reason: 'Reply contains unsupported claims or sensitive content' }
      }
    }

    return { safe: true }
  }

  static async generateReviewReply(input: AiReplyInput): Promise<string> {
    await EntitlementService.assertFeature(
      input.organizationId,
      GOOGLE_BUSINESS_FEATURES.AI,
    )
    await UsageService.assertWithinLimit(input.organizationId, 'aiGenerations')

    const reviewText = this.sanitizeReviewText(input.reviewText)
    if (this.detectPromptInjection(reviewText)) {
      return (
        'Thank you for sharing your feedback. We appreciate you taking the time to let us know about your experience, ' +
        'and our team will review your comments carefully.'
      )
    }

    const settings = await SettingsRepository.getOrCreate(input.organizationId)
    const org = await Organization.findById(input.organizationId).lean()

    const tone = input.tone || settings.defaultAiTone || 'professional'
    const language = input.language || settings.aiLanguage || 'English'
    const instructions =
      input.instructions ||
      settings.aiInstructions ||
      'Always be polite and thank customers for their feedback.'
    const businessName =
      input.businessName || org?.name || 'our business'
    const firstName = (input.reviewerName || 'there').split(' ')[0]

    const ratingLine =
      input.rating >= 4
        ? `We are glad you had a positive experience.`
        : input.rating === 3
          ? `We appreciate your honest feedback and will use it to improve.`
          : `We are sorry your experience did not meet expectations and would like to make things right.`

    const generated =
      `Hi ${firstName}, thank you for your ${input.rating}-star review of ${businessName}. ` +
      `${ratingLine} ` +
      `${instructions} ` +
      `(Tone: ${tone}; Language: ${language})`

    const safety = this.validateReplySafety(generated)
    if (!safety.safe) {
      return (
        'Thank you for your feedback. We value your input and our team will follow up with you directly.'
      )
    }

    await UsageService.increment(input.organizationId, 'aiGenerations')
    return generated
  }

  static async generatePostContent(
    organizationId: number,
    prompt: string,
  ): Promise<string> {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.AI,
    )
    await UsageService.assertWithinLimit(organizationId, 'aiGenerations')

    const org = await Organization.findById(organizationId).lean()
    const settings = await SettingsRepository.getOrCreate(organizationId)
    const businessName = org?.name || 'our business'
    const tone = settings.defaultAiTone || 'professional'

    const content =
      `${prompt.trim()}\n\n` +
      `— ${businessName}\n` +
      `Contact us to learn more about our latest offerings. (${tone} tone)`

    await UsageService.increment(organizationId, 'aiGenerations')
    return content.slice(0, 1500)
  }
}
