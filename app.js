/* Stampr UI. PDF work happens in watermark.js (StamprCore), licensing in license.js (StamprLicense). */
(function () {
  'use strict';

  const core = window.StamprCore;
  const License = window.StamprLicense;
  const CONFIG = window.STAMPR_CONFIG || {};
  const SETTINGS_KEY = 'stampr.settings.v1';
  const PROFILES_KEY = 'stampr.profiles.v1';
  const $ = (id) => document.getElementById(id);

  const el = {
    tabs: document.querySelectorAll('.mode-tabs button'),
    panelAdd: $('panel-add'), panelRemove: $('panel-remove'),
    fileCard: document.querySelector('.file-card'),
    dropzone: $('dropzone'), fileInput: $('file-input'),
    fileInfo: $('file-info'), fileName: $('file-name'), filePages: $('file-pages'),
    addFiles: $('add-files'), clearFiles: $('clear-files'),
    fileSelectWrap: $('file-select-wrap'), fileSelect: $('file-select'),
    profileSelect: $('profile-select'), profileSave: $('profile-save'), profileDelete: $('profile-delete'),
    types: document.querySelectorAll('input[name="type"]'),
    textSettings: $('text-settings'), imageSettings: $('image-settings'),
    template: $('wm-template'), text: $('wm-text'),
    fieldsBox: $('fields-box'), fieldChips: document.querySelectorAll('#field-chips button'),
    name: $('wm-name'), rev: $('wm-rev'), date: $('wm-date'),
    font: $('wm-font'), customFont: $('custom-font'), fontInput: $('font-input'), fontName: $('font-name'),
    size: $('wm-size'), color: $('wm-color'), colorHex: $('wm-color-hex'),
    imageInput: $('image-input'), imageName: $('image-name'), scale: $('wm-scale'), scaleVal: $('wm-scale-val'),
    opacity: $('wm-opacity'), opacityVal: $('wm-opacity-val'),
    positions: document.querySelectorAll('input[name="position"]'),
    rotation: $('wm-rotation'), chips: document.querySelectorAll('#rotation-chips button'),
    pages: $('wm-pages'), permanent: $('wm-permanent'),
    reset: $('reset-settings'),
    downloadAdd: $('download-add'), runRemove: $('run-remove'), downloadRemove: $('download-remove'),
    message: $('message'),
    previewTitle: $('preview-title'), pager: $('pager'), prev: $('prev-page'), next: $('next-page'), pageLabel: $('page-label'),
    placeholder: $('placeholder'), canvas: $('preview-canvas'), spinner: $('spinner'), warning: $('preview-warning'),
    stage: $('preview-stage'),
    proBtn: $('pro-btn'), proDialog: $('pro-dialog'), proReason: $('pro-reason'),
    proBuy: $('pro-buy'), proActive: $('pro-active'), proDetails: $('pro-details'),
    buyYearly: $('buy-yearly'), buyLifetime: $('buy-lifetime'), buyNote: $('buy-note'), notOnSale: $('not-on-sale'),
    licenseForm: $('license-form'), licenseKey: $('license-key'), licenseActivate: $('license-activate'),
    licenseError: $('license-error'), licenseRemove: $('license-remove'),
  };

  const state = {
    mode: 'add',
    files: [], // { name, bytes: Uint8Array, doc: PDFDocument (for previews), pageCount }
    current: 0, // index into files shown in the preview
    page: 0,
    customFont: null, // { name, bytes }
    image: null, // { name, bytes }
    removed: null, // [{ bytes, removed, pagesAffected }] per file after running removal
    previewToken: 0,
    busy: false,
  };

  const currentFile = () => state.files[state.current] || null;

  // ---------- settings ----------

  function loadSettings() {
    try {
      return Object.assign({}, core.DEFAULTS, { permanent: false }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, core.DEFAULTS, { permanent: false });
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function radioValue(list, fallback) {
    const r = Array.from(list).find((x) => x.checked);
    return r ? r.value : fallback;
  }

  function readSettings() {
    return {
      type: radioValue(el.types, 'text'),
      text: el.text.value,
      font: el.font.value,
      fontSize: Number(el.size.value),
      color: el.color.value,
      opacity: Number(el.opacity.value) / 100,
      position: radioValue(el.positions, 'center'),
      rotation: Number(el.rotation.value) || 0,
      imageScale: Number(el.scale.value),
      pages: el.pages.value,
      name: el.name.value,
      rev: el.rev.value,
      date: el.date.value,
      permanent: el.permanent.checked,
    };
  }

  function writeSettings(s) {
    s = Object.assign({}, core.DEFAULTS, { permanent: false }, s);
    el.types.forEach((r) => { r.checked = r.value === s.type; });
    el.text.value = s.text;
    el.font.value = s.font === 'custom' && !state.customFont ? core.DEFAULTS.font : s.font;
    if (!el.font.value) el.font.value = core.DEFAULTS.font;
    el.size.value = s.fontSize;
    el.color.value = s.color;
    el.colorHex.value = s.color.toUpperCase();
    el.opacity.value = Math.round(s.opacity * 100);
    el.positions.forEach((r) => { r.checked = r.value === s.position; });
    el.rotation.value = s.rotation;
    el.scale.value = s.imageScale;
    el.pages.value = s.pages;
    el.name.value = s.name;
    el.rev.value = s.rev;
    el.date.value = s.date;
    el.permanent.checked = !!s.permanent;
    syncControls();
  }

  function syncControls() {
    const type = radioValue(el.types, 'text');
    el.textSettings.hidden = type !== 'text';
    el.imageSettings.hidden = type !== 'image';
    el.opacityVal.textContent = el.opacity.value + ' %';
    el.scaleVal.textContent = el.scale.value + ' % of page width';
    el.customFont.hidden = el.font.value !== 'custom';
    const rot = Number(el.rotation.value);
    el.chips.forEach((b) => b.classList.toggle('active', Number(b.dataset.deg) === rot));
    if (core.hasFields(el.text.value)) el.fieldsBox.open = true;
  }

  function proFeaturesUsed(settings, fileCount) {
    const used = [];
    if (fileCount > 1) used.push('Multiple files');
    if (settings.type === 'image') used.push('Image watermarks');
    if (settings.type === 'text' && core.hasFields(settings.text)) used.push('Stamp fields');
    if (settings.permanent) used.push('Permanent watermarks');
    return used;
  }

  function listJoin(items) {
    return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  // ---------- profiles (Pro) ----------

  function loadProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}'); } catch (e) { return {}; }
  }

  function renderProfiles(selected) {
    const profiles = loadProfiles();
    el.profileSelect.innerHTML = '';
    el.profileSelect.add(new Option(Object.keys(profiles).length ? 'Choose a profile…' : 'No saved profiles', ''));
    Object.keys(profiles).sort((a, b) => a.localeCompare(b)).forEach((n) => el.profileSelect.add(new Option(n, n)));
    el.profileSelect.value = selected && profiles[selected] ? selected : '';
    el.profileDelete.disabled = !el.profileSelect.value;
  }

  // ---------- messages ----------

  function showMessage(kind, text) {
    el.message.className = 'message ' + kind;
    el.message.textContent = text;
    el.message.hidden = false;
  }
  function clearMessage() { el.message.hidden = true; }

  function setWarning(text) {
    el.warning.textContent = text || '';
    el.warning.hidden = !text;
  }

  // ---------- PDF.js (preview + permanent mode), loaded on demand ----------

  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('./vendor/pdfjs/pdf.min.mjs').then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
        return lib;
      }).catch((e) => {
        console.warn('PDF.js could not be loaded; preview disabled.', e);
        return null;
      });
    }
    return pdfjsPromise;
  }

  function openWithPdfjs(pdfjs, bytes) {
    const base = new URL('vendor/pdfjs/', document.baseURI).href;
    return pdfjs.getDocument({
      data: bytes.slice(), // PDF.js takes ownership of the buffer
      isEvalSupported: false,
      standardFontDataUrl: base + 'standard_fonts/',
      cMapUrl: base + 'cmaps/',
      cMapPacked: true,
      wasmUrl: base + 'wasm/',
    });
  }

  let renderTask = null;
  let shownTask = null; // PDF.js loading task of the page on screen (destroyed when replaced)

  async function renderBytes(bytes, pageNumber, token) {
    const pdfjs = await loadPdfjs();
    if (!pdfjs) {
      setWarning('Preview is unavailable when the page is opened directly from disk. Downloads still work.');
      return;
    }
    const loadingTask = openWithPdfjs(pdfjs, bytes);
    const pdf = await loadingTask.promise;
    if (token !== state.previewToken) { loadingTask.destroy(); return; }
    const page = await pdf.getPage(pageNumber);
    if (token !== state.previewToken) { loadingTask.destroy(); return; }

    const box = el.stage.getBoundingClientRect();
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.max(0.1, Math.min((box.width - 32) / vp1.width, (box.height - 32) / vp1.height));
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * dpr });

    if (renderTask) { renderTask.cancel(); renderTask = null; }
    // Render offscreen first so a cancelled render never leaves a blank canvas on screen.
    const off = document.createElement('canvas');
    off.width = Math.ceil(viewport.width);
    off.height = Math.ceil(viewport.height);
    const task = page.render({ canvasContext: off.getContext('2d'), canvas: off, viewport });
    renderTask = task;
    try {
      await task.promise;
    } catch (e) {
      loadingTask.destroy();
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    if (renderTask === task) renderTask = null;
    if (token !== state.previewToken) { loadingTask.destroy(); return; }

    el.canvas.width = off.width;
    el.canvas.height = off.height;
    el.canvas.style.width = Math.round(viewport.width / dpr) + 'px';
    el.canvas.style.height = Math.round(viewport.height / dpr) + 'px';
    el.canvas.getContext('2d').drawImage(off, 0, 0);
    el.canvas.hidden = false;
    el.placeholder.hidden = true;
    if (shownTask) shownTask.destroy();
    shownTask = loadingTask;
  }

  // Permanent mode: every page becomes a JPEG image in a new PDF.
  async function flattenPdf(bytes) {
    const pdfjs = await loadPdfjs();
    if (!pdfjs) throw new Error('Permanent mode needs the page to be opened from wstampr.com, not from disk.');
    const task = openWithPdfjs(pdfjs, bytes);
    const pdf = await task.promise;
    const out = await PDFLib.PDFDocument.create();
    const MAX_PIXELS = 16e6; // stays below mobile canvas limits
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const vp1 = page.getViewport({ scale: 1 }); // in points, page rotation applied
        let scale = 200 / 72; // 200 dpi keeps drawings readable
        scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (vp1.width * vp1.height)));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        out.addPage([vp1.width, vp1.height]).drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        page.cleanup();
        canvas.width = canvas.height = 0;
      }
    } finally {
      task.destroy();
    }
    return out.save();
  }

  // ---------- preview ----------

  function assets() {
    return {
      fontBytes: state.customFont && state.customFont.bytes,
      image: state.image,
    };
  }

  async function updatePreview() {
    const file = currentFile();
    if (!file) return;
    const token = ++state.previewToken;
    updatePager();
    el.spinner.hidden = false;
    try {
      if (state.mode === 'add') {
        const settings = readSettings();
        let problem = null;
        try { core.parsePages(settings.pages, file.pageCount); } catch (e) { problem = e.message; }
        if (!problem && settings.type === 'text' && settings.font === 'custom' && !state.customFont) {
          problem = 'Choose a font file to preview the custom font.';
        }
        if (!problem && settings.type === 'image' && !state.image) problem = 'Choose an image to use as watermark.';
        if (problem) {
          setWarning(problem);
          await renderBytes(await pageOnly(file, state.page), 1, token);
          return;
        }
        const res = await core.previewPage(file.doc, state.page, settings, assets(), { file: file.name });
        if (token !== state.previewToken) return;
        setWarning(res.skipped ? `Page ${state.page + 1} is not among the selected pages, so it won't be stamped.`
          : res.fits ? '' : 'The watermark is larger than this page and will be cut off. Try a smaller size.');
        await renderBytes(res.bytes, 1, token);
      } else {
        setWarning('');
        const r = state.removed && state.removed[state.current];
        await renderBytes(r ? r.bytes : file.bytes, state.page + 1, token);
      }
    } catch (e) {
      if (token !== state.previewToken) return;
      setWarning(e.message || 'Preview failed.');
    } finally {
      if (token === state.previewToken) el.spinner.hidden = true;
    }
  }

  // The page without a watermark (used while something is still missing).
  async function pageOnly(file, index) {
    const doc = await PDFLib.PDFDocument.create();
    const [p] = await doc.copyPages(file.doc, [index]);
    doc.addPage(p);
    return doc.save();
  }

  let previewTimer = null;
  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, delay == null ? 200 : delay);
  }

  function updatePager() {
    const file = currentFile();
    const n = file ? file.pageCount : 0;
    el.pager.hidden = n < 2;
    el.pageLabel.textContent = `Page ${state.page + 1} of ${n}`;
    el.prev.disabled = state.page <= 0;
    el.next.disabled = state.page >= n - 1;
    const r = state.mode === 'remove' && state.removed && state.removed[state.current];
    el.previewTitle.textContent = r && r.removed ? 'Preview — after removal' : 'Preview';
  }

  // ---------- files ----------

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(new Error('The file could not be read.'));
      r.readAsArrayBuffer(file);
    });
  }

  async function openPdfs(fileList, append) {
    const list = Array.from(fileList || []);
    if (!list.length) return;
    clearMessage();
    el.spinner.hidden = false;
    const opened = [], failed = [];
    for (const f of list) {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { failed.push(`${f.name}: not a PDF`); continue; }
      try {
        const bytes = await readFile(f);
        const doc = await core.loadPdf(bytes);
        opened.push({ name: f.name, bytes, doc, pageCount: doc.getPageCount() });
      } catch (e) {
        failed.push(`${f.name}: ${e.message}`);
      }
    }
    el.fileInput.value = '';
    el.spinner.hidden = true;
    if (opened.length) {
      state.files = append ? state.files.concat(opened) : opened;
      state.current = append ? state.files.length - opened.length : 0;
      state.page = 0;
      state.removed = null;
      el.downloadRemove.hidden = true;
      renderFiles();
      updatePreview();
    }
    if (failed.length) showMessage('error', (failed.length === 1 ? 'Could not open ' : 'Could not open these files: ') + failed.join('; '));
    else if (state.files.length > 1 && !License.isPro()) {
      showMessage('info', 'Stamping several files at once is a Pro feature. You can preview them all for free.');
    }
  }

  function renderFiles() {
    const n = state.files.length;
    el.fileCard.classList.toggle('has-file', n > 0);
    el.fileInfo.hidden = n === 0;
    el.fileSelectWrap.hidden = n < 2;
    if (n === 1) {
      const f = state.files[0];
      el.fileName.textContent = f.name;
      el.fileName.title = f.name;
      el.filePages.textContent = f.pageCount === 1 ? '1 page' : `${f.pageCount} pages`;
    } else if (n > 1) {
      const pages = state.files.reduce((s, f) => s + f.pageCount, 0);
      el.fileName.textContent = `${n} files`;
      el.fileName.title = state.files.map((f) => f.name).join('\n');
      el.filePages.textContent = `${pages} pages in total`;
      el.fileSelect.innerHTML = '';
      state.files.forEach((f, i) => el.fileSelect.add(new Option(`${f.name} (${f.pageCount} p)`, String(i))));
      el.fileSelect.value = String(state.current);
    }
    updateButtons();
  }

  function clearFiles() {
    state.files = [];
    state.current = 0;
    state.page = 0;
    state.removed = null;
    state.previewToken++;
    el.downloadRemove.hidden = true;
    el.canvas.hidden = true;
    el.placeholder.hidden = false;
    el.pager.hidden = true;
    setWarning('');
    clearMessage();
    renderFiles();
  }

  function updateButtons() {
    const has = state.files.length > 0 && !state.busy;
    el.downloadAdd.disabled = !has;
    el.runRemove.disabled = !has;
    const many = state.files.length > 1;
    el.downloadAdd.textContent = many ? `Download ${state.files.length} watermarked PDFs (ZIP)` : 'Download watermarked PDF';
    el.runRemove.textContent = many ? `Remove watermarks from ${state.files.length} files` : 'Remove watermarks';
  }

  function outName(name, suffix) {
    return `${name.replace(/\.pdf$/i, '')}-${suffix}.pdf`;
  }

  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type: type || 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // outputs: [{ name, bytes }] → one PDF, or a ZIP when there are several.
  function deliver(outputs, zipName) {
    if (outputs.length === 1) { download(outputs[0].bytes, outputs[0].name); return; }
    const entries = {};
    for (const o of outputs) {
      let n = o.name, k = 2;
      while (entries[n]) n = o.name.replace(/\.pdf$/i, `-${k++}.pdf`);
      entries[n] = [o.bytes, { level: 0 }]; // PDFs are already compressed
    }
    download(fflate.zipSync(entries), zipName, 'application/zip');
  }

  async function withBusy(button, label, fn) {
    const old = button.textContent;
    state.busy = true;
    updateButtons();
    button.disabled = true;
    button.textContent = label;
    try {
      await fn((text) => { button.textContent = text; });
    } catch (e) {
      console.error(e);
      showMessage('error', e.message || 'Something went wrong.');
    } finally {
      state.busy = false;
      button.textContent = old;
      updateButtons();
    }
  }

  // ---------- Pro dialog ----------

  function fillPrices() {
    const prices = CONFIG.prices || {};
    document.querySelectorAll('[data-price]').forEach((n) => { n.textContent = prices[n.dataset.price] || ''; });
  }

  function renderPro() {
    const pro = License.isPro();
    document.body.classList.toggle('is-pro', pro);
    el.proBtn.textContent = pro ? 'Pro ✓' : 'Get Pro';
    el.proBuy.hidden = pro;
    el.proActive.hidden = !pro;
    const info = License.info();
    if (pro && info) {
      const masked = info.key.length > 8 ? info.key.slice(0, 4) + '…' + info.key.slice(-4) : info.key;
      el.proDetails.textContent = `${info.product || 'Stampr Pro'} · key ${masked}` +
        (info.expiresAt ? ` · renews or expires ${String(info.expiresAt).slice(0, 10)}` : '');
    }
    const ls = CONFIG.lemonSqueezy || {};
    const onSale = License.configured() && ls.checkoutYearly && ls.checkoutLifetime;
    el.buyYearly.href = ls.checkoutYearly || '#';
    el.buyLifetime.href = ls.checkoutLifetime || '#';
    [el.buyYearly, el.buyLifetime].forEach((a) => a.classList.toggle('disabled', !onSale));
    el.buyNote.hidden = !onSale;
    el.notOnSale.hidden = !!onSale;
  }

  function openPro(reason) {
    el.proReason.textContent = reason || '';
    el.proReason.hidden = !reason;
    el.licenseError.hidden = true;
    renderPro();
    if (!el.proDialog.open) el.proDialog.showModal();
  }

  // Shows the Pro dialog and returns false when the user isn't Pro.
  function requirePro(features) {
    if (License.isPro()) return true;
    const info = License.info();
    const lapsed = info && info.reason ? ' ' + info.reason : '';
    openPro(`${listJoin(features)} ${features.length > 1 ? 'are Pro features' : 'is a Pro feature'}.${lapsed}`);
    return false;
  }

  async function activateKey(key) {
    el.licenseError.hidden = true;
    el.licenseActivate.disabled = true;
    el.licenseActivate.textContent = 'Checking…';
    try {
      await License.activate(key);
      el.licenseKey.value = '';
      el.proReason.hidden = true;
      renderPro();
      showMessage('ok', 'Stampr Pro is now active in this browser. Thank you!');
    } catch (e) {
      el.licenseError.textContent = e.message;
      el.licenseError.hidden = false;
    } finally {
      el.licenseActivate.disabled = false;
      el.licenseActivate.textContent = 'Activate';
    }
  }

  // ---------- mode ----------

  function setMode(mode) {
    state.mode = mode;
    el.tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
    el.panelAdd.hidden = mode !== 'add';
    el.panelRemove.hidden = mode !== 'remove';
    clearMessage();
    setWarning('');
    updatePreview();
  }

  // ---------- events ----------

  function init() {
    Object.entries(core.FONTS).forEach(([value, f]) => el.font.add(new Option(f.label, value)));
    el.font.add(new Option('Custom font (.ttf / .otf)…', 'custom'));
    writeSettings(loadSettings());
    renderProfiles();
    fillPrices();
    renderPro();
    License.onChange(renderPro);

    el.tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

    const onSettingsChange = () => {
      syncControls();
      saveSettings(readSettings());
      clearMessage();
      schedulePreview();
    };
    [el.text, el.size, el.rotation, el.opacity, el.scale, el.pages, el.name, el.rev, el.date]
      .forEach((i) => i.addEventListener('input', onSettingsChange));
    [el.font, el.permanent].forEach((i) => i.addEventListener('change', onSettingsChange));
    el.types.forEach((r) => r.addEventListener('change', onSettingsChange));
    el.positions.forEach((r) => r.addEventListener('change', onSettingsChange));
    el.color.addEventListener('input', () => { el.colorHex.value = el.color.value.toUpperCase(); onSettingsChange(); });
    el.colorHex.addEventListener('input', () => {
      let v = el.colorHex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { el.color.value = v.toLowerCase(); onSettingsChange(); }
    });
    el.colorHex.addEventListener('blur', () => { el.colorHex.value = el.color.value.toUpperCase(); });
    el.chips.forEach((b) => b.addEventListener('click', () => { el.rotation.value = b.dataset.deg; onSettingsChange(); }));
    el.reset.addEventListener('click', () => { writeSettings({}); el.profileSelect.value = ''; onSettingsChange(); });

    el.template.addEventListener('change', () => {
      if (!el.template.value) return;
      el.text.value = el.template.value;
      el.template.value = '';
      onSettingsChange();
    });
    el.fieldChips.forEach((b) => b.addEventListener('click', () => {
      const t = el.text, f = b.dataset.field;
      const s = t.selectionStart != null ? t.selectionStart : t.value.length;
      const e = t.selectionEnd != null ? t.selectionEnd : t.value.length;
      t.value = t.value.slice(0, s) + f + t.value.slice(e);
      t.focus();
      t.setSelectionRange(s + f.length, s + f.length);
      onSettingsChange();
    }));

    el.fontInput.addEventListener('change', async () => {
      const f = el.fontInput.files[0];
      if (!f) return;
      if (!/\.(ttf|otf)$/i.test(f.name)) { showMessage('error', 'Please choose a .ttf or .otf font file.'); return; }
      state.customFont = { name: f.name, bytes: await readFile(f) };
      el.fontName.textContent = f.name;
      el.fontInput.value = '';
      clearMessage();
      schedulePreview(0);
    });

    el.imageInput.addEventListener('change', async () => {
      const f = el.imageInput.files[0];
      if (!f) return;
      if (!/\.(png|jpe?g)$/i.test(f.name)) { showMessage('error', 'Please choose a PNG or JPG image.'); return; }
      state.image = { name: f.name, bytes: await readFile(f) };
      el.imageName.textContent = f.name;
      el.imageInput.value = '';
      clearMessage();
      schedulePreview(0);
    });

    // Profiles
    el.profileSelect.addEventListener('change', () => {
      const p = loadProfiles()[el.profileSelect.value];
      el.profileDelete.disabled = !el.profileSelect.value;
      if (p) { writeSettings(p); saveSettings(readSettings()); schedulePreview(0); }
    });
    el.profileSave.addEventListener('click', () => {
      if (!requirePro(['Saved profiles'])) return;
      const name = (window.prompt('Name this profile (e.g. "Review stamp – Project X"):', el.profileSelect.value || '') || '').trim();
      if (!name) return;
      const profiles = loadProfiles();
      profiles[name] = readSettings();
      try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch (e) { showMessage('error', 'The profile could not be saved in this browser.'); return; }
      renderProfiles(name);
      showMessage('ok', `Profile "${name}" saved.` + (state.image && readSettings().type === 'image' ? ' Note: the image itself is not stored — choose it again next time.' : ''));
    });
    el.profileDelete.addEventListener('click', () => {
      const name = el.profileSelect.value;
      if (!name || !window.confirm(`Delete the profile "${name}"?`)) return;
      const profiles = loadProfiles();
      delete profiles[name];
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
      renderProfiles();
    });

    // File picking & drag-and-drop (anywhere on the file card or the preview).
    let appendNext = false;
    el.fileInput.addEventListener('change', () => { openPdfs(el.fileInput.files, appendNext); appendNext = false; });
    el.addFiles.addEventListener('click', () => { appendNext = true; el.fileInput.click(); });
    el.clearFiles.addEventListener('click', clearFiles);
    el.fileSelect.addEventListener('change', () => { state.current = Number(el.fileSelect.value); state.page = 0; updatePreview(); });
    [el.fileCard, el.stage].forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); el.dropzone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => { zone.classList.remove('dragover'); el.dropzone.classList.remove('dragover'); });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        el.dropzone.classList.remove('dragover');
        openPdfs(e.dataTransfer.files, state.files.length > 0);
      });
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    el.prev.addEventListener('click', () => { if (state.page > 0) { state.page--; updatePreview(); } });
    el.next.addEventListener('click', () => {
      const f = currentFile();
      if (f && state.page < f.pageCount - 1) { state.page++; updatePreview(); }
    });

    el.downloadAdd.addEventListener('click', () => {
      const settings = readSettings();
      const pro = proFeaturesUsed(settings, state.files.length);
      if (pro.length && !requirePro(pro)) return;
      withBusy(el.downloadAdd, 'Working…', async (progress) => {
        clearMessage();
        const outputs = [], failed = [], overflow = [];
        for (let i = 0; i < state.files.length; i++) {
          const f = state.files[i];
          if (state.files.length > 1) progress(`Working… ${i + 1} / ${state.files.length}`);
          try {
            const res = await core.addWatermark(f.bytes, settings, assets(), { file: f.name });
            let bytes = res.bytes;
            if (settings.permanent) {
              progress(state.files.length > 1 ? `Flattening… ${i + 1} / ${state.files.length}` : 'Flattening pages…');
              bytes = await flattenPdf(bytes);
            }
            outputs.push({ name: outName(f.name, 'watermarked'), bytes });
            if (res.overflowPages.length) overflow.push(state.files.length > 1 ? f.name : 'page ' + res.overflowPages.slice(0, 8).join(', '));
          } catch (e) {
            if (state.files.length === 1) throw e;
            failed.push(`${f.name}: ${e.message}`);
          }
        }
        if (!outputs.length) throw new Error(failed.join('; '));
        deliver(outputs, 'stampr-watermarked.zip');
        let msg = outputs.length === 1 ? 'Done — your watermarked PDF is downloading.' : `Done — ${outputs.length} watermarked PDFs are downloading as a ZIP.`;
        if (overflow.length) msg += ` The watermark doesn't fully fit on ${overflow.join(', ')}.`;
        if (failed.length) msg += ` Skipped: ${failed.join('; ')}`;
        showMessage(failed.length ? 'info' : 'ok', msg);
      });
    });

    el.runRemove.addEventListener('click', () => {
      if (state.files.length > 1 && !requirePro(['Multiple files'])) return;
      withBusy(el.runRemove, 'Removing…', async (progress) => {
        clearMessage();
        const results = [];
        let total = 0, filesHit = 0;
        for (let i = 0; i < state.files.length; i++) {
          if (state.files.length > 1) progress(`Removing… ${i + 1} / ${state.files.length}`);
          const r = await core.removeWatermarks(state.files[i].bytes);
          results.push(r);
          total += r.removed;
          if (r.removed) filesHit++;
        }
        if (!total) {
          state.removed = null;
          el.downloadRemove.hidden = true;
          showMessage('info', state.files.length > 1 ? 'No removable watermarks were found in these files.' : 'No removable watermarks were found in this PDF.');
          return;
        }
        state.removed = results;
        el.downloadRemove.hidden = false;
        el.downloadRemove.textContent = filesHit > 1 ? `Download ${filesHit} cleaned PDFs (ZIP)` : 'Download cleaned PDF';
        const where = state.files.length > 1 ? `${filesHit} of ${state.files.length} files`
          : `${results[0].pagesAffected} page${results[0].pagesAffected === 1 ? '' : 's'}`;
        showMessage('ok', `Removed ${total} watermark${total === 1 ? '' : 's'} from ${where}. Check the preview, then download.`);
        updatePreview();
      });
    });

    el.downloadRemove.addEventListener('click', () => {
      if (!state.removed) return;
      const outputs = state.removed
        .map((r, i) => ({ r, f: state.files[i] }))
        .filter(({ r }) => r.removed)
        .map(({ r, f }) => ({ name: outName(f.name, 'no-watermark'), bytes: r.bytes }));
      deliver(outputs, 'stampr-cleaned.zip');
    });

    // Pro
    el.proBtn.addEventListener('click', () => openPro());
    document.querySelectorAll('[data-open-pro]').forEach((b) => b.addEventListener('click', () => openPro()));
    [el.buyYearly, el.buyLifetime].forEach((a) => a.addEventListener('click', (e) => {
      if (a.classList.contains('disabled')) e.preventDefault();
    }));
    el.licenseForm.addEventListener('submit', (e) => { e.preventDefault(); activateKey(el.licenseKey.value); });
    el.licenseRemove.addEventListener('click', async () => {
      if (!window.confirm('Remove Stampr Pro from this browser? You can activate the same key again later.')) return;
      await License.deactivate();
      renderPro();
    });

    // Coming back from checkout: wstampr.com/?license=KEY activates straight away.
    const params = new URLSearchParams(location.search);
    const keyParam = params.get('license') || params.get('license_key');
    if (keyParam) {
      history.replaceState(null, '', location.pathname + location.hash);
      openPro();
      el.licenseKey.value = keyParam;
      if (!License.isPro()) activateKey(keyParam);
    }
    License.refresh().then(renderPro);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (state.files.length) updatePreview(); }, 200);
    });

    updatePager();
    loadPdfjs(); // warm up
  }

  init();
})();
