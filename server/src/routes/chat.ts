import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { embedText, generateAssistantReply } from '../lib/githubModels'
import { z } from 'zod'
import fetch from 'node-fetch'

const router = Router()

async function getDbRecommendations(): Promise<{ sku: string; title: string; blurb: string; price_cents: number }[]> {
  try {
    const { data } = await supabaseAdmin.from('products').select('sku, title, blurb, price_cents').limit(3)
    return (data as any[]) || []
  } catch {
    return []
  }
}

function getHeuristicRecommendations(order: any | null): { title: string; blurb: string }[] {
  if (!order) return []
  const recs: { title: string; blurb: string }[] = []
  const base = String(order.id || '')
  const status = String(order.status || 'processing')
  // Very simple demo logic; replace with real catalog logic later
  if (base.includes('100') || status === 'in_transit') {
    recs.push({ title: 'Premium Protection Plan', blurb: 'Covers accidental damage for 2 years.' })
  }
  if (base.includes('200') || status === 'processing') {
    recs.push({ title: 'Fast Charger (USB-C 30W)', blurb: 'Charges compatible devices up to 2x faster.' })
  }
  if (base.includes('300') || status === 'delivered') {
    recs.push({ title: 'Bundle: Case + Screen Guard', blurb: 'Save 15% when bundled together.' })
  }
  if (recs.length === 0) {
    recs.push({ title: 'Popular Add‑on: Extended Warranty', blurb: 'Extra peace of mind for a small price.' })
  }
  return recs.slice(0, 3)
}

const ChatRequestSchema = z.object({
  userId: z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : undefined), z.string().uuid().optional()),
  message: z.string().transform(s => s.trim()).pipe(z.string().min(1)),
  orderId: z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : undefined), z.string().optional())
    .transform(s => (s && s.length > 0 ? s : undefined)),
  conversationId: z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : undefined), z.string().uuid().optional()),
})

