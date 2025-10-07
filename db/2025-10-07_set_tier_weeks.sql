-- Function to update forecasting_settings.tier_weeks without Supabase Auth
-- Uses a shared password check and SECURITY DEFINER to bypass RLS safely

create or replace function public.set_tier_weeks(new_weeks integer, pass text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if pass is null or pass <> 'CARIBU' then
    raise exception 'invalid password';
  end if;
  if new_weeks < 1 or new_weeks > 12 then
    raise exception 'weeks out of range';
  end if;
  update public.forecasting_settings
     set tier_weeks = new_weeks
   where id = 1;
end;
$$;

-- Allow public execution (anon and authenticated)
grant execute on function public.set_tier_weeks(integer, text) to anon, authenticated;

