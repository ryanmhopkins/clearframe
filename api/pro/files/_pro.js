(function () {
  globalThis.ClearFramePro = true;
  globalThis.ClearFrameProWorker = '/api/pro/module?name=pro-worker.mjs';
  globalThis.ClearFrameExtended?.reset();

  const fileInput = document.querySelector('#fileInput');
  if (fileInput && !fileInput.accept.includes('.dng')) {
    fileInput.accept += ',.dng,.cr2,.nef,.arw';
  }

  const folder = document.createElement('input');
  folder.type = 'file';
  folder.id = 'folderInput';
  folder.multiple = true;
  folder.webkitdirectory = true;
  folder.hidden = true;
  document.body.appendChild(folder);
  folder.addEventListener('change', () => {
    if (folder.files && folder.files.length) globalThis.handleFiles(folder.files);
    folder.value = '';
  });

  function folderButton(className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = 'Choose folder';
    button.addEventListener('click', event => {
      event.stopPropagation();
      folder.click();
    });
    return button;
  }

  const browse = document.querySelector('#browseBtn');
  if (browse) browse.after(folderButton('secondary-button folder-button'));
  const addMore = document.querySelector('#addMore');
  if (addMore) addMore.after(folderButton('secondary-button'));

  const bar = document.createElement('div');
  bar.className = 'preset-bar';
  bar.innerHTML = '<label for="presetName">Preset</label><input id="presetName" type="text" maxlength="40" autocomplete="off"><button id="savePreset" class="secondary-button" type="button">Save preset</button><label for="presetList" class="preset-pick">Apply</label><select id="presetList"></select><button id="applyPreset" class="secondary-button" type="button">Apply to all</button><p class="preset-note">Presets stay in this browser. Apply to all uses the saved choices on every photo in the batch.</p>';
  const cleanBar = document.querySelector('.clean-bar');
  if (cleanBar) cleanBar.before(bar);

  const storageKey = 'clearframe.pro.presets';
  const readPresets = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || []; }
    catch { return []; }
  };
  const writePresets = list => localStorage.setItem(storageKey, JSON.stringify(list));
  const renderPresets = () => {
    const select = document.querySelector('#presetList');
    if (!select) return;
    select.replaceChildren();
    for (const preset of readPresets()) {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.name;
      select.appendChild(option);
    }
  };
  document.querySelector('#savePreset')?.addEventListener('click', () => {
    const name = document.querySelector('#presetName').value.trim();
    if (!name || name.length > 40) return;
    const next = readPresets().filter(preset => preset.name !== name);
    next.push({name, ids: globalThis.ClearFrameCurrentIds()});
    writePresets(next);
    renderPresets();
    document.querySelector('#presetList').value = name;
  });
  document.querySelector('#applyPreset')?.addEventListener('click', () => {
    const name = document.querySelector('#presetList').value;
    const preset = readPresets().find(item => item.name === name);
    if (preset) globalThis.ClearFrameApplyToAll(preset.ids);
  });
  renderPresets();
})();
