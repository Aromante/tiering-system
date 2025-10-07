const path = require('path')
const fsp = require('fs/promises')
const { fetchSales } = require('../integrations/provider')

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
  // For now, just proxy to fetchSales without caching
  return await fetchSales(fromISO, toISO, channel, opts)
}

module.exports = { fetchAggregatedSales }
