import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export const AUTOMATION_ACTIONS = [
  'auto_publish',
  'require_approval',
  'notify_admin',
  'human_review',
] as const

export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number]

export interface IGoogleBusinessAutomationRule extends Document<number> {
  organizationId: number
  locationId?: number | null
  name: string
  enabled: boolean
  minRating?: number | null
  maxRating?: number | null
  keywords?: string[]
  action: AutomationAction
  priority: number
  metadata: Record<string, unknown>
  createdBy?: number | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IGoogleBusinessAutomationRule>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true },
    locationId: { type: Number, ref: 'GoogleBusinessLocation', default: null },
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    minRating: { type: Number, min: 1, max: 5, default: null },
    maxRating: { type: Number, min: 1, max: 5, default: null },
    keywords: { type: [String], default: [] },
    action: { type: String, enum: AUTOMATION_ACTIONS, required: true },
    priority: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Number, ref: 'User', default: null },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, enabled: 1, priority: -1 })
schema.index({ organizationId: 1, locationId: 1 })

applyAutoIncrement(schema, 'GoogleBusinessAutomationRule')

export const GoogleBusinessAutomationRule = model<IGoogleBusinessAutomationRule>(
  'GoogleBusinessAutomationRule',
  schema,
)
