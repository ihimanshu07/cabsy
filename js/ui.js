import { supabase, configured } from './supabase.js';

export function toast(message, type = 'info') { const region = document.querySelector('.toast-region') || Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toast-region', ariaLive: 'polite' }); const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; region.append(node); setTimeout(() => node.remove(), 5000); }
export function setButtonLoading(button, loading, label) { if (!button) return; if (loading) { button.dataset.label = button.textContent; button.disabled = true; button.textContent = label; } else { button.disabled = false; button.textContent = button.dataset.label || button.textContent; } }
export function openModal(content) { const backdrop = document.querySelector('#modal-backdrop'); backdrop.querySelector('.modal').innerHTML = content; backdrop.classList.add('open'); const close = () => backdrop.classList.remove('open'); backdrop.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close)); document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); } }); backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); }, { once: true }); backdrop.querySelector('button, a')?.focus(); }
export function currentPath() { return `${location.pathname.split('/').pop() || 'index.html'}${location.search}${location.hash}`; }

async function renderAccount() { const authSlot = document.querySelector('[data-auth-slot]'); if (!authSlot) return; if (!configured) { authSlot.innerHTML = '<a class="button button-outline" href="auth.html">Login</a><a class="button" href="auth.html#signup">Create Account</a>'; return; } const { data: { session } } = await supabase.auth.getSession(); if (!session) { authSlot.innerHTML = '<a class="button button-outline" href="auth.html">Login</a><a class="button" href="auth.html#signup">Create Account</a>'; return; } const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Customer'; const { data: isAdmin } = await supabase.rpc('is_admin'); const operationsLink = isAdmin ? '<a href="admin.html">Operations Dashboard</a>' : ''; authSlot.innerHTML = `<details class="account-menu"><summary>Hello, ${escapeHTML(name.split(' ')[0])}</summary><nav><a href="profile.html">My Profile</a><a href="bookings.html">My Bookings</a><a href="index.html#book">Book a Cab</a>${operationsLink}<button type="button" data-logout>Logout</button></nav></details>`; authSlot.querySelector('[data-logout]').addEventListener('click', async () => { await supabase.auth.signOut(); toast('You have been logged out.', 'success'); location.href = 'index.html'; }); }
function escapeHTML(value) { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function renderPublicNavigation() {
  const page = location.pathname.split('/').pop() || 'index.html';
  const publicPages = new Set(['index.html', 'fares.html', 'services.html', 'destinations.html', 'about.html', 'contact.html', 'driver-registration.html']);
  if (!publicPages.has(page)) return;
  const links = document.querySelector('.nav-links');
  if (!links) return;
  const items = [
    ['index.html', 'Home'], ['index.html#book', 'Book a cab'], ['fares.html', 'Fares'], ['services.html', 'Services'],
    ['destinations.html', 'Destinations'], ['about.html', 'About'], ['contact.html', 'Contact'], ['driver-registration.html', 'Drive with CABSY']
  ];
  links.innerHTML = items.map(([href, label]) => `<a href="${href}"${href === page ? ' class="active"' : ''}>${label}</a>`).join('');
}

export async function initUI() { const nav = document.querySelector('.site-header'); renderPublicNavigation(); addEventListener('scroll', () => nav?.classList.toggle('scrolled', scrollY > 8), { passive: true }); const toggle = document.querySelector('.menu-toggle'); toggle?.addEventListener('click', () => { const links = document.querySelector('.nav-links'), actions = document.querySelector('.nav-actions'); const next = !links.classList.contains('open'); links.classList.toggle('open', next); actions.classList.toggle('mobile-open', next); toggle.setAttribute('aria-expanded', String(next)); document.body.classList.toggle('menu-open', next); }); await renderAccount(); if (configured) supabase.auth.onAuthStateChange(() => setTimeout(renderAccount, 0)); }
