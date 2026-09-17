import { supabase } from './supabase.js';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
let leafletLoader;

const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoader) return leafletLoader;
  leafletLoader = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      stylesheet.dataset.leaflet = 'true';
      document.head.append(stylesheet);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha512-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBoqzM2InlXeY2a4fJk5dGqJj9rwZq3m5rNo7rN+qM9Q==' ;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.append(script);
  });
  return leafletLoader;
};

const durationLabel = seconds => seconds >= 3600 ? `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min` : `${Math.max(1, Math.round(seconds / 60))} min`;

export async function initOrsBooking({ onRoute, onError, onPending }) {
  const pickupInput = document.querySelector('#pickup');
  const dropInput = document.querySelector('#destination');
  const resultBoxes = { pickup: document.querySelector('[data-location-results="pickup"]'), drop: document.querySelector('[data-location-results="drop"]') };
  const mapElement = document.querySelector('#route-map');
  const state = { pickup: null, drop: null, route: null, key: '', revision: 0, map: null, mapLayer: null, pickupMarker: null, dropMarker: null };
  const routeKey = () => state.pickup && state.drop ? `${state.pickup.lat},${state.pickup.lng}:${state.drop.lat},${state.drop.lng}` : '';
  const clearMapRoute = () => { [state.mapLayer, state.pickupMarker, state.dropMarker].forEach(layer => layer?.remove()); state.mapLayer = null; state.pickupMarker = null; state.dropMarker = null; };
  const invalidate = () => { state.route = null; state.key = ''; state.revision += 1; clearMapRoute(); onPending?.(); };

  const renderMap = async (route, pickup, drop) => {
    try {
      const L = await loadLeaflet();
      if (!state.map) {
        state.map = L.map(mapElement, { scrollWheelZoom: false });
        L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(state.map);
      }
      mapElement.hidden = false;
      clearMapRoute();
      state.pickupMarker = L.marker([pickup.lat, pickup.lng]).addTo(state.map).bindPopup('Pickup');
      state.dropMarker = L.marker([drop.lat, drop.lng]).addTo(state.map).bindPopup('Drop');
      state.mapLayer = L.geoJSON(route.geometry, { style: { color: '#ed6a1c', weight: 5, opacity: 0.85 } }).addTo(state.map);
      const bounds = state.mapLayer.getBounds();
      if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [30, 30] });
      else state.map.fitBounds(L.latLngBounds([[pickup.lat, pickup.lng], [drop.lat, drop.lng]]), { padding: [30, 30] });
      setTimeout(() => state.map.invalidateSize(), 0);
    } catch (error) { console.error('Leaflet map unavailable:', error); }
  };

  const requestRoute = async () => {
    const key = routeKey();
    if (!key) return;
    if (state.key === key && state.route) { onRoute?.({ ...state.route, pickup: state.pickup, drop: state.drop, durationLabel: durationLabel(state.route.durationSeconds) }); return; }
    const revision = state.revision;
    const pickup = state.pickup;
    const drop = state.drop;
    onPending?.('Calculating route...');
    const { data, error } = await supabase.functions.invoke('calculate-route', { body: { origin: pickup, destination: drop } });
    if (revision !== state.revision || key !== routeKey()) return;
    if (error || data?.error) { onError?.('Unable to calculate route. Please try again.'); return; }
    state.key = key;
    state.route = data;
    await renderMap(data, pickup, drop);
    onRoute?.({ ...data, pickup, drop, durationLabel: durationLabel(data.durationSeconds) });
  };

  const selectLocation = async (key, location) => {
    state[key] = location;
    const input = key === 'pickup' ? pickupInput : dropInput;
    input.value = location.address;
    resultBoxes[key].replaceChildren();
    invalidate();
    await requestRoute();
  };

  const setupSearch = (input, key) => {
    let timer;
    input.addEventListener('input', () => {
      if (state[key]) { state[key] = null; invalidate(); }
      const query = input.value.trim();
      resultBoxes[key].replaceChildren();
      clearTimeout(timer);
      if (query.length < 3) return;
      timer = setTimeout(async () => {
        resultBoxes[key].innerHTML = '<span class="location-search-status">Searching locations...</span>';
        const { data, error } = await supabase.functions.invoke('search-locations', { body: { query } });
        if (input.value.trim() !== query) return;
        resultBoxes[key].replaceChildren();
        if (error || data?.error) { resultBoxes[key].innerHTML = '<span class="location-search-status is-error">Unable to search locations. Please try again.</span>'; return; }
        if (!data.locations?.length) { resultBoxes[key].innerHTML = '<span class="location-search-status">No locations found.</span>'; return; }
        data.locations.forEach(location => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'location-result';
          button.textContent = location.address;
          button.addEventListener('click', () => selectLocation(key, location));
          resultBoxes[key].append(button);
        });
      }, 350);
    });
  };

  setupSearch(pickupInput, 'pickup');
  setupSearch(dropInput, 'drop');
  return state;
}
