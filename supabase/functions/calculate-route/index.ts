export {};

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void; env: { get(name: string): string | undefined }; };

const ORS_DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
const RATES: Record<string, number> = { sedan: 14, suv: 18, premium: 25 };
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
type Point = { lat: number; lng: number };

const validPoint = (point: unknown): point is Point => {
  if (!point || typeof point !== 'object') return false;
  const { lat, lng } = point as Point;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey } });
  return response.ok ? await response.json() as { id: string } : null;
}

async function calculateDrivingRoute(origin: Point, destination: Point) {
  const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
  if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not configured');
  if (origin.lat === destination.lat && origin.lng === destination.lng) throw new Error('Pickup and drop cannot be the same location');

  const response = await fetch(ORS_DIRECTIONS_URL, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]], instructions: false })
  });
  if (!response.ok) throw new Error(`openrouteservice directions failed: ${response.status}`);

  const feature = (await response.json()).features?.[0];
  const summary = feature?.properties?.summary;
  if (!summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration) || !feature?.geometry) {
    throw new Error('No driving route was returned');
  }
  return {
    distanceMeters: Math.round(summary.distance),
    distanceKm: Number((summary.distance / 1000).toFixed(3)),
    durationSeconds: Math.round(summary.duration),
    durationMinutes: Math.max(1, Math.round(summary.duration / 60)),
    geometry: feature.geometry
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!await authenticate(request)) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await request.json();
    if (!validPoint(body.origin) || !validPoint(body.destination)) return json({ error: 'Valid pickup and drop coordinates are required' }, 400);
    const route = await calculateDrivingRoute(body.origin, body.destination);
    const fares = Object.fromEntries(Object.entries(RATES).map(([vehicle, rate]) => [vehicle, Number((route.distanceKm * rate).toFixed(2))]));
    return json({ ...route, rates: RATES, fares });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to calculate driving route' }, 502);
  }
});
