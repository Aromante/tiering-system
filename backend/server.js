const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5006

app.use(cors())
app.use(express.json())

// Mount tiers routes (copied from planb backend)
app.use(require('./tiers/routes').router)

// Serve SPA if built
try {
  const distPath = path.resolve(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
} catch {}

app.listen(PORT, '0.0.0.0', () => console.log(`Tiers backend on :${PORT}`))
