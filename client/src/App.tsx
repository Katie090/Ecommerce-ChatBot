import { Link, Route, Routes, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Chat from './pages/Chat'
import Admin from './pages/Admin'

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark')

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-blue-600" />
          <strong className="text-lg">E-commerce Support</strong>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link className="rounded px-3 py-1.5 hover:bg-gray-800" to="/chat">Chat</Link>
          <Link className="rounded px-3 py-1.5 hover:bg-gray-800" to="/admin">Admin</Link>
          <button
            className="ml-2 rounded border border-gray-700 px-3 py-1.5 hover:bg-gray-800"
            onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  )
}
