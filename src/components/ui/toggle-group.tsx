import React from 'react'

export function ToggleGroup({ type, value, onValueChange, className, children }: { type: 'single' | 'multiple', value: any, onValueChange: (v: any)=>void, className?: string, children: React.ReactNode }) {
  return <div className={className}>{React.Children.map(children, (child) => React.cloneElement(child as any, { groupType: type, groupValue: value, onGroupChange: onValueChange }))}</div>
}

export function ToggleGroupItem({ value, children, groupType, groupValue, onGroupChange, 'aria-label': ariaLabel, className }: any) {
  const active = groupType === 'single' ? groupValue === value : Array.isArray(groupValue) && groupValue.includes(value)
  const toggle = () => {
    if (groupType === 'single') onGroupChange(value)
    else {
      const set = new Set(groupValue || [])
      set.has(value) ? set.delete(value) : set.add(value)
      onGroupChange(Array.from(set))
    }
  }
  return (
    <button
      aria-label={ariaLabel}
      onClick={toggle}
      className={`text-sm h-12 px-4 rounded-full mr-2 transition-colors ${active ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' : 'bg-white text-gray-700 hover:bg-gray-100 border'} ${className||''}`}
    >
      {children}
    </button>
  )
}
