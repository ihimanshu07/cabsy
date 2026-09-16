import { initUI, toast } from './ui.js';
import { VEHICLES, formatINR } from './data.js';
import { configured, supabase } from './supabase.js';

await initUI();
document.querySelectorAll('[data-vehicle-select]').forEach(button => button.addEventListener('click', () => { const select = document.querySelector('#vehicle'); if (select) { select.value = button.dataset.vehicleSelect; select.dispatchEvent(new Event('change')); document.querySelector('#book')?.scrollIntoView({ behavior: 'smooth' }); } }));
const fare = document.querySelector('[data-fare-preview]');
document.querySelector('#vehicle')?.addEventListener('change', e => { const vehicle = VEHICLES[e.target.value]; if (fare) fare.textContent = vehicle ? `${formatINR(vehicle.fare)} estimated fare` : 'Choose a vehicle to view fare'; });
document.querySelectorAll('[data-book-link]').forEach(link => link.addEventListener('click', async e => { if (!configured) return; const { data: { session } } = await supabase.auth.getSession(); if (!session) { e.preventDefault(); location.href = `auth.html?returnTo=${encodeURIComponent('index.html#book')}`; } }));
if (!configured) toast('Set your public Supabase configuration in js/config.js before using account features.', 'info');
