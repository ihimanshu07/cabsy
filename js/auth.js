import { supabase, configured } from './supabase.js';
import { SITE_URL } from './config.js';
import { emailValid, phoneValid, fieldError, clearErrors } from './validation.js';
import { initUI, setButtonLoading } from './ui.js';

await initUI();
const message = document.querySelector('#auth-message');
const say = (text, type = 'info') => { message.textContent = text; message.className = `auth-message show ${type}`; };
const safeReturnTo = value => {
  const candidate = String(value ?? '');
  return /^[A-Za-z0-9][A-Za-z0-9._-]*(?:[?#].*)?$/.test(candidate) ? candidate : 'index.html#book';
};
const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
const query = new URLSearchParams(location.search);
const hashQuery = new URLSearchParams(location.hash.replace(/^#/, ''));
const isOAuthCallback = query.has('code') || location.hash.includes('access_token') || hashQuery.has('error');
const oauthBaseUrl = ['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin : SITE_URL;
const oauthRedirectUrl = new URL('auth.html', oauthBaseUrl);
oauthRedirectUrl.searchParams.set('returnTo', returnTo);

const friendly = error => {
  const detail = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase();
  const status = Number(error?.status ?? 0);
  if (detail.includes('invalid login')) return 'Email or password is incorrect.';
  if (detail.includes('already registered') || detail.includes('already been registered')) return 'An account with this email already exists. Try signing in or resetting the password.';
  if (detail.includes('password should') || detail.includes('weak password')) return 'Choose a stronger password of at least 8 characters.';
  if (status === 429 || detail.includes('rate limit') || detail.includes('over_email_send_rate_limit') || detail.includes('too many requests')) return 'Too many verification emails were requested. Please wait before trying again, or contact CABSY support.';
  if (detail.includes('redirect') || detail.includes('not allowed')) return 'Account verification is temporarily unavailable. Please contact CABSY support.';
  if (status >= 500 || detail.includes('failed to fetch') || detail.includes('network')) return 'The account service is temporarily unavailable. Check your connection and try again.';
  return 'Unable to complete the request. Please try again later.';
};

function showPanel(panel) {
  document.querySelectorAll('.auth-tab').forEach(button => button.classList.toggle('active', button.dataset.panel === panel));
  document.querySelectorAll('.auth-form').forEach(form => { form.hidden = form.id !== `${panel}-form`; });
}

async function ensure() {
  if (!configured) { say('Add your public Supabase configuration in js/config.js first.', 'error'); return false; }
  return true;
}

async function safely(action) {
  try { return await action(); } catch (error) { return { error }; }
}

function setGoogleLoading(loading) {
  document.querySelectorAll('[data-google-oauth]').forEach(button => setButtonLoading(button, loading, 'Opening Google...'));
}

async function finishOAuthCallback() {
  const providerError = query.get('error') || query.get('error_description') || hashQuery.get('error') || hashQuery.get('error_description');
  if (providerError) {
    say('Google sign-in was cancelled or could not be completed. Please try again.', 'error');
    return;
  }
  if (!isOAuthCallback || !configured) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    location.replace(returnTo);
    return;
  }
  say('Google sign-in did not complete. Please try again.', 'error');
}

document.querySelectorAll('.auth-tab').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));
if (location.hash === '#signup') showPanel('signup');
document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
  const input = document.querySelector(`#${button.dataset.passwordToggle}`);
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? 'Show' : 'Hide';
}));
document.querySelector('#signup-password')?.addEventListener('input', event => {
  const score = [/.{8,}/, /[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(event.target.value)).length;
  const meter = document.querySelector('.strength span');
  meter.style.width = `${score * 20}%`;
  meter.style.background = score >= 4 ? 'var(--success)' : score >= 3 ? 'var(--warning)' : 'var(--error)';
});

document.querySelectorAll('[data-google-oauth]').forEach(button => button.addEventListener('click', async () => {
  if (!await ensure()) return;
  setGoogleLoading(true);
  const { error } = await safely(() => supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirectUrl.href }
  }));
  if (error) {
    setGoogleLoading(false);
    say('Unable to start Google sign-in. Please try again.', 'error');
  }
}));

await finishOAuthCallback();

document.querySelector('#signup-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  clearErrors(event.currentTarget);
  if (!await ensure()) return;
  const fields = new FormData(event.currentTarget);
  const name = fields.get('full_name').trim();
  const email = fields.get('email').trim();
  const phone = fields.get('phone').trim();
  const password = fields.get('password');
  const confirm = fields.get('confirm_password');
  let invalid = false;
  if (!name) { fieldError(event.currentTarget.full_name, 'Enter your full name.'); invalid = true; }
  if (!emailValid(email)) { fieldError(event.currentTarget.email, 'Please enter a valid email address.'); invalid = true; }
  if (!phoneValid(phone)) { fieldError(event.currentTarget.phone, 'Enter a valid Indian mobile number.'); invalid = true; }
  if (password.length < 8) { fieldError(event.currentTarget.password, 'Use at least 8 characters.'); invalid = true; }
  if (password !== confirm) { fieldError(event.currentTarget.confirm_password, 'Passwords do not match.'); invalid = true; }
  if (invalid) return;

  const button = event.currentTarget.querySelector('[type=submit]');
  setButtonLoading(button, true, 'Creating account...');
  const { data, error } = await safely(() => supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: new URL('auth.html', location.href).href, data: { full_name: name, phone } }
  }));
  setButtonLoading(button, false);
  if (error) { say(friendly(error), 'error'); return; }
  if (data.session) location.href = returnTo;
  else say('Account created. Check your email to verify your address before signing in.', 'info');
});

document.querySelector('#login-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  clearErrors(event.currentTarget);
  if (!await ensure()) return;
  const fields = new FormData(event.currentTarget);
  const email = fields.get('email').trim();
  const password = fields.get('password');
  let invalid = false;
  if (!emailValid(email)) { fieldError(event.currentTarget.email, 'Please enter a valid email address.'); invalid = true; }
  if (!password) { fieldError(event.currentTarget.password, 'Enter your password.'); invalid = true; }
  if (invalid) return;
  const button = event.currentTarget.querySelector('[type=submit]');
  setButtonLoading(button, true, 'Signing in...');
  const { error } = await safely(() => supabase.auth.signInWithPassword({ email, password }));
  setButtonLoading(button, false);
  if (error) { say(friendly(error), 'error'); return; }
  location.href = returnTo;
});

document.querySelector('#forgot-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!await ensure()) return;
  const email = new FormData(event.currentTarget).get('email').trim();
  if (!emailValid(email)) { say('Please enter a valid email address.', 'error'); return; }
  const button = event.currentTarget.querySelector('button');
  setButtonLoading(button, true, 'Sending link...');
  const { error } = await safely(() => supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL('auth.html?mode=reset', location.href).href }));
  setButtonLoading(button, false);
  say(error ? friendly(error) : 'If an account exists, a password reset link has been sent.', error ? 'error' : 'info');
});

if (new URLSearchParams(location.search).get('mode') === 'reset') showPanel('reset');
document.querySelector('#reset-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!await ensure()) return;
  const password = new FormData(event.currentTarget).get('password');
  if (password.length < 8) { say('Use at least 8 characters.', 'error'); return; }
  const button = event.currentTarget.querySelector('button');
  setButtonLoading(button, true, 'Updating password...');
  const { error } = await safely(() => supabase.auth.updateUser({ password }));
  setButtonLoading(button, false);
  if (error) { say(friendly(error), 'error'); return; }
  say('Password updated. You can now continue.', 'info');
  setTimeout(() => { location.href = returnTo; }, 800);
});
