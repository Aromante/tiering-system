import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
// Card UI removido al quitar comparativa
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
// Filtros comparativos removidos
import { Badge } from '@/components/ui/badge'
import { normalizeText } from '@/lib/utils'
import { BarChart3, Settings, ChevronUp, ChevronDown } from 'lucide-react'
import Spinner from '@/components/ui/spinner'

export default function TiersDashboard() {
  const [channel, setChannel] = React.useState<'TOTAL'|'ONLINE'|'POS'>('TOTAL')
  const ALL_TIERS = ['SS','S','A','B','C','T'] as const
  // Vacío significa "Todos" (no aplicar filtro). Seleccionar uno lo filtra específico.
  const [tiers, setTiers] = React.useState<string[]>([])
  const [search, setSearch] = React.useState('')
  // Barra de filtros siempre visible (sin toggle)
  const [sort, setSort] = React.useState<{ key: 'rank'|'tier'|'name'|'qty30'|'qty100'|'revenue'|'sharePct'|'deltaSharePct', dir: 'asc'|'desc' }>({ key: 'revenue', dir: 'desc' })

  // Se removió la ventana comparativa

  // helpers para comparativa removidos

  const apiBase = (import.meta as any).env?.VITE_API_BASE || ''
  // Carga inicial rápida (lite)
  const baseQuery = useQuery({
    queryKey: ['tiersSummary'],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ channel: 'TOTAL' })
      params.set('lite', '1')
      const url = `${apiBase}/api/tiers/summary?${params.toString()}`
      const res = await fetch(url, { signal, cache: 'no-store', headers: { 'Cache-Control': 'no-store' } })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data as { rows: any[], total: number, page: number, pageSize: number }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: false,
  })

  // Fetch en segundo plano (completo) para TOTAL
  const fullQuery = useQuery({
    queryKey: ['tiersSummaryFull'],
    enabled: !!baseQuery.data && channel === 'TOTAL',
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ channel: 'TOTAL' })
      const url = `${apiBase}/api/tiers/summary?${params.toString()}`
      const res = await fetch(url, { signal, cache: 'no-store', headers: { 'Cache-Control': 'no-store' } })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data as { rows: any[], total: number, page: number, pageSize: number, meta?: any }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  // Fallback channel query if server doesn't provide per-channel meta
  const chQuery = useQuery({
    queryKey: ['tiersSummaryCh', channel],
    enabled: channel !== 'TOTAL' && !((baseQuery.data as any)?.meta?.channels?.[channel]),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ channel })
      const url = `${apiBase}/api/tiers/summary?${params.toString()}`
      const res = await fetch(url, { signal, cache: 'no-store', headers: { 'Cache-Control': 'no-store' } })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data as { rows: any[], total: number, page: number, pageSize: number }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })

  // Rank by participation (sharePct) descending for numbering column (#)
  // Datos a renderizar para TOTAL: primero lite, luego full cuando esté
  const totalData = (channel === 'TOTAL') ? (fullQuery.data || baseQuery.data) : null

  const baseRankByShare = React.useMemo(() => {
    // Rank is based on the complete table (not filtered by search)
    const rows = (totalData?.rows || [])
    const sorted = rows.slice().sort((a:any,b:any)=> Number(b.sharePct||0) - Number(a.sharePct||0))
    const map: Record<string, number> = {}
    sorted.forEach((r:any, idx:number) => { if (r?.productId) map[r.productId] = idx + 1 })
    return map
  }, [totalData?.rows])

  function sortIcon(col: typeof sort.key) {
    const active = sort.key === col
    return (
      <span className="ml-1 inline-flex flex-col leading-none">
        <ChevronUp className={`h-2.5 w-2.5 ${active && sort.dir === 'asc' ? 'text-gray-700' : 'text-gray-300'}`} strokeWidth={1.75} />
        <ChevronDown className={`h-2.5 w-2.5 -mt-0.5 ${active && sort.dir === 'desc' ? 'text-gray-700' : 'text-gray-300'}`} strokeWidth={1.75} />
      </span>
    )
  }
  function toggleSort(col: typeof sort.key) {
    setSort((prev) => prev.key === col ? { key: col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: col, dir: 'asc' })
  }
  function applySort(rows: any[]) {
    const k = sort.key; const dir = sort.dir === 'asc' ? 1 : -1
    const getter = (r:any) => (
      k === 'rank' ? ((r.productId && baseRankByShare[r.productId]) || r.rank || 999999) :
      k === 'tier' ? String(r.tier || '') :
      k === 'name' ? String(r.name || '') :
      Number(r[k] || 0)
    )
    return rows.slice().sort((a,b)=> {
      const av = getter(a), bv = getter(b)
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir
      return (av - bv) * dir
    })
  }

  const fmtRevenue = (n: any) => `$${Number(n||0).toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`
  const fmtPct = (n: any) => `${Number(n||0).toFixed(1)}%`

  // carga comparativa removida

  return (
    <main className="container max-w-6xl py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-600" /> Tiers — Resumen</h1>
          <p className="text-sm text-gray-500">Vista dinámica por canal, ordenada por ingresos. El # refleja la participación.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/settings"><Button data-variant="outline" data-size="sm" className="gap-2 btn-pill"><Settings className="h-4 w-4" /> Ajustes</Button></Link>
          {/* Indicador de versión de tabla */}
          {channel === 'TOTAL' && (
            <Badge className="px-3 py-1" data-variant={fullQuery.data ? 'green' : 'gray'}>
              {fullQuery.data ? 'Completa' : 'Lite'}
            </Badge>
          )}
        </div>
      </header>

      {/* Búsqueda + botón de filtros (bajo el título, sobre la tabla) */}
      <div className="flex items-center gap-3 py-3">
        <div className="flex items-center gap-2 h-12 px-5 rounded-full bg-white border soft-hover w-[300px]">
          <input value={search} onChange={e=> setSearch(e.target.value)} placeholder="Buscar producto…" className="outline-none bg-transparent text-sm w-full" />
        </div>
        <div className="ml-auto flex items-center gap-6">
          <ToggleGroup type="single" value={channel} onValueChange={(v)=> setChannel(prev => prev === v ? 'TOTAL' : (v as any))}>
            <ToggleGroupItem value="ONLINE" aria-label="ONLINE">ONLINE</ToggleGroupItem>
            <ToggleGroupItem value="POS" aria-label="POS">POS</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="multiple" value={tiers} onValueChange={(v)=> setTiers(v as string[])} className="flex flex-wrap">
            {ALL_TIERS.map(t => (
              <ToggleGroupItem
                key={t}
                value={t}
                aria-label={t}
                className="w-12 h-12 px-0 flex items-center justify-center"
              >
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Overlay de actualización ligera cuando hay refetch en curso */}
      {(baseQuery.isFetching || chQuery.isFetching || fullQuery.isFetching) && (
        <div className="fixed top-3 right-4 z-40 bg-white/90 border rounded-full px-3 py-1 text-xs text-gray-600 shadow-sm flex items-center gap-2">
          <Spinner size="sm" />
          <span>Actualizando datos… {channel==='TOTAL' ? (fullQuery.isFetching ? '(Completa)' : '(Lite)') : ''}</span>
        </div>
      )}

      <section>
        {baseQuery.isLoading && <Spinner label="Cargando…" />}
        {(baseQuery.error || fullQuery.error) && <p className="text-sm text-red-600">{((baseQuery.error||fullQuery.error) as any).message}</p>}
        {totalData && (
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm table-modern">
              <thead className="bg-gray-100">
                <tr className="text-left text-gray-700">
                  <th className="py-4 px-3 first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('rank')}>RANGO {sortIcon('rank')}</button></th>
                  <th className="py-4 pr-2 first:rounded-l-xl last:rounded-r-xl"><button className="flex items-center gap-1" onClick={()=> toggleSort('tier')}>TIER {sortIcon('tier')}</button></th>
                  <th className="py-4 pr-2 first:rounded-l-xl last:rounded-r-xl"><button className="flex items-center gap-1" onClick={()=> toggleSort('name')}>PRODUCTO {sortIcon('name')}</button></th>
                  <th className="py-4 text-center first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('qty30')}>30ML {sortIcon('qty30')}</button></th>
                  <th className="py-4 text-center first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('qty100')}>100ML {sortIcon('qty100')}</button></th>
                  <th className="py-4 text-center first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('revenue')}>NET SALES {sortIcon('revenue')}</button></th>
                  <th className="py-4 text-right pr-8 first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-end gap-1" onClick={()=> toggleSort('sharePct')}>% {sortIcon('sharePct')}</button></th>
                  <th className="py-4 text-right pr-8 first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-end gap-1" onClick={()=> toggleSort('deltaSharePct')}>DELTA {sortIcon('deltaSharePct')}</button></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalRows = (totalData?.rows || [])
                  if (channel === 'TOTAL') {
                    const filtered = applySort(totalRows
                      .filter((r:any)=> tiers.length === 0 || tiers.includes(String(r.tier||'')))
                      .filter((r:any)=> !search || normalizeText(String(r.name||'')).includes(normalizeText(search)))
                  )
                    if (filtered.length === 0) return (<tr><td colSpan={8} className="py-10 text-center text-sm text-gray-500">NO EXISTE NINGÚN PRODUCTO DE ESTE TIER</td></tr>)
                    return filtered.map((r:any, i:number) => (
                      <tr key={i} className={"border-b border-gray-100 row-hover"}>
                        <td className="py-5 px-3 tabular-nums text-center tracking-tight text-[13px]">{(r.productId && baseRankByShare[r.productId]) || r.rank || i+1}</td>
                        <td className="py-5 pr-2 tracking-tight text-[13px]">{r.tier ? <Badge className="px-3 py-1" data-variant={r.tier==='SS'?'blue': r.tier==='S'?'green': r.tier==='A'?'amber': r.tier==='B'?'orange': r.tier==='C'?'red':'gray'}>{r.tier}</Badge> : ''}</td>
                        <td className="py-5 pr-4 whitespace-nowrap font-medium tracking-tight text-[13px]">{r.name}</td>
                        <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{Number(r.qty30||0).toLocaleString()}</td>
                        <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{Number(r.qty100||0).toLocaleString()}</td>
                        <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{fmtRevenue(r.revenue)}</td>
                        <td className="py-5 tabular-nums text-right pr-8 tracking-tight text-[13px]">{fmtPct(r.sharePct)}</td>
                        <td className={`py-5 tabular-nums text-right pr-8 tracking-tight text-[13px] ${Number(r.deltaSharePct||0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(r.deltaSharePct)}</td>
                      </tr>
                    ))
                  }
                  const ch = channel
                  const meta = (baseQuery.data as any)?.meta?.channels || {}
                  let list:any[] = Array.isArray(meta?.[ch]) ? meta[ch] : []
                  if (!list || list.length === 0) {
                    if (chQuery.isLoading) {
                      return (<tr><td colSpan={8} className="py-8 text-center"><Spinner label="Cargando canal…" /></td></tr>)
                    }
                    if (chQuery.data?.rows) {
                      list = chQuery.data.rows.map((r:any)=> ({ productId: r.productId, name: r.name, qty30: r.qty30||0, qty100: r.qty100||0, revenue: Number(r.revenue||0) }))
                    }
                  }
                  const tierById: Record<string,string> = {}
                  for (const r of totalRows) if (r?.productId) tierById[r.productId] = r.tier
                  const sumRev = list.reduce((a,b)=> a + Number(b.revenue||0), 0) || 1
                  const rows = list.map((r:any)=> ({
                    productId: r.productId,
                    name: r.name,
                    qty30: r.qty30||0,
                    qty100: r.qty100||0,
                    revenue: Number(r.revenue||0),
                    totalSales: 0,
                    sharePct: (Number(r.revenue||0)*100)/sumRev,
                    deltaSharePct: 0,
                    tier: tierById[r.productId] || 'C',
                  }))
                  const filtered = applySort(rows
                    .filter((r:any)=> tiers.length === 0 || tiers.includes(String(r.tier||'')))
                    .filter((r:any)=> !search || normalizeText(String(r.name||'')).includes(normalizeText(search)))
                  )
                  if (filtered.length === 0) return (<tr><td colSpan={8} className="py-10 text-center text-sm text-gray-500">NO EXISTE NINGÚN PRODUCTO DE ESTE TIER</td></tr>)
                  const sorted = rows.slice().sort((a,b)=> Number(b.sharePct)-Number(a.sharePct))
                  const rankMap: Record<string, number> = {}
                  sorted.forEach((r:any, idx:number)=> { if (r.productId) rankMap[r.productId] = idx+1 })
                  return filtered.map((r:any, i:number) => (
                    <tr key={i} className={"border-b border-gray-100 row-hover"}>
                      <td className="py-5 px-3 tabular-nums text-center tracking-tight text-[13px]">{(r.productId && rankMap[r.productId]) || i+1}</td>
                      <td className="py-5 pr-2 tracking-tight text-[13px]">{r.tier ? <Badge className="px-3 py-1" data-variant={r.tier==='SS'?'blue': r.tier==='S'?'green': r.tier==='A'?'amber': r.tier==='B'?'orange': r.tier==='C'?'red':'gray'}>{r.tier}</Badge> : ''}</td>
                      <td className="py-5 pr-4 whitespace-nowrap font-medium tracking-tight text-[13px]">{r.name}</td>
                      <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{Number(r.qty30||0).toLocaleString()}</td>
                      <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{Number(r.qty100||0).toLocaleString()}</td>
                      <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{fmtRevenue(r.revenue)}</td>
                      <td className="py-5 tabular-nums text-right pr-8 tracking-tight text-[13px]">{fmtPct(r.sharePct)}</td>
                      <td className={`py-5 tabular-nums text-right pr-8 tracking-tight text-[13px] ${Number(r.deltaSharePct||0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(r.deltaSharePct)}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Se removió la sección de comparativa inferior */}
    </main>
  )
}
