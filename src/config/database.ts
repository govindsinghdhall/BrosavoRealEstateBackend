import mongoose from 'mongoose'
import { env } from './env'
import { Organization } from '../models/Organization'
import { ensureWebsiteApiKeys } from '../scripts/ensureWebsiteApiKeys'

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true)

  await mongoose.connect(env.MONGODB_URI)
  console.log(`MongoDB connected: ${mongoose.connection.name}`)

  await ensureWebsiteApiKeys()
  await Organization.syncIndexes()
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
}
