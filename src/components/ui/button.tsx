import React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'primary' | 'outline' | 'ghost'
type Size = 'sm' | 'md'

export function Button({ className, children, 'data-variant': variant = 'outline', 'data-size': size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { 'data-variant'?: Variant, 'data-size'?: Size }) {
  const base = 'inline-flex items-center justify-center rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40'
  const sizes = size === 'sm' ? 'h-8 px-2' : 'h-9 px-3'
  const styles = (
    variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-500 border border-transparent'
    : variant === 'default' ? 'bg-white text-gray-900 hover:bg-gray-50 border'
    : variant === 'ghost' ? 'bg-transparent text-gray-700 hover:bg-gray-100 border border-transparent'
    : 'bg-white text-gray-900 hover:bg-gray-50 border'
  )
  return (
    <button {...props} className={cn(base, sizes, styles, className)}>
      {children}
    </button>
  )
}
