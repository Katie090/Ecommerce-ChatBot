import { useEffect, useState } from 'react'

type Conversation = {
  id: string
  lastMessage: string
  escalated: boolean
  createdAt: string
}

export default function Admin() {
  const [items, setItems] = useState<Conversation[]>([])

  useEffect(() => {
    // TODO: fetch escalated conversations from backend
    setItems([])
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h2 className="mb-3 text-lg font-semibold">Escalated Conversations</h2>
      {items.length === 0 ? (
        <p className="text-gray-400">No escalations yet.</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {items.map(item => (
            <li key={item.id} className="flex items-start justify-between px-2 py-3">
              <div>
                <div className="font-mono text-sm text-gray-300">#{item.id}</div>
                <div className="text-gray-200">{item.lastMessage}</div>
              </div>
              <div className={item.escalated ? 'text-amber-400' : 'text-emerald-400'}>
                {item.escalated ? 'Escalated' : 'Resolved'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
