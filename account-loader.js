(async function () {
  const status = document.querySelector('#proStatus');
  if (new URLSearchParams(location.search).get('portal')) {
    status.textContent = 'Manage subscription could not be opened. Try again in a moment.';
    status.hidden = false;
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
    document.body.classList.add('account-ready');
    const script = document.createElement('script');
    script.src = '/api/pro/module?name=pro.js';
    script.onerror = () => { status.textContent = 'Pro tools could not be loaded. Sign in again.'; status.hidden = false; };
    document.body.appendChild(script);
  } catch {
    status.textContent = 'Pro status could not be checked.';
    status.hidden = false;
  }
})();
