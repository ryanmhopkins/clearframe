(function (root) {
  const backdrop = document.getElementById('proBackdrop');
  const dialog = document.getElementById('proDialog');
  const app = document.getElementById('app');
  const closeButton = document.getElementById('proClose');
  if (!backdrop || !dialog || !app || !closeButton) return;

  let lastFocus = null;

  function focusables() {
    return [...dialog.querySelectorAll('a[href], button:not([disabled])')].filter(el => !el.closest('[hidden]'));
  }

  function remember(explicit) {
    if (explicit && typeof explicit.focus === 'function') return explicit;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement && active.id !== 'fileInput') return active;
    return document.getElementById('dropzone') || document.querySelector('[data-pro-dialog]');
  }

  function open(options) {
    options = options || {};
    if (!backdrop.hidden) return;
    const source = options.source === 'raw_error' ? 'raw_error' : 'header';
    lastFocus = remember(options.returnFocus);
    dialog.setAttribute('data-source', source);
    backdrop.hidden = false;
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    dialog.focus({preventScroll: true});
    try { root.ClearFrameAnalytics?.proDialogOpened(source); }
    catch { /* analytics must not break the dialog */ }
  }

  function close() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    dialog.removeAttribute('data-source');
    app.inert = false;
    app.removeAttribute('aria-hidden');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    const target = lastFocus && document.contains(lastFocus) ? lastFocus : document.querySelector('[data-pro-dialog]');
    lastFocus = null;
    if (target && typeof target.focus === 'function') target.focus({preventScroll: true});
  }

  document.addEventListener('click', event => {
    const opener = event.target && event.target.closest ? event.target.closest('[data-pro-dialog]') : null;
    if (!opener) return;
    event.preventDefault();
    open({source: opener.getAttribute('data-pro-dialog'), returnFocus: opener});
  });

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('mousedown', event => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', event => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  root.ClearFrameProDialog = {open};
})(typeof globalThis !== 'undefined' ? globalThis : window);
