import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Lazy singleton for browser/realtime usage
let _client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient {
  if (!_client) _client = createClient(URL, ANON)
  return _client
}

// Proxy so components can import `supabase` directly
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// Server-side client (same anon key — RLS disabled for private app)
export function createServiceClient(): SupabaseClient {
  return createClient(URL, ANON)
}
