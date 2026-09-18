export {};

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void; env: { get(name: string): string | undefined }; };

const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
let lastNominatimRequestAt = 0;

type Location = { address: string; lat: number; lng: number };

class ProviderError extends Error {
  constructor(readonly status: number) { super(`openrouteservice geocoding failed: ${status}`); }
}

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey } });
  return response.ok ? await response.json() as { id: string } : null;
}

async function searchOpenRouteService(query: string, apiKey: string): Promise<Location[]> {
  const url = new URL(ORS_GEOCODE_URL);
  url.searchParams.set('text', query);
  url.searchParams.set('size', '5');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { authorization: apiKey } });
      if (response.ok) {
        const payload = await response.json();
        return (payload.features ?? []).flatMap((feature: { properties?: { label?: string; name?: string }; geometry?: { coordinates?: unknown } }) => {
          const coordinates = feature.geometry?.coordinates;
          const address = feature.properties?.label || feature.properties?.name;
          if (!address || !Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
          return [{ address, lng: coordinates[0], lat: coordinates[1] }];
        });
      }
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await wait(500);
        continue;
      }
      throw new ProviderError(response.status);
    } catch (error) {
      if (error instanceof ProviderError || attempt === 1) throw error;
      await wait(500);
    }
  }
  return [];
}

async function searchNominatim(query: string): Promise<Location[]> {
  const delay = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimRequestAt);
  if (delay > 0) await wait(delay);
  lastNominatimRequestAt = Date.now();

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'CABSY/1.0 (https://cabsyindia.com; location search)'
    }
  });
  if (!response.ok) throw new Error(`Nominatim geocoding failed: ${response.status}`);
  const payload = await response.json();
  return (Array.isArray(payload) ? payload : []).flatMap((item: { display_name?: string; lat?: string; lon?: string }) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!item.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ address: item.display_name, lat, lng }];
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!await authenticate(request)) return json({ error: 'Sign in is required to search locations', code: 'unauthorized' }, 401);

  try {
    const { query } = await request.json();
    const text = String(query ?? '').trim();
    if (text.length < 3 || text.length > 160) return json({ error: 'Enter at least three characters', code: 'invalid_query' }, 400);
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not configured');

    try {
      return json({ locations: await searchOpenRouteService(text, apiKey), provider: 'openrouteservice' });
    } catch (error) {
      if (!(error instanceof ProviderError) || ![401, 403, 404].includes(error.status)) throw error;
      console.warn(`ORS geocoder rejected request (${error.status}); using Nominatim fallback`);
      return json({ locations: await searchNominatim(text), provider: 'nominatim' });
    }
  } catch (error) {
    console.error(error);
    if (error instanceof ProviderError && error.status === 429) {
      return json({ error: 'Location search is temporarily busy. Please wait a few seconds and try again.', code: 'rate_limited', retryAfterSeconds: 10 }, 429);
    }
    return json({ error: 'Location search is temporarily unavailable. Please try again.', code: 'service_unavailable' }, 503);
  }
});
