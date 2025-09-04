import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import chatRouter from './routes/chat'
import adminRouter from './routes/admin'
import { Router } from 'express'
import { supabaseAdmin } from './lib/supabase'
import { randomUUID } from 'crypto'
import behaviorRouter from './routes/behavior'


const app = express()
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`)
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/api/chat', chatRouter)
app.use('/api/admin', adminRouter)
app.use('/api/behavior', behaviorRouter)

// Simple cart add endpoint (demo only)
app.post('/api/cart/add', async (req, res) => {
  const { userId, sku } = req.body || {}
  if (!userId || !sku) return res.status(400).json({ error: 'userId and sku required' })
  // Log behavior event for add-to-cart
  await supabaseAdmin.from('user_behavior').insert({ user_id: userId, event_type: 'cart_add', event_payload: { sku } })
  res.json({ ok: true })
})

// Mock order endpoint
const mockApi = Router()
mockApi.get('/order/:id', (req, res) => {
  const id = req.params.id
  const now = new Date()
  const eta = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  res.json({ id, status: 'in_transit', delivery_eta: eta.toISOString().slice(0, 10) })
})
app.use('/api', mockApi)

// Identify endpoint: sets a cookie and ensures a Supabase user row exists
app.get('/api/identify', async (req, res) => {
  let uid = req.cookies['uid']
  if (!uid) {
    uid = randomUUID()
    res.cookie('uid', uid, { httpOnly: false, sameSite: 'lax' })
  }
  // Ensure user exists in Supabase
  try {
    const { data, error } = await supabaseAdmin.from('users').select('id').eq('id', uid).maybeSingle()
    if (!data && !error) {
      await supabaseAdmin.from('users').insert({ id: uid, email: null })
    }
  } catch {}
  res.json({ userId: uid })
})

const port = process.env.PORT ? Number(process.env.PORT) : 8080
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
