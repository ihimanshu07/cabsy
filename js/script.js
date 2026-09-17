import { initUI, toast } from './ui.js';
import { VEHICLES, formatINR } from './data.js';
import { configured, supabase } from './supabase.js';

await initUI();

const vehicleSelect = document.querySelector('#vehicle');
const farePreview = document.querySelector('[data-fare-preview]');

document.querySelectorAll('[data-vehicle-select]').forEach(button => {
  button.addEventListener('click', () => {
    if (!vehicleSelect) return;
    vehicleSelect.value = button.dataset.vehicleSelect;
    vehicleSelect.dispatchEvent(new Event('change'));
    document.querySelector('#book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    vehicleSelect.focus({ preventScroll: true });
  });
});


document.querySelectorAll('[data-book-link]').forEach(link => {
  link.addEventListener('click', async event => {
    if (!configured) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return;
    event.preventDefault();
    location.href = `auth.html?returnTo=${encodeURIComponent('index.html#book')}`;
  });
});

const revealTargets = document.querySelectorAll('[data-reveal]');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion || !('IntersectionObserver' in window)) {
  revealTargets.forEach(target => target.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px' });
  revealTargets.forEach(target => observer.observe(target));
}

if (!configured) {
  toast('Set your public Supabase configuration in js/config.js before using account features.', 'info');
}
