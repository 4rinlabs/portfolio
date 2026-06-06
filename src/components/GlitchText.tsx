import { type ElementType } from 'react'

type GlitchTextProps = {
  text: string
  as?: ElementType
  className?: string
  variant?: 'hero' | 'heading'
  /** Brighter violet edge for headings on dark backgrounds */
  tone?: 'dark' | 'light'
}

export function GlitchText({
  text,
  as: Tag = 'span',
  className = '',
  variant = 'heading',
  tone = 'dark',
}: GlitchTextProps) {
  const layer = variant === 'hero' ? 'glitch-hero' : 'glitch-heading'
  const toneClass = tone === 'light' ? 'glitch-tone-light' : ''

  return (
    <Tag className={`${layer} ${toneClass} ${className}`.trim()} data-text={text}>
      {text}
    </Tag>
  )
}
