import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Spinner from '@/components/ui/spinner'

type TiersConfig = {
  tierSSPct: number
  tierSPct: number
  tierAPct: number
  tiersTopCount: number
  tempTierWeeks: number
  salesWindowDays: number
}

export default function TiersSettingsPage() {
  const apiBase = (import.meta as any).env?.VITE_API_BASE || ''
  const [token, setToken] = React.useState<string>(() => sessionStorage.getItem('tiersAdminToken') || '')
  const [cfg, setCfg] = React.useState<TiersConfig | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  React.useEffect(() => {
    (async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`${apiBase}/api/tiers/config`)
        const j = await res.json()
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
        setCfg(j)
      } catch (e:any) { setError(e?.message || 'Error') }
      finally { setLoading(false) }
    })()
  }, [])

  function num(v: string, d: number) { const n = Number(v); return Number.isFinite(n) ? n : d }
  function set<K extends keyof TiersConfig>(key: K, value: any) { setCfg(prev => prev ? { ...prev, [key]: value } as TiersConfig : prev) }

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/api/tiers/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify(cfg) })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      sessionStorage.setItem('tiersAdminToken', token)
      try { await qc.invalidateQueries({ queryKey: ['tiersSummary'] }) } catch {}
      navigate('/')
    } catch (e:any) { alert(e?.message || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <main className="container max-w-3xl py-8 space-y-6 relative">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ajustes de Tiers</h1>
        <button className="h-8 rounded-md border px-3 text-xs" onClick={() => navigate('/')}>Volver</button>
      </header>

      <section className="rounded-xl border bg-white p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Admin Token</label>
          <input className="h-9 w-full rounded-md border bg-white px-3 text-sm" type="password" value={token} onChange={e=> setToken(e.target.value)} placeholder="Pega aquí tu token" disabled={saving} />
          <p className="text-xs text-gray-500">Se usa sólo para guardado y se almacena en esta sesión del navegador.</p>
        </div>

        {loading && <p className="text-sm text-gray-500">Cargando configuración…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {cfg && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="% Tier SS" value={String(cfg.tierSSPct)} onChange={v=> set('tierSSPct', num(v, cfg.tierSSPct))} suffix="%" disabled={saving} />
            <Field label="% Tier S" value={String(cfg.tierSPct)} onChange={v=> set('tierSPct', num(v, cfg.tierSPct))} suffix="%" disabled={saving} />
            <Field label="% Tier A" value={String(cfg.tierAPct)} onChange={v=> set('tierAPct', num(v, cfg.tierAPct))} suffix="%" disabled={saving} />
            <Field label="Top (B fill hasta)" value={String(cfg.tiersTopCount)} onChange={v=> set('tiersTopCount', Math.max(1, Math.round(num(v, cfg.tiersTopCount))))} disabled={saving} />
            <Field label="Semanas Tier Temporal (T)" value={String(cfg.tempTierWeeks)} onChange={v=> set('tempTierWeeks', Math.max(0, Math.round(num(v, cfg.tempTierWeeks))))} disabled={saving} />
            <Field label="Días ventana de ventas" value={String(cfg.salesWindowDays)} onChange={v=> set('salesWindowDays', Math.max(1, Math.round(num(v, cfg.salesWindowDays))))} disabled={saving} />
          </div>
        )}

        <div className="flex gap-2">
          <button className="h-9 rounded-md border px-4 text-sm" disabled={saving || loading || !cfg} onClick={save}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          <button className="h-9 rounded-md border px-4 text-sm" onClick={() => window.location.reload()} disabled={saving}>Descartar</button>
        </div>
      </section>

      {saving && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="rounded-xl bg-white shadow-md px-5 py-4 flex items-center gap-3">
            <Spinner label="Actualizando configuración…" />
          </div>
        </div>
      )}
    </main>
  )
}

function Field({ label, value, onChange, suffix, disabled }: { label: string, value: string, onChange: (v: string) => void, suffix?: string, disabled?: boolean }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <input className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={e=> onChange(e.target.value)} disabled={disabled} />
        {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
      </div>
    </label>
  )
}

// Eliminado: opción para sólo días completos (ahora es regla fija)
