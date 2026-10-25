(async function () {
  const status = document.querySelector('#proStatus');
  const email = document.querySelector('#proEmail');
  if (new URLSearchParams(location.search).get('portal')) {
    status.textContent = 'The receipt page could not be opened. Try again in a moment.';
  }
  document.querySelector('#signOut')?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', {method: 'POST'});
    location.href = 'index.html';
  });
  try {
    const response = await fetch('/api/auth/session', {headers: {Accept: 'application/json'}});
    if (!response.ok) {
      location.href = 'signin.html';
      return;
    }
    const data = await response.json();
    status.textContent = 'Pro is active.';
    email.textContent = data.email || '';
    const script = document.createElement('script');
    script.src = '/api/pro/module?name=pro.js';
    script.onerror = () => { status.textContent = 'Pro tools could not be loaded. Sign in again.'; };
    document.body.appendChild(script);
  } catch {
    status.textContent = 'Pro status could not be checked.';
  }
})();
