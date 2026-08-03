import { MarketingActivityLog } from '../../models/MarketingActivityLog'

export async function logMarketingActivity(input: {
  organizationId: number
  module: string
  action: string
  description: string
  performedBy?: number | null
  ip?: string | null
  userAgent?: string | null
}) {
  return MarketingActivityLog.create({
    organizationId: input.organizationId,
    module: input.module,
    action: input.action,
    description: input.description,
    performedBy: input.performedBy ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })
}
