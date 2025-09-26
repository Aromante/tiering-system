import React from 'react'

type Size = 'sm' | 'md' | 'lg' | number

export function Spinner({ size = 'md', label }: { size?: Size; label?: string }) {
  const px = typeof size === 'number' ? size : size === 'sm' ? 16 : size === 'lg' ? 24 : 20
  return (
    <span className="inline-flex items-center gap-2 text-gray-500 text-sm" role="status" aria-live="polite">
      <span
        aria-hidden
        className="inline-block animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
        style={{ width: px, height: px }}
      />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

export default Spinner

