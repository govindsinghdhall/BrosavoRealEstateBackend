import express from 'express'
import path from 'path'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { getCorsOptions } from './config/cors'
import { env } from './config/env'
import routes from './routes'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

export function createApp() {
  const app = express()

  app.use(
    helmet({
      // Default "same-origin" blocks browsers from reading cross-origin API responses.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )
  app.use(cors(getCorsOptions()))
  app.use(morgan('dev'))
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))

  app.use(
    '/uploads/marketing',
    express.static(path.resolve(process.cwd(), env.MARKETING_UPLOAD_DIR)),
  )

  app.use('/api/v1', routes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
