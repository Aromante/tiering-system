import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
// Card UI removido al quitar comparativa
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
// Filtros comparativos removidos
import { Badge } from '@/components/ui/badge'
import { normalizeText } from '@/lib/utils'
import { BarChart3, ChevronUp, ChevronDown, Settings as SettingsIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Spinner from '@/components/ui/spinner'

export default function TiersDashboard() {
  const [channel, setChannel] = React.useState<'TOTAL'|'ONLINE'|'POS'>('TOTAL')
  const ALL_TIERS = ['SS','S','A','B','C','T'] as const
  // Vacío significa "Todos" (no aplicar filtro). Seleccionar uno lo filtra específico.
  const [tiers, setTiers] = React.useState<string[]>([])
  const [search, setSearch] = React.useState('')
  // Barra de filtros siempre visible (sin toggle)
  const [sort, setSort] = React.useState<{ key: 'rank'|'tier'|'name'|'qty30'|'qty100'|'revenue'|'sharePct'|'deltaSharePct', dir: 'asc'|'desc' }>({ key: 'revenue', dir: 'desc' })
  // Visibilidad de columnas (persistencia local por ahora)
  const [showRevenue, setShowRevenue] = React.useState<boolean>(false)
  // Mobile: tarjetas expandibles por SKU
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('tiers-cols-v1')
      if (raw) {
        const saved = JSON.parse(raw)
        setShowRevenue(Boolean(saved.showRevenue))
      }
    } catch {}
  }, [])
  React.useEffect(() => {
    try { localStorage.setItem('tiers-cols-v1', JSON.stringify({ showRevenue })) } catch {}
  }, [showRevenue])

  // Se removió la ventana comparativa

  // helpers para comparativa removidos

  async function fetchChannelRows(ch: 'TOTAL'|'ONLINE'|'POS') {
    const prefix = ((import.meta as any).env?.VITE_SKU_PREFIX || 'PER-') as string
    const table = ch === 'POS' ? 'tiering_pos' : (ch === 'ONLINE' ? 'tiering_online' : 'tiering_global')
    const { data, error } = await supabase
      .from(table)
      .select('product_title, participation_pct, tier, three_weeks_units, three_weeks_30ml, three_weeks_100ml, revenue_gross, rank')
    if (error) throw error
    const rows = (data || []).map((r: any) => {
      // No hay SKU en las vistas: usamos product_title como id estable para UI
      const baseId = String(r.product_title || '').trim()
      const name = String(r.product_title || baseId)
      const qty30 = Number(r.three_weeks_30ml ?? 0)
      const qty100 = Number(r.three_weeks_100ml ?? 0)
      const revenue = Number(r.revenue_gross || 0)
      const sharePct = r.participation_pct != null ? Number(r.participation_pct) : 0
      const tier = r.tier ? String(r.tier) : undefined
      const rank = r.rank != null ? Number(r.rank) : undefined
      return { productId: baseId, name, qty30, qty100, revenue, sharePct, tier, rank }
    })
    return { rows, total: rows.length, page: 1, pageSize: rows.length }
  }

  const baseQuery = useQuery({
    queryKey: ['tiersSummary','TOTAL'],
    queryFn: () => fetchChannelRows('TOTAL'),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  })

  // Fallback channel query if server doesn't provide per-channel meta
  const chQuery = useQuery({
    queryKey: ['tiersSummaryCh', channel],
    enabled: channel !== 'TOTAL',
    queryFn: () => fetchChannelRows(channel),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })

  // Rank by participation (sharePct) descending for numbering column (#)
  const baseRankByShare = React.useMemo(() => {
    // Rank is based on the complete table (not filtered by search)
    const rows = (baseQuery.data?.rows || [])
    const sorted = rows.slice().sort((a:any,b:any)=> Number(b.sharePct||0) - Number(a.sharePct||0))
    const map: Record<string, number> = {}
    sorted.forEach((r:any, idx:number) => { if (r?.productId) map[r.productId] = idx + 1 })
    return map
  }, [baseQuery.data?.rows])

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
    const tierRank = (t: any) => {
      const map: Record<string, number> = { SS: 1, S: 2, A: 3, B: 4, C: 5, T: 6 }
      const key = String(t || '').toUpperCase()
      return map[key] ?? 9999
    }
    const getter = (r:any) => (
      k === 'rank' ? ((r.productId && baseRankByShare[r.productId]) || r.rank || 999999) :
      k === 'tier' ? tierRank(r.tier) :
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

  // Mobile sorting helpers
  const sortLabels: Record<typeof sort.key, string> = {
    rank: 'Ranking',
    tier: 'Tier',
    name: 'Producto',
    qty30: '30ML',
    qty100: '100ML',
    revenue: 'Net Sales',
    sharePct: '% Participación',
    deltaSharePct: 'Delta %',
  }

  // carga comparativa removida

  return (
    <main className="container max-w-6xl py-6 md:py-8 space-y-4 md:space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-600" /> Tiers — Resumen</h1>
          <p className="text-sm text-gray-500">Vista dinámica por canal, ordenada por ingresos. El # refleja la participación.</p>
        </div>
        <SettingsInline showRevenue={showRevenue} setShowRevenue={setShowRevenue} />
      </header>

      {/* Búsqueda + botón de filtros (bajo el título, sobre la tabla) */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 py-3">
        <div className="flex items-center gap-2 h-11 md:h-12 px-4 md:px-5 rounded-full bg-white border soft-hover w-full md:w-[300px]">
          <input value={search} onChange={e=> setSearch(e.target.value)} placeholder="Buscar producto…" className="outline-none bg-transparent text-sm w-full" />
        </div>
        <div className="md:ml-auto flex flex-wrap items-center gap-3 md:gap-6">
          <ToggleGroup type="single" value={channel} onValueChange={(v)=> setChannel(prev => prev === v ? 'TOTAL' : (v as any))}>
            <ToggleGroupItem value="ONLINE" aria-label="ONLINE" className="h-10 px-3 md:h-12 md:px-4">ONLINE</ToggleGroupItem>
            <ToggleGroupItem value="POS" aria-label="POS" className="h-10 px-3 md:h-12 md:px-4">POS</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="multiple" value={tiers} onValueChange={(v)=> setTiers(v as string[])} className="flex flex-wrap">
            {ALL_TIERS.map(t => (
              <ToggleGroupItem
                key={t}
                value={t}
                aria-label={t}
                className="w-10 h-10 md:w-12 md:h-12 px-0 flex items-center justify-center"
              >
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Overlay de actualización ligera cuando hay refetch en curso */}
      {baseQuery.isFetching && (
        <div className="fixed top-3 right-4 z-40 bg-white/90 border rounded-full px-3 py-1 text-xs text-gray-600 shadow-sm flex items-center gap-2">
          <Spinner size="sm" />
          <span>Actualizando datos…</span>
        </div>
      )}

      <section>
        {baseQuery.isLoading && <Spinner label="Cargando…" />}
        {baseQuery.error && <p className="text-sm text-red-600">{(baseQuery.error as any).message}</p>}
        {baseQuery.data && (
          <>
            {/* Mobile sorting controls */}
            <div className="md:hidden mb-2 flex items-center justify-between">
              <Popover>
                <PopoverTrigger asChild>
                  <Button data-size="sm" data-variant="outline" className="gap-2">
                    Ordenar: <span className="font-medium">{sortLabels[sort.key]}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[220px] p-2">
                  <div className="text-xs text-gray-500 mb-2">Ordenar por</div>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(sortLabels).map(([k, label]) => (
                      <Button key={k} data-size="sm" data-variant={(sort.key === (k as any)) ? 'default' : 'outline'} className="justify-start"
                        onClick={()=> setSort(prev => ({ ...prev, key: k as any }))}
                      >{label}</Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button data-size="sm" data-variant="outline" onClick={()=> setSort(prev => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))}>
                {sort.dir === 'asc' ? 'Ascendente' : 'Descendente'}
              </Button>
            </div>

            {/* Mobile cards (no scroll horizontal) */}
            <div className="md:hidden space-y-3">
              {(() => {
                const totalRows = (baseQuery.data?.rows || [])
                const isOpen = (id: string) => expanded.has(id)
                const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
                if (channel === 'TOTAL') {
                  const filtered = applySort(totalRows
                    .filter((r:any)=> tiers.length === 0 || tiers.includes(String(r.tier||'')))
                    .filter((r:any)=> !search || normalizeText(String(r.name||'')).includes(normalizeText(search)))
                  )
                  if (filtered.length === 0) return (<div className="py-10 text-center text-sm text-gray-500">NO EXISTE NINGÚN PRODUCTO DE ESTE TIER</div>)
                  return filtered.map((r:any, i:number) => (
                    <div key={i} className="rounded-xl border bg-white p-3 shadow-sm">
                      <button onClick={()=> toggle(r.productId)} className="w-full flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 grid place-items-center text-[12px] tabular-nums">{(r.productId && baseRankByShare[r.productId]) || r.rank || i+1}</div>
                          <div className="font-medium text-sm leading-snug text-left">{r.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.tier ? <Badge className="px-2.5 py-0.5 text-xs" data-variant={r.tier==='SS'?'blue': r.tier==='S'?'green': r.tier==='A'?'amber': r.tier==='B'?'orange': r.tier==='C'?'red':'gray'}>{r.tier}</Badge> : null}
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen(r.productId) ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {isOpen(r.productId) && (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                          <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">30ML</div><div className="tabular-nums">{Number(r.qty30||0).toLocaleString()}</div></div>
                          <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">100ML</div><div className="tabular-nums">{Number(r.qty100||0).toLocaleString()}</div></div>
                          {showRevenue && (
                            <div className="rounded-lg bg-gray-50 p-2 col-span-2"><div className="text-xs text-gray-500">NET SALES</div><div className="tabular-nums">{fmtRevenue(r.revenue)}</div></div>
                          )}
                          <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">% PARTIC.</div><div className="tabular-nums">{fmtPct(r.sharePct)}</div></div>
                          <div className={`rounded-lg bg-gray-50 p-2 ${Number(r.deltaSharePct||0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}><div className="text-xs text-gray-500">DELTA</div><div className="tabular-nums">{fmtPct(r.deltaSharePct)}</div></div>
                        </div>
                      )}
                    </div>
                  ))
                }
                const ch = channel
                if (chQuery.isLoading) return (<div className="py-8 text-center"><Spinner label="Cargando canal…" /></div>)
                let list:any[] = []
                if (chQuery.data?.rows) list = chQuery.data.rows
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
                  sharePct: Number.isFinite(Number(r.sharePct)) ? Number(r.sharePct) : (Number(r.revenue||0)*100)/sumRev,
                  deltaSharePct: 0,
                  tier: r.tier || tierById[r.productId] || 'C',
                }))
                const filtered = applySort(rows
                  .filter((r:any)=> tiers.length === 0 || tiers.includes(String(r.tier||'')))
                  .filter((r:any)=> !search || normalizeText(String(r.name||'')).includes(normalizeText(search)))
                )
                if (filtered.length === 0) return (<div className="py-10 text-center text-sm text-gray-500">NO EXISTE NINGÚN PRODUCTO DE ESTE TIER</div>)
                const sorted = rows.slice().sort((a,b)=> Number(b.sharePct)-Number(a.sharePct))
                const rankMap: Record<string, number> = {}
                sorted.forEach((r:any, idx:number)=> { if (r.productId) rankMap[r.productId] = idx+1 })
                return filtered.map((r:any, i:number) => (
                  <div key={i} className="rounded-xl border bg-white p-3 shadow-sm">
                    <button onClick={()=> toggle(r.productId)} className="w-full flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 grid place-items-center text-[12px] tabular-nums">{(r.productId && rankMap[r.productId]) || i+1}</div>
                        <div className="font-medium text-sm leading-snug text-left">{r.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.tier ? <Badge className="px-2.5 py-0.5 text-xs" data-variant={r.tier==='SS'?'blue': r.tier==='S'?'green': r.tier==='A'?'amber': r.tier==='B'?'orange': r.tier==='C'?'red':'gray'}>{r.tier}</Badge> : null}
                        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen(r.productId) ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isOpen(r.productId) && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                        <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">30ML</div><div className="tabular-nums">{Number(r.qty30||0).toLocaleString()}</div></div>
                        <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">100ML</div><div className="tabular-nums">{Number(r.qty100||0).toLocaleString()}</div></div>
                        {showRevenue && (
                          <div className="rounded-lg bg-gray-50 p-2 col-span-2"><div className="text-xs text-gray-500">NET SALES</div><div className="tabular-nums">{fmtRevenue(r.revenue)}</div></div>
                        )}
                        <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">% PARTIC.</div><div className="tabular-nums">{fmtPct(r.sharePct)}</div></div>
                        <div className={`rounded-lg bg-gray-50 p-2 ${Number(r.deltaSharePct||0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}><div className="text-xs text-gray-500">DELTA</div><div className="tabular-nums">{fmtPct(r.deltaSharePct)}</div></div>
                      </div>
                    )}
                  </div>
                ))
              })()}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-xl">
              <table className="w-full text-sm table-modern">
              <thead className="bg-gray-100">
                <tr className="text-left text-gray-700">
                  <th className="py-4 px-3 first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('rank')}>RANGO {sortIcon('rank')}</button></th>
                  <th className="py-4 pr-2 first:rounded-l-xl last:rounded-r-xl"><button className="flex items-center gap-1" onClick={()=> toggleSort('tier')}>TIER {sortIcon('tier')}</button></th>
                  <th className="py-4 pr-2 first:rounded-l-xl last:rounded-r-xl"><button className="flex items-center gap-1" onClick={()=> toggleSort('name')}>PRODUCTO {sortIcon('name')}</button></th>
                  <th className="py-4 text-center first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('qty30')}>30ML {sortIcon('qty30')}</button></th>
                  <th className="py-4 text-center first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('qty100')}>100ML {sortIcon('qty100')}</button></th>
                  {showRevenue && (
                    <th className="py-4 text-center first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-center gap-1" onClick={()=> toggleSort('revenue')}>NET SALES {sortIcon('revenue')}</button></th>
                  )}
                  <th className="py-4 text-right pr-8 first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-end gap-1" onClick={()=> toggleSort('sharePct')}>% {sortIcon('sharePct')}</button></th>
                  <th className="py-4 text-right pr-8 first:rounded-l-xl last:rounded-r-xl"><button className="w-full flex items-center justify-end gap-1" onClick={()=> toggleSort('deltaSharePct')}>DELTA {sortIcon('deltaSharePct')}</button></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalRows = (baseQuery.data?.rows || [])
                  if (channel === 'TOTAL') {
                    const filtered = applySort(totalRows
                      .filter((r:any)=> tiers.length === 0 || tiers.includes(String(r.tier||'')))
                      .filter((r:any)=> !search || normalizeText(String(r.name||'')).includes(normalizeText(search)))
                    )
                    const colSpanTotal = 7 + (showRevenue ? 1 : 0)
                    if (filtered.length === 0) return (<tr><td colSpan={colSpanTotal} className="py-10 text-center text-sm text-gray-500">NO EXISTE NINGÚN PRODUCTO DE ESTE TIER</td></tr>)
                    return filtered.map((r:any, i:number) => (
                      <tr key={i} className={"border-b border-gray-100 row-hover"}>
                        <td className="py-5 px-3 tabular-nums text-center tracking-tight text-[13px]">{(r.productId && baseRankByShare[r.productId]) || r.rank || i+1}</td>
                        <td className="py-5 pr-2 tracking-tight text-[13px]">{r.tier ? <Badge className="px-3 py-1" data-variant={r.tier==='SS'?'blue': r.tier==='S'?'green': r.tier==='A'?'amber': r.tier==='B'?'orange': r.tier==='C'?'red':'gray'}>{r.tier}</Badge> : ''}</td>
                        <td className="py-5 pr-4 whitespace-nowrap font-medium tracking-tight text-[13px]">{r.name}</td>
                        <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{Number(r.qty30||0).toLocaleString()}</td>
                        <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{Number(r.qty100||0).toLocaleString()}</td>
                        {showRevenue && (
                          <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{fmtRevenue(r.revenue)}</td>
                        )}
                        <td className="py-5 tabular-nums text-right pr-8 tracking-tight text-[13px]">{fmtPct(r.sharePct)}</td>
                        <td className={`py-5 tabular-nums text-right pr-8 tracking-tight text-[13px] ${Number(r.deltaSharePct||0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(r.deltaSharePct)}</td>
                      </tr>
                    ))
                  }
                  const ch = channel
                  let list:any[] = []
                  if (ch === 'TOTAL') list = (baseQuery.data?.rows || [])
                  else if (chQuery.isLoading) {
                    const colSpanCh = 7 + (showRevenue ? 1 : 0)
                    return (<tr><td colSpan={colSpanCh} className="py-8 text-center"><Spinner label="Cargando canal…" /></td></tr>)
                  } else if (chQuery.data?.rows) list = chQuery.data.rows
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
                    sharePct: Number.isFinite(Number(r.sharePct)) ? Number(r.sharePct) : (Number(r.revenue||0)*100)/sumRev,
                    deltaSharePct: 0,
                    tier: r.tier || tierById[r.productId] || 'C',
                  }))
                  const filtered = applySort(rows
                    .filter((r:any)=> tiers.length === 0 || tiers.includes(String(r.tier||'')))
                    .filter((r:any)=> !search || normalizeText(String(r.name||'')).includes(normalizeText(search)))
                  )
                  const colSpanChEmpty = 7 + (showRevenue ? 1 : 0)
                  if (filtered.length === 0) return (<tr><td colSpan={colSpanChEmpty} className="py-10 text-center text-sm text-gray-500">NO EXISTE NINGÚN PRODUCTO DE ESTE TIER</td></tr>)
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
                      {showRevenue && (
                        <td className="py-5 tabular-nums text-center tracking-tight text-[13px]">{fmtRevenue(r.revenue)}</td>
                      )}
                      <td className="py-5 tabular-nums text-right pr-8 tracking-tight text-[13px]">{fmtPct(r.sharePct)}</td>
                      <td className={`py-5 tabular-nums text-right pr-8 tracking-tight text-[13px] ${Number(r.deltaSharePct||0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(r.deltaSharePct)}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* Se removió la sección de comparativa inferior */}
    </main>
  )
}

function SettingsInline({ showRevenue, setShowRevenue }: { showRevenue: boolean, setShowRevenue: (v: boolean)=>void }) {
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['forecasting_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('forecasting_settings').select('id,tier_weeks').eq('id', 1).maybeSingle()
      if (error) throw error
      return data || null
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const currentWeeks = Number(settingsQuery.data?.tier_weeks ?? 3)

  async function setWeeks(w: 1|2|3|4) {
    try {
      setSaving(true)
      const { error } = await supabase.rpc('set_tier_weeks', { new_tier: w })
      if (error) throw error
      await settingsQuery.refetch()
      // Refrescar datos del dashboard de inmediato
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['tiersSummary'] }),
        queryClient.invalidateQueries({ queryKey: ['tiersSummaryCh'] }),
      ])
      await Promise.allSettled([
        queryClient.refetchQueries({ queryKey: ['tiersSummary'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['tiersSummaryCh'], type: 'active' }),
      ])
      setOpen(false)
    } catch (e) {
      alert((e as any)?.message || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  // Close menu on outside click
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return
      const btn = btnRef.current
      if (!btn) return
      const tgt = e.target as Node
      if (btn.contains(tgt)) return
      const panel = document.getElementById('settings-popover')
      if (panel && panel.contains(tgt)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div className="relative">
      <Button ref={btnRef as any} onClick={()=> setOpen(v=>!v)} data-variant="outline" data-size="sm" className="gap-2 btn-pill">
        <SettingsIcon className="h-4 w-4" />
        <span>Semanas: {currentWeeks}</span>
      </Button>
      {open && (
        <div id="settings-popover" className="absolute right-0 mt-2 z-50 rounded-lg border bg-white shadow-md p-3 min-w-[220px]">
          <div className="text-xs text-gray-500 mb-2">Selecciona semanas a considerar</div>
          <div className="flex items-center gap-2">
            {[1,2,3,4].map(v => (
              <Button key={v} onClick={()=> setWeeks(v as 1|2|3|4)} disabled={saving} data-size="sm" data-variant={currentWeeks===v? 'default':'outline'}>
                {v}
              </Button>
            ))}
          </div>
          {((import.meta as any).env?.VITE_TIERS_ADMIN_COLUMNS === '1') && (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs text-gray-500 mb-2">Columnas</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showRevenue} onChange={(e)=> setShowRevenue(e.target.checked)} />
                Mostrar NET SALES
              </label>
            </div>
          )}
          {saving && <div className="text-xs text-gray-500 mt-2">Guardando…</div>}
        </div>
      )}
    </div>
  )
}
