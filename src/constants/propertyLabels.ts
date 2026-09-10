export const LISTING_TYPES = ['INDIVIDUAL', 'PROJECT'] as const
export type ListingType = (typeof LISTING_TYPES)[number]

export const PROJECT_STATUSES = [
  'UPCOMING',
  'PRE_LAUNCH',
  'NEW_LAUNCH',
  'UNDER_CONSTRUCTION',
  'READY_TO_MOVE',
  'COMPLETED',
  'ON_HOLD',
  'SOLD_OUT',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PRICE_TYPES = ['FIXED', 'NEGOTIABLE', 'ON_REQUEST'] as const
export type PriceType = (typeof PRICE_TYPES)[number]

export const PROPERTY_LABELS = [
  'FEATURED',
  'DISCOUNTED',
  'PRICE_REDUCED',
  'URGENT_SALE',
  'HOT_DEAL',
  'NEW_LAUNCH',
  'PRE_LAUNCH',
  'UPCOMING',
  'LIMITED_INVENTORY',
  'READY_TO_MOVE',
  'INVESTOR_OPPORTUNITY',
  'SPECIAL_OFFER',
  'EXCLUSIVE',
  'PREMIUM',
  'OWNER_DIRECT',
] as const
export type PropertyLabel = (typeof PROPERTY_LABELS)[number]

export const LABEL_DISPLAY: Record<PropertyLabel, { emoji: string; label: string }> = {
  FEATURED: { emoji: '⭐', label: 'Featured' },
  DISCOUNTED: { emoji: '💰', label: 'Discounted' },
  PRICE_REDUCED: { emoji: '📉', label: 'Price Reduced' },
  URGENT_SALE: { emoji: '🔥', label: 'Urgent Sale' },
  HOT_DEAL: { emoji: '🏷', label: 'Hot Deal' },
  NEW_LAUNCH: { emoji: '🆕', label: 'New Launch' },
  PRE_LAUNCH: { emoji: '🚀', label: 'Pre-Launch' },
  UPCOMING: { emoji: '🏗', label: 'Upcoming' },
  LIMITED_INVENTORY: { emoji: '⏳', label: 'Limited Inventory' },
  READY_TO_MOVE: { emoji: '🏠', label: 'Ready to Move' },
  INVESTOR_OPPORTUNITY: { emoji: '🎯', label: 'Investor Opportunity' },
  SPECIAL_OFFER: { emoji: '🎁', label: 'Special Offer' },
  EXCLUSIVE: { emoji: '⭐', label: 'Exclusive' },
  PREMIUM: { emoji: '💎', label: 'Premium' },
  OWNER_DIRECT: { emoji: '👤', label: 'Owner Direct' },
}

export function isValidPropertyLabel(value: string): value is PropertyLabel {
  return (PROPERTY_LABELS as readonly string[]).includes(value)
}
