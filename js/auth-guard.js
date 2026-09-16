import { supabase, configured } from './supabase.js';
import { currentPath } from './ui.js';

export async function requireAuth() {
  if (!configured) { location.replace(`auth.html?returnTo=${encodeURIComponent(currentPath())}`); return null; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.replace(`auth.html?returnTo=${encodeURIComponent(currentPath())}`); return null; }
  return session;
}
