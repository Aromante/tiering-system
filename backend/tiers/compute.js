/**
 * Compute Tier assignments from sales buckets.
 * sales: [{ productId, qty30, qty100, totalQty?, sharePct?, productLaunchDate? }]
 * config: { tierSSPct, tierSPct, tierAPct, tiersTopCount, tempTierWeeks }
 */
function computeTierAssignments(sales = [], config = {}) {
  const { tierSSPct = 20, tierSPct = 5, tierAPct = 1.5, tiersTopCount = 30, tempTierWeeks = 12 } = config
  const now = Date.now()
  const weekMs = 7 * 24 * 3600 * 1000
  const enriched = sales.map(s => { const qty30 = Number(s.qty30 || 0); const qty100 = Number(s.qty100 || 0); const totalQty = Number(s.totalQty || (qty30 + qty100)); return { ...s, qty30, qty100, totalQty } })
  const sumAll = enriched.reduce((acc, s) => acc + (s.totalQty || 0), 0) || 1
  const withShare = enriched.map(s => ({ ...s, sharePct: s.sharePct != null ? Number(s.sharePct) : (s.totalQty * 100) / sumAll }))
  const assigned = []
  let ss = 0, s = 0, a = 0
  for (const row of withShare.sort((x, y) => y.sharePct - x.sharePct)) {
    let isT = false
    if (row.productLaunchDate) {
      const t0 = Date.parse(row.productLaunchDate)
      if (Number.isFinite(t0)) { const weeks = (now - t0) / weekMs; if (weeks < tempTierWeeks) isT = true }
    }
    if (isT) { assigned.push({ productId: row.productId, tier: 'T', reason: 'T<tempWeeks' }); continue }
    let tier = 'C'; let reason = 'C else'
    if (row.sharePct >= tierSSPct) { tier = 'SS'; reason = 'SS>=threshold'; ss++ }
    else if (row.sharePct >= tierSPct) { tier = 'S'; reason = 'S>=threshold'; s++ }
    else if (row.sharePct >= tierAPct) { tier = 'A'; reason = 'A>=threshold'; a++ }
    assigned.push({ productId: row.productId, tier, reason })
  }
  const currentTop = ss + s + a
  const toFill = Math.max(0, tiersTopCount - currentTop)
  if (toFill > 0) {
    const candidates = assigned.filter(x => x.tier === 'C').map(x => ({ ...x, sharePct: withShare.find(r => r.productId === x.productId)?.sharePct || 0 })).sort((x, y) => y.sharePct - x.sharePct)
    for (let i = 0; i < Math.min(toFill, candidates.length); i++) {
      const pid = candidates[i].productId
      const idx = assigned.findIndex(x => x.productId === pid)
      if (idx >= 0) assigned[idx] = { ...assigned[idx], tier: 'B', reason: 'B fill' }
    }
  }
  return assigned
}

module.exports = { computeTierAssignments }
