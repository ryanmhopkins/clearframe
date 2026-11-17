(function () {
  'use strict';
  const button = document.querySelector('#shareClearFrame');
  const status = document.querySelector('#shareStatus');
  const fallback = document.querySelector('#shareLink');
  if (!button || !status || !fallback) return;
  // A fixed public URL: never share this page's query, photos, or account data.
  const url = 'https://getclearframe.app/';
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '';
    fallback.hidden = true;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({title: 'ClearFrame', text: 'Review and clean photo metadata in your browser. Photos stay on your device.', url});
        return;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Link copied.';
        return;
      }
      throw new Error('Manual copy needed');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      fallback.value = url;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      status.textContent = 'Copy this public link to share ClearFrame.';
    } finally { button.disabled = false; }
  });
})();
