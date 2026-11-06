(async function () {
  if (document.body.dataset.accountPage === 'true') return;
  try {
    const response = await fetch('/api/auth/session', {headers: {Accept: 'application/json'}});
    if (!response.ok) return;
    const session = await response.json();
    if (!session.signedIn || !session.pro) return;
    location.replace('account.html');
  } catch {
    // The public cleaner remains usable if the session check is unavailable.
  }
})();
