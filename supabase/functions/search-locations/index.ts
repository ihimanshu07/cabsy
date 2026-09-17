export {};

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void; env: { get(name: string): string | undefined }; };

// The public openrouteservice Pelias geocoder is separate from the HEIGIT /v2 Directions API.
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey } });
  return response.ok ? await response.json() as { id: string } : null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!await authenticate(request)) return json({ error: 'Unauthorized' }, 401);
  try {
    const { query } = await request.json();
    const text = String(query ?? '').trim();
    if (text.length < 3 || text.length > 160) return json({ error: 'Enter at least three characters' }, 400);
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not configured');
    const url = new URL(ORS_GEOCODE_URL);
    url.searchParams.set('text', text);
    url.searchParams.set('size', '5');
    const response = await fetch(url, { headers: { authorization: apiKey } });
    if (!response.ok) throw new Error(`openrouteservice geocoding failed: ${response.status}`);
    const payload = await response.json();
    const locations = (payload.features ?? []).flatMap((feature: { properties?: { label?: string; name?: string }; geometry?: { coordinates?: unknown } }) => {
      const coordinates = feature.geometry?.coordinates;
      const address = feature.properties?.label || feature.properties?.name;
      if (!address || !Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
      return [{ address, lng: coordinates[0], lat: coordinates[1] }];
    });
    return json({ locations });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to search locations' }, 502);
  }
});
