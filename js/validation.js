export const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
// Accept a 10-digit Indian mobile number, with optional 91 or +91 country code.
export const phoneValid = value => /^(?:\+?91)?[6-9]\d{9}$/.test(value.replace(/[\s-]/g, ''));
export const todayISO = () => new Date().toISOString().split('T')[0];
export const cleanText = value => value.trim().replace(/\s+/g, ' ');

export function fieldError(input, message = '') {
  const error = document.querySelector(`[data-error-for="${input.name}"]`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  input.classList.toggle('input-error', Boolean(message));
  if (error) error.textContent = message;
}

export function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach(node => node.textContent = '');
  form.querySelectorAll('[aria-invalid="true"]').forEach(input => { input.setAttribute('aria-invalid', 'false'); input.classList.remove('input-error'); });
}
