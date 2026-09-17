import { initUI, toast, setButtonLoading } from './ui.js';
import { supabase, configured } from './supabase.js';
import { emailValid, phoneValid } from './validation.js';

await initUI();

const form = document.querySelector('#driver-form');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  const labels = {
    full_name: 'full name', phone: 'phone number', email: 'email', city: 'city',
    experience: 'driving experience', vehicle_type: 'vehicle type',
    vehicle_registration: 'vehicle registration number', license_number: 'license number',
    aadhaar_last_four: 'last four Aadhaar digits'
  };
  const missing = Object.keys(labels).filter(key => !String(fields[key] ?? '').trim());
  if (missing.length) {
    toast(`Please complete: ${missing.map(key => labels[key]).join(', ')}.`, 'error');
    return;
  }
  if (!emailValid(fields.email)) { toast('Please enter a valid email address.', 'error'); return; }
  if (!phoneValid(fields.phone)) { toast('Enter a valid Indian mobile number, for example 9876543210.', 'error'); return; }
  if (!/^\d{4}$/.test(fields.aadhaar_last_four)) { toast('Enter exactly four Aadhaar digits.', 'error'); return; }
  if (fields.aadhaar_confirmed !== 'on') { toast('Confirm that the Aadhaar reference belongs to you.', 'error'); return; }
  if (!configured) { toast('Applications are unavailable until Supabase is configured.', 'error'); return; }

  const button = form.querySelector('button[type="submit"]');
  setButtonLoading(button, true, 'Submitting application...');
  const { error } = await supabase.from('driver_applications').insert({
    full_name: fields.full_name.trim(), phone: fields.phone.trim(), email: fields.email.trim(), city: fields.city.trim(),
    experience: fields.experience.trim(), vehicle_type: fields.vehicle_type.trim(), vehicle_registration: fields.vehicle_registration.trim(),
    license_number: fields.license_number.trim(), aadhaar_last_four: fields.aadhaar_last_four,
    aadhaar_confirmed: true, message: String(fields.message ?? '').trim() || null
  });
  setButtonLoading(button, false);
  if (error) { console.error(error); toast('Unable to submit application. Please try again.', 'error'); return; }
  form.reset();
  toast('Application submitted for review.', 'success');
});
