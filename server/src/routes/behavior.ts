import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { generateAssistantReply } from '../lib/githubModels'

const router = Router()

async function ensureUser(userId: string) {
  try {
    const { data } = await supabaseAdmin.from('users').select('id').eq('id', userId).maybeSingle()
    if (!data) {
      await supabaseAdmin.from('users').insert({ id: userId, email: null })
    }
  } catch (e) {
    // ignore
  }
}

// Log a behavior event
router.post('/log', async (req, res) => {
  const { userId, sessionId, eventType, eventPayload } = req.body || {}
  if (!userId || !eventType) return res.status(400).json({ error: 'userId and eventType are required' })
  await ensureUser(userId)
  const { error } = await supabaseAdmin.from('user_behavior').insert({
    user_id: userId,
    session_id: sessionId ?? null,
    event_type: eventType,
    event_payload: eventPayload ?? null,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// Evaluate recent behavior and possibly generate a proactive prompt
router.post('/evaluate', async (req, res) => {
  const { userId, sessionId, force } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId required' })
  await ensureUser(userId)

  // Fetch last 10 minutes of events for this session/user
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: events, error } = await supabaseAdmin
    .from('user_behavior')
    .select('event_type, event_payload, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return res.status(500).json({ error: error.message })

  // Simple rule-based classification
  const safe = Array.isArray(events) ? events : []
  const adds = safe.filter(e => e.event_type === 'cart_add').length
  const removes = safe.filter(e => e.event_type === 'cart_remove').length
  const timeSpentMs = safe.filter(e => e.event_type === 'time_spent').reduce((acc, e) => acc + (e.event_payload?.ms ?? 0), 0)
  const scrolledBottom = !!safe.find(e => e.event_type === 'scroll_depth' && (e.event_payload?.percent ?? 0) >= 95)
  const addRemoveCount = adds + removes

  let classification: string | null = null
  if (addRemoveCount >= 3 && timeSpentMs >= 3 * 60 * 1000) {
    classification = 'Anxious Browser'
  } else if (scrolledBottom && adds === 0) {
    classification = 'Hesitant Buyer'
  }

  if (!classification && !force) return res.json({ shouldPrompt: false })

  let effectiveClassification = classification || 'Proactive Greeting'
  let prompt: string
  if (!classification && force) {
    // Default welcome with gentle guidance toward ordering
    prompt = 'I completely understand it can be hard to choose. Would you like help finding the right item or placing an order?'
  } else {
    const behaviorSummary = JSON.stringify({ adds, removes, timeSpentMs, scrolledBottom, classification })
    const policy = 'Write a very short, warm, proactive message (<=2 sentences) that reassures and guides next step.'
    const message = `Generate a short, friendly proactive message for a customer showing this behavioral context: ${behaviorSummary}`
    prompt = await generateAssistantReply(message, '', policy)
  }

  // Store prompt
  const { data: row, error: insErr } = await supabaseAdmin
    .from('proactive_prompts')
    .insert({ user_id: userId, session_id: sessionId ?? null, classification: effectiveClassification, prompt })
    .select('id, prompt, classification')
    .single()
  if (insErr) return res.status(500).json({ error: insErr.message })

  res.json({ shouldPrompt: true, promptId: row.id, prompt: row.prompt, classification: row.classification })
})

// Record engagement (click/reply) for a proactive prompt
router.post('/engagement', async (req, res) => {
  const { promptId, engaged } = req.body || {}
  if (!promptId || typeof engaged !== 'boolean') return res.status(400).json({ error: 'promptId and engaged required' })
  const { error } = await supabaseAdmin.from('proactive_prompts').update({ engaged }).eq('id', promptId)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router


