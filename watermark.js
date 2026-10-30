/*
 * Stampr core: add and remove PDF watermarks.
 *
 * Works both in the browser (exposes window.StamprCore, using the global PDFLib and fontkit)
 * and in Node (module.exports is a factory: require('./watermark.js')(PDFLib, fontkit)),
 * so the same code is used by the page and by the tests.
 *
 * Every watermark Stampr draws is written to its own content stream that is
 *   1. tagged with the stream-dictionary key /StamprWatermark true, and
 *   2. wrapped in "/Artifact <</Type /Pagination /Subtype /Watermark>> BDC ... EMC",
 *      the standard PDF way of saying "this is a watermark" (Acrobat does the same).
 * Removal drops tagged streams, strips marked-content blocks with /Subtype /Watermark
 * (so watermarks from Acrobat and similar tools go too) and deletes /Watermark annotations.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.StamprCore = factory(root.PDFLib, root.fontkit);
})(typeof self !== 'undefined' ? self : this, function (PDFLib, fontkit) {
  'use strict';

  const {
    PDFDocument, StandardFonts, rgb, degrees,
    PDFName, PDFBool, PDFDict, PDFArray, PDFRawStream, PDFOperator, decodePDFRawStream,
  } = PDFLib;

  const MARK = PDFName.of('StamprWatermark');
  const MARGIN = 36; // pt, distance from the page edge for top/bottom placement
  const LINE_SPACING = 1.2;

  const FONTS = {
    'helvetica': { label: 'Helvetica', std: StandardFonts.Helvetica },
    'helvetica-bold': { label: 'Helvetica Bold', std: StandardFonts.HelveticaBold },
    'helvetica-oblique': { label: 'Helvetica Oblique', std: StandardFonts.HelveticaOblique },
    'times': { label: 'Times Roman', std: StandardFonts.TimesRoman },
    'times-bold': { label: 'Times Bold', std: StandardFonts.TimesRomanBold },
    'times-italic': { label: 'Times Italic', std: StandardFonts.TimesRomanItalic },
    'courier': { label: 'Courier', std: StandardFonts.Courier },
    'courier-bold': { label: 'Courier Bold', std: StandardFonts.CourierBold },
  };

  const DEFAULTS = {
    type: 'text', // 'text' | 'image'
    text: 'DRAFT',
    font: 'helvetica-bold',
    fontSize: 72,
    color: '#808080',
    opacity: 0.3,
    position: 'center', // 'top' | 'center' | 'bottom'
    rotation: 45, // degrees, counter-clockwise
    imageScale: 40, // image width in % of the page width
    pages: '', // '' = all pages, otherwise e.g. "1-3, 5", "first", "last", "odd", "even"
    name: '',
    rev: '',
    date: '', // '' = today
  };

  // Stamp fields: {date} {name} {rev} {file} {page} {pages}
  const FIELD_RE = /\{(date|name|rev|file|page|pages)\}/gi;

  function hasFields(text) {
    FIELD_RE.lastIndex = 0;
    const r = FIELD_RE.test(text || '');
    FIELD_RE.lastIndex = 0;
    return r;
  }

  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function fillFields(text, ctx) {
    return text.replace(FIELD_RE, (m, k) => {
      const v = ctx[k.toLowerCase()];
      return v == null ? '' : String(v);
    });
  }

  // Returns a sorted array of 0-based page indices. Throws a readable error for bad input.
  function parsePages(spec, count) {
    const s = String(spec || '').trim().toLowerCase();
    const all = Array.from({ length: count }, (_, i) => i);
    if (!s || s === 'all') return all;
    if (s === 'first') return count ? [0] : [];
    if (s === 'last') return count ? [count - 1] : [];
    if (s === 'odd') return all.filter((i) => i % 2 === 0);
    if (s === 'even') return all.filter((i) => i % 2 === 1);
    const set = new Set();
    for (const part of s.split(/[,;]+/)) {
      const p = part.trim();
      if (!p) continue;
      let m;
      if ((m = /^(\d+)$/.exec(p))) {
        const n = +m[1];
        if (n >= 1 && n <= count) set.add(n - 1);
      } else if ((m = /^(\d*)\s*-\s*(\d*)$/.exec(p)) && (m[1] || m[2])) {
        const a = m[1] ? +m[1] : 1;
        const b = m[2] ? +m[2] : count;
        for (let n = Math.max(1, a); n <= Math.min(count, b); n++) set.add(n - 1);
      } else {
        throw new Error(`"${part.trim()}" is not a valid page range. Use e.g. 1-3, 5, 8-`);
      }
    }
    if (!set.size) throw new Error('None of the chosen pages exist in this PDF.');
    return Array.from(set).sort((a, b) => a - b);
  }

  // ---------- adding ----------

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x808080;
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function normAngle(a) {
    a = Number(a) || 0;
    a %= 360;
    return a < 0 ? a + 360 : a;
  }

  function normalizeSettings(s) {
    const out = Object.assign({}, DEFAULTS, s);
    out.type = out.type === 'image' ? 'image' : 'text';
    out.text = String(out.text == null ? '' : out.text);
    out.fontSize = Math.min(1000, Math.max(1, Number(out.fontSize) || DEFAULTS.fontSize));
    out.opacity = Math.min(1, Math.max(0, Number(out.opacity)));
    if (!Number.isFinite(out.opacity)) out.opacity = DEFAULTS.opacity;
    out.rotation = Number(out.rotation) || 0;
    out.imageScale = Math.min(100, Math.max(1, Number(out.imageScale) || DEFAULTS.imageScale));
    if (!['top', 'center', 'bottom'].includes(out.position)) out.position = 'center';
    return out;
  }

  // Older callers passed the custom font bytes directly as the third argument.
  function normalizeAssets(assets) {
    if (assets instanceof Uint8Array || assets instanceof ArrayBuffer) return { fontBytes: assets };
    return assets || {};
  }

  async function embedFont(doc, settings, customFontBytes) {
    if (settings.font === 'custom') {
      if (!customFontBytes) throw new Error('Choose a font file (.ttf or .otf) first.');
      doc.registerFontkit(fontkit);
      // Full embedding: fontkit's subsetting garbles glyphs in some fonts.
      return doc.embedFont(customFontBytes, { subset: false });
    }
    const f = FONTS[settings.font] || FONTS[DEFAULTS.font];
    return doc.embedFont(f.std);
  }

  async function embedImage(doc, image) {
    if (!image || !image.bytes) throw new Error('Choose an image (PNG or JPG) first.');
    const b = image.bytes;
    try {
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return await doc.embedPng(b);
      if (b[0] === 0xff && b[1] === 0xd8) return await doc.embedJpg(b);
    } catch (e) {
      throw new Error('This image could not be read. Try saving it again as PNG.');
    }
    throw new Error('Only PNG and JPG images are supported.');
  }

  // Measures the text block. Throws a readable error if the font can't encode a character.
  function measure(font, text, size) {
    const lines = text.split(/\r\n|\r|\n/);
    let widths;
    try {
      widths = lines.map((l) => font.widthOfTextAtSize(l, size));
    } catch (e) {
      const m = /cannot encode "(.+?)"/i.exec(e.message || '');
      throw new Error(
        (m ? `The character "${m[1]}" is not available in this font. ` : 'The text contains characters this font cannot show. ') +
        'Choose a custom font (.ttf/.otf) that includes it.');
    }
    const ascent = font.heightAtSize(size, { descender: false });
    const lineH = size * LINE_SPACING;
    return {
      lines, widths, size, ascent, lineH,
      W: Math.max(0, ...widths),
      H: ascent + (lines.length - 1) * lineH,
    };
  }

  // The page as it is shown on screen: crop box and /Rotate taken into account, so that
  // "top", "center", "bottom" and the angle refer to what the reader sees.
  function pageGeometry(page) {
    const crop = page.getCropBox();
    const pageRot = Math.round(normAngle(page.getRotation().angle) / 90) % 4 * 90;
    const sideways = pageRot === 90 || pageRot === 270;
    return {
      crop, pageRot,
      visW: sideways ? crop.height : crop.width,
      visH: sideways ? crop.width : crop.height,
    };
  }

  // Places a W×H box (rotated by settings.rotation) on the page. Returns a function that maps
  // box-local coordinates (origin at the box centre) to PDF user space, plus whether it fits.
  function placeBox(geo, W, H, settings) {
    const a = settings.rotation * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const hx = Math.abs(c) * W / 2 + Math.abs(s) * H / 2;
    const hy = Math.abs(s) * W / 2 + Math.abs(c) * H / 2;
    const { visW, visH, pageRot, crop } = geo;

    const cx = visW / 2;
    let cy = visH / 2;
    if (settings.position === 'top') cy = visH - MARGIN - hy;
    else if (settings.position === 'bottom') cy = MARGIN + hy;

    const needH = settings.position === 'center' ? 2 * hy : 2 * hy + MARGIN;
    const fits = 2 * hx <= visW + 0.5 && needH <= visH + 0.5;

    const toUser = (lx, ly) => {
      const vx = cx + lx * c - ly * s;
      const vy = cy + lx * s + ly * c;
      let x, y;
      if (pageRot === 90) { x = visH - vy; y = vx; }
      else if (pageRot === 180) { x = visW - vx; y = visH - vy; }
      else if (pageRot === 270) { x = vy; y = visW - vx; }
      else { x = vx; y = vy; }
      return { x: x + crop.x, y: y + crop.y };
    };
    return { toUser, fits, angle: settings.rotation + pageRot };
  }

  // Runs draw() so that everything it draws ends up in one marked, removable content stream.
  function drawMarked(doc, page, draw) {
    // pdf-lib only creates a fresh content stream per PDFPage object; force a new one so the
    // watermark always lives in a stream of its own that removal can drop as a whole.
    page.contentStream = undefined;
    page.contentStreamRef = undefined;
    draw();
    const cs = page.contentStream;
    if (cs) {
      cs.dict.set(MARK, PDFBool.True);
      cs.operators.unshift(PDFOperator.of('BDC', [
        PDFName.of('Artifact'),
        doc.context.obj({ Type: 'Pagination', Subtype: 'Watermark' }),
      ]));
      cs.operators.push(PDFOperator.of('EMC'));
    }
    page.contentStream = undefined;
    page.contentStreamRef = undefined;
  }

  // Prepares whatever is shared by all pages (font or image), returns stamp(page, ctx) → fits.
  async function makeStamper(doc, settings, assets) {
    if (settings.type === 'image') {
      const img = await embedImage(doc, assets.image);
      return (page) => {
        const geo = pageGeometry(page);
        const W = geo.visW * settings.imageScale / 100;
        const H = W * img.height / img.width;
        const box = placeBox(geo, W, H, settings);
        const p = box.toUser(-W / 2, -H / 2);
        drawMarked(doc, page, () => page.drawImage(img, {
          x: p.x, y: p.y, width: W, height: H, opacity: settings.opacity, rotate: degrees(box.angle),
        }));
        return box.fits;
      };
    }

    if (!settings.text.trim()) throw new Error('Enter a watermark text.');
    const font = await embedFont(doc, settings, assets.fontBytes);
    const color = hexToRgb(settings.color);
    const fields = hasFields(settings.text);
    const fixed = fields ? null : measure(font, settings.text, settings.fontSize);
    return (page, ctx) => {
      const block = fixed || measure(font, fillFields(settings.text, ctx), settings.fontSize);
      const box = placeBox(pageGeometry(page), block.W, block.H, settings);
      drawMarked(doc, page, () => {
        block.lines.forEach((line, i) => {
          if (!line.trim()) return;
          const p = box.toUser(-block.widths[i] / 2, block.H / 2 - block.ascent - i * block.lineH);
          page.drawText(line, {
            x: p.x, y: p.y, size: block.size, font, color,
            opacity: settings.opacity, rotate: degrees(box.angle),
          });
        });
      });
      return box.fits;
    };
  }

  function fieldContext(settings, ctx, pageIndex, pageCount) {
    return {
      date: settings.date || today(),
      name: settings.name,
      rev: settings.rev,
      file: (ctx.file || '').replace(/\.pdf$/i, ''),
      page: pageIndex + 1,
      pages: pageCount,
    };
  }

  async function loadPdf(bytes) {
    try {
      return await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (e) {
      if (e && (e.name === 'EncryptedPDFError' || /encrypted/i.test(e.message || ''))) {
        throw new Error('This PDF is password-protected or encrypted. Remove the protection and try again.');
      }
      throw new Error('This file could not be read as a PDF.');
    }
  }

  // assets: { fontBytes, image: { bytes } }   ctx: { file }
  // Returns { bytes, pageCount, stampedPages, overflowPages: [1-based page numbers] }.
  async function addWatermark(pdfBytes, rawSettings, assets, ctx) {
    const settings = normalizeSettings(rawSettings);
    assets = normalizeAssets(assets);
    ctx = ctx || {};
    const doc = await loadPdf(pdfBytes);
    const count = doc.getPageCount();
    const targets = parsePages(settings.pages, count);
    const stamp = await makeStamper(doc, settings, assets);
    const pages = doc.getPages();
    const overflowPages = [];
    for (const i of targets) {
      if (!stamp(pages[i], fieldContext(settings, ctx, i, count))) overflowPages.push(i + 1);
    }
    return { bytes: await doc.save(), pageCount: count, stampedPages: targets.length, overflowPages };
  }

  // Fast preview: copies one page of an already loaded document into a new one-page PDF.
  // Returns { bytes, fits, skipped } — skipped when the page isn't in settings.pages.
  async function previewPage(srcDoc, pageIndex, rawSettings, assets, ctx) {
    const settings = normalizeSettings(rawSettings);
    assets = normalizeAssets(assets);
    ctx = ctx || {};
    const count = srcDoc.getPageCount();
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(srcDoc, [pageIndex]);
    doc.addPage(page);
    const targets = parsePages(settings.pages, count);
    let fits = true, skipped = !targets.includes(pageIndex);
    const empty = settings.type === 'text' && !settings.text.trim();
    if (!skipped && !empty) {
      const stamp = await makeStamper(doc, settings, assets);
      fits = stamp(page, fieldContext(settings, ctx, pageIndex, count));
    }
    return { bytes: await doc.save(), fits, skipped };
  }

  // ---------- removing ----------

  function bytesToLatin1(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return s;
  }

  function latin1ToBytes(s) {
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 255;
    return u8;
  }

  const WS = ' \t\r\n\f\0';
  const DELIMS = '()<>[]{}/%';

  function skipLiteralString(src, i) { // src[i] === '('
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return i + 1;
    }
    return src.length;
  }

  // Skips a balanced <<...>> or [...] (strings inside are respected).
  function skipNested(src, i) {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '(') { i = skipLiteralString(src, i); continue; }
      if (ch === '%') { while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
      if (ch === '<' && src[i + 1] === '<') { depth++; i += 2; continue; }
      if (ch === '>' && src[i + 1] === '>') { depth--; i += 2; if (depth === 0) return i; continue; }
      if (ch === '<') { const e = src.indexOf('>', i); i = e < 0 ? src.length : e + 1; continue; }
      if (ch === '[') { depth++; i++; continue; }
      if (ch === ']') { depth--; i++; if (depth === 0) return i; continue; }
      i++;
    }
    return src.length;
  }

  // Removes "... BDC ... EMC" blocks whose properties say /Subtype /Watermark.
  // Returns { text, removed }.
  function stripWatermarkBlocks(src, isNamedWatermark) {
    const cuts = [];
    let depth = 0, removeDepth = -1, removeStart = 0;
    let operandStart = -1, lastOperand = null;
    let i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (WS.includes(ch)) { i++; continue; }
      if (ch === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
      const start = i;
      let operand = null;
      if (ch === '(') { i = skipLiteralString(src, i); operand = { kind: 'string' }; }
      else if (ch === '<' && src[i + 1] === '<') { i = skipNested(src, i); operand = { kind: 'dict', raw: src.slice(start, i) }; }
      else if (ch === '<') { const e = src.indexOf('>', i); i = e < 0 ? n : e + 1; operand = { kind: 'hex' }; }
      else if (ch === '[') { i = skipNested(src, i); operand = { kind: 'array' }; }
      else if (ch === '/') {
        i++;
        while (i < n && !WS.includes(src[i]) && !DELIMS.includes(src[i])) i++;
        operand = { kind: 'name', raw: src.slice(start + 1, i) };
      } else if (DELIMS.includes(ch)) {
        i++; // stray ')', '>', ']', '{', '}' — ignore
        continue;
      } else {
        while (i < n && !WS.includes(src[i]) && !DELIMS.includes(src[i])) i++;
        const tok = src.slice(start, i);
        if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok) || tok === 'true' || tok === 'false' || tok === 'null') {
          operand = { kind: 'number' };
        } else {
          // operator
          if (tok === 'BI') {
            // Inline image: binary data between "ID" and "EI".
            const id = src.slice(i).search(/\sID[\s]/);
            if (id < 0) break;
            const dataStart = i + id + 4;
            const ei = src.slice(dataStart).search(/\sEI(?=[\s]|$)/);
            i = ei < 0 ? n : dataStart + ei + 3;
          } else if (tok === 'BDC' || tok === 'BMC') {
            depth++;
            if (tok === 'BDC' && removeDepth < 0 && lastOperand) {
              const wm = (lastOperand.kind === 'dict' && /\/Subtype\s*\/Watermark(?![\w#])/.test(lastOperand.raw)) ||
                (lastOperand.kind === 'name' && isNamedWatermark(lastOperand.raw));
              if (wm) { removeDepth = depth; removeStart = operandStart; }
            }
          } else if (tok === 'EMC') {
            if (depth === removeDepth) { cuts.push([removeStart, i]); removeDepth = -1; }
            if (depth > 0) depth--;
          }
          operandStart = -1;
          lastOperand = null;
          continue;
        }
      }
      if (operandStart < 0) operandStart = start;
      lastOperand = operand;
    }
    if (!cuts.length) return { text: src, removed: 0 };
    let out = '', pos = 0;
    for (const [a, b] of cuts) { out += src.slice(pos, a) + '\n'; pos = b; }
    return { text: out + src.slice(pos), removed: cuts.length };
  }

  function removeFromPage(doc, page) {
    const ctx = doc.context;
    const node = page.node;
    let removed = 0;

    // 1. Watermark annotations.
    const annots = node.Annots();
    if (annots) {
      for (let k = annots.size() - 1; k >= 0; k--) {
        const a = annots.lookup(k);
        const sub = a instanceof PDFDict ? a.get(PDFName.of('Subtype')) : null;
        if (sub && sub === PDFName.of('Watermark')) { annots.remove(k); removed++; }
      }
    }

    // 2. Content streams.
    const contentsRef = node.get(PDFName.of('Contents'));
    const contents = contentsRef && ctx.lookup(contentsRef);
    if (!contents) return removed;
    const refs = contents instanceof PDFArray ? contents.asArray() : [contentsRef];

    const kept = [];
    for (const ref of refs) {
      const stream = ctx.lookup(ref);
      if (stream && stream.dict && stream.dict.get(MARK) === PDFBool.True) removed++;
      else kept.push(ref);
    }

    // 3. Watermark blocks inside the remaining content (Acrobat & co., or Stampr streams
    //    that another tool has merged into the page content).
    let decoded = null;
    try {
      decoded = kept.map((ref) => {
        const st = ctx.lookup(ref);
        if (!(st instanceof PDFRawStream)) throw new Error('unsupported stream');
        return bytesToLatin1(decodePDFRawStream(st).decode());
      });
    } catch (e) {
      decoded = null; // unknown filter — leave the content as it is
    }
    if (decoded) {
      const joined = decoded.join('\n');
      if (joined.includes('BDC')) {
        const props = (node.Resources() || ctx.obj({})).lookupMaybe(PDFName.of('Properties'), PDFDict);
        const isNamedWatermark = (name) => {
          if (!props) return false;
          const d = props.lookup(PDFName.of(name));
          return d instanceof PDFDict && d.get(PDFName.of('Subtype')) === PDFName.of('Watermark');
        };
        const res = stripWatermarkBlocks(joined, isNamedWatermark);
        if (res.removed) {
          removed += res.removed;
          const ref = ctx.register(ctx.flateStream(latin1ToBytes(res.text)));
          node.set(PDFName.of('Contents'), ctx.obj([ref]));
          return removed;
        }
      }
    }
    if (kept.length !== refs.length) node.set(PDFName.of('Contents'), ctx.obj(kept));
    return removed;
  }

  // Returns { bytes, removed, pagesAffected, pageCount }.
  async function removeWatermarks(pdfBytes) {
    const doc = await loadPdf(pdfBytes);
    let removed = 0, pagesAffected = 0;
    for (const page of doc.getPages()) {
      const r = removeFromPage(doc, page);
      if (r) { removed += r; pagesAffected++; }
    }
    return { bytes: removed ? await doc.save() : pdfBytes, removed, pagesAffected, pageCount: doc.getPageCount() };
  }

  return {
    FONTS, DEFAULTS, loadPdf, addWatermark, previewPage, removeWatermarks,
    hasFields, parsePages,
    _internal: { stripWatermarkBlocks, normalizeSettings, fillFields },
  };
});
