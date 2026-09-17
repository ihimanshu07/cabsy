export {};

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void; env: { get(name: string): string | undefined }; };

const ORS_DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
const RATES: Record<string, number> = { sedan: 14, suv: 18, premium: 25 };
const CAPACITIES: Record<string, number> = { sedan: 4, suv: 6, premium: 4 };
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
type SelectedLocation = { address: string; lat: number; lng: number };

const validLocation = (location: unknown): location is SelectedLocation => {
  if (!location || typeof location !== 'object') return false;
  const { address, lat, lng } = location as SelectedLocation;
  return typeof address === 'string' && address.trim().length > 0 && address.length <= 500 && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey } });
  return response.ok ? await response.json() as { id: string } : null;
}

async function calculateDrivingRoute(origin: SelectedLocation, destination: SelectedLocation) {
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
  if (!summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration)) throw new Error('No driving route was returned');
  return { distanceMeters: Math.round(summary.distance), distanceKm: Number((summary.distance / 1000).toFixed(3)), durationSeconds: Math.round(summary.duration) };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const currentUser = await authenticate(request);
  if (!currentUser) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await request.json();
    const vehicle = String(body.vehicle ?? '');
    const passengerCount = Number(body.passenger_count);
    if (!RATES[vehicle] || !validLocation(body.pickup) || !validLocation(body.drop)) return json({ error: 'Valid selected locations and vehicle are required' }, 400);
    if (body.pickup.lat === body.drop.lat && body.pickup.lng === body.drop.lng) return json({ error: 'Pickup and drop cannot be the same location' }, 400);
    if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > CAPACITIES[vehicle]) return json({ error: 'Passenger count is not supported by the selected vehicle' }, 400);

    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const travelDate = String(body.travel_date ?? '').trim();
    const travelTime = String(body.travel_time ?? '').trim();
    if (!name || !phone || !travelDate || !travelTime) return json({ error: 'Missing booking details' }, 400);

    const route = await calculateDrivingRoute(body.pickup, body.drop);
    const rate = RATES[vehicle];
    const fare = Number((route.distanceKm * rate).toFixed(2));
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    if (!serviceKey || !url) throw new Error('Server booking credentials are not configured');
    const payload = {
      user_id: currentUser.id, name, phone, pickup: body.pickup.address.trim(), destination: body.drop.address.trim(),
      pickup_lat: body.pickup.lat, pickup_lng: body.pickup.lng, drop_lat: body.drop.lat, drop_lng: body.drop.lng,
      distance_meters: route.distanceMeters, distance_km: route.distanceKm, estimated_duration_seconds: route.durationSeconds,
      vehicle, rate_per_km: rate, fare, passenger_count: passengerCount, travel_date: travelDate, travel_time: travelTime,
      special_instructions: String(body.special_instructions ?? '').trim() || null
    };
    const insert = await fetch(`${url}/rest/v1/bookings`, { method: 'POST', headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(payload) });
    if (!insert.ok) throw new Error(`Booking insert failed: ${await insert.text()}`);
    const booking = (await insert.json())[0];
    return json({ booking, route: { ...route, ratePerKm: rate, fare } }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to create verified booking' }, 502);
  }
});
