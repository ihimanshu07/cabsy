import { supabase, configured } from './supabase.js';
import { WHATSAPP_NUMBER } from './config.js';
import { VEHICLES, formatINR } from './data.js';
import { cleanText, phoneValid, todayISO, fieldError, clearErrors } from './validation.js';
import { initOrsBooking } from './ors-booking.js';
import { openModal, toast, setButtonLoading } from './ui.js';

const escapeHTML = value => { const node = document.createElement('span'); node.textContent = value ?? ''; return node.innerHTML; };
const form = document.querySelector('#booking-form');

if (form) {
  const dateInput = form.elements.travel_date;
  const vehicleInput = form.elements.vehicle;
  const submit = form.querySelector('[type=submit]');
  const summary = document.querySelector('#route-summary');
  const farePreview = document.querySelector('[data-fare-preview]');
  let mapState;
  let verifiedRoute = null;
  dateInput.min = todayISO();

  const renderRoute = () => {
    const vehicle = VEHICLES[vehicleInput.value];
    if (!verifiedRoute) { submit.disabled = true; return; }
    const fare = verifiedRoute.fares[vehicleInput.value];
    const rate = verifiedRoute.rates[vehicleInput.value];
    summary.innerHTML = `<div class="route-summary-grid"><div><small>Pickup</small><strong>${escapeHTML(verifiedRoute.pickup.address)}</strong></div><div><small>Drop</small><strong>${escapeHTML(verifiedRoute.drop.address)}</strong></div><div><small>Driving distance</small><strong>${verifiedRoute.distanceKm.toFixed(1)} km</strong></div><div><small>Estimated travel time</small><strong>${escapeHTML(verifiedRoute.durationLabel)}</strong></div></div>${vehicle ? `<div class="fare-breakdown"><span>Selected vehicle: <b>${escapeHTML(vehicle.name)}</b></span><span>Rate: <b>₹${rate}/km</b></span><span>Verified fare: <b>${formatINR(fare)}</b></span></div>` : '<div class="route-wait">Choose a vehicle to see its fare.</div>'}`;
    farePreview.innerHTML = vehicle ? `<span>✦</span> ${formatINR(fare)} verified route estimate` : '<span>✦</span> Choose a vehicle to view fare';
    submit.disabled = !vehicle;
  };
  const pending = message => { verifiedRoute = null; submit.disabled = true; farePreview.innerHTML = `<span>✦</span> ${message || 'Select pickup and drop locations'}`; summary.innerHTML = `<div class="route-summary-empty ${message ? 'is-loading' : ''}">${escapeHTML(message || 'Select a pickup and destination from the location suggestions to calculate the road distance and fare.')}</div>`; };
  const routeError = message => { verifiedRoute = null; submit.disabled = true; farePreview.innerHTML = '<span>✦</span> Route unavailable'; summary.innerHTML = `<div class="route-summary-empty is-error">${escapeHTML(message)}</div>`; toast(message, 'error'); };

  vehicleInput.addEventListener('change', renderRoute);
  initOrsBooking({ onPending: pending, onError: routeError, onRoute: route => { verifiedRoute = route; renderRoute(); } }).then(state => { mapState = state; });

  form.addEventListener('submit', async event => {
    event.preventDefault(); clearErrors(form);
    if (!configured) { toast('Booking is unavailable until Supabase is configured.', 'error'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.href = `auth.html?returnTo=${encodeURIComponent('index.html#book')}`; return; }
    const values = Object.fromEntries(new FormData(form));
    const vehicle = VEHICLES[values.vehicle]; let invalid = false;
    const fail = (field, message) => { fieldError(form.elements[field], message); invalid = true; };
    values.name = cleanText(values.name); values.phone = cleanText(values.phone);
    if (!values.name) fail('name', 'Enter the customer name.');
    if (!phoneValid(values.phone)) fail('phone', 'Enter a valid Indian mobile number.');
    if (!values.travel_date || values.travel_date < todayISO()) fail('travel_date', 'Choose today or a future date.');
    if (!values.travel_time) fail('travel_time', 'Choose a travel time.');
    if (!vehicle) fail('vehicle', 'Choose a vehicle.');
    const passengers = Number(values.passenger_count);
    if (!Number.isInteger(passengers) || passengers < 1) fail('passenger_count', 'Enter at least one passenger.');
    else if (vehicle && passengers > vehicle.capacity) fail('passenger_count', `${vehicle.name} supports up to ${vehicle.capacity} passengers.`);
    if (!verifiedRoute || !mapState?.pickup || !mapState?.drop) { toast('Select both locations from the search suggestions and wait for the route calculation.', 'error'); return; }
    if (invalid) return;
    setButtonLoading(submit, true, 'Creating verified booking...');
    const { data, error } = await supabase.functions.invoke('create-route-booking', { body: { name: values.name, phone: values.phone.replace(/[\s-]/g, ''), pickup: mapState.pickup, drop: mapState.drop, travel_date: values.travel_date, travel_time: values.travel_time, vehicle: values.vehicle, passenger_count: passengers, special_instructions: cleanText(values.special_instructions || '') || null } });
    setButtonLoading(submit, false);
    if (error || data?.error) { console.error(error || data); toast('Unable to create verified booking. Please try again.', 'error'); return; }
    const booking = data.booking; const route = data.route;
    const message = encodeURIComponent(`CABSY Booking Request\n\nBooking ID: ${booking.booking_reference}\nCustomer: ${booking.name}\nPhone: ${booking.phone}\nPickup: ${booking.pickup}\nDestination: ${booking.destination}\nDistance: ${route.distanceKm.toFixed(1)} km\nTime: ${Math.round(route.durationSeconds / 60)} min\nDate: ${booking.travel_date}\nTime: ${booking.travel_time}\nVehicle: ${vehicle.name}\nRate: ₹${route.ratePerKm}/km\nVerified Fare: ${formatINR(route.fare)}`);
    const whatsappReady = /^\d{8,15}$/.test(WHATSAPP_NUMBER);
    openModal(`<span class="eyebrow">Booking request submitted</span><h2>Thank you, ${escapeHTML(booking.name)}</h2><p>Your booking is currently <strong>Pending</strong>. WhatsApp contact does not confirm a booking.</p><p class="reference">${escapeHTML(booking.booking_reference)}</p><p><strong>${escapeHTML(booking.pickup)}</strong> → <strong>${escapeHTML(booking.destination)}</strong><br>${route.distanceKm.toFixed(1)} km · about ${Math.round(route.durationSeconds / 60)} min<br>${escapeHTML(vehicle.name)} · ₹${route.ratePerKm}/km · Verified fare: ${formatINR(route.fare)}</p><p class="details-actions"><a class="button" href="booking-details.html#id=${booking.id}">View My Booking</a>${whatsappReady ? `<a class="button button-outline" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP_NUMBER}?text=${message}">Send via WhatsApp</a>` : ''}<button class="button button-outline" data-modal-close>Close</button></p>`);
    toast('Verified booking created successfully.', 'success'); form.reset(); pending();
  });

  (async () => { if (!configured) return; const { data: { session } } = await supabase.auth.getSession(); if (!session) return; const { data } = await supabase.from('profiles').select('full_name,phone').single(); if (data) { form.elements.name.value = data.full_name || ''; form.elements.phone.value = data.phone || ''; } })();
}
