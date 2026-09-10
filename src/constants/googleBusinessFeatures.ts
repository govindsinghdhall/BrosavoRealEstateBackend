/**
 * Google Business feature entitlements.
 * Integrates with Organization.settings.features when present;
 * defaults allow all features until a billing system is wired.
 */

export const GOOGLE_BUSINESS_FEATURES = {
  GOOGLE_BUSINESS: 'google_business',
  POSTS: 'google_business_posts',
  SCHEDULING: 'google_business_scheduling',
  REVIEWS: 'google_business_reviews',
  AI: 'google_business_ai',
  AUTO_REPLY: 'google_business_auto_reply',
  ANALYTICS: 'google_business_analytics',
  MULTI_LOCATION: 'google_business_multi_location',
} as const

export type GoogleBusinessFeature =
  (typeof GOOGLE_BUSINESS_FEATURES)[keyof typeof GOOGLE_BUSINESS_FEATURES]

export const DEFAULT_FEATURE_LIMITS = {
  maxLocations: 10,
  maxScheduledPostsPerMonth: 100,
  maxAiGenerationsPerMonth: 100,
  maxAiRepliesPerMonth: 200,
  maxAutoReplyRules: 20,
  analyticsRetentionDays: 365,
} as const

export const FEATURE_DISABLED_MESSAGE: Record<GoogleBusinessFeature, string> = {
  google_business:
    'Google Business management is not included in your current plan.',
  google_business_posts:
    'Google Business posts are not included in your current plan.',
  google_business_scheduling:
    'Google Business post scheduling is not included in your current plan.',
  google_business_reviews:
    'Google Business reviews are not included in your current plan.',
  google_business_ai:
    'Google Business AI is not included in your current plan.',
  google_business_auto_reply:
    'Google Business automatic review replies are not included in your current plan.',
  google_business_analytics:
    'Google Business analytics are not included in your current plan.',
  google_business_multi_location:
    'Multiple Google Business locations are not included in your current plan.',
}
