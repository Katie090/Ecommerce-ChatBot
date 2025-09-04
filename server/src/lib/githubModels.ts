import fetch from 'node-fetch'

const baseUrl = process.env.GITHUB_MODELS_BASE_URL || 'https://models.inference.ai.azure.com'
const apiKey = process.env.GITHUB_MODELS_API_KEY
const modelId = process.env.GITHUB_MODELS_MODEL_ID || 'gpt-5'

export async function generateAssistantReply(userMessage: string, context: string, policy: string): Promise<string> {
  if (!apiKey) {
    return 'Sorry, our AI assistant is temporarily unavailable.'
  }
  const system = `${policy}\nContext: ${context}`
  const body = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.3,
    max_tokens: 300
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const resp = await fetch(`${baseUrl}/openai/deployments/${modelId}/chat/completions?api-version=2024-05-01-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey as string
    },
    body: JSON.stringify(body),
    signal: controller.signal
  })
  clearTimeout(timeout)
  if (!resp.ok) {
    const text = await resp.text()
    console.error('GitHub Models error', resp.status, text)
    return 'Sorry, I could not generate a response at the moment.'
  }
  const json: any = await resp.json()
  const content = json?.choices?.[0]?.message?.content
  return content || 'How can I help you with your order today?'
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!apiKey) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(`${baseUrl}/openai/deployments/text-embedding-3-small/embeddings?api-version=2024-05-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey as string
      },
      body: JSON.stringify({ input: text }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!resp.ok) return null
    const json: any = await resp.json()
    const vec = json?.data?.[0]?.embedding
    return Array.isArray(vec) ? vec : null
  } catch {
    return null
  }
}
