import { CampaignRepository } from '../../repositories/marketing.repository'
import { AppError, NotFoundError } from '../../utils/errors'
import { logMarketingActivity } from './activityLog.service'
import type { CampaignStatus } from '../../models/MarketingCampaign'
import type { MarketingProvider } from '../../models/MarketingProviderAccount'

export class CampaignService {
  static list(organizationId: number): Promise<Array<Record<string, unknown>>> {
    return CampaignRepository.list(organizationId)
  }

  static async get(organizationId: number, id: number) {
    const campaign = await CampaignRepository.findById(organizationId, id)
    if (!campaign) throw new NotFoundError('Campaign not found')
    return campaign
  }

  static async create(
    organizationId: number,
    userId: number,
    input: {
      campaignName: string
      provider: MarketingProvider
      campaignType: string
      audience: string
      scheduleAt?: Date | null
      status?: CampaignStatus
    },
  ) {
    const campaign = await CampaignRepository.create({
      organizationId,
      campaignName: input.campaignName.trim(),
      provider: input.provider,
      campaignType: input.campaignType.trim(),
      audience: input.audience.trim(),
      scheduleAt: input.scheduleAt ?? null,
      status: input.status || (input.scheduleAt ? 'scheduled' : 'draft'),
      statistics: { sent: 0 },
      createdBy: userId,
    })

    await logMarketingActivity({
      organizationId,
      module: 'campaigns',
      action: 'created',
      description: `Created campaign "${campaign.campaignName}"`,
      performedBy: userId,
    })

    return campaign
  }

  static async update(
    organizationId: number,
    id: number,
    userId: number,
    data: Partial<{
      campaignName: string
      campaignType: string
      audience: string
      scheduleAt: Date | null
      status: CampaignStatus
      statistics: Record<string, unknown>
    }>,
  ) {
    const campaign = await this.get(organizationId, id)
    Object.assign(campaign, data)
    await campaign.save()

    await logMarketingActivity({
      organizationId,
      module: 'campaigns',
      action: 'updated',
      description: `Updated campaign #${id}`,
      performedBy: userId,
    })

    return campaign
  }

  static async setStatus(
    organizationId: number,
    id: number,
    userId: number,
    status: CampaignStatus,
  ) {
    const allowed: CampaignStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled']
    if (!allowed.includes(status)) throw new AppError('Invalid campaign status', 400)
    return this.update(organizationId, id, userId, { status })
  }

  static async remove(organizationId: number, id: number, userId: number) {
    const campaign = await this.get(organizationId, id)
    await campaign.deleteOne()
    await logMarketingActivity({
      organizationId,
      module: 'campaigns',
      action: 'deleted',
      description: `Deleted campaign "${campaign.campaignName}"`,
      performedBy: userId,
    })
    return { id }
  }
}
