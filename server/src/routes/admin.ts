import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/escalations', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, escalated, created_at, messages(content)')
    .eq('escalated', true)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return res.status(500).json({ error: error.message })
  const items = (data ?? []).map(row => ({
    id: row.id,
    escalated: row.escalated,
    createdAt: row.created_at,
    lastMessage: row.messages?.[row.messages.length - 1]?.content ?? ''
  }))
  res.json({ items })
})

export default router

