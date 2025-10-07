const prov = require('./supabase')

module.exports = {
  fetchSales: prov.fetchSales,
  fetchSkuSummary: prov.fetchSkuSummary,
  auditSku: prov.auditSku || (async () => []),
  auditProductById: prov.auditProductById || (async () => [])
}
