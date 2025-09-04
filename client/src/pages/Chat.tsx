import { useEffect, useState } from 'react'
import MessageList from '../components/MessageList'
import ChatInput from '../components/ChatInput'
import { useBehavioralContext } from '../hooks/useBehavioralContext'

export default function Chat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [orderId, setOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(() => {
    return localStorage.getItem('conversationId')
  })
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '')

  useEffect(() => {
    let cancelled = false
    const ensure = async () => {
      if (userId) return
      try {
        const resp = await fetch('/api/identify', { credentials: 'include' })
        const json = await resp.json()
        if (!cancelled && json.userId) {
          localStorage.setItem('userId', json.userId)
          setUserId(json.userId)
        }
      } catch {}
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ensure()
    return () => { cancelled = true }
  }, [userId])
  const [error, setError] = useState<string | null>(null)
  const [proactive, setProactive] = useState<{ id: string; text: string } | null>(null)
  const [showReplyModal, setShowReplyModal] = useState(false)
  const [replyInput, setReplyInput] = useState('')
  const [showChat, setShowChat] = useState<boolean>(false)
  const [showLauncher, setShowLauncher] = useState<boolean>(false)
  const behavior = useBehavioralContext(userId)

  // Load existing messages if conversationId exists
  async function loadMessagesIfAny(id: string) {
    try {
      const resp = await fetch(`/api/chat/${id}/messages`)
      if (resp.ok) {
        const json = await resp.json()
        const msgs = (json.messages as { role: 'user' | 'assistant'; content: string }[]) || []
        setMessages(msgs)
      }
    } catch {}
  }

  useEffect(() => {
    if (conversationId) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      loadMessagesIfAny(conversationId)
    }
    // run once on mount and when conversationId changes
  }, [conversationId])

  // Periodically evaluate behavior and possibly show a proactive prompt
  useEffect(() => {
    let canceled = false
    const tick = async () => {
      const r = await behavior.evaluate()
      if (!canceled && r?.shouldPrompt && r.prompt) {
        setProactive({ id: r.promptId, text: r.prompt })
        if (showChat) {
          setMessages(prev => [...prev, { role: 'assistant', content: r.prompt }])
        }
      }
    }
    const iv = setInterval(() => { void tick() }, 20000)
    return () => { canceled = true; clearInterval(iv) }
  }, [behavior, showChat])

  // Initiate proactive greeting on first load
  useEffect(() => {
    let canceled = false
    const greet = async () => {
      const r = await fetch('/api/behavior/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId: sessionStorage.getItem('sessionId'), force: true })
      }).then(res => res.ok ? res.json() : null).catch(() => null)
      if (!canceled && r?.shouldPrompt && r.prompt) {
        setProactive({ id: r.promptId, text: r.prompt })
        if (showChat) {
          setMessages(prev => [...prev, { role: 'assistant', content: r.prompt }])
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    greet()
    return () => { canceled = true }
  }, [userId, showChat])

  const sendMessage = async (text: string) => {
    const userMsg = { role: 'user' as const, content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setError(null)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, orderId, conversationId, userId }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      if (!resp.ok) {
        const t = await resp.text()
        setError(`Request failed (${resp.status}): ${t}`)
        return
      }
      const json = await resp.json()
      if (json.conversationId && json.conversationId !== conversationId) {
        setConversationId(json.conversationId)
        localStorage.setItem('conversationId', json.conversationId)
      }
      if (json.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: json.reply }])
      }
    } catch (e: any) {
      setError(e?.name === 'AbortError' ? 'Request timed out' : (e?.message || 'Request failed'))
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I’m having trouble responding right now. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const escalate = () => {
    if (!conversationId) return
    fetch(`/api/chat/${conversationId}/escalate`, { method: 'POST' })
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: 'I have escalated your request to a human agent. We will get back shortly.' }
    ])
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-60px)] max-w-3xl flex-col gap-3 p-4">
      {showChat && (
        <div className="flex items-center gap-2">
          <input
            value={orderId}
            onChange={e => setOrderId(e.target.value)}
            placeholder="Order ID (optional)"
            className="flex-1 rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">Lookup</button>
        </div>
      )}

      {!showChat && proactive && (
        <div className="fixed bottom-4 right-4 z-20 w-[320px] rounded-lg border border-emerald-700 bg-emerald-900/30 p-3 text-sm text-emerald-200 shadow-xl">
          <div className="mb-2 flex items-center gap-2 font-medium text-emerald-100">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700">🤖</div>
            <span>Suggestion</span>
          </div>
          <div className="mb-3 whitespace-pre-wrap">{proactive.text}</div>
          <div className="flex gap-2">
            <button
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
              onClick={() => {
                behavior.recordEngagement(proactive.id, true)
                setShowChat(true)
                setShowReplyModal(true)
              }}
            >
              Reply
            </button>
            <button
              className="rounded border border-emerald-700 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-800/40"
              onClick={() => {
                behavior.recordEngagement(proactive.id, false)
                setProactive(null)
                setShowLauncher(true)
              }}
            >
              Ignore
            </button>
          </div>
        </div>
      )}

      {!showChat && showLauncher && (
        <button
          className="fixed bottom-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-xl shadow-lg hover:bg-gray-800"
          onClick={() => setShowChat(true)}
          title="Chat"
        >
          💬
        </button>
      )}

      {showChat && (
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
        {error && (
          <div className="border-b border-red-900 bg-red-950 p-2 text-sm text-red-300">{error}</div>
        )}
        {proactive && (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-emerald-700 bg-emerald-900/30 p-3 text-sm text-emerald-200 shadow">
            <div className="mb-2 flex items-center gap-2 font-medium text-emerald-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700">🤖</div>
              <span>Suggestion</span>
            </div>
            <div className="mb-3 whitespace-pre-wrap">{proactive.text}</div>
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
                onClick={() => {
                  behavior.recordEngagement(proactive.id, true)
                  setShowChat(true)
                  setShowReplyModal(true)
                }}
              >
                Reply
              </button>
              <button
                className="rounded border border-emerald-700 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-800/40"
                onClick={() => {
                  behavior.recordEngagement(proactive.id, false)
                  setProactive(null)
                  setShowLauncher(true)
                }}
              >
                Ignore
              </button>
              <button
                className="ml-auto rounded px-2 py-1 text-xs text-emerald-300 hover:underline"
                onClick={() => {
                  behavior.recordEngagement(proactive.id, false)
                  setProactive(null)
                  setShowLauncher(true)
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {showReplyModal && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-lg">
              <div className="mb-2 text-sm text-gray-300">Reply to suggestion</div>
              <textarea
                value={replyInput}
                onChange={e => setReplyInput(e.target.value)}
                rows={3}
                placeholder="Type your message..."
                className="mb-3 w-full rounded-md border border-gray-700 bg-gray-950 p-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="flex items-center gap-2">
                <button
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                  onClick={() => {
                    const text = replyInput.trim()
                    if (!text) return
                    setShowReplyModal(false)
                    setProactive(null)
                    setReplyInput('')
                    setShowChat(true)
                    void sendMessage(text)
                  }}
                >
                  Send
                </button>
                <button
                  className="ml-auto rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                  onClick={() => setShowReplyModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        <MessageList messages={messages} />
        <div className="flex items-center justify-between px-2 text-xs text-gray-400">
          {loading ? <span className="px-2 py-1">Assistant is typing…</span> : <span />}
        </div>
        <ChatInput onSend={sendMessage} onEscalate={escalate} />
      </div>
      )}
    </div>
  )
}
