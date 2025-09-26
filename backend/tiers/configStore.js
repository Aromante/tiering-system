const fs = require('fs/promises')
const path = require('path')
const CONFIG_PATH = path.join(__dirname, 'config.json')

function num(v, d) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d }

function validate(cfg = {}) {
  return {
    tierSSPct: num(cfg.tierSSPct, 20),
    tierSPct: num(cfg.tierSPct, 5),
    tierAPct: num(cfg.tierAPct, 1.5),
    tiersTopCount: num(cfg.tiersTopCount, 30),
    tempTierWeeks: num(cfg.tempTierWeeks, 12),
    salesWindowDays: num(cfg.salesWindowDays, 35),
    useCompletedDays: Boolean(cfg.useCompletedDays || false),
    recalcFrequencyDays: num(cfg.recalcFrequencyDays, 14),
    graceMonthsC: num(cfg.graceMonthsC, 12),
    configVersion: num(cfg.configVersion, 1)
  }
}

async function readConfig() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
  return validate(JSON.parse(raw))
}

async function writeConfig(next) {
  const current = await readConfig().catch(() => null)
  const base = validate(next)
  const bumped = { ...base, configVersion: num((current?.configVersion || base.configVersion || 1) + 1, 2) }
  await fs.writeFile(CONFIG_PATH, JSON.stringify(bumped, null, 2))
  return bumped
}

module.exports = { readConfig, writeConfig }
