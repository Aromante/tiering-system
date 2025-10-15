import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

type Ctx = { open: boolean; setOpen: (v: boolean)=>void; containerRef: React.RefObject<HTMLDivElement> }
const PopCtx = createContext<Ctx | null>(null)

export function Popover({ children }: any) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Close on outside click / ESC
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return
      const el = containerRef.current
      if (!el) return
      const tgt = e.target as Node
      if (!el.contains(tgt)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])
  return (
    <PopCtx.Provider value={{ open, setOpen, containerRef }}>
      <div ref={containerRef as any} className="relative inline-block">{children}</div>
    </PopCtx.Provider>
  )
}

export function PopoverTrigger({ asChild, children }: any) {
  const ctx = useContext(PopCtx)
  if (!ctx) return children
  const onClick = (e: any) => { e.stopPropagation(); ctx.setOpen(!ctx.open) }
  if (asChild && React.isValidElement(children)) return React.cloneElement(children, { onClick: (ev:any)=> { children.props?.onClick?.(ev); onClick(ev) } })
  return <button onClick={onClick}>{children}</button>
}

export function PopoverContent({ children, className, align }: any) {
  const ctx = useContext(PopCtx)
  if (!ctx || !ctx.open) return null
  const alignClass = align === 'end' ? 'right-0' : (align === 'start' ? 'left-0' : '')
  return (
    <div
      className={`absolute ${alignClass} z-50 mt-1 border bg-white/95 rounded-2xl shadow-lg backdrop-blur-md ${className||''}`}
      onClick={() => ctx.setOpen(false)}
    >
      {children}
    </div>
  )
}
