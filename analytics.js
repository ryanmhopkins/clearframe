(function (root) {
  'use strict';
  // Public project token. It is not a secret (PostHog's phc_ tokens are public).
  const POSTHOG_KEY = 'phc_p2NczAGuJvGQYjWMXPstrbxRMxx7pHKLEv2CGzocg5yd';
  const UI_HOST = 'https://us.posthog.com';
  const DEFAULTS = '2026-08-30';
  const APP_VERSION = '1.1.0';
  const OPT_OUT_KEY = 'cf_analytics_off';
  const COOKIELESS_ID = '$posthog_cookieless';
  // Direct ingest, not a same-origin rewrite.
  // server-lib/http.js setCookie uses Path=/ and no Domain attribute, so
  // cf_session and cf_used are host-only and are sent on every path of this
  // site. A Vercel external rewrite forwards the request, including Cookie
  // and Authorization. Route transforms that delete headers were not proven
  // against this cookie without a deploy, and the cookie attributes must
  // not change. A cross-origin request to the host below does not attach
  // that host-only session cookie.
  const API_HOST = 'https://us.i.posthog.com';

  const PAGE_PATHS = ['/', '/pro', '/signin', '/how-privacy-works', '/privacy', '/terms', '/contact', 'other'];
  const EVENTS = {
    $pageview: {path: PAGE_PATHS},
    clean_completed: {
      file_count_bucket: ['1', '2-5', '6-20', '21+'],
      format_group: ['jpeg', 'png', 'webp', 'gif', 'heic', 'avif', 'tiff', 'raw', 'mixed'],
      mode: ['single', 'batch', 'folder'],
      tier: ['free', 'pro'],
      preset_used: ['true', 'false']
    },
    scan_completed: {
      file_count_bucket: ['1', '2-5', '6-20', '21+'],
      format_group: ['jpeg', 'png', 'webp', 'gif', 'heic', 'avif', 'tiff', 'raw', 'mixed'],
      metadata_found: ['none', 'some']
    },
    checkout_started: {
      placement: ['header', 'hero', 'raw_gate', 'folder_gate', 'pricing'],
      discount_shown: ['launch9', 'none']
    },
    upgrade_click: {
      placement: ['header', 'hero', 'raw_gate', 'folder_gate', 'pricing']
    },
    pro_signin_requested: {result: ['sent', 'not_paid', 'error']}
  };
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
  const UTM_VALUE = /^[a-z0-9_-]{1,32}$/;
  const DOMAIN_VALUE = /^[a-z0-9.-]{1,32}$/;
  const VERSION_VALUE = /^(?:\d+\.\d+\.\d+|[0-9a-f]{7})$/;
  const FILE_VALUE = /\.(?:jpe?g|png|gif|webp|hei[cf]|avif|tiff?|dng|cr2|nef|arw|raw|rw2|orf|raf|bmp|svg)\b/i;
  const FORMAT_GROUPS = {
    jpeg: 'jpeg', jpg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif',
    heic: 'heic', heif: 'heic', avif: 'avif', tif: 'tiff', tiff: 'tiff',
    dng: 'raw', cr2: 'raw', nef: 'raw', arw: 'raw', raw: 'raw'
  };

  let memoryOptOut = false;

  function yes(value) {
    return value === true || value === 1 || value === '1' || value === 'yes';
  }

  function dnt() {
    const nav = root.navigator;
    return yes(nav && nav.doNotTrack) || yes(nav && nav.msDoNotTrack) || yes(root.doNotTrack) || yes(nav && nav.globalPrivacyControl);
  }

  function storage() {
    try { return root.localStorage; }
    catch { return null; }
  }

  // posthog-js falls back to document.cookie when localStorage.setItem throws,
  // even with cookieless_mode 'always'. If a probe write fails, skip init so
  // analytics never sets a cookie.
  function storageWritable() {
    let local = null;
    let session = null;
    try { local = root.localStorage; } catch { return false; }
    try { session = root.sessionStorage; } catch { return false; }
    if (!local || !session || typeof local.setItem !== 'function' || typeof session.setItem !== 'function') return false;
    const key = '__cf_ls_probe__';
    try {
      local.setItem(key, '1');
      local.removeItem(key);
      session.setItem(key, '1');
      session.removeItem(key);
      return true;
    } catch {
      try { local.removeItem(key); } catch { /* nothing stored */ }
      try { session.removeItem(key); } catch { /* nothing stored */ }
      return false;
    }
  }

  function optedOut() {
    if (memoryOptOut) return true;
    const store = storage();
    try { return !!(store && store.getItem(OPT_OUT_KEY) === '1'); }
    catch { return false; }
  }

  function setOptOut(on) {
    memoryOptOut = !!on;
    const store = storage();
    if (!store) return;
    try {
      if (on) store.setItem(OPT_OUT_KEY, '1');
      else store.removeItem(OPT_OUT_KEY);
    } catch { /* the in-memory flag still stops this page */ }
  }

  function coarsePath(pathname) {
    let path = String(pathname || '/');
    try { path = decodeURIComponent(path); }
    catch { /* keep the raw path and bucket it below */ }
    path = path.split('?')[0].split('#')[0];
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path.endsWith('.html')) path = path.slice(0, -5);
    if (path === '' || path === '/index') path = '/';
    return PAGE_PATHS.indexOf(path) >= 0 ? path : 'other';
  }

  function fileCountBucket(count) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) return null;
    if (n === 1) return '1';
    if (n <= 5) return '2-5';
    if (n <= 20) return '6-20';
    return '21+';
  }

  function formatGroup(formats) {
    const list = Array.isArray(formats) ? formats : [formats];
    const groups = new Set();
    for (const format of list) {
      const group = FORMAT_GROUPS[String(format || '').toLowerCase()];
      if (group) groups.add(group);
    }
    if (!groups.size) return null;
    if (groups.size === 1) return [...groups][0];
    return 'mixed';
  }

  function environment() {
    let host = '';
    try { host = String(root.location && root.location.hostname || '').toLowerCase(); }
    catch { host = ''; }
    if (host === 'getclearframe.app' || host === 'www.getclearframe.app') return 'production';
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '') return 'development';
    return 'preview';
  }

  function urlParts(properties) {
    const raw = typeof properties.$current_url === 'string' ? properties.$current_url : '';
    let pathname = typeof properties.$pathname === 'string' ? properties.$pathname : '/';
    let origin = '';
    let host = '';
    if (raw) {
      try {
        const url = new URL(raw, 'https://getclearframe.app');
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          origin = url.origin;
          host = url.hostname;
          pathname = url.pathname || pathname;
        }
      } catch { /* drop the unreadable URL */ }
    }
    return {origin, host, path: coarsePath(pathname)};
  }

  function keepString(value, pattern) {
    return typeof value === 'string' && value.length <= 32 && pattern.test(value) && !FILE_VALUE.test(value) && value.indexOf('@') < 0;
  }

  function sanitizeEvent(event, state) {
    if (!event || typeof event.event !== 'string' || !EVENTS[event.event]) return null;
    const blocked = state ? !!(state.optedOut || state.dnt) : (optedOut() || dnt());
    if (blocked) return null;
    const src = event.properties && typeof event.properties === 'object' ? event.properties : {};
    const out = {};
    if (src.token !== POSTHOG_KEY) return null;
    out.token = POSTHOG_KEY;
    if (src.distinct_id === COOKIELESS_ID) out.distinct_id = COOKIELESS_ID;
    if (src.$cookieless_mode === true) out.$cookieless_mode = true;
    if (src.project === 'clearframe') out.project = src.project;
    if (src.environment === 'production' || src.environment === 'preview' || src.environment === 'development') out.environment = src.environment;
    if (keepString(src.app_version, VERSION_VALUE)) out.app_version = src.app_version;

    const parts = urlParts(src);
    out.path = parts.path;
    out.$pathname = parts.path;
    if (parts.origin && parts.origin.indexOf('@') < 0 && parts.origin.indexOf('?') < 0 && parts.origin.indexOf('#') < 0) {
      out.$current_url = parts.path === 'other' || parts.path === '/' ? parts.origin + '/' : parts.origin + parts.path;
    }
    if (parts.host && keepString(parts.host, DOMAIN_VALUE)) out.$host = parts.host;
    if (typeof src.$referring_domain === 'string' && keepString(src.$referring_domain.toLowerCase(), DOMAIN_VALUE)) {
      out.$referring_domain = src.$referring_domain.toLowerCase();
    }
    for (const key of UTM_KEYS) {
      if (typeof src[key] === 'string' && UTM_VALUE.test(src[key])) out[key] = src[key];
    }

    const enums = EVENTS[event.event];
    for (const key of Object.keys(enums)) {
      const value = src[key];
      if (typeof value === 'string' && value.length <= 32 && enums[key].indexOf(value) >= 0 && !FILE_VALUE.test(value) && value.indexOf('@') < 0 && value.indexOf('?') < 0 && value.indexOf('#') < 0) {
        out[key] = value;
      }
    }
    if (event.event === '$pageview') out.path = parts.path;
    else delete out.path;

    for (const key of Object.keys(out)) {
      const value = out[key];
      if (typeof value !== 'string') continue;
      if (key === 'token' || key === '$current_url') continue;
      if (value.length > 32 || value.indexOf('@') >= 0 || value.indexOf('?') >= 0 || value.indexOf('#') >= 0 || FILE_VALUE.test(value)) delete out[key];
    }
    if (out.$current_url && (out.$current_url.indexOf('?') >= 0 || out.$current_url.indexOf('#') >= 0 || out.$current_url.indexOf('@') >= 0)) delete out.$current_url;

    const next = {};
    for (const key of Object.keys(event)) {
      if (key === 'properties' || key === '$set' || key === '$set_once') continue;
      next[key] = event[key];
    }
    next.properties = out;
    return next;
  }

  function capture(name, props, options) {
    try {
      if (optedOut() || dnt()) return;
      const ph = root.posthog;
      if (!ph || typeof ph.capture !== 'function') return;
      ph.capture(name, props || {}, options || {send_instantly: true});
    } catch { /* analytics must not break the page */ }
  }

  function cleanCompleted(info) {
    try {
      const props = {preset_used: info && info.presetUsed ? 'true' : 'false'};
      const bucket = fileCountBucket(info && info.count);
      const group = formatGroup(info && info.formats);
      if (bucket) props.file_count_bucket = bucket;
      if (group) props.format_group = group;
      if (info && EVENTS.clean_completed.mode.indexOf(info.mode) >= 0) props.mode = info.mode;
      if (info && EVENTS.clean_completed.tier.indexOf(info.tier) >= 0) props.tier = info.tier;
      capture('clean_completed', props);
    } catch { /* ignore */ }
  }

  function scanCompleted(info) {
    try {
      const props = {};
      const bucket = fileCountBucket(info && info.count);
      const group = formatGroup(info && info.formats);
      if (bucket) props.file_count_bucket = bucket;
      if (group) props.format_group = group;
      if (info && (info.metadataFound === 'none' || info.metadataFound === 'some')) props.metadata_found = info.metadataFound;
      capture('scan_completed', props);
    } catch { /* ignore */ }
  }

  // The sign-in API uses one response whether or not a link was sent, so the
  // page cannot honestly report sent versus not_paid. Failures are error.
  function signinRequested(outcome) {
    try {
      if (outcome === 'error') capture('pro_signin_requested', {result: 'error'});
      else capture('pro_signin_requested', {});
    } catch { /* ignore */ }
  }

  function bindCheckout(doc) {
    doc.addEventListener('click', event => {
      const target = event.target && event.target.closest ? event.target.closest('a.upgrade-link') : null;
      if (!target) return;
      const header = target.closest && (target.closest('header') || target.closest('.top-links'));
      const hint = doc.querySelector('.code-hint');
      const props = {discount_shown: hint && hint.textContent.trim() === 'Code LAUNCH9' ? 'launch9' : 'none'};
      if (header) props.placement = 'header';
      capture('checkout_started', props, {transport: 'sendBeacon', send_instantly: true});
    });
  }

  function bindOptOut(doc, ph) {
    const button = doc.querySelector('#analyticsToggle');
    if (!button) return;
    const paint = () => {
      const off = optedOut();
      button.textContent = off ? 'Turn on analytics' : 'Turn off analytics';
      button.setAttribute('aria-pressed', off ? 'true' : 'false');
    };
    paint();
    button.addEventListener('click', () => {
      if (optedOut()) {
        setOptOut(false);
        try { ph.opt_in_capturing(); } catch { /* no-op under cookieless_mode always */ }
        capture('$pageview');
      } else {
        setOptOut(true);
        try { ph.opt_out_capturing(); } catch { /* no-op under cookieless_mode always */ }
      }
      paint();
    });
  }

  function start(options) {
    options = options || {};
    const ph = options.posthog || root.posthog;
    if (!ph || typeof ph.init !== 'function' || root.__cfAnalyticsStarted) return;
    if (!storageWritable()) return;
    root.__cfAnalyticsStarted = true;
    try {
      // posthog-js 1.438.21 ignores opt_out_capturing() and respect_dnt while
      // cookieless_mode is 'always' (is_capturing() stays true). Opt-out and
      // Do Not Track are enforced in sanitizeEvent. The button still calls
      // opt_out_capturing and opt_in_capturing.
      ph.init(POSTHOG_KEY, {
        api_host: options.apiHost || API_HOST,
        ui_host: UI_HOST,
        defaults: DEFAULTS,
        cookieless_mode: 'always',
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: false,
        capture_dead_clicks: false,
        rageclick: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        enable_recording_console_log: false,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        disableDeviceModel: true,
        advanced_disable_flags: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        respect_dnt: true,
        property_denylist: ['$referrer', '$initial_referrer', '$el_text', '$elements', '$set', '$set_once'],
        before_send: sanitizeEvent,
        disable_compression: !!options.disableCompression
      });
      ph.register({project: 'clearframe', app_version: APP_VERSION, environment: environment()});
      if (optedOut()) {
        try { ph.opt_out_capturing(); } catch { /* ignored by the SDK in this mode */ }
      }
      const doc = root.document;
      if (doc) {
        bindCheckout(doc);
        bindOptOut(doc, ph);
      }
    } catch { /* analytics must not break the page */ }
  }

  const api = {
    POSTHOG_KEY, API_HOST, UI_HOST, DEFAULTS, APP_VERSION, OPT_OUT_KEY, EVENTS,
    sanitizeEvent, coarsePath, fileCountBucket, formatGroup, environment,
    optedOut, setOptOut, dnt, start, capture, cleanCompleted, scanCompleted, signinRequested
  };
  root.ClearFrameAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined' && root.posthog && !root.__CF_ANALYTICS_HOLD__) {
    try { api.start(); } catch { /* ignore */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
