import React, { createContext, useContext } from 'react'

type Ctx = { value: string; onValueChange: (v: string) => void }
const TabsCtx = createContext<Ctx | null>(null)

export function Tabs({ value, onValueChange, children }: { value: string, onValueChange: (v:string)=>void, children: React.ReactNode }) {
  return <TabsCtx.Provider value={{ value, onValueChange }}>{children}</TabsCtx.Provider>
}
export function TabsList({ children, className }: any) {
  return <div className={`flex gap-2 ${className || ''}`}>{children}</div>
}
export function TabsTrigger({ value, children }: any) {
  const ctx = useContext(TabsCtx)!
  const active = ctx?.value === value
  return <button onClick={() => ctx?.onValueChange(value)} className={`h-8 px-4 rounded-full text-xs transition-colors ${active ? 'bg-amber-300/80 text-gray-900 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-100 border'}`}>{children}</button>
}
export function TabsContent({ value, children, className }: any) {
  const ctx = useContext(TabsCtx)!
  if (ctx?.value !== value) return null
  return <div className={className}>{children}</div>
}
