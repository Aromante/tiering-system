// Supabase (Postgres) data provider using forecasting_weekly_sales
// Requires: SUPABASE_DB_URL (standard Postgres connection string)

const { Pool } = (() => {
  try { return require('pg') } catch { return {} }
})()

function requiredEnv() {
  return !!(process.env.SUPABASE_DB_URL)
}

function parseIdListEnv(name, fallback = []) {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return fallback
  return raw.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean).map(x => Number(x)).filter(Number.isFinite)
}

// Defaults based on user-provided mapping
const DEFAULT_POS_IDS = [107414356280, 80271802680]
const DEFAULT_ONLINE_IDS = [98632499512]
const DEFAULT_EXCLUDE_IDS = [103584596280]

let pool = null
function getPool() {
  if (!pool) {
    if (!requiredEnv()) throw new Error('Supabase DB env not configured')
    pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 3 })
  }
  return pool
}

function sizeRegexes() {
  const SIZE_100_REGEX = process.env.TIERS_SIZE100_REGEX
  const SIZE_30_REGEX = process.env.TIERS_SIZE30_REGEX
  const r100 = (() => { try { return new RegExp(SIZE_100_REGEX || '(?:^|[^0-9])100(?:\\s*ml)?(?:$|[^0-9])', 'i') } catch { return /(?:^|[^0-9])100(?:\s*ml)?(?:$|[^0-9])/i } })()
  const r30 = (() => { try { return new RegExp(SIZE_30_REGEX || '(?:^|[^0-9])30(?:\\s*ml)?(?:$|[^0-9])', 'i') } catch { return /(?:^|[^0-9])30(?:\s*ml)?(?:$|[^0-9])/i } })()
  return { r100, r30 }
}

function skuPrefixRegex() {
  const prefix = String(process.env.TIERS_SKU_PREFIX || '').trim()
  if (!prefix) return null
  // Build a case-insensitive anchored regex that removes the prefix
  // Example: ^ABC-
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `^(?:${escaped})`
}

function channelFilters(channel, posIds, excludeIds) {
  // ONLINE = not POS and not excluded
  const allowTotal = (channel === 'TOTAL')
  const wantPos = (channel === 'POS')
  const wantOnline = (channel === 'ONLINE')
  return { allowTotal, wantPos, wantOnline, posIds, excludeIds }
}

// Build SQL for aggregated sales from forecasting_weekly_sales using date overlap weighting
function buildSalesSQL() {
  // product_key derivation removes an optional prefix and size tokens, collapses spaces/underscores/hyphens
  return `
WITH base AS (
  SELECT
    sku,
    location_id,
    COALESCE(window_start, week_start) AS wnd_start,
    COALESCE(window_end, week_end)   AS wnd_end,
    units_sold
  FROM public.forecasting_weekly_sales
  WHERE COALESCE(window_end, week_end) >= $1::date
    AND COALESCE(window_start, week_start) <= $2::date
),
overl AS (
  SELECT
    sku,
    location_id,
    wnd_start,
    wnd_end,
    units_sold,
    GREATEST(0, LEAST(wnd_end, $2::date) - GREATEST(wnd_start, $1::date) + 1) AS overlap_days,
    (wnd_end - wnd_start + 1) AS total_days
  FROM base
),
weighted AS (
  SELECT
    sku,
    location_id,
    CASE WHEN total_days > 0 THEN overlap_days::numeric / total_days ELSE 0 END AS weight,
    units_sold
  FROM overl
)
SELECT
  product_key AS productId,
  product_key AS name,
  COALESCE(ROUND(SUM(CASE WHEN (sku ~* $6 OR $6 = '') THEN CASE WHEN (sku ~* $4) THEN units_sold * weight ELSE 0 END ELSE 0 END))::int, 0) AS qty30,
  COALESCE(ROUND(SUM(CASE WHEN (sku ~* $6 OR $6 = '') THEN CASE WHEN (sku ~* $5) THEN units_sold * weight ELSE 0 END ELSE 0 END))::int, 0) AS qty100,
  0::numeric AS revenue,
  0::numeric AS "totalSales"
FROM (
  SELECT
    sku,
    location_id,
    weight,
    units_sold,
    UPPER(TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            CASE WHEN $3 <> '' THEN REGEXP_REPLACE(sku, $3, '', 'i') ELSE sku END,
            '(^|[^0-9])(30|100)(\\s*ml)?([^0-9]|$)', '\\1', 'gi'
          ),
          '[-_ ]+', ' ', 'g'
        ),
        '\\s+', ' ', 'g'
      )
    )) AS product_key
  FROM weighted
) t
WHERE ($7) -- channel filter expression injected via parameterized flags
GROUP BY product_key
HAVING (COALESCE(ROUND(SUM(CASE WHEN (sku ~* $6 OR $6 = '') THEN CASE WHEN (sku ~* $4) THEN units_sold * weight ELSE 0 END ELSE 0 END))::int, 0)
      + COALESCE(ROUND(SUM(CASE WHEN (sku ~* $6 OR $6 = '') THEN CASE WHEN (sku ~* $5) THEN units_sold * weight ELSE 0 END ELSE 0 END))::int, 0)) > 0
ORDER BY product_key;
`
}

