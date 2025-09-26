Tiering System (standalone)
===========================

Resumen de Tiers con canales TOTAL/ONLINE/POS, filtros SS/S/A/B/C/T, tabla con ingresos/participación/delta y selector de ventana/comparativa.

Estructura
- Frontend (Vite/React): en la raíz (`src/pages/dashboards/tiers/*`).
- Backend (Express): `backend/` con rutas `/api/tiers/*` y configuración en `backend/tiers/config.json`.

Uso en desarrollo
- `npm install`
- `npm run dev` (frontend en :8086, backend en :5006)

Configurar
- Copia `.env.example` a `.env` si necesitas definir `ADMIN_TOKEN` o cambiar puertos.
- Edita `backend/tiers/config.json` para ajustar thresholds y ventana de ventas.
- Si conectarás Shopify:
  - Define `SHOPIFY_*` y banderas `TIERS_*` en `.env`.
  - Implementa `backend/integrations/shopify.js` para devolver ventas agregadas (por ahora placeholder).

Producción
- `npm run build` genera `dist/`.
- `npm --prefix backend run serve:prod` sirve API y SPA desde `../dist`.
