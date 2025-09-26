import React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'blue' | 'green' | 'red' | 'amber' | 'orange' | 'gray'

export function Badge({ className, children, 'data-variant': v = 'gray' }: React.HTMLAttributes<HTMLSpanElement> & { 'data-variant'?: Variant }) {
  const style = (
    v === 'blue' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' :
    v === 'green' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
    v === 'red' ? 'bg-red-100 text-red-800 ring-1 ring-red-300' :
    v === 'amber' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
    v === 'orange' ? 'bg-orange-100 text-orange-800 ring-1 ring-orange-300' :
    'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
  )
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', style, className)}>{children}</span>
}
