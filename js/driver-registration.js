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
    vehicle_registration: 'vehicle registration number', license_number: 'license number'
  };
  const missing = Object.keys(labels).filter(key => !fields[key]?.trim());

  if (missing.length) {
    toast(`Please complete: ${missing.map(key => labels[key]).join(', ')}.`, 'error');
    return;
  }
  if (!emailValid(fields.email)) {
    toast('Please enter a valid email address.', 'error');
    return;
  }
  if (!phoneValid(fields.phone)) {
    toast('Enter a valid Indian mobile number, for example 9876543210.', 'error');
    return;
  }
  if (!configured) {
    toast('Applications are unavailable until Supabase is configured.', 'error');
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  setButtonLoading(button, true, 'Submitting application...');
  const { error } = await supabase.from('driver_applications').insert({
    ...fields,
    message: fields.message.trim() || null
  });
  setButtonLoading(button, false);

  if (error) {
    console.error(error);
    toast('Unable to submit application. Please try again.', 'error');
    return;
  }
  form.reset();
  toast('Application submitted for review.', 'success');
});