type Message = { role: 'user' | 'assistant'; content: string }

export default function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
      {messages.map((m, idx) => (
        <div key={idx} className={`flex mb-2 ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
          <div
            className={`max-w-[75%] rounded-lg border px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${
              m.role === 'assistant'
                ? 'bg-gray-800 border-gray-700 text-gray-100'
                : 'bg-blue-600/20 border-blue-700 text-blue-100'
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}
    </div>
  )
}
