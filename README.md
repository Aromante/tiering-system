Tiering System (Supabase-only)
==============================

Resumen de Tiers con canales TOTAL/ONLINE/POS, filtros SS/S/A/B/C/T, tabla con ingresos/participación y selector de semanas. El frontend consulta directamente vistas de Supabase.

Estructura
- Frontend (Vite/React): `src/pages/dashboards/tiers/*`.
- Datos: vistas `tiering_global`, `tiering_online`, `tiering_pos` en Supabase.

Variables
- Copia `.env.example` a `.env.local` y rellena:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_SKU_PREFIX` (por defecto `PER-`)

Desarrollo
- Requiere Node 20 (este repo incluye `.nvmrc` con 20.16.0 y `engines` en `package.json`).
- `npm install`
- `npm run dev` (Vite en http://localhost:8086)

Datos esperados en las vistas
- Columnas: `product_title, participation_pct, tier, three_weeks_units, three_weeks_30ml, three_weeks_100ml, revenue_gross, rank`.
- Mapeo UI: `name=product_title`, `qty30=three_weeks_30ml`, `qty100=three_weeks_100ml`, `revenue=revenue_gross`, `sharePct=participation_pct`, `tier`, `rank`.

Selector de Semanas
- Engrane en el header para elegir 1, 2, 3 o 4 semanas.
- Realiza `rpc('set_tier_weeks', { new_tier: X })` en Supabase.
- Implementa la función RPC con SECURITY DEFINER y `GRANT EXECUTE` a `anon`.

Windows
- Node 20 (usa nvm-windows). Este repo incluye `.nvmrc` (20.16.0) y `engines` en `package.json`.
- Git para Windows respetará `.gitattributes` (EOL LF) para evitar issues de fin de línea.
- Ejecuta `npm install` y `npm run dev`. El dev server usa `host: localhost` y puerto 8086.

Build
- `npm run build` genera `dist/`.

Administración de columnas (ocultas por defecto)
- La columna “NET SALES” está oculta por defecto.
- Existe un toggle administrativo en el menú de ajustes para mostrar/ocultarla, pero permanece oculto salvo que se habilite explícitamente vía env:
  - `VITE_TIERS_ADMIN_COLUMNS=1` (Vite/Pages) → muestra la sección “Columnas” con el checkbox “Mostrar NET SALES”.
- Persistencia local: el estado del toggle se recuerda por navegador (`localStorage` → `tiers-cols-v1`).
- Para un control global en el futuro, se puede persistir en Supabase (tabla de settings + RPC SECURITY DEFINER).
