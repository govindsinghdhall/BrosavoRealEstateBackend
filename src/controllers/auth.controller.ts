import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getAuthenticatedUser, loginUser, registerUser } from '../services/auth.service'
import { success } from '../utils/response'

const registerSchema = z.object({
  organizationName: z.string().min(1, 'Organization name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body)
    const result = await registerUser(input)
    return success(
      res,
      { user: result.user, accessToken: result.accessToken },
      'Account created successfully',
      201,
    )
  } catch (error) {
    next(error)
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body)
    const result = await loginUser(input)
    return success(res, { user: result.user, accessToken: result.accessToken }, 'Login successful')
  } catch (error) {
    next(error)
  }
}

export async function logout(_req: Request, res: Response) {
  return success(res, null, 'Logged out successfully')
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    return success(res, { userId: req.auth.userId })
  } catch (error) {
    next(error)
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const user = await getAuthenticatedUser(req.auth.userId, req.auth.organizationId)
    return success(res, user)
  } catch (error) {
    next(error)
  }
}
