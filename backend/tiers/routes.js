const express = require('express')
const crypto = require('crypto')
let utcToZonedTime = null
let zonedTimeToUtc = null
try {
  const dftz = require('date-fns-tz')
  utcToZonedTime = dftz.utcToZonedTime
  zonedTimeToUtc = dftz.zonedTimeToUtc
} catch {}
const { readConfig, writeConfig } = require('./configStore')
const { computeTierAssignments } = require('./compute')
const { fetchSales, fetchSkuSummary, auditSku, auditProductById } = require('../integrations/shopify')
const { fetchAggregatedSales } = require('./monthlyCache')
const router = express.Router()
const REMOTE_BASE = process.env.TIERS_REMOTE_BASE || ''

function computeIsoWindowDays(days, completedOnly = false) {
  const tzName = String(process.env.TIERS_TZ || '').trim()
  const nDays = Math.max(1, Number(days) || 1)
  if (tzName && typeof utcToZonedTime === 'function' && typeof zonedTimeToUtc === 'function') {
    const now = new Date()
    const zoned = utcToZonedTime(now, tzName)
    const y = zoned.getFullYear()
    const m = zoned.getMonth()
    const d = zoned.getDate()
    const anchor = completedOnly ? new Date(y, m, d - 1, 23, 59, 59, 999) : new Date(y, m, d, 23, 59, 59, 999)
    const endLocal = anchor
    const startLocal = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - (nDays - 1), 0, 0, 0, 0)
    const fromUTC = zonedTimeToUtc(startLocal, tzName)
    const toUTC = zonedTimeToUtc(endLocal, tzName)
    return { fromISO: fromUTC.toISOString(), toISO: toUTC.toISOString() }
  }
  const offsetH = Number(process.env.TIERS_TZ_OFFSET_HOURS || '-7')
  const offsetMs = offsetH * 3600 * 1000
  const now = new Date()
  const tzNowMs = now.getTime() + offsetMs
  const tzNow = new Date(tzNowMs)
  const y = tzNow.getUTCFullYear()
  const m = tzNow.getUTCMonth()
  const d = tzNow.getUTCDate()
  const anchorEndLocal = completedOnly ? Date.UTC(y, m, d - 1, 23, 59, 59, 999) : Date.UTC(y, m, d, 23, 59, 59, 999)
  const endUtcMs = anchorEndLocal - offsetMs
  const startUtcMs = endUtcMs - ((nDays * 24 * 3600 * 1000) - 1)
  return { fromISO: new Date(startUtcMs).toISOString(), toISO: new Date(endUtcMs).toISOString() }
}

function shiftIsoWindowDays(fromISO, toISO, days) {
  const nDays = Math.max(1, Number(days) || 1)
  const tzName = String(process.env.TIERS_TZ || '').trim()
  try {
    if (tzName && typeof utcToZonedTime === 'function' && typeof zonedTimeToUtc === 'function') {
      const f = new Date(fromISO)
      const t = new Date(toISO)
      if (Number.isFinite(f.getTime()) && Number.isFinite(t.getTime())) {
        const fLoc = utcToZonedTime(f, tzName)
        const tLoc = utcToZonedTime(t, tzName)
        const fShift = new Date(fLoc.getFullYear(), fLoc.getMonth(), fLoc.getDate() - nDays, fLoc.getHours(), fLoc.getMinutes(), fLoc.getSeconds(), fLoc.getMilliseconds())
        const tShift = new Date(tLoc.getFullYear(), tLoc.getMonth(), tLoc.getDate() - nDays, tLoc.getHours(), tLoc.getMinutes(), tLoc.getSeconds(), tLoc.getMilliseconds())
        const fUTC = zonedTimeToUtc(fShift, tzName)
        const tUTC = zonedTimeToUtc(tShift, tzName)
        return { prevFrom: fUTC.toISOString(), prevTo: tUTC.toISOString() }
      }
    }
  } catch {}
  const ms = nDays * 24 * 3600 * 1000
  return { prevFrom: new Date(Date.parse(fromISO) - ms).toISOString(), prevTo: new Date(Date.parse(toISO) - ms).toISOString() }
}

