import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './config.js';

export const configured = isSupabaseConfigured();
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('CABSY is not configured yet. Add the public Supabase values in js/config.js.');
  return supabase;
}
