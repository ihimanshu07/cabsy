import { requireAuth } from './auth-guard.js';
import { supabase } from './supabase.js';
import { initUI, openModal, toast } from './ui.js';
import { VEHICLES, formatINR, humanizeStatus } from './data.js';

const escapeHTML = value => {
  const node = document.createElement('span');
  node.textContent = value ?? '';
  return node.innerHTML;
};
const durationLabel = seconds => {
  if (!Number.isFinite(Number(seconds))) return null;
  const minutes = Math.max(1, Math.round(Number(seconds) / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
};

const session = await requireAuth();
if (session) {
  await initUI();
  const target = document.querySelector('#booking-detail');
  const url = new URL(location.href);
  const id = url.searchParams.get('id') || new URLSearchParams(url.hash.slice(1)).get('id');

  if (!id) {
    target.innerHTML = '<h1>Booking not found</h1><p>This page needs a booking ID. Return to My Bookings and use its Details button.</p>';
  } else {
    const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('Unable to load booking details:', error);
      target.innerHTML = '<h1>Unable to load booking</h1><p>Please refresh and try again. If the problem continues, confirm you are using the account that created this booking.</p>';
    } else if (!booking) {
      target.innerHTML = '<h1>Booking not found</h1><p>This booking is unavailable or does not belong to your account.</p>';
    } else {
      const vehicle = VEHICLES[booking.vehicle]?.name || booking.vehicle;
      const routeDetails = booking.distance_km != null ? `
        <div class="detail"><span>Driving distance</span><strong>${Number(booking.distance_km).toFixed(1)} km</strong></div>
        <div class="detail"><span>Estimated travel time</span><strong>${escapeHTML(durationLabel(booking.estimated_duration_seconds) || 'Not available')}</strong></div>
        <div class="detail"><span>Verified rate</span><strong>₹${Number(booking.rate_per_km).toFixed(2)}/km</strong></div>` : '';
      target.innerHTML = `<div class="dashboard-head"><div><span class="eyebrow">Booking request</span><h1>${escapeHTML(booking.booking_reference)}</h1></div><span class="status status-${booking.status}">${humanizeStatus(booking.status)}</span></div><div class="details-grid"><div class="detail"><span>Customer</span><strong>${escapeHTML(booking.name)}</strong></div><div class="detail"><span>Phone</span><strong>${escapeHTML(booking.phone)}</strong></div><div class="detail"><span>Pickup</span><strong>${escapeHTML(booking.pickup)}</strong></div><div class="detail"><span>Destination</span><strong>${escapeHTML(booking.destination)}</strong></div><div class="detail"><span>Travel date & time</span><strong>${escapeHTML(booking.travel_date)} · ${escapeHTML(booking.travel_time.slice(0, 5))}</strong></div><div class="detail"><span>Vehicle</span><strong>${escapeHTML(vehicle)}</strong></div><div class="detail"><span>Passengers</span><strong>${booking.passenger_count}</strong></div>${routeDetails}<div class="detail"><span>Verified fare</span><strong>${formatINR(booking.fare)}</strong></div><div class="detail"><span>Special instructions</span><strong>${escapeHTML(booking.special_instructions || 'None provided')}</strong></div><div class="detail"><span>Submitted</span><strong>${new Date(booking.created_at).toLocaleString('en-IN')}</strong></div></div><div class="details-actions">${booking.status === 'pending' ? '<button class="button" id="cancel-booking">Cancel Booking</button>' : ''}<a class="button button-outline" href="contact.html">Contact CABSY</a></div>`;

      document.querySelector('#cancel-booking')?.addEventListener('click', () => openModal(`<h2>Cancel booking?</h2><p>Are you sure you want to cancel ${booking.booking_reference}? This action preserves the record but marks it as cancelled.</p><p class="details-actions"><button class="button" id="confirm-cancel">Yes, cancel booking</button><button class="button button-outline" data-modal-close>Keep booking</button></p>`));
      document.querySelector('#modal-backdrop').addEventListener('click', async event => {
        if (event.target.id !== 'confirm-cancel') return;
        const { error: cancelError } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id).eq('status', 'pending');
        if (cancelError) { toast('Unable to cancel booking.', 'error'); return; }
        toast('Booking cancelled successfully.', 'success');
        location.reload();
      });
    }
  }
}
