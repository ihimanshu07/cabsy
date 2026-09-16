export const SUPABASE_URL = 'https://atqjamabdcsuvsutdkdv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_hazNWgbwLX_PsLP_1RktdA_2pU9dJxU';
export const WHATSAPP_NUMBER = '919235105455';
export const SITE_URL = 'http://localhost:3000';

export const isSupabaseConfigured = () =>
  SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_') &&
  !SUPABASE_ANON_KEY.includes('YOUR_');
