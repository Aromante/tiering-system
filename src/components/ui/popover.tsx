import React from 'react'

export function Popover({ children }: any) { return <div className="relative inline-block">{children}</div> }
export function PopoverTrigger({ asChild, children }: any) { return children }
export function PopoverContent({ children, className }: any) { return <div className={`absolute z-50 mt-1 border bg-white/95 rounded-2xl shadow-lg backdrop-blur-md ${className||''}`}>{children}</div> }
