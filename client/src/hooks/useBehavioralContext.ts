import { useCallback, useEffect, useRef } from 'react'

export function useBehavioralContext(userId: string | null | undefined) {
  const sessionIdRef = useRef<string>(() => {
    const key = 'sessionId'
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
    return id
  }) as any

  const sessionId = sessionIdRef.current as string

  const log = useCallback(async (eventType: string, eventPayload?: any) => {
    if (!userId) return
    try {
      await fetch('/api/behavior/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId, eventType, eventPayload })
      })
    } catch {}
  }, [userId, sessionId])

  // Time on page
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const ms = Date.now() - start
      // sample every 30s
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      log('time_spent', { ms })
    }, 30000)
    return () => clearInterval(timer)
  }, [log])

  // Scroll depth
  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const percent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      log('scroll_depth', { percent })
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [log])

  // Exit intent
  useEffect(() => {
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        log('exit_intent')
      }
    }
    window.addEventListener('mousemove', onLeave)
    return () => window.removeEventListener('mousemove', onLeave)
  }, [log])

  const recordCartAdd = useCallback(() => log('cart_add'), [log])
  const recordCartRemove = useCallback(() => log('cart_remove'), [log])
  const recordSizeGuide = useCallback(() => log('size_guide_open'), [log])

  const evaluate = useCallback(async () => {
    if (!userId) return null
    try {
      const resp = await fetch('/api/behavior/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId })
      })
      if (!resp.ok) return null
      return await resp.json()
    } catch {
      return null
    }
  }, [userId, sessionId])

  const recordEngagement = useCallback(async (promptId: string, engaged: boolean) => {
    try {
      await fetch('/api/behavior/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, engaged })
      })
    } catch {}
  }, [])

  return {
    recordCartAdd,
    recordCartRemove,
    recordSizeGuide,
    evaluate,
    recordEngagement,
  }
}



