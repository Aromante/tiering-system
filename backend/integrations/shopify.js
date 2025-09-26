// Use global fetch (Node 18+)
const fetch = (...args) => globalThis.fetch(...args)

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_TOKEN,
} = process.env

function requiredEnv() {
  return !!(SHOPIFY_STORE_DOMAIN && SHOPIFY_ADMIN_TOKEN)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function shopifyGraphQL(query, variables) {
  if (!requiredEnv()) throw new Error('Shopify env not configured')
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/graphql.json`
  const maxAttempts = Math.max(1, Number(process.env.SHOPIFY_GQL_RETRY_MAX || '6'))
  const baseDelay = Math.max(50, Number(process.env.SHOPIFY_GQL_MIN_DELAY_MS || '300'))
  let lastErr = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN },
        body: JSON.stringify({ query, variables })
      })
      const text = await res.text().catch(() => '')
      let data = {}
      try { data = text ? JSON.parse(text) : {} } catch {}
      const isThrottledHttp = res.status === 429
      const errs = Array.isArray(data?.errors) ? data.errors : []
      const hasThrottleError = errs.some(e => (e?.extensions?.code === 'THROTTLED') || /throttled/i.test(String(e?.message || '')))
      if (!res.ok || errs.length) {
        if (isThrottledHttp || hasThrottleError) {
          const jitter = Math.floor(Math.random() * 200)
          const waitMs = Math.min(8000, Math.round(baseDelay * Math.pow(2, attempt - 1)) + jitter)
          await sleep(waitMs)
          continue
        }
        const msg = errs.length ? JSON.stringify(errs) : `HTTP ${res.status} ${text ? ' body='+text.slice(0,200) : ''}`
        throw new Error(`Shopify GraphQL error: ${msg}`)
      }
      const interDelay = Math.max(0, Number(process.env.SHOPIFY_GQL_INTER_DELAY_MS || '0'))
      if (interDelay) await sleep(interDelay)
      return data
    } catch (e) { lastErr = e; const jitter = Math.floor(Math.random() * 200); const waitMs = Math.min(8000, Math.round(baseDelay * Math.pow(2, attempt - 1)) + jitter); await sleep(waitMs) }
  }
  throw (lastErr || new Error('Shopify GraphQL failed after retries'))
}

async function paginate(query, path, variables = {}, mapper = (n) => n) {
  let after = null
  const out = []
  while (true) {
    const vars = { ...variables, after }
    const data = await shopifyGraphQL(query, vars)
    const root = path.split('.').reduce((acc, k) => acc?.[k], data.data)
    const edges = root?.edges || []
    for (const e of edges) out.push(mapper(e.node))
    if (!root?.pageInfo?.hasNextPage) break
    after = edges[edges.length - 1]?.cursor
    if (!after) break
  }
  return out
}

// Aggregate orders into product sales buckets
async function fetchSales(fromISO, toISO, channel = 'TOTAL', opts = {}) {
  if (!requiredEnv()) return []
  const NET_RETURNS = (typeof opts.netOfReturns === 'boolean') ? opts.netOfReturns : (String(process.env.TIERS_NET_OF_RETURNS || '').toLowerCase() === 'true')
  const timeField = String(opts.timeField || process.env.TIERS_ORDER_TIME_FIELD || 'processed_at').trim()
  const extra = (opts.extraQuery != null ? String(opts.extraQuery) : (process.env.TIERS_ORDER_QUERY_EXTRA || 'financial_status:paid -status:cancelled'))
  const queryTime = `${timeField}:>=${fromISO} ${timeField}:<=${toISO}`
  const querySales = `${queryTime}${extra ? ' ' + extra : ''}`

  const q = /* GraphQL */ `
    query Orders($first:Int!, $after:String, $query:String!) {
      orders(first:$first, after:$after, query:$query) {
        edges { cursor node {
          id createdAt taxesIncluded app { name }
          lineItems(first:250) { edges { node {
            quantity discountedTotalSet { shopMoney { amount } }
            taxLines { priceSet { shopMoney { amount } } }
            variant { id sku title product { id title } }
          } } }
          refunds { 
            createdAt
            refundLineItems(first:250) { edges { node { quantity lineItem { variant { id sku title product { id title } } } } } }
          }
        } }
        pageInfo { hasNextPage }
      }
    }
  `
  const CH_POS = new Set(['Point of Sale'])
  const SIZE_100_REGEX = process.env.TIERS_SIZE100_REGEX
  const SIZE_30_REGEX = process.env.TIERS_SIZE30_REGEX
  const r100 = (() => { try { return new RegExp(SIZE_100_REGEX || '(?:^|[^0-9])100(?:\s*ml)?(?:$|[^0-9])', 'i') } catch { return /(?:^|[^0-9])100(?:\s*ml)?(?:$|[^0-9])/i } })()
  const r30 = (() => { try { return new RegExp(SIZE_30_REGEX || '(?:^|[^0-9])30(?:\s*ml)?(?:$|[^0-9])', 'i') } catch { return /(?:^|[^0-9])30(?:\s*ml)?(?:$|[^0-9])/i } })()
  function detectSize({ sku, vtitle }) { const s = String(sku || ''), t = String(vtitle || ''); const has100 = r100.test(s) || r100.test(t) || /-100\b/i.test(s); const has30 = r30.test(s) || r30.test(t) || /-30\b/i.test(s); return { is100: !!has100 && !has30, is30: !!has30 && !has100 } }

  const salesMap = new Map()
  const variantSizeMap = new Map()
  const prefix = process.env.TIERS_SKU_PREFIX || ''
  const prefixRe = prefix ? new RegExp(`^${prefix}`) : /^/

  const orders = await paginate(q, 'orders', { first: 100, query: querySales }, (n) => n)
  for (const o of orders) {
    const appName = o?.app?.name || ''
    let chan = CH_POS.has(appName) ? 'POS' : 'ONLINE'
    if (channel !== 'TOTAL' && chan !== channel) continue
    const lines = o?.lineItems?.edges || []
    function unitRevenueForVariant(variantId, fallbackSku) {
      try {
        let totalNet = 0, totalQty = 0
        for (const le2 of lines) {
          const li2 = le2.node
          const vId2 = li2?.variant?.id || ''
          const sku2 = (li2?.variant?.sku || '').trim()
          if ((variantId && vId2 === variantId) || (!variantId && fallbackSku && sku2 === fallbackSku)) {
            const q2 = Number(li2?.quantity || 0)
            const a2 = Number(li2?.discountedTotalSet?.shopMoney?.amount || 0)
            const taxes2 = (li2?.taxLines || []).map(tl => Number(tl?.priceSet?.shopMoney?.amount || 0)).filter(Number.isFinite).reduce((aa,bb)=>aa+bb,0)
            const net2 = Number.isFinite(a2) ? (o?.taxesIncluded ? Math.max(a2 - taxes2, 0) : a2) : 0
            totalQty += q2; totalNet += net2
          }
        }
        if (totalQty > 0 && Number.isFinite(totalNet)) return totalNet / totalQty
      } catch {}
      return 0
    }
    function unitTotalForVariant(variantId, fallbackSku) {
      try {
        let totalAmt = 0, totalQty = 0
        for (const le2 of lines) {
          const li2 = le2.node
          const vId2 = li2?.variant?.id || ''
          const sku2 = (li2?.variant?.sku || '').trim()
          const a2 = Number(li2?.discountedTotalSet?.shopMoney?.amount || 0)
          const taxes2 = (li2?.taxLines || []).map(tl => Number(tl?.priceSet?.shopMoney?.amount || 0)).filter(Number.isFinite).reduce((aa,bb)=>aa+bb,0)
          const ttl2 = (o?.taxesIncluded ? a2 : a2 + taxes2)
          if ((variantId && vId2 === variantId) || (!variantId && fallbackSku && sku2 === fallbackSku)) {
            const q2 = Number(li2?.quantity || 0)
            totalQty += q2; totalAmt += ttl2
          }
        }
        if (totalQty > 0 && Number.isFinite(totalAmt)) return totalAmt / totalQty
      } catch {}
      return 0
    }

    for (const le of lines) {
      const li = le.node
      const sku = (li?.variant?.sku || '').trim()
      const vtitle = (li?.variant?.title || '').trim()
      const product = li?.variant?.product || null
      const productId = product?.id || ''
      const variantId = li?.variant?.id || ''
      if (!productId) continue
      const prodName = product?.title || product?.handle || productId
      if (!prefixRe.test(sku)) continue
      const { is100, is30 } = detectSize({ sku, vtitle })
      if (!is100 && !is30) continue
      const qty = Number(li.quantity || 0)
      const cur = salesMap.get(productId) || { qty30: 0, qty100: 0, name: prodName, revenue: 0 }
      if (!cur.name && prodName) cur.name = prodName
      if (is100) cur.qty100 += qty
      if (is30) cur.qty30 += qty
      if (variantId) { if (is100) variantSizeMap.set(variantId, '100'); else if (is30) variantSizeMap.set(variantId, '30') }
      const amt = Number(li?.discountedTotalSet?.shopMoney?.amount || 0)
      const taxes = (li?.taxLines || []).map(tl => Number(tl?.priceSet?.shopMoney?.amount || 0)).filter(Number.isFinite).reduce((a,b)=>a+b,0)
      const netLine = Number.isFinite(amt) ? (o?.taxesIncluded ? Math.max(amt - taxes, 0) : amt) : 0
      const ttlLine = Number.isFinite(amt) ? (o?.taxesIncluded ? amt : amt + taxes) : 0
      const netRounded = Math.round(netLine * 100) / 100
      const ttlRounded = Math.round(ttlLine * 100) / 100
      cur.revenue = Number((Number(cur.revenue||0) + netRounded).toFixed(2))
      cur.totalSales = Number((Number(cur.totalSales||0) + ttlRounded).toFixed(2))
      salesMap.set(productId, cur)
    }
    try {
      if (NET_RETURNS) {
        const boundByRefundDate = (typeof opts.byRefundDate === 'boolean') ? opts.byRefundDate : (String(process.env.TIERS_NET_RETURNS_BY_REFUND_DATE || '').toLowerCase() === 'true')
        const refunds = o?.refunds || []
        for (const refund of refunds) {
          if (boundByRefundDate) {
            const rAt = Date.parse(refund?.createdAt || '')
            const fAt = Date.parse(fromISO)
            const tAt = Date.parse(toISO)
            if (!(Number.isFinite(rAt) && Number.isFinite(fAt) && Number.isFinite(tAt))) continue
            if (rAt < fAt || rAt > tAt) continue
          }
          const rlis = refund?.refundLineItems?.edges || []
          for (const rle of rlis) {
            const rli = rle.node
            const sku = (rli?.lineItem?.variant?.sku || '').trim()
            const vtitle = (rli?.lineItem?.variant?.title || '').trim()
            const product = rli?.lineItem?.variant?.product || null
            const productId = product?.id || ''
            const variantId = rli?.lineItem?.variant?.id || ''
            if (!productId) continue
            const qty = Number(rli?.quantity || 0)
            const rKey = `${o.id}|${refund?.createdAt || ''}|${variantId || sku}|${qty}`
            if (!qty || salesMap.get(productId)?.qty30 == null) {}
            let size = variantId ? variantSizeMap.get(variantId) : null
            let is100 = size === '100'
            let is30 = size === '30'
            if (!is100 && !is30) {
              const allowByProductPresence = salesMap.has(productId)
              if (!allowByProductPresence && !prefixRe.test(sku)) continue
              const det = detectSize({ sku, vtitle })
              is100 = det.is100; is30 = det.is30
              if (!is100 && !is30) continue
            }
            const cur = salesMap.get(productId) || { qty30: 0, qty100: 0, name: product?.title || productId, revenue: 0, totalSales: 0 }
            if (is100) cur.qty100 -= qty
            if (is30) cur.qty30 -= qty
            const unitNet = unitRevenueForVariant(variantId, sku)
            if (unitNet > 0) cur.revenue -= unitNet * qty
            const unitTtl = unitTotalForVariant(variantId, sku)
            if (unitTtl > 0) cur.totalSales = Number((Number(cur.totalSales||0) - unitTtl * qty).toFixed(2))
            salesMap.set(productId, cur)
          }
        }
      }
    } catch {}
  }
  return Array.from(salesMap.entries()).map(([productId, v]) => ({ productId, name: v.name || productId, qty30: v.qty30 || 0, qty100: v.qty100 || 0, revenue: Number((v.revenue || 0).toFixed(2)), totalSales: Number((v.totalSales || 0).toFixed(2)) }))
}

async function auditSku() { return [] }
async function auditProductById() { return [] }

async function fetchSkuSummary(fromISO, toISO, skuMatch, channel = 'TOTAL', opts = {}) {
  if (!requiredEnv()) return { sku: skuMatch, qty: 0, netSales: 0, totalSales: 0, byApp: {} }
  const timeField = String(opts.timeField || process.env.TIERS_ORDER_TIME_FIELD || 'processed_at').trim()
  const extra = (opts.extraQuery != null ? String(opts.extraQuery) : (process.env.TIERS_ORDER_QUERY_EXTRA || 'financial_status:paid -status:cancelled'))
  const queryTime = `${timeField}:>=${fromISO} ${timeField}:<=${toISO}`
  const querySales = `${queryTime}${extra ? ' ' + extra : ''}`
  const q = /* GraphQL */ `
    query Orders($first:Int!, $after:String, $query:String!) {
      orders(first:$first, after:$after, query:$query) {
        edges { cursor node {
          id createdAt taxesIncluded app { name }
          lineItems(first:250) { edges { node {
            quantity discountedTotalSet { shopMoney { amount } }
            taxLines { priceSet { shopMoney { amount } } }
            variant { id sku title product { id title } }
          } } }
        } }
        pageInfo { hasNextPage }
      }
    }
  `
  const out = { sku: skuMatch, qty: 0, netSales: 0, totalSales: 0, byApp: {} }
  const orders = await paginate(q, 'orders', { first: 100, query: querySales }, (n) => n)
  for (const o of orders) {
    const appName = o?.app?.name || 'Online Store'
    const lines = o?.lineItems?.edges || []
    for (const le of lines) {
      const li = le.node
      const sku = (li?.variant?.sku || '').trim()
      if (sku !== skuMatch) continue
      const qty = Number(li?.quantity || 0)
      const amt = Number(li?.discountedTotalSet?.shopMoney?.amount || 0)
      const taxes = (li?.taxLines || []).map(tl => Number(tl?.priceSet?.shopMoney?.amount || 0)).filter(Number.isFinite).reduce((a,b)=>a+b,0)
      const netLine = Number.isFinite(amt) ? (o?.taxesIncluded ? Math.max(amt - taxes, 0) : amt) : 0
      const ttlLine = Number.isFinite(amt) ? (o?.taxesIncluded ? amt : amt + taxes) : 0
      const netRounded = Math.round(netLine * 100) / 100
      const ttlRounded = Math.round(ttlLine * 100) / 100
      out.qty += qty
      out.netSales = Number((out.netSales + netRounded).toFixed(2))
      out.totalSales = Number((out.totalSales + ttlRounded).toFixed(2))
      const rec = out.byApp[appName] || { qty: 0, netSales: 0, totalSales: 0 }
      rec.qty += qty
      rec.netSales = Number((rec.netSales + netRounded).toFixed(2))
      rec.totalSales = Number((rec.totalSales + ttlRounded).toFixed(2))
      out.byApp[appName] = rec
    }
  }
  return out
}

module.exports = { fetchSales, fetchSkuSummary, auditSku, auditProductById }
