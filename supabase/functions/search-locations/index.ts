export {};

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void; env: { get(name: string): string | undefined }; };

const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

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

async function searchOpenRouteService(query: string, apiKey: string) {
  const url = new URL(ORS_GEOCODE_URL);
  url.searchParams.set('text', query);
  url.searchParams.set('size', '5');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { authorization: apiKey } });
      if (response.ok) return await response.json();
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
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!await authenticate(request)) return json({ error: 'Sign in is required to search locations' }, 401);

  try {
    const { query } = await request.json();
    const text = String(query ?? '').trim();
    if (text.length < 3 || text.length > 160) return json({ error: 'Enter at least three characters', code: 'invalid_query' }, 400);
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not configured');

    const payload = await searchOpenRouteService(text, apiKey);
    const locations = (payload.features ?? []).flatMap((feature: { properties?: { label?: string; name?: string }; geometry?: { coordinates?: unknown } }) => {
      const coordinates = feature.geometry?.coordinates;
      const address = feature.properties?.label || feature.properties?.name;
      if (!address || !Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
      return [{ address, lng: coordinates[0], lat: coordinates[1] }];
    });
    return json({ locations });
  } catch (error) {
    console.error(error);
    if (error instanceof ProviderError && error.status === 429) {
      return json({ error: 'Location search is temporarily busy. Please wait a few seconds and try again.', code: 'rate_limited', retryAfterSeconds: 10 }, 429);
    }
    if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
      return json({ error: 'Location search is temporarily unavailable. Please try again later.', code: 'provider_unavailable' }, 503);
    }
    return json({ error: 'Location search is temporarily unavailable. Please try again.', code: 'service_unavailable' }, 503);
  }
});
