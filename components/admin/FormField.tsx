import type { ReactNode } from 'react'

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  color: 'rgba(255,255,255,0.5)',
  marginBottom: '6px',
}

const BASE_INPUT: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '10px 14px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'DM Sans, system-ui',
  transition: 'border-color 0.2s',
}

const ERROR_STYLE: React.CSSProperties = {
  marginTop: '5px',
  fontSize: '12px',
  color: 'rgba(255,100,100,0.9)',
}

interface FieldProps {
  label: string
  name: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}

export function FormField({ label, name, error, hint, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={name} style={LABEL}>
        {label}
        {required && <span style={{ color: '#7fff00', marginLeft: '3px' }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p style={{ ...ERROR_STYLE, color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>{hint}</p>
      )}
      {error && <p style={ERROR_STYLE}>{error}</p>}
    </div>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export function AdminInput({ error, style, ...props }: InputProps) {
  return (
    <input
      style={{
        ...BASE_INPUT,
        borderColor: error ? 'rgba(255,100,100,0.5)' : 'rgba(255,255,255,0.1)',
        ...style,
      }}
      {...props}
    />
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export function AdminTextarea({ error, style, ...props }: TextareaProps) {
  return (
    <textarea
      style={{
        ...BASE_INPUT,
        borderColor: error ? 'rgba(255,100,100,0.5)' : 'rgba(255,255,255,0.1)',
        minHeight: '120px',
        resize: 'vertical',
        ...style,
      }}
      {...props}
    />
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  options: { value: string; label: string }[]
}

export function AdminSelect({ error, options, style, ...props }: SelectProps) {
  return (
    <select
      style={{
        ...BASE_INPUT,
        borderColor: error ? 'rgba(255,100,100,0.5)' : 'rgba(255,255,255,0.1)',
        appearance: 'none',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: '#141414' }}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function AdminCheckbox({
  label,
  name,
  defaultChecked,
  checked,
  onChange,
}: {
  label: string
  name: string
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.7)',
      }}
    >
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        style={{ width: '16px', height: '16px', accentColor: '#7fff00', cursor: 'pointer' }}
      />
      {label}
    </label>
  )
}