router.post('/', async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    console.warn('Invalid /api/chat body:', req.body)
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() })
  }
  const { userId, message, orderId, conversationId } = parsed.data

  // Ensure user exists if a userId is provided
  if (userId) {
    try {
      const { data: existing, error: findErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
      if (!existing && !findErr) {
        await supabaseAdmin.from('users').insert({ id: userId, email: null })
      }
    } catch (e) {
      console.error('ensure user failed', e)
    }
  }

  let orderContext: any = null
  if (orderId) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()
    if (error) {
      console.error(error)
    } else {
      orderContext = data
    }
    if (!orderContext) {
      try {
        const resp = await fetch(`http://localhost:${process.env.PORT || 8080}/api/order/${encodeURIComponent(orderId)}`)
        if (resp.ok) {
          orderContext = await resp.json()
        }
      } catch (e) {
        console.error('order mock fetch failed', e)
      }
    }
  }

  // Try to extract orderId from the message if not provided
  let extractedOrderId: string | undefined
  if (!orderId) {
    const m = /\b(ORDER[-_]?\d{3,})\b/i.exec(message)
    if (m) extractedOrderId = m[1].toUpperCase().replace('_', '-')
  }
  if (!orderId && extractedOrderId && !orderContext) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', extractedOrderId)
      .maybeSingle()
    if (!error && data) orderContext = data
  }

  // When no orderId is provided, suggest user's recent orders if any
  let suggestionText: string | null = null
  if (!orderId && userId) {
    try {
      const { data: orders, error: ordersErr } = await supabaseAdmin
        .from('orders')
        .select('id, status, delivery_eta, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (!ordersErr && orders && orders.length > 0) {
        const list = orders
          .map((o, i) => `${i + 1}. ${o.id} — ${o.status}${o.delivery_eta ? ` (ETA: ${o.delivery_eta})` : ''}`)
          .join('\n')
        suggestionText = `I found your recent orders:\n${list}\n\nPlease reply with the Order ID you want me to check.`
      }
    } catch (e) {
      console.error('orders lookup failed', e)
    }
  }

  // Decide if we should escalate (missing context or sensitive topic)
  const lower = message.toLowerCase()
  const isSensitive = lower.includes('credit card') || lower.includes('password') || lower.includes('ssn')
  const shouldEscalate = isSensitive || (!!orderId && !orderContext)

  let assistant = 'Thanks for reaching out. '
  try {
    if (shouldEscalate) {
      assistant += 'I am escalating this to a human agent for secure assistance.'
    } else {
      if (suggestionText) {
        assistant = suggestionText
      } else {
        const policy = [
          'You are a compassionate customer support assistant.',
          'Tone: very warm, human, and reassuring. Lead with empathy in the first sentence.',
          'Acknowledge feelings explicitly: e.g., "I completely understand how frustrating this is" or "I’m really sorry for the inconvenience".',
          'Keep responses short: 1–3 short sentences max.',
          'Focus on next steps or concrete info. Avoid blame. Never overpromise.',
          'If data is missing or sensitive, offer a safe next step or escalate politely.',
        ].join(' ')
        // FAQ similarity search
        let faqContext = ''
        try {
          const qEmb = await embedText(message)
          if (qEmb) {
            const { data: matches } = await supabaseAdmin.rpc('match_faqs', {
              query_embedding: qEmb as unknown as number[],
              match_count: 1
            })
            if (matches && matches.length > 0) {
              const top = matches[0] as any
              faqContext = `Relevant FAQ:\nQ: ${top.question}\nA: ${top.answer}`
            }
          }
        } catch (e) {
          console.error('faq search failed', e)
        }
        const contextParts = [] as string[]
        if (orderContext) contextParts.push(`Order: ${JSON.stringify(orderContext)}`)
        if (faqContext) contextParts.push(faqContext)
        const recs = getHeuristicRecommendations(orderContext)
        const recText = recs.length
          ? `\n\nYou might also like:\n${recs.map(r => `• ${r.title} — ${r.blurb}`).join('\n')}`
          : ''
        const context = (contextParts.join('\n\n') || 'No order context.') + recText
        const generated = await generateAssistantReply(message, context, policy)
        // If model failed or returned a generic error, build a heuristic reply
        const failurePhrases = [
          'Sorry, our AI assistant is temporarily unavailable.',
          'Sorry, I could not generate a response at the moment.'
        ]
        const failed = !generated || generated.trim() === '' || failurePhrases.some(p => generated.includes(p))
        if (failed) {
          if (orderContext) {
            const eta = orderContext.delivery_eta ? ` with an estimated delivery on ${orderContext.delivery_eta}` : ''
            const recs = getHeuristicRecommendations(orderContext)
            const recText = recs.length ? `\n\nYou might also like:\n${recs.map(r => `• ${r.title} — ${r.blurb}`).join('\n')}` : ''
            assistant = `I completely understand how important this is. Order ${orderContext.id} is ${orderContext.status}${eta}. I’m here to help with anything else you need.${recText}`
          } else {
            assistant = 'I’m really sorry for the hiccup. If you share your Order ID or what you need, I’ll jump on it right away.'
          }
        } else {
          assistant = generated
        }
      }
    }
  } catch (e) {
    console.error('assistant error', e)
    if (orderContext) {
      const eta = orderContext.delivery_eta ? ` with an estimated delivery on ${orderContext.delivery_eta}` : ''
      const recs = getHeuristicRecommendations(orderContext)
      const recText = recs.length ? `\n\nYou might also like:\n${recs.map(r => `• ${r.title} — ${r.blurb}`).join('\n')}` : ''
      assistant = `I completely understand the concern. Order ${orderContext.id} is ${orderContext.status}${eta}. I’m here if you need anything else.${recText}`
    } else if (suggestionText) {
      assistant = suggestionText
    } else {
      assistant = 'I’m really sorry for the delay. If you share your Order ID, I’ll look into it right away.'
    }
  }

  let convId = conversationId
  if (!convId) {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .insert({ user_id: userId ?? null, escalated: shouldEscalate })
      .select('id')
      .single()
    convId = conv?.id as string | undefined
  } else if (shouldEscalate) {
    await supabaseAdmin.from('conversations').update({ escalated: true }).eq('id', convId)
  }

  if (convId) {
    const { error: insertErr } = await supabaseAdmin.from('messages').insert([
      { conversation_id: convId, role: 'user', content: message },
      { conversation_id: convId, role: 'assistant', content: assistant }
    ])
    if (insertErr) console.error('message insert failed', insertErr)
  }

  // Fetch simple DB-backed recommendations to render as buttons on the client
  const dbRecs = await getDbRecommendations()

  res.json({ reply: assistant, escalated: shouldEscalate, conversationId: convId, suggestions: dbRecs })
})

// Create a conversation with an initial assistant (proactive) message
router.post('/proactive', async (req, res) => {
  const { userId, message } = req.body || {}
  if (!userId || !message) return res.status(400).json({ error: 'userId and message required' })
  try {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({ user_id: userId, escalated: false })
      .select('id')
      .single()
    if (convErr) return res.status(500).json({ error: convErr.message })
    const { error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({ conversation_id: conv.id, role: 'assistant', content: message })
    if (msgErr) return res.status(500).json({ error: msgErr.message })
    res.json({ conversationId: conv.id })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'failed to create proactive conversation' })
  }
})

// Fetch message history for a conversation
router.get('/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ messages: data })
})

// Escalate an existing conversation
router.post('/:conversationId/escalate', async (req, res) => {
  const { conversationId } = req.params
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ escalated: true })
    .eq('id', conversationId)
  if (error) return res.status(500).json({ error: error.message })
  await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: 'I have escalated your request to a human agent. We will follow up shortly.'
  })
  res.json({ ok: true })
})

export default router
