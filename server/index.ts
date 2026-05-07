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
  { default: historyHandler },
  { default: historyByIdHandler },
  { default: publicAnalyzeHandler },
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
  import('../api/history'),
  import('../api/history/[id]'),
  import('../api/public/analyze'),
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

app.use('/api', apiJsonBody)

app.post('/api/analyze', noBuffer, adapt(analyzeHandler as VercelStyleHandler))
app.post('/api/benchmark', noBuffer, adapt(benchmarkHandler as VercelStyleHandler))
app.post('/api/upload', adapt(uploadHandler as VercelStyleHandler))
app.get('/api/video', adapt(videoHandler as VercelStyleHandler))
app.head('/api/video', adapt(videoHandler as VercelStyleHandler))

app.get('/api/auth/feishu', adapt(feishuAuthHandler as VercelStyleHandler))
app.get('/api/auth/callback', adapt(authCallbackHandler as VercelStyleHandler))
app.get('/api/auth/me', adapt(authMeHandler as VercelStyleHandler))

app.get('/api/history', adapt(historyHandler as VercelStyleHandler))
app.get('/api/history/:id', (req, _res, next) => {
  req.query.id = req.params.id
  next()
}, adapt(historyByIdHandler as VercelStyleHandler))
app.delete('/api/history/:id', (req, _res, next) => {
  req.query.id = req.params.id
  next()
}, adapt(historyByIdHandler as VercelStyleHandler))

app.get('/api/api-keys', adapt(apiKeysHandler as VercelStyleHandler))
app.post('/api/api-keys', adapt(apiKeysHandler as VercelStyleHandler))
app.put('/api/api-keys/:id', (req, _res, next) => {
  req.query.id = req.params.id
  next()
}, adapt(apiKeyByIdHandler as VercelStyleHandler))
app.patch('/api/api-keys/:id', (req, _res, next) => {
  req.query.id = req.params.id
  next()
}, adapt(apiKeyByIdHandler as VercelStyleHandler))
app.delete('/api/api-keys/:id', (req, _res, next) => {
  req.query.id = req.params.id
  next()
}, adapt(apiKeyByIdHandler as VercelStyleHandler))

app.post('/api/public/analyze', noBuffer, adapt(publicAnalyzeHandler as VercelStyleHandler))

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
    res.status(503).send('Vidana frontend is not built. Run npm run build before starting the production server.')
  })
}

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', error)
  if (res.headersSent) return next(error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, host, () => {
  console.log(`Vidana server listening on http://${host}:${port}`)
})
