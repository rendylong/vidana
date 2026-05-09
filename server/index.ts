import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import express, { type NextFunction, type Request, type Response } from 'express'

type VercelStyleHandler = (req: Request, res: Response) => unknown | Promise<unknown>

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

dotenv.config({ path: path.join(rootDir, '.env.production') })
dotenv.config({ path: path.join(rootDir, '.env.local') })

const [
  { default: analyzeHandler },
  { default: benchmarkHandler },
  { default: uploadHandler },
  { default: videoHandler },
  { default: apiKeysHandler },
  { default: apiKeyByIdHandler },
  { default: feishuAuthHandler },
  { default: authCallbackHandler },
  { default: authMeHandler },
  { default: adminLoginHandler },
  { default: adminLogoutHandler },
  { default: adminMeHandler },
  { default: adminDashboardHandler },
  { default: adminUsersHandler },
  { default: adminUserByIdHandler },
  { default: adminUserCreditsHandler },
  { default: adminAnalysisByIdHandler },
  { default: historyHandler },
  { default: historyByIdHandler },
  { default: publicAnalyzeHandler },
  { default: publicAnalysisByIdHandler },
] = await Promise.all([
  import('../api/analyze'),
  import('../api/benchmark'),
  import('../api/upload'),
  import('../api/video'),
  import('../api/api-keys'),
  import('../api/api-keys/[id]'),
  import('../api/auth/feishu'),
  import('../api/auth/callback'),
  import('../api/auth/me'),
  import('../api/admin/login'),
  import('../api/admin/logout'),
  import('../api/admin/me'),
  import('../api/admin/dashboard'),
  import('../api/admin/users'),
  import('../api/admin/users/[id]'),
  import('../api/admin/users/[id]/credits'),
  import('../api/admin/analyses/[id]'),
  import('../api/history'),
  import('../api/history/[id]'),
  import('../api/public/analyze'),
  import('../api/public/analyses/[id]'),
])

const app = express()
const port = Number(process.env.PORT || 5174)
const host = process.env.HOST || '127.0.0.1'

app.disable('x-powered-by')
app.set('trust proxy', true)

app.use(cookieParser())

function adapt(handler: VercelStyleHandler): express.RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res)
    } catch (error) {
      next(error)
    }
  }
}

function apiJsonBody(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/api/public/analyze') return next()
  return express.json({ limit: '70mb' })(req, res, next)
}

function noBuffer(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Accel-Buffering', 'no')
  next()
}

function withQueryParam(name: string): express.RequestHandler {
  return (req, _res, next) => {
    Object.defineProperty(req, 'query', {
      value: { ...req.query, [name]: req.params[name] },
      configurable: true,
    })
    next()
  }
}

app.use('/api', apiJsonBody)

app.post('/api/analyze', noBuffer, adapt(analyzeHandler as VercelStyleHandler))
app.post('/api/benchmark', noBuffer, adapt(benchmarkHandler as VercelStyleHandler))
app.post('/api/upload', adapt(uploadHandler as VercelStyleHandler))
app.get('/api/video', adapt(videoHandler as VercelStyleHandler))
app.head('/api/video', adapt(videoHandler as VercelStyleHandler))

app.get('/api/auth/feishu', adapt(feishuAuthHandler as VercelStyleHandler))
app.get('/api/auth/callback', adapt(authCallbackHandler as VercelStyleHandler))
app.get('/api/auth/me', adapt(authMeHandler as VercelStyleHandler))

app.post('/api/admin/login', adapt(adminLoginHandler as VercelStyleHandler))
app.post('/api/admin/logout', adapt(adminLogoutHandler as VercelStyleHandler))
app.get('/api/admin/me', adapt(adminMeHandler as VercelStyleHandler))
app.get('/api/admin/dashboard', adapt(adminDashboardHandler as VercelStyleHandler))
app.get('/api/admin/users', adapt(adminUsersHandler as VercelStyleHandler))
app.get('/api/admin/users/:id', withQueryParam('id'), adapt(adminUserByIdHandler as VercelStyleHandler))
app.post('/api/admin/users/:id/credits', withQueryParam('id'), adapt(adminUserCreditsHandler as VercelStyleHandler))
app.get('/api/admin/analyses/:id', withQueryParam('id'), adapt(adminAnalysisByIdHandler as VercelStyleHandler))

app.get('/api/history', adapt(historyHandler as VercelStyleHandler))
app.get('/api/history/:id', withQueryParam('id'), adapt(historyByIdHandler as VercelStyleHandler))
app.delete('/api/history/:id', withQueryParam('id'), adapt(historyByIdHandler as VercelStyleHandler))

app.get('/api/api-keys', adapt(apiKeysHandler as VercelStyleHandler))
app.post('/api/api-keys', adapt(apiKeysHandler as VercelStyleHandler))
app.put('/api/api-keys/:id', withQueryParam('id'), adapt(apiKeyByIdHandler as VercelStyleHandler))
app.patch('/api/api-keys/:id', withQueryParam('id'), adapt(apiKeyByIdHandler as VercelStyleHandler))
app.delete('/api/api-keys/:id', withQueryParam('id'), adapt(apiKeyByIdHandler as VercelStyleHandler))

app.post('/api/public/analyze', noBuffer, adapt(publicAnalyzeHandler as VercelStyleHandler))
app.get('/api/public/analyses/:id', withQueryParam('id'), adapt(publicAnalysisByIdHandler as VercelStyleHandler))

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    maxAge: '1h',
  }))

  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  app.use((_req, res) => {
    res.status(503).send('Ovidly frontend is not built. Run npm run build before starting the production server.')
  })
}

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', error)
  if (res.headersSent) return next(error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, host, () => {
  console.log(`Ovidly server listening on http://${host}:${port}`)
})
