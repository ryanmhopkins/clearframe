(function (root) {
  const LIMIT = 10;
  const KEY = 'clearframe.free-downloads.v1';
  let fallback = null;

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function read() {
    let saved;
    try { saved = JSON.parse(root.localStorage.getItem(KEY)) || fallback; }
    catch { saved = fallback; }
    return saved && saved.day === today() && Number.isInteger(saved.count) && saved.count >= 0
      ? saved.count : 0;
  }
  function remaining() { return Math.max(0, LIMIT - read()); }
  function canUse(count) { return Number.isInteger(count) && count > 0 && count <= remaining(); }
  function record(count) {
    if (!canUse(count)) return false;
    const saved = {day: today(), count: read() + count};
    fallback = saved;
    try { root.localStorage.setItem(KEY, JSON.stringify(saved)); }
    catch { /* Keep the allowance in memory when browser storage is unavailable. */ }
    return true;
  }
  root.ClearFrameDailyLimit = {limit: LIMIT, remaining, canUse, record};
})(typeof globalThis !== 'undefined' ? globalThis : window);
