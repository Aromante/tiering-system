import { createClient } from '@supabase/supabase-js'

const url = (import.meta as any).env?.VITE_SUPABASE_URL as string
const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url || '', key || '', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export async function ensureAdminAuth(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session) return true
    const adminEmail = (import.meta as any).env?.VITE_TIER_ADMIN_EMAIL as string | undefined
    const adminPassword = (import.meta as any).env?.VITE_TIER_ADMIN_PASSWORD as string | undefined
    if (!adminEmail || !adminPassword) return false
    const { error } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
    if (error) return false
    return true
  } catch {
    return false
  }
}
