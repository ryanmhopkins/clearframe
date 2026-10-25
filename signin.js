const form = document.querySelector('#signin');
const status = document.querySelector('#signinStatus');
if (new URLSearchParams(location.search).get('error')) status.textContent = 'That sign-in link is invalid or expired.';
form?.addEventListener('submit', async event => {
  event.preventDefault();
  status.textContent = 'Checking…';
  let outcome = 'error';
  try {
    const response = await fetch('/api/auth/request', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({email: document.querySelector('#email').value})
    });
    const data = await response.json();
    status.textContent = data.message || 'Enter an email address.';
    if (response.ok) outcome = 'accepted';
  } catch {
    status.textContent = 'The sign-in request could not be sent. Try again.';
  }
  try { globalThis.ClearFrameAnalytics?.signinRequested(outcome); }
  catch { /* analytics must not break sign-in */ }
});
