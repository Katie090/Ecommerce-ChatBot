import { useState } from 'react'

export default function ChatInput({ onSend, onEscalate }: { onSend: (text: string) => void; onEscalate?: () => void }) {
  const [value, setValue] = useState('')

  const submit = () => {
    const text = value.trim()
    if (!text) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="flex items-center gap-2 p-2 border-t border-gray-800 bg-gray-900">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Ask about orders, refunds, returns, delivery..."
        className="flex-1 rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      {onEscalate && (
        <button
          onClick={onEscalate}
          className="rounded-md border border-amber-600 bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
        >
          Escalate to Agent
        </button>
      )}
      <button onClick={submit} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">Send</button>
    </div>
  )
}
