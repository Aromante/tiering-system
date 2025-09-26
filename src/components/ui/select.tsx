import React from 'react'

export function Select({ value, onValueChange, children }: any) {
  return <div data-select="" data-value={value}>{React.Children.map(children, (c:any)=> React.cloneElement(c, { selectValue: value, onSelectChange: onValueChange }))}</div>
}
export function SelectTrigger({ children, className }: any) { return <div className={`h-9 px-3 rounded-full border bg-white flex items-center ${className||''}`}>{children}</div> }
export function SelectValue({ placeholder }: any) { return <span className="text-sm text-gray-700">{placeholder}</span> }
export function SelectContent({ children }: any) { return <div className="mt-1 border rounded-xl bg-white p-1 inline-block shadow-md">{children}</div> }
export function SelectItem({ value, children, onSelectChange }: any) { return <button className="block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100" onClick={()=> onSelectChange?.(value)}>{children}</button> }