function computeIsoWindowMonth(year, month1) {
  const tzName = String(process.env.TIERS_TZ || '').trim()
  const y = Number(year)
  const m1 = Math.min(12, Math.max(1, Number(month1)))
  if (tzName && typeof utcToZonedTime === 'function' && typeof zonedTimeToUtc === 'function') {
    const startLocal = new Date(y, m1 - 1, 1, 0, 0, 0, 0)
    const endLocal = new Date(y, m1, 0, 23, 59, 59, 999)
    const fromUTC = zonedTimeToUtc(startLocal, tzName)
    const toUTC = zonedTimeToUtc(endLocal, tzName)
    return { fromISO: fromUTC.toISOString(), toISO: toUTC.toISOString() }
  }
  const offsetH = Number(process.env.TIERS_TZ_OFFSET_HOURS || '-7')
  const offsetMs = offsetH * 3600 * 1000
  const startLocalMs = Date.UTC(y, m1 - 1, 1, 0, 0, 0, 0)
  const endLocalMs = Date.UTC(y, m1, 0, 23, 59, 59, 999)
  const fromUtc = new Date(startLocalMs - offsetMs)
  const toUtc = new Date(endLocalMs - offsetMs)
  return { fromISO: fromUtc.toISOString(), toISO: toUtc.toISOString() }
}

function computePrevMonthWindow(fromISO) {
  const tzName = String(process.env.TIERS_TZ || '').trim()
  try {
    if (tzName && typeof utcToZonedTime === 'function' && typeof zonedTimeToUtc === 'function') {
      const f = new Date(fromISO)
      const fLoc = utcToZonedTime(f, tzName)
      const y = fLoc.getFullYear()
      const m = fLoc.getMonth()
      const prevYear = m === 0 ? y - 1 : y
      const prevMonth1 = m === 0 ? 12 : (m)
      const prev = computeIsoWindowMonth(prevYear, prevMonth1)
      return { prevFrom: prev.fromISO, prevTo: prev.toISO }
    }
  } catch {}
  const f = new Date(fromISO)
  const prevYear = f.getUTCMonth() === 0 ? f.getUTCFullYear() - 1 : f.getUTCFullYear()
  const prevMonth1 = f.getUTCMonth() === 0 ? 12 : f.getUTCMonth()
  const prev = computeIsoWindowMonth(prevYear, prevMonth1)
  return { prevFrom: prev.fromISO, prevTo: prev.toISO }
}

async function getSummaryBaseRows(channel, fromISO, toISO, opts = {}) {
  const sales = await fetchAggregatedSales(channel, fromISO, toISO, opts)
  const sumRev = sales.reduce((a,b)=> a + (Number(b.revenue||0)), 0) || 1
  const withShare = sales.map(r => ({ ...r, sharePct: (Number(r.revenue||0)*100)/sumRev }))
  const cfg = await readConfig()
  const assign = computeTierAssignments(withShare, cfg)
  const tierMap = new Map(assign.map(a => [a.productId, a.tier]))
  return withShare.map(r => ({ ...r, tier: tierMap.get(r.productId) || 'C' }))
}

router.use(express.json())

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set' })
  if (req.get('X-Admin-Token') !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' })
  next()
}

router.get('/api/tiers/config', async (_req, res) => { res.json(await readConfig()) })

router.put('/api/tiers/config', requireAdmin, async (req, res) => {
  const body = req.body || {}
  const safe = {
    tierSSPct: Number(body.tierSSPct), tierSPct: Number(body.tierSPct), tierAPct: Number(body.tierAPct),
    tiersTopCount: Number(body.tiersTopCount), tempTierWeeks: Number(body.tempTierWeeks), salesWindowDays: Number(body.salesWindowDays),
    useCompletedDays: Boolean(body.useCompletedDays),
    recalcFrequencyDays: Number(body.recalcFrequencyDays), graceMonthsC: Number(body.graceMonthsC)
  }
  const saved = await writeConfig(safe)
  try { summaryCache.clear() } catch {}
  res.json(saved)
})

router.post('/api/tiers/recalculate', async (req, res) => {
  const { channel = 'TOTAL', from, to } = req.body || {}
  const cfg = await readConfig()
  const { fromISO, toISO } = from && to ? { fromISO: from, toISO: to } : computeIsoWindowDays(cfg.salesWindowDays, true)
  const sales = await fetchSales(fromISO, toISO, channel)
  const assignments = computeTierAssignments(sales, cfg)
  res.json(assignments)
})

