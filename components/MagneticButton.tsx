'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { type ReactNode, useRef } from 'react'

type MagneticButtonProps = {
  children: ReactNode
  className?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}

export function MagneticButton({
  children,
  className = '',
  onClick,
  type = 'button',
  disabled = false,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, { stiffness: 280, damping: 18 })
  const y = useSpring(my, { stiffness: 280, damping: 18 })

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const bounds = ref.current?.getBoundingClientRect()
    if (!bounds) return
    const px = e.clientX - bounds.left - bounds.width / 2
    const py = e.clientY - bounds.top - bounds.height / 2
    mx.set(px * 0.15)
    my.set(py * 0.2)
  }

  const handleLeave = () => {
    mx.set(0)
    my.set(0)
  }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      className={className}
      onMouseMove={disabled ? undefined : handleMove}
      onMouseLeave={disabled ? undefined : handleLeave}
      onClick={onClick}
      style={{ x, y }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
    >
      {children}
    </motion.button>
  )
}
