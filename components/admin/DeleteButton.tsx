'use client'

import { useTransition } from 'react'

interface DeleteButtonProps {
  action: (formData: FormData) => Promise<void>
  id: string
  label?: string
  confirmMessage?: string
}

export function DeleteButton({
  action,
  id,
  label = 'Delete',
  confirmMessage = 'Are you sure? This cannot be undone.',
}: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!confirm(confirmMessage)) return
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await action(fd)
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: '6px 14px',
          background: 'rgba(255,50,50,0.08)',
          border: '1px solid rgba(255,50,50,0.25)',
          borderRadius: '8px',
          color: 'rgba(255,100,100,0.8)',
          fontSize: '11px',
          fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? '…' : label}
      </button>
    </form>
  )
}
