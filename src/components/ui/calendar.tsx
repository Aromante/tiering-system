import React from 'react'

export function Calendar({ mode, selected, onSelect, numberOfMonths }: any) {
  // Minimal placeholder; in real app use a datepicker
  return (
    <div className="p-2 text-xs text-gray-500">
      <p>Selector de fechas no interactivo (placeholder)</p>
      <button className="mt-2 h-8 px-2 rounded-md border" onClick={()=> onSelect?.({ from: new Date(), to: new Date() })}>Usar hoy</button>
    </div>
  )
}

