(async function () {
  const nav = document.querySelector('.top-links');
  if (!nav || document.body.dataset.accountPage === 'true') return;
  try {
    const response = await fetch('/api/auth/session', {headers: {Accept: 'application/json'}});
    if (!response.ok) return;
    const session = await response.json();
    if (!session.signedIn || !session.pro) return;
    document.querySelector('.upgrade-banner')?.remove();
    nav.replaceChildren();
    const badge = document.createElement('span');
    badge.className = 'member-badge';
    badge.textContent = 'Pro active';
    const account = document.createElement('a');
    account.className = 'account-link';
    account.href = 'account.html';
    account.textContent = 'Open my workspace';
    nav.append(badge, account);
  } catch {
    // The public cleaner remains usable if the session check is unavailable.
  }
})();