function buildSkuSummarySQL() {
  return `
WITH base AS (
  SELECT
    sku,
    location_id,
    COALESCE(window_start, week_start) AS wnd_start,
    COALESCE(window_end, week_end)   AS wnd_end,
    units_sold
  FROM public.forecasting_weekly_sales
  WHERE COALESCE(window_end, week_end) >= $1::date
    AND COALESCE(window_start, week_start) <= $2::date
    AND sku = $3
),
overl AS (
  SELECT
    sku,
    location_id,
    wnd_start,
    wnd_end,
    units_sold,
    GREATEST(0, LEAST(wnd_end, $2::date) - GREATEST(wnd_start, $1::date) + 1) AS overlap_days,
    (wnd_end - wnd_start + 1) AS total_days
  FROM base
),
weighted AS (
  SELECT
    sku,
    location_id,
    CASE WHEN total_days > 0 THEN overlap_days::numeric / total_days ELSE 0 END AS weight,
    units_sold
  FROM overl
)
SELECT
  COALESCE(ROUND(SUM(units_sold * weight))::int, 0) AS qty,
  0::numeric AS netSales,
  0::numeric AS totalSales
FROM weighted
WHERE ($4);
`
}

function buildChannelClause(flags, posIdsParam = '$8', excludeIdsParam = '$9') {
  // Build an expression string evaluated server-side using boolean flags and arrays
  // $7 will receive this entire expression via query param substitution in JS
  // flags: { allowTotal, wantPos, wantOnline }
  if (flags.allowTotal) return 'TRUE'
  if (flags.wantPos) return `(location_id = ANY(${posIdsParam})) AND NOT (location_id = ANY(${excludeIdsParam}))`
  // ONLINE = not POS and not excluded
  return `(NOT (location_id = ANY(${posIdsParam})) AND NOT (location_id = ANY(${excludeIdsParam})))`
}

