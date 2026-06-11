'use client'

import { useFormStatus } from 'react-dom'

interface SubmitButtonProps {
  label?: string
  loadingLabel?: string
  danger?: boolean
  full?: boolean
}

export function SubmitButton({
  label = 'Save',
  loadingLabel = 'Saving…',
  danger = false,
  full = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '11px 24px',
        background: danger
          ? 'rgba(255,50,50,0.12)'
          : pending
            ? 'rgba(127,255,0,0.5)'
            : '#7fff00',
        border: danger ? '1px solid rgba(255,80,80,0.4)' : 'none',
        borderRadius: '8px',
        color: danger ? 'rgba(255,100,100,0.9)' : '#0a0a0a',
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.7 : 1,
        width: full ? '100%' : undefined,
        transition: 'all 0.15s',
      }}
    >
      {pending ? loadingLabel : label}
    </button>
  )
}
