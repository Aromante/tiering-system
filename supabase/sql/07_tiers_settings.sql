-- Tiering System — Global column settings
-- Objetivo: permitir habilitar/ocultar columnas (p. ej., NET SALES) de forma global
-- mediante una tabla de settings y RPCs SECURITY DEFINER en Supabase.

-- 1) Tabla de settings (una fila)
create table if not exists public.tiers_settings (
  id int primary key default 1,
  show_revenue boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Garantiza fila única (id=1)
insert into public.tiers_settings (id, show_revenue)
values (1, false)
on conflict (id) do nothing;

-- 2) RPC: leer settings
drop function if exists public.tiers_get_settings();
create or replace function public.tiers_get_settings()
returns public.tiers_settings
language sql
security definer
set search_path = public
as $$
  select * from public.tiers_settings where id = 1;
$$;

-- 3) RPC: actualizar settings
drop function if exists public.tiers_set_settings(boolean);
create or replace function public.tiers_set_settings(
  p_show_revenue boolean
)
returns public.tiers_settings
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tiers_settings
     set show_revenue = coalesce(p_show_revenue, show_revenue),
         updated_at = now()
   where id = 1;
  return (
    select * from public.tiers_settings where id = 1
  );
end;
$$;

-- 4) Permisos
-- Ajustar según el modelo de auth del proyecto. Opciones:
--   a) Solo service_role (recomendado si se llama desde Worker):
--      grant execute on function public.tiers_get_settings() to service_role;
--      grant execute on function public.tiers_set_settings(boolean) to service_role;
--   b) Frontend autenticado (con RLS adicional por rol):
--      grant execute on function public.tiers_get_settings() to authenticated;
--      grant execute on function public.tiers_set_settings(boolean) to authenticated;

-- 5) Frontend (idea de uso)
--  - GET: llamar a rpc('tiers_get_settings') para inicializar showRevenue.
--  - SET: tras validar permisos (idealmente vía Worker), llamar rpc('tiers_set_settings', { p_show_revenue: true|false }).