router.get('/api/tiers/summary', async (req, res) => {
  res.setHeader('X-TS-Handler', 'summary')
  try {
  const { channel = 'TOTAL', from, to, tiers, search = '', page = '1', pageSize = '50' } = req.query
  const cfg = await readConfig()
  const onParam = String(req.query.on || '').trim()
  const monthParam = String(req.query.month || '').trim()
  const yearParam = String(req.query.year || '').trim()
  function parseMonthYear(mStr, yStr) {
    if (!mStr) return null
    let y = NaN; let m1 = NaN
    if (/^\d{4}-\d{2}$/.test(mStr)) { y = Number(mStr.slice(0,4)); m1 = Number(mStr.slice(5)) }
    else { m1 = Number(mStr) }
    if (!Number.isFinite(y)) {
      if (yStr) y = Number(yStr)
      if (!Number.isFinite(y)) {
        const tzName = String(process.env.TIERS_TZ || '').trim()
        const now = new Date()
        const z = (tzName && typeof utcToZonedTime === 'function') ? utcToZonedTime(now, tzName) : now
        y = z.getFullYear()
      }
    }
    if (!(Number.isFinite(m1) && m1 >= 1 && m1 <= 12)) return null
    return { year: y, month1: m1 }
  }
  const monthSel = parseMonthYear(monthParam, yearParam)
  let w = monthSel
    ? computeIsoWindowMonth(monthSel.year, monthSel.month1)
    : ((from && to) ? { fromISO: String(from), toISO: String(to) } : computeIsoWindowDays(cfg.salesWindowDays, true))
  if (onParam && !(from && to)) {
    try {
      const days = Math.max(1, Number(req.query.days || cfg.salesWindowDays || 1))
      const tzName = String(process.env.TIERS_TZ || '').trim()
      const [y,m,d] = onParam.split('-').map(x=> Number(x))
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        if (tzName && typeof zonedTimeToUtc === 'function') {
          const endLocal = new Date(y, m-1, d, 23, 59, 59, 999)
          const startLocal = new Date(y, m-1, d - (days - 1), 0, 0, 0, 0)
          w = { fromISO: zonedTimeToUtc(startLocal, tzName).toISOString(), toISO: zonedTimeToUtc(endLocal, tzName).toISOString() }
        }
      }
    } catch {}
  }
  // Optional remote passthrough but enforcing completed-day window via from/to when not provided
  if (REMOTE_BASE) {
    try {
      const qp = new URLSearchParams()
      for (const [k, v] of Object.entries(req.query || {})) {
        if (v == null) continue
        if (Array.isArray(v)) { if (v.length) qp.set(k, String(v[0])) }
        else qp.set(k, String(v))
      }
      if (!qp.get('from') || !qp.get('to')) { qp.set('from', w.fromISO); qp.set('to', w.toISO) }
      const url = `${REMOTE_BASE.replace(/\/$/,'')}/api/tiers/summary?${qp.toString()}`
      const r = await fetch(url)
      const j = await r.json()
      res.setHeader('X-TS-Remote', 'true')
      return res.status(r.status).json(j)
    } catch (e) {
      // fall back to local
    }
  }
  const fromISO = w.fromISO
  const toISO = w.toISO
  const lite = ['1','true','yes','on'].includes(String(req.query.lite || '').toLowerCase())
  const nocache = String(req.query.nocache || '').toLowerCase() === 'true' || String(req.query.cache || '') === '0'
  const deltaBase = (() => { const s = String(req.query.deltaBase || process.env.TIERS_DELTA_BASE_POLICY || 'anchor_start').trim().toLowerCase(); return (s === 'anchor_end') ? 'anchor_end' : 'anchor_start' })()
  const qpNet = String(req.query.net || req.query.netOfReturns || '').toLowerCase()
  const netOfReturns = qpNet ? ['1','true','yes','on'].includes(qpNet) : (String(process.env.TIERS_NET_OF_RETURNS || '').toLowerCase() === 'true')
  const qpPolicy = String(req.query.returnsPolicy || '').toLowerCase()
  const qpByRefund = String(req.query.byRefundDate || '').toLowerCase()
  const byRefundDate = qpPolicy ? (qpPolicy === 'refund_date') : (qpByRefund ? ['1','true','yes','on'].includes(qpByRefund) : (String(process.env.TIERS_NET_RETURNS_BY_REFUND_DATE || '').toLowerCase() === 'true'))
  const timeField = (() => { const tf = String(req.query.timeField || '').trim().toLowerCase(); if (tf === 'created_at' || tf === 'processed_at') return tf; const env = String(process.env.TIERS_ORDER_TIME_FIELD || 'processed_at').trim().toLowerCase(); return env === 'processed_at' ? 'processed_at' : 'created_at' })()
  const baseRows = await getSummaryBaseRows(String(channel), fromISO, toISO, { nocache, netOfReturns, byRefundDate, timeField })
  let channelsMeta = null
  if (!lite && String(channel).toUpperCase() === 'TOTAL') {
    try {
      const online = await getSummaryBaseRows('ONLINE', fromISO, toISO, { nocache, netOfReturns, byRefundDate, timeField })
      const pos = await getSummaryBaseRows('POS', fromISO, toISO, { nocache, netOfReturns, byRefundDate, timeField })
      function slim(rows) { return rows.map(r => ({ productId: r.productId, name: r.name, qty30: r.qty30||0, qty100: r.qty100||0, revenue: Number(r.revenue||0) })) }
      channelsMeta = { ONLINE: slim(online), POS: slim(pos) }
    } catch {}
  }

  const rankMap = new Map(); for (let i = 0; i < baseRows.length; i++) rankMap.set(baseRows[i].productId, i + 1)
  let prevMap = new Map()
  try {
    if (!lite) {
      const msPerDay = 24 * 3600 * 1000
      const monthMode = !!monthSel
      const { prevFrom, prevTo } = (() => {
        if (monthMode) return computePrevMonthWindow(fromISO)
        const lenDays = (() => {
          if (!(from && to)) return Number(cfg.salesWindowDays || 35)
          const dtFrom = Date.parse(fromISO); const dtTo = Date.parse(toISO)
          if (Number.isFinite(dtFrom) && Number.isFinite(dtTo) && dtTo >= dtFrom) return Math.max(1, Math.floor((dtTo - dtFrom) / msPerDay) + 1)
          return Number(cfg.salesWindowDays || 35)
        })()
        if (deltaBase === 'anchor_end') return shiftIsoWindowDays(fromISO, toISO, lenDays)
        try { const tzName = String(process.env.TIERS_TZ || '').trim(); if (tzName && typeof utcToZonedTime === 'function' && typeof zonedTimeToUtc === 'function') { const f = new Date(fromISO); const fLoc = utcToZonedTime(f, tzName); const prevToLoc = new Date(fLoc.getFullYear(), fLoc.getMonth(), fLoc.getDate(), fLoc.getHours(), fLoc.getMinutes(), fLoc.getSeconds(), Math.max(0, fLoc.getMilliseconds() - 1)); const prevFromLoc = new Date(prevToLoc.getFullYear(), prevToLoc.getMonth(), prevToLoc.getDate() - (lenDays - 1), prevToLoc.getHours(), prevToLoc.getMinutes(), prevToLoc.getSeconds(), prevToLoc.getMilliseconds()); const pF = zonedTimeToUtc(prevFromLoc, tzName).toISOString(); const pT = zonedTimeToUtc(prevToLoc, tzName).toISOString(); return { prevFrom: pF, prevTo: pT } } } catch {}
        const fromMs = Date.parse(fromISO); const prevToMs = fromMs - 1; const prevFromMs = prevToMs - (lenDays * msPerDay) + 1; return { prevFrom: new Date(prevFromMs).toISOString(), prevTo: new Date(prevToMs).toISOString() }
      })()
      const prevRows = await getSummaryBaseRows(String(channel), prevFrom, prevTo, { nocache, netOfReturns, byRefundDate, timeField })
      prevMap = new Map(prevRows.map(r => [r.productId, Number(r.sharePct || 0)]))
    }
  } catch {}

  let list = baseRows
  if (tiers) { const set = new Set(String(tiers).split(',').map(x => x.trim())); list = list.filter(r => set.has(r.tier)) }
  if (search) list = list.filter(r => r.name.toLowerCase().includes(String(search).toLowerCase()))
  const p = Math.max(parseInt(page, 10) || 1, 1)
  const ps = Math.max(parseInt(pageSize, 10) || 50, 1)
  const start = (p - 1) * ps
  const end = start + ps
  const withMeta = list.map(r => ({
    ...r,
    rank: rankMap.get(r.productId) || null,
    deltaSharePct: (lite
      ? 0
      : Number((Number(r.sharePct || 0) - (prevMap.get(r.productId) || 0)).toFixed(4)))
  }))
  const cfgNow = await readConfig().catch(() => ({ configVersion: 1 }))
  const pageRows = withMeta.slice(start, end)
  const payload = { rows: pageRows, total: withMeta.length, page: p, pageSize: ps, configVersion: cfgNow.configVersion || 1, window: { fromISO, toISO }, meta: { channels: channelsMeta } }

  // CSV export
  if (String(req.query.format || '').toLowerCase() === 'csv') {
    const cols = ['productId','name','tier','rank','qty30','qty100','revenue','sharePct','deltaSharePct']
    const esc = (v) => {
      const s = (v == null ? '' : String(v))
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s
    }
    const lines = [cols.join(',')].concat(pageRows.map(r => cols.map(k => esc(r && r[k])).join(',')))
    const csv = lines.join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="tiers-summary-${channel}-${Date.now()}.csv"`)
    return res.send(csv)
  }

  try {
    const body = JSON.stringify(payload)
    const hash = crypto.createHash('sha1').update(body).digest('hex')
    const eTag = `W/"${hash}"`
    if (req.headers['if-none-match'] === eTag) {
      res.setHeader('ETag', eTag)
      res.setHeader('X-Window-From', fromISO)
      res.setHeader('X-Window-To', toISO)
      const cacheS = Number(process.env.TIERS_HTTP_CACHE_S || '60')
      res.setHeader('Cache-Control', `public, max-age=${cacheS}`)
      return res.status(304).end()
    }
    const cacheS = Number(process.env.TIERS_HTTP_CACHE_S || '60')
    res.setHeader('ETag', eTag)
    res.setHeader('X-Window-From', fromISO)
    res.setHeader('X-Window-To', toISO)
    res.setHeader('Cache-Control', `public, max-age=${cacheS}`)
    if (lite) res.setHeader('X-Lite', 'true')
    res.setHeader('X-Net-Of-Returns', String(netOfReturns))
    res.setHeader('X-By-Refund-Date', String(byRefundDate))
    res.setHeader('X-Time-Field', String(timeField))
    res.setHeader('X-Delta-Base', String(monthSel ? 'month_prev' : deltaBase))
    if (monthSel) { res.setHeader('X-Month-Mode', 'true'); res.setHeader('X-Month', String(monthSel.month1)); res.setHeader('X-Year', String(monthSel.year)) }
    return res.json(payload)
  } catch { return res.json(payload) }
  } catch (e) {
    console.error('[tiers] summary error:', e)
    return res.status(500).json({ error: String(e?.message || e) })
  }
})

// Debug endpoint to compare per-SKU with Shopify report
router.get('/api/tiers/debug-sku', async (req, res) => {
  try {
    const sku = String(req.query.sku || '').trim()
    if (!sku) return res.status(400).json({ error: 'Missing sku' })
    const channel = String(req.query.channel || 'TOTAL').toUpperCase()
    const cfg = await readConfig()
    const days = Number(req.query.days || cfg.salesWindowDays || 1)
    const on = String(req.query.on || '').trim()
    let fromISO, toISO
    if (on) {
      // Anchor to specific local date (end of day), then go back (days-1)
      const tzName = String(process.env.TIERS_TZ || '').trim()
      const offsetH = Number(process.env.TIERS_TZ_OFFSET_HOURS || '-7')
      try {
        const [y,m,d] = on.split('-').map(x=> Number(x))
        if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
          if (tzName && typeof zonedTimeToUtc === 'function') {
            const endLocal = new Date(y, m-1, d, 23, 59, 59, 999)
            const startLocal = new Date(y, m-1, d - (days - 1), 0, 0, 0, 0)
            fromISO = zonedTimeToUtc(startLocal, tzName).toISOString()
            toISO = zonedTimeToUtc(endLocal, tzName).toISOString()
          } else {
            const offsetMs = offsetH * 3600 * 1000
            const endLocalMs = Date.UTC(y, m-1, d, 23, 59, 59, 999)
            const toUtcMs = endLocalMs - offsetMs
            const fromUtcMs = toUtcMs - ((days * 24 * 3600 * 1000) - 1)
            fromISO = new Date(fromUtcMs).toISOString()
            toISO = new Date(toUtcMs).toISOString()
          }
        }
      } catch {}
    }
    if (!fromISO || !toISO) {
      const win = computeIsoWindowDays(days, true)
      fromISO = win.fromISO; toISO = win.toISO
    }
    const tf = String(req.query.tf || process.env.TIERS_ORDER_TIME_FIELD || 'processed_at')
    const timeField = (tf === 'created_at' ? 'created_at' : 'processed_at')
    const r = await fetchSkuSummary(fromISO, toISO, sku, channel, { timeField })
    return res.json({ sku, window: { fromISO, toISO }, timeField, ...r })
  } catch (e) { return res.status(500).json({ error: 'debug failed', detail: e?.message || String(e) }) }
})

router.get('/api/tiers/audit', async (req, res) => {
  try {
    const sku = String(req.query.sku || '').trim()
    if (!sku) return res.status(400).json({ error: 'Missing sku' })
    const channel = String(req.query.channel || 'TOTAL').toUpperCase()
    const cfg = await readConfig()
    const w = (req.query.from && req.query.to) ? { fromISO: String(req.query.from), toISO: String(req.query.to) } : computeIsoWindowDays(cfg.salesWindowDays)
    const { fromISO, toISO } = w
    const qpPolicy = String(req.query.returnsPolicy || '').toLowerCase()
    const qpByRefund = String(req.query.byRefundDate || '').toLowerCase()
    const byRefundDate = qpPolicy ? (qpPolicy === 'refund_date') : (qpByRefund ? ['1','true','yes','on'].includes(qpByRefund) : (String(process.env.TIERS_NET_RETURNS_BY_REFUND_DATE || '').toLowerCase() === 'true'))
    const result = await auditSku(fromISO, toISO, sku, channel)
    return res.json({ window: { fromISO, toISO }, channel, sku, ...result, byRefundDate })
  } catch (e) { return res.status(500).json({ error: 'Audit error', detail: e?.message || String(e) }) }
})

router.get('/api/tiers/audit-product', async (req, res) => {
  try {
    const productId = String(req.query.productId || '').trim()
    if (!productId) return res.status(400).json({ error: 'Missing productId' })
    const channel = String(req.query.channel || 'TOTAL').toUpperCase()
    const cfg = await readConfig()
    const w = (req.query.from && req.query.to) ? { fromISO: String(req.query.from), toISO: String(req.query.to) } : computeIsoWindowDays(cfg.salesWindowDays)
    const { fromISO, toISO } = w
    const qpPolicy = String(req.query.returnsPolicy || '').toLowerCase()
    const qpByRefund = String(req.query.byRefundDate || '').toLowerCase()
    const byRefundDate = qpPolicy ? (qpPolicy === 'refund_date') : (qpByRefund ? ['1','true','yes','on'].includes(qpByRefund) : (String(process.env.TIERS_NET_RETURNS_BY_REFUND_DATE || '').toLowerCase() === 'true'))
    const tf = String(req.query.timeField || String(process.env.TIERS_ORDER_TIME_FIELD || 'created_at')).toLowerCase()
    const timeField = (tf === 'processed_at') ? 'processed_at' : 'created_at'
    const result = await auditProductById(fromISO, toISO, productId, channel, { byRefundDate, timeField })
    return res.json({ window: { fromISO, toISO }, channel, productId, byRefundDate, timeField, ...result })
  } catch (e) { return res.status(500).json({ error: 'Audit product error', detail: e?.message || String(e) }) }
})

module.exports = { router }
