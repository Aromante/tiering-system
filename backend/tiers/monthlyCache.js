const path = require('path')
const fsp = require('fs/promises')
const { fetchSales } = require('../integrations/shopify')

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache')
function ensureDir(p) { require('fs').existsSync(p) || require('fs').mkdirSync(p, { recursive: true }) }

function suffixFromOpts(opts = {}) {
  const net = (opts.netOfReturns ? 'N1' : 'N0')
  const byRef = (opts.byRefundDate ? 'R1' : 'R0')
  const tf = (opts.timeField || 'processed_at').trim()
  const xHash = require('crypto').createHash('sha1').update(String(opts.extraQuery || '')).digest('hex').slice(0,8)
  return `${net}-${byRef}-TF${tf}-X${xHash}`
}

async function readMonth(channel, yyyymm, opts = {}) {
  try {
    const suf = suffixFromOpts(opts)
    const file = path.join(CACHE_DIR, `monthly-${channel}-${yyyymm}-${suf}.json`)
    const raw = await fsp.readFile(file, 'utf-8')
    return JSON.parse(raw)
  } catch { return null }
}
async function writeMonth(channel, yyyymm, data, opts = {}) {
  ensureDir(CACHE_DIR)
  const suf = suffixFromOpts(opts)
  const file = path.join(CACHE_DIR, `monthly-${channel}-${yyyymm}-${suf}.json`)
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
}

async function fetchAggregatedSales(channel, fromISO, toISO, opts = {}) {
  // Dev shortcut: allow forcing sample data to validate UI end-to-end without Shopify.
  // Set TIERS_FORCE_SAMPLE=1 in backend/.env to enable.
  if (String(process.env.TIERS_FORCE_SAMPLE || '').trim() === '1') {
    return sampleAggregatedSales()
  }
  // If Shopify env is not configured, return empty list quickly (no retries)
  const hasShopify = Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN)
  if (!hasShopify) {
    return []
  }
  // Otherwise, fetch real sales from Shopify
  return await fetchSales(fromISO, toISO, channel, opts)
}

module.exports = { fetchAggregatedSales }

// ---- Sample data for local validation (no Shopify required) ----
function sampleAggregatedSales() {
  // Minimal realistic shape expected by downstream code
  // Fields: productId, name, qty30, qty100, revenue
  const rows = [
    { productId: 'gid://shopify/Product/1001', name: 'Aromante Aurora 100ml', qty30: 0, qty100: 180, revenue: 180 * 520 },
    { productId: 'gid://shopify/Product/1002', name: 'Aromante Brisa 30ml', qty30: 320, qty100: 0, revenue: 320 * 190 },
    { productId: 'gid://shopify/Product/1003', name: 'Aromante Cerezo 100ml', qty30: 0, qty100: 95, revenue: 95 * 510 },
    { productId: 'gid://shopify/Product/1004', name: 'Aromante Duna 30ml', qty30: 210, qty100: 0, revenue: 210 * 185 },
    { productId: 'gid://shopify/Product/1005', name: 'Aromante Esencia 100ml', qty30: 0, qty100: 60, revenue: 60 * 540 },
  ]
  return rows
}
