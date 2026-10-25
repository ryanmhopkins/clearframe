const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

test('free allowance persists in this browser and resets at local midnight', () => {
  const dom = new JSDOM('', {runScripts: 'outside-only', url: 'https://getclearframe.app/'});
  const w = dom.window;
  const NativeDate = w.Date;
  let clock = new NativeDate(2026, 9, 25, 23, 59);
  w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } };
  try {
    w.eval(fs.readFileSync('daily-limit.js', 'utf8'));
    const quota = w.ClearFrameDailyLimit;
    assert.equal(quota.remaining(), 10);
    assert.equal(quota.record(9), true);
    assert.equal(quota.remaining(), 1);
    assert.equal(quota.canUse(2), false);
    assert.equal(quota.record(2), false);
    assert.equal(quota.remaining(), 1);
    clock = new NativeDate(2026, 9, 26, 0, 0);
    assert.equal(quota.remaining(), 10);
    assert.equal(quota.record(1), true);
    assert.equal(quota.remaining(), 9);
  } finally { dom.window.close(); }
});

test('the eleventh free download is blocked and opens the upgrade dialog', async () => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {runScripts: 'outside-only', url: 'https://getclearframe.app/'});
  const w = dom.window;
  w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; w.Blob = Blob;
  w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const downloads = [], dialogs = [];
  try {
    for (const script of ['metadata.js', 'motion.js', 'daily-limit.js', 'app.js']) w.eval(fs.readFileSync(script, 'utf8'));
    w.downloadBlob = (...args) => downloads.push(args);
    w.ClearFrameProDialog = {open: options => dialogs.push(options)};
    const bytes = new Uint8Array([255, 216, 255, 217]);
    await w.handleFiles([{name: 'photo.jpg', type: 'image/jpeg', size: bytes.length, lastModified: 0, arrayBuffer: async () => bytes.buffer}]);
    for (let i = 0; i < 10; i++) await w.clean();
    assert.equal(downloads.length, 10);
    assert.equal(w.ClearFrameDailyLimit.remaining(), 0);
    await w.clean();
    assert.equal(downloads.length, 10);
    assert.equal(dialogs.length, 1);
    assert.equal(dialogs[0].source, 'quota');
    assert.match(dialogs[0].message, /resets at local midnight/);
    w.ClearFrameMember = true;
    await w.clean();
    assert.equal(downloads.length, 11);
  } finally { dom.window.close(); }
});

test('a ZIP counts its photos and is blocked when the whole batch exceeds the allowance', async () => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {runScripts: 'outside-only', url: 'https://getclearframe.app/'});
  const w = dom.window;
  w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; w.Blob = Blob;
  w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const downloads = [], dialogs = [];
  try {
    for (const script of ['metadata.js', 'motion.js', 'daily-limit.js', 'app.js']) w.eval(fs.readFileSync(script, 'utf8'));
    w.downloadBlob = (...args) => downloads.push(args);
    w.ClearFrameProDialog = {open: options => dialogs.push(options)};
    w.JSZip = class { file() {} async generateAsync() { return new Blob(['zip']); } };
    const bytes = new Uint8Array([255, 216, 255, 217]);
    const photo = name => ({name, type: 'image/jpeg', size: bytes.length, lastModified: 0, arrayBuffer: async () => bytes.buffer});
    await w.handleFiles([photo('one.jpg'), photo('two.jpg')]);
    await w.cleanAll();
    assert.equal(downloads.length, 1);
    assert.equal(w.ClearFrameDailyLimit.remaining(), 8);
    assert.equal(w.ClearFrameDailyLimit.record(7), true);
    await w.cleanAll();
    assert.equal(downloads.length, 1);
    assert.equal(w.ClearFrameDailyLimit.remaining(), 1);
    assert.match(dialogs[0].message, /includes 2 photos/);
    w.ClearFrameDailyLimit.record(1);
    assert.equal(w.ClearFrameDailyLimit.remaining(), 0);
  } finally { dom.window.close(); }
});
