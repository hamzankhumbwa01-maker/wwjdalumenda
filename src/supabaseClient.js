import { createClient } from '@supabase/supabase-js'

// Project URL + publishable key. These two are SAFE to ship in the app:
// the access rules in 02_security.sql (Row Level Security) protect the data.
// NEVER put the "secret" / service_role key here.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://egrhltjjokyfnqdrlxfs.supabase.co'
const KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_ZswvT3yWSyffX15NZxzp2w_qXPbNGIf'

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