function useTieringTables() {
  const v = String(process.env.TIERS_USE_TIERING_TABLES || 'true').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function stripPrefix(sku) {
  const prefix = String(process.env.TIERS_SKU_PREFIX || '').trim()
  if (!prefix) return sku
  if (sku.startsWith(prefix)) return sku.slice(prefix.length)
  return sku
}

function is30(id) { return /-30$/i.test(id) }
function is100(id) { return /-100$/i.test(id) }

async function fetchSales(fromISO, toISO, channel = 'TOTAL', opts = {}) {
  if (!requiredEnv()) return []
  const pool = getPool()

  if (useTieringTables()) {
    const table = (String(channel || 'TOTAL').toUpperCase() === 'POS')
      ? 'public.tiering_pos'
      : (String(channel || 'TOTAL').toUpperCase() === 'ONLINE')
        ? 'public.tiering_online'
        : 'public.tiering_global'

    // Expect columns: sku, product_title, participation_pct, tier, three_weeks_units, revenue_gross
    const sql = `SELECT sku, product_title, participation_pct, tier, three_weeks_units, revenue_gross, rank FROM ${table}`
    const client = await pool.connect()
    try {
      const { rows } = await client.query(sql)
      const out = []
      for (const r of rows) {
        const rawSku = String(r.sku || '').trim()
        const pid = stripPrefix(rawSku)
        const qty = Number(r.three_weeks_units || 0)
        const row = {
          productId: pid || rawSku || String(r.product_title || '').trim() || 'UNKNOWN',
          name: String(r.product_title || pid || rawSku || '').trim(),
          qty30: is30(pid) ? qty : 0,
          qty100: is100(pid) ? qty : 0,
          revenue: Number(r.revenue_gross || 0),
          totalSales: Number(r.revenue_gross || 0),
          sharePct: (r.participation_pct != null ? Number(r.participation_pct) : undefined),
          tier: (r.tier ? String(r.tier) : undefined),
          rank: (r.rank != null ? Number(r.rank) : undefined)
        }
        // Only push rows that look like 30/100 variants
        if (row.qty30 > 0 || row.qty100 > 0) out.push(row)
      }
      return out
    } finally { client.release() }
  }

  // Fallback: compute from forecasting_weekly_sales
  const posIds = parseIdListEnv('TIERS_POS_LOCATION_IDS', DEFAULT_POS_IDS)
  const excludeIds = parseIdListEnv('TIERS_EXCLUDE_LOCATION_IDS', DEFAULT_EXCLUDE_IDS)
  const prefixRe = skuPrefixRegex() || ''
  const size30Re = process.env.TIERS_SIZE30_REGEX || '(^|[^0-9])30(\\s*ml)?([^0-9]|$)'
  const size100Re = process.env.TIERS_SIZE100_REGEX || '(^|[^0-9])100(\\s*ml)?([^0-9]|$)'
  const skuPrefixFilter = String(process.env.TIERS_SKU_PREFIX || '').trim()
  const skuFilterRegex = skuPrefixFilter ? `^${skuPrefixFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : ''

  const flags = channelFilters(String(channel || 'TOTAL').toUpperCase(), posIds, excludeIds)
  const channelClause = buildChannelClause(flags)
  const sql = buildSalesSQL()
  const params = [fromISO, toISO, prefixRe, size30Re, size100Re, skuFilterRegex, channelClause, posIds, excludeIds]
  const client = await pool.connect()
  try {
    const sqlFinal = sql.replace('$7', channelClause)
    const { rows } = await client.query(sqlFinal, params)
    return rows.map(r => ({
      productId: r.productid,
      name: r.name,
      qty30: Number(r.qty30 || 0),
      qty100: Number(r.qty100 || 0),
      revenue: Number(r.revenue || 0),
      totalSales: Number(r.totalSales || 0)
    }))
  } finally { client.release() }
}

async function fetchSkuSummary(fromISO, toISO, skuMatch, channel = 'TOTAL') {
  if (!requiredEnv()) return { sku: skuMatch, qty: 0, netSales: 0, totalSales: 0, byApp: {} }
  const pool = getPool()
  if (useTieringTables()) {
    const table = (String(channel || 'TOTAL').toUpperCase() === 'POS')
      ? 'public.tiering_pos'
      : (String(channel || 'TOTAL').toUpperCase() === 'ONLINE')
        ? 'public.tiering_online'
        : 'public.tiering_global'
    const sql = `SELECT sku, product_title, participation_pct, tier, three_weeks_units, revenue_gross, rank FROM ${table} WHERE sku = $1`
    const client = await pool.connect()
    try {
      const { rows } = await client.query(sql, [skuMatch])
      const r = rows[0]
      if (!r) return { sku: skuMatch, qty: 0, netSales: 0, totalSales: 0, byApp: {} }
      return {
        sku: skuMatch,
        qty: Number(r.three_weeks_units || 0),
        netSales: Number(r.revenue_gross || 0),
        totalSales: Number(r.revenue_gross || 0),
        byApp: {},
      }
    } finally { client.release() }
  }
  // fallback to weekly-based
  const posIds = parseIdListEnv('TIERS_POS_LOCATION_IDS', DEFAULT_POS_IDS)
  const excludeIds = parseIdListEnv('TIERS_EXCLUDE_LOCATION_IDS', DEFAULT_EXCLUDE_IDS)
  const flags = channelFilters(String(channel || 'TOTAL').toUpperCase(), posIds, excludeIds)
  const channelClause = buildChannelClause(flags, '$4', '$5')
  const sql = buildSkuSummarySQL()
  const client = await pool.connect()
  try {
    const sqlFinal = sql.replace('$4', channelClause)
    const { rows } = await client.query(sqlFinal, [fromISO, toISO, skuMatch, posIds, excludeIds])
    const r = rows[0] || { qty: 0, netsales: 0, totalsales: 0 }
    return {
      sku: skuMatch,
      qty: Number(r.qty || 0),
      netSales: Number(r.netsales || 0),
      totalSales: Number(r.totalsales || 0),
      byApp: {}
    }
  } finally { client.release() }
}

module.exports = { fetchSales, fetchSkuSummary }
