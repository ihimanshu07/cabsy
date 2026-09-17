import { requireAuth } from './auth-guard.js';
import { supabase } from './supabase.js';
import { initUI, toast } from './ui.js';
import { formatINR, humanizeStatus } from './data.js';

const escapeHTML = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
const statusOptions = (current, choices) => choices.map(status => `<option value="${status}" ${status === current ? 'selected' : ''}>${humanizeStatus(status)}</option>`).join('');
const session = await requireAuth();

if (session) {
  await initUI();
  const { data: allowed, error: roleError } = await supabase.rpc('is_admin');
  if (roleError || !allowed) {
    toast('This page is restricted to authorized CABSY staff.', 'error');
    setTimeout(() => location.replace('index.html'), 800);
  } else {
    document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(item => item.classList.toggle('active', item === tab));
      document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === tab.dataset.panel));
    }));
    document.querySelector('#refresh-dashboard').addEventListener('click', loadDashboard);
    await loadDashboard();
  }
}

async function loadDashboard() {
  const [bookingsResult, driversResult, messagesResult] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('driver_applications').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(100)
  ]);
  const error = bookingsResult.error || driversResult.error || messagesResult.error;
  if (error) { console.error(error); toast('Unable to load operations data.', 'error'); return; }
  const bookings = bookingsResult.data;
  const drivers = driversResult.data;
  const messages = messagesResult.data;
  document.querySelector('#admin-metrics').innerHTML = [
    ['Pending bookings', bookings.filter(item => item.status === 'pending').length],
    ['Pending drivers', drivers.filter(item => item.status === 'pending').length],
    ['New messages', messages.filter(item => item.status === 'new').length]
  ].map(([label, value]) => `<article class="card metric"><span>${label}</span><strong>${value}</strong></article>`).join('');
  document.querySelector('#admin-bookings-body').innerHTML = bookings.length ? bookings.map(item => `<tr><td><strong>${escapeHTML(item.booking_reference)}</strong><br>${escapeHTML(item.name)}<br>${escapeHTML(item.phone)}</td><td>${escapeHTML(item.pickup)}<br>→ ${escapeHTML(item.destination)}</td><td>${escapeHTML(item.travel_date)} ${escapeHTML(item.travel_time.slice(0, 5))}<br>${escapeHTML(item.vehicle)}</td><td>${formatINR(item.fare)}</td><td><select data-status-table="bookings" data-id="${item.id}" aria-label="Update booking status">${statusOptions(item.status, ['pending', 'confirmed', 'completed', 'cancelled'])}</select></td></tr>`).join('') : '<tr><td colspan="5">No bookings yet.</td></tr>';
  document.querySelector('#admin-drivers-body').innerHTML = drivers.length ? drivers.map(item => `<tr><td><strong>${escapeHTML(item.full_name)}</strong><br>${escapeHTML(item.phone)}<br>${escapeHTML(item.email)}<br>${escapeHTML(item.city)}</td><td>${escapeHTML(item.experience)}<br>${escapeHTML(item.vehicle_type)}</td><td>${escapeHTML(item.vehicle_registration)}<br>${escapeHTML(item.license_number)}${item.aadhaar_last_four ? `<br>Aadhaar ending: ${escapeHTML(item.aadhaar_last_four)}` : ''}</td><td><select data-status-table="driver_applications" data-id="${item.id}" aria-label="Update driver application status">${statusOptions(item.status, ['pending', 'reviewing', 'approved', 'rejected'])}</select></td></tr>`).join('') : '<tr><td colspan="4">No driver applications yet.</td></tr>';
  document.querySelector('#admin-messages-body').innerHTML = messages.length ? messages.map(item => `<tr><td><strong>${escapeHTML(item.name)}</strong><br>${escapeHTML(item.email)}<br>${escapeHTML(item.phone || 'No phone supplied')}</td><td>${escapeHTML(item.message)}</td><td>${new Date(item.created_at).toLocaleString('en-IN')}</td><td><select data-status-table="contact_messages" data-id="${item.id}" aria-label="Update contact message status">${statusOptions(item.status, ['new', 'read', 'resolved'])}</select></td></tr>`).join('') : '<tr><td colspan="4">No contact messages yet.</td></tr>';
  document.querySelectorAll('[data-status-table]').forEach(select => select.addEventListener('change', updateStatus));
}

async function updateStatus(event) {
  const select = event.currentTarget;
  select.disabled = true;
  const { error } = await supabase.from(select.dataset.statusTable).update({ status: select.value }).eq('id', select.dataset.id);
  select.disabled = false;
  if (error) { console.error(error); toast('Unable to update the status.', 'error'); await loadDashboard(); return; }
  toast('Status updated successfully.', 'success');
  await loadDashboard();
}
