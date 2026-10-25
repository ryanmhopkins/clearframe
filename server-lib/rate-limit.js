const buckets = new Map();

function resetRateLimit() {
  buckets.clear();
}

function allow(key, limit, windowMs, now = Date.now()) {
  const recent = (buckets.get(key) || []).filter(time => now - time < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

module.exports = {allow, resetRateLimit};
