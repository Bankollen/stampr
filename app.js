/* Stampr UI. All PDF work happens in watermark.js (StamprCore); this file wires up the page. */
(function () {
  'use strict';

  const core = window.StamprCore;
  const SETTINGS_KEY = 'stampr.settings.v1';
  const $ = (id) => document.getElementById(id);

  const el = {
    tabs: document.querySelectorAll('.mode-tabs button'),
    panelAdd: $('panel-add'), panelRemove: $('panel-remove'),
    fileCard: document.querySelector('.file-card'),
    dropzone: $('dropzone'), fileInput: $('file-input'),
    fileInfo: $('file-info'), fileName: $('file-name'), filePages: $('file-pages'), changeFile: $('change-file'),
    text: $('wm-text'), font: $('wm-font'), customFont: $('custom-font'), fontInput: $('font-input'), fontName: $('font-name'),
    size: $('wm-size'), color: $('wm-color'), colorHex: $('wm-color-hex'),
    opacity: $('wm-opacity'), opacityVal: $('wm-opacity-val'),
    positions: document.querySelectorAll('input[name="position"]'),
    rotation: $('wm-rotation'), chips: document.querySelectorAll('#rotation-chips button'),
    reset: $('reset-settings'),
    downloadAdd: $('download-add'), runRemove: $('run-remove'), downloadRemove: $('download-remove'),
    message: $('message'),
    previewTitle: $('preview-title'), pager: $('pager'), prev: $('prev-page'), next: $('next-page'), pageLabel: $('page-label'),
    placeholder: $('placeholder'), canvas: $('preview-canvas'), spinner: $('spinner'), warning: $('preview-warning'),
    stage: $('preview-stage'),
  };

  const state = {
    mode: 'add',
    file: null, // { name, bytes: Uint8Array, doc: PDFDocument (for previews), pageCount }
    page: 0,
    customFont: null, // { name, bytes }
    removed: null, // { bytes, removed, pagesAffected } after running removal
    previewToken: 0,
    busy: false,
  };

  // ---------- settings ----------

  function loadSettings() {
    try {
      return Object.assign({}, core.DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, core.DEFAULTS);
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function readSettings() {
    const pos = Array.from(el.positions).find((r) => r.checked);
    return {
      text: el.text.value,
      font: el.font.value,
      fontSize: Number(el.size.value),
      color: el.color.value,
      opacity: Number(el.opacity.value) / 100,
      position: pos ? pos.value : 'center',
      rotation: Number(el.rotation.value) || 0,
    };
  }

  function writeSettings(s) {
    el.text.value = s.text;
    el.font.value = s.font === 'custom' && !state.customFont ? core.DEFAULTS.font : s.font;
    el.size.value = s.fontSize;
    el.color.value = s.color;
    el.colorHex.value = s.color.toUpperCase();
    el.opacity.value = Math.round(s.opacity * 100);
    el.positions.forEach((r) => { r.checked = r.value === s.position; });
    el.rotation.value = s.rotation;
    syncControls();
  }

  function syncControls() {
    el.opacityVal.textContent = el.opacity.value + ' %';
    el.customFont.hidden = el.font.value !== 'custom';
    const rot = Number(el.rotation.value);
    el.chips.forEach((b) => b.classList.toggle('active', Number(b.dataset.deg) === rot));
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

  // ---------- preview (PDF.js, loaded on demand) ----------

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

  let renderTask = null;
  let shownTask = null; // PDF.js loading task of the page on screen (destroyed when replaced)

  async function renderBytes(bytes, pageNumber, token) {
    const pdfjs = await loadPdfjs();
    if (!pdfjs) {
      setWarning('Preview is unavailable when the page is opened directly from disk. Downloads still work.');
      return;
    }
    const base = new URL('vendor/pdfjs/', document.baseURI).href;
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(), // PDF.js takes ownership of the buffer
      isEvalSupported: false,
      standardFontDataUrl: base + 'standard_fonts/',
      cMapUrl: base + 'cmaps/',
      cMapPacked: true,
      wasmUrl: base + 'wasm/',
    });
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

  async function updatePreview() {
    if (!state.file) return;
    const token = ++state.previewToken;
    updatePager();
    el.spinner.hidden = false;
    try {
      if (state.mode === 'add') {
        const settings = readSettings();
        const customBytes = state.customFont && state.customFont.bytes;
        if (settings.font === 'custom' && !customBytes) {
          setWarning('Choose a font file to preview the custom font.');
          await renderBytes(await pageOnly(state.page), 1, token);
          return;
        }
        const res = await core.previewPage(state.file.doc, state.page, settings, customBytes);
        if (token !== state.previewToken) return;
        setWarning(res.fits ? '' : 'The watermark is larger than this page and will be cut off. Try a smaller font size.');
        await renderBytes(res.bytes, 1, token);
      } else {
        setWarning('');
        const bytes = state.removed ? state.removed.bytes : state.file.bytes;
        await renderBytes(bytes, state.page + 1, token);
      }
    } catch (e) {
      if (token !== state.previewToken) return;
      console.error(e);
      setWarning(e.message || 'Preview failed.');
    } finally {
      if (token === state.previewToken) el.spinner.hidden = true;
    }
  }

  // The page without a watermark (used while a custom font is still missing).
  async function pageOnly(index) {
    const doc = await PDFLib.PDFDocument.create();
    const [p] = await doc.copyPages(state.file.doc, [index]);
    doc.addPage(p);
    return doc.save();
  }

  let previewTimer = null;
  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, delay == null ? 200 : delay);
  }

  function updatePager() {
    const n = state.file ? state.file.pageCount : 0;
    el.pager.hidden = n < 2;
    el.pageLabel.textContent = `Page ${state.page + 1} of ${n}`;
    el.prev.disabled = state.page <= 0;
    el.next.disabled = state.page >= n - 1;
    el.previewTitle.textContent = state.mode === 'remove'
      ? (state.removed && state.removed.removed ? 'Preview — after removal' : 'Preview')
      : 'Preview';
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

  async function openPdf(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showMessage('error', 'Please choose a PDF file.');
      return;
    }
    clearMessage();
    el.spinner.hidden = false;
    try {
      const bytes = await readFile(file);
      const doc = await core.loadPdf(bytes);
      state.file = { name: file.name, bytes, doc, pageCount: doc.getPageCount() };
      state.page = 0;
      state.removed = null;
      el.fileName.textContent = file.name;
      el.fileName.title = file.name;
      el.filePages.textContent = state.file.pageCount === 1 ? '1 page' : `${state.file.pageCount} pages`;
      el.fileInfo.hidden = false;
      el.fileCard.classList.add('has-file');
      el.downloadRemove.hidden = true;
      updateButtons();
      updatePreview();
    } catch (e) {
      el.spinner.hidden = true;
      showMessage('error', e.message || 'This file could not be opened.');
    } finally {
      el.fileInput.value = '';
    }
  }

  function updateButtons() {
    const has = !!state.file && !state.busy;
    el.downloadAdd.disabled = !has;
    el.runRemove.disabled = !has;
  }

  function outName(suffix) {
    const base = (state.file ? state.file.name : 'document.pdf').replace(/\.pdf$/i, '');
    return `${base}-${suffix}.pdf`;
  }

  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function withBusy(button, label, fn) {
    const old = button.textContent;
    state.busy = true;
    updateButtons();
    button.textContent = label;
    try {
      await fn();
    } catch (e) {
      console.error(e);
      showMessage('error', e.message || 'Something went wrong.');
    } finally {
      state.busy = false;
      button.textContent = old;
      updateButtons();
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

    el.tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

    const onSettingsChange = () => {
      syncControls();
      saveSettings(readSettings());
      clearMessage();
      schedulePreview();
    };
    [el.text, el.size, el.rotation, el.opacity].forEach((i) => i.addEventListener('input', onSettingsChange));
    el.font.addEventListener('change', onSettingsChange);
    el.positions.forEach((r) => r.addEventListener('change', onSettingsChange));
    el.color.addEventListener('input', () => { el.colorHex.value = el.color.value.toUpperCase(); onSettingsChange(); });
    el.colorHex.addEventListener('input', () => {
      let v = el.colorHex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { el.color.value = v.toLowerCase(); onSettingsChange(); }
    });
    el.colorHex.addEventListener('blur', () => { el.colorHex.value = el.color.value.toUpperCase(); });
    el.chips.forEach((b) => b.addEventListener('click', () => { el.rotation.value = b.dataset.deg; onSettingsChange(); }));
    el.reset.addEventListener('click', () => { writeSettings(Object.assign({}, core.DEFAULTS)); onSettingsChange(); });

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

    // File picking & drag-and-drop (anywhere on the file card or the preview).
    el.fileInput.addEventListener('change', () => openPdf(el.fileInput.files[0]));
    el.changeFile.addEventListener('click', () => el.fileInput.click());
    [el.fileCard, el.stage].forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); el.dropzone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => { zone.classList.remove('dragover'); el.dropzone.classList.remove('dragover'); });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        el.dropzone.classList.remove('dragover');
        openPdf(e.dataTransfer.files[0]);
      });
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    el.prev.addEventListener('click', () => { if (state.page > 0) { state.page--; updatePreview(); } });
    el.next.addEventListener('click', () => { if (state.file && state.page < state.file.pageCount - 1) { state.page++; updatePreview(); } });

    el.downloadAdd.addEventListener('click', () => withBusy(el.downloadAdd, 'Working…', async () => {
      clearMessage();
      const res = await core.addWatermark(state.file.bytes, readSettings(), state.customFont && state.customFont.bytes);
      download(res.bytes, outName('watermarked'));
      let msg = `Done — ${res.pageCount === 1 ? '1 page' : res.pageCount + ' pages'} watermarked.`;
      if (res.overflowPages.length) {
        const list = res.overflowPages.length > 8 ? res.overflowPages.slice(0, 8).join(', ') + '…' : res.overflowPages.join(', ');
        msg += ` The watermark doesn't fully fit on page ${list}.`;
      }
      showMessage('ok', msg);
    }));

    el.runRemove.addEventListener('click', () => withBusy(el.runRemove, 'Removing…', async () => {
      clearMessage();
      const res = await core.removeWatermarks(state.file.bytes);
      if (!res.removed) {
        state.removed = null;
        el.downloadRemove.hidden = true;
        showMessage('info', 'No removable watermarks were found in this PDF.');
        return;
      }
      state.removed = res;
      el.downloadRemove.hidden = false;
      showMessage('ok', `Removed ${res.removed} watermark${res.removed === 1 ? '' : 's'} from ` +
        `${res.pagesAffected} page${res.pagesAffected === 1 ? '' : 's'}. Check the preview, then download.`);
      updatePreview();
    }));

    el.downloadRemove.addEventListener('click', () => {
      if (state.removed) download(state.removed.bytes, outName('no-watermark'));
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (state.file) updatePreview(); }, 200);
    });

    updatePager();
    loadPdfjs(); // warm up
  }

  init();
})();
