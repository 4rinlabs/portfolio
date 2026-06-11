'use client'

import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  duration?: number
}

export function Toast({ message, type = 'success', duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(t)
  }, [duration])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        padding: '14px 20px',
        borderRadius: '10px',
        background: type === 'success' ? '#0a0a0a' : '#1a0a0a',
        border: `1px solid ${type === 'success' ? 'rgba(127,255,0,0.4)' : 'rgba(255,80,80,0.4)'}`,
        color: type === 'success' ? '#7fff00' : 'rgba(255,100,100,0.9)',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'slideInToast 0.25s ease',
        maxWidth: '320px',
      }}
    >
      {type === 'success' ? '✓ ' : '✕ '}{message}
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
