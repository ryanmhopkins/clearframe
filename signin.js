const form = document.querySelector('#signin');
const status = document.querySelector('#signinStatus');
const submitButton = form?.querySelector('button[type="submit"]');
let requesting = false;
const params = new URLSearchParams(location.search);
if (params.get('error')) status.textContent = 'That sign-in link is invalid, expired, or already used. Enter your checkout email below to request a new link.';
if (params.get('subscribed') === '1') document.querySelector('#subscribedNote')?.removeAttribute('hidden');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (requesting) return;
  requesting = true;
  form.setAttribute('aria-busy', 'true');
  if (submitButton) submitButton.disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  status.textContent = 'Checking…';
  let outcome = 'error';
  try {
    const response = await fetch('/api/auth/request', {
      method: 'POST',
      signal: controller.signal,
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({email: document.querySelector('#email').value})
    });
    const data = await response.json();
    status.textContent = data.message || 'Enter an email address.';
    if (response.ok) outcome = 'accepted';
  } catch {
    status.textContent = 'The sign-in request could not be confirmed. Try again.';
  } finally {
    clearTimeout(timeout);
    requesting = false;
    form.removeAttribute('aria-busy');
    if (submitButton) submitButton.disabled = false;
  }
  try { globalThis.ClearFrameAnalytics?.signinRequested(outcome); }
  catch { /* analytics must not break sign-in */ }
});
