import { User } from '../models/User'
import { Role } from '../models/Role'
import { Organization } from '../models/Organization'
import { LeadSource } from '../models/LeadSource'
import {
  createOrganizationForSignup,
  getOrganizationById,
  serializeOrganization,
} from './organization.service'
import { serializeUser } from './user.service'
import { comparePassword, hashPassword } from '../utils/password'
import { signAccessToken } from '../utils/jwt'
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors'

export interface RegisterInput {
  organizationName: string
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
}

export interface LoginInput {
  email: string
  password: string
}

export async function registerUser(input: RegisterInput) {
  const email = input.email.toLowerCase().trim()

  const existingUser = await User.findOne({ email })
  if (existingUser) {
    throw new ConflictError('An account with this email already exists')
  }

  let organization = await createOrganizationForSignup({
    organizationName: input.organizationName,
    email,
    phone: input.phone,
  })

  try {
    const adminRole = await Role.findOne({
      organizationId: organization._id,
      name: 'admin',
    })

    if (!adminRole) {
      throw new AppError('Failed to provision organization roles', 500)
    }

    const passwordHash = await hashPassword(input.password)
    const user = await User.create({
      organizationId: organization._id,
      roleId: adminRole._id,
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || null,
      isActive: true,
      lastLoginAt: new Date(),
    })

    const accessToken = signAccessToken({
      userId: user._id,
      organizationId: organization._id,
      roleId: adminRole._id,
      email: user.email,
    })

    return {
      user: await serializeUser(user),
      accessToken,
      organization: serializeOrganization(organization),
    }
  } catch (error) {
    await LeadSource.deleteMany({ organizationId: organization._id })
    await Role.deleteMany({ organizationId: organization._id })
    await Organization.deleteOne({ _id: organization._id })
    throw error
  }
}

export async function loginUser(input: LoginInput) {
  const email = input.email.toLowerCase().trim()
  const user = await User.findOne({ email }).select('+passwordHash')

  if (!user || !(await comparePassword(input.password, user.passwordHash))) {
    throw new UnauthorizedError('Invalid email or password')
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Your account has been deactivated')
  }

  const organization = await getOrganizationById(user.organizationId)
  if (!organization.isActive) {
    throw new UnauthorizedError('Your organization has been deactivated')
  }

  user.lastLoginAt = new Date()
  await user.save()

  const accessToken = signAccessToken({
    userId: user._id,
    organizationId: user.organizationId,
    roleId: user.roleId,
    email: user.email,
  })

  return {
    user: await serializeUser(user),
    accessToken,
    organization: serializeOrganization(organization),
  }
}

export async function getAuthenticatedUser(userId: number, organizationId: number) {
  const user = await User.findOne({ _id: userId, organizationId })
  if (!user) {
    throw new UnauthorizedError('User not found')
  }
  return serializeUser(user)
}
