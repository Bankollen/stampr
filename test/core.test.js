// Usage: npm install && npm test
const path = require('path');
const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const core = require(path.join(__dirname, '..', 'watermark.js'))(PDFLib, fontkit);
const { PDFDocument, StandardFonts, PDFName, decodePDFRawStream, PDFArray, PDFRawStream } = PDFLib;
const assert = require('assert');

async function pageContent(doc, i) {
  const node = doc.getPages()[i].node;
  const c = doc.context.lookup(node.get(PDFName.of('Contents')));
  const refs = c instanceof PDFArray ? c.asArray() : [node.get(PDFName.of('Contents'))];
  return refs.map(r => { const s = doc.context.lookup(r); return Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents()).toString('latin1'); }).join('\n');
}

(async () => {
  // Build a source PDF: portrait, landscape, rotated 90, rotated 270 with offset cropbox.
  const src = await PDFDocument.create();
  const f = await src.embedFont(StandardFonts.Helvetica);
  const p1 = src.addPage([595, 842]); p1.drawText('Page one body text', { x: 50, y: 700, size: 14, font: f });
  const p2 = src.addPage([842, 595]); p2.drawText('Landscape', { x: 50, y: 500, size: 14, font: f });
  const p3 = src.addPage([595, 842]); p3.setRotation(PDFLib.degrees(90)); p3.drawText('Rotated 90', { x: 50, y: 700, size: 14, font: f });
  const p4 = src.addPage([600, 900]); p4.setCropBox(50, 100, 500, 700); p4.setRotation(PDFLib.degrees(270)); p4.drawText('Rot 270 crop', { x: 100, y: 700, size: 14, font: f });
  const srcBytes = await src.save();
  const origContent = [];
  { const d = await PDFDocument.load(srcBytes); for (let i = 0; i < 4; i++) origContent.push(await pageContent(d, i)); }

  for (const rotation of [0, 45, 90, 135, 180, 225, -30, 400]) for (const position of ['top', 'center', 'bottom']) {
    const r = await core.addWatermark(srcBytes, { text: 'DRAFT\nNot for construction', rotation, position, fontSize: 40 }, null);
    assert.equal(r.pageCount, 4);
    const d = await PDFDocument.load(r.bytes);
    for (let i = 0; i < 4; i++) {
      const c = await pageContent(d, i);
      assert(c.includes('/Artifact') && c.includes('/Watermark'), 'marked content present');
    }
    const rm = await core.removeWatermarks(r.bytes);
    assert.equal(rm.removed, 4, `removed count ${rotation}/${position}`);
    const d2 = await PDFDocument.load(rm.bytes);
    for (let i = 0; i < 4; i++) {
      const c = await pageContent(d2, i);
      assert(!c.includes('Watermark'), 'watermark gone');
      assert(c.includes(origContent[i].trim().split('\n')[2] || 'BT'), 'original content kept');
    }
  }
  console.log('add/remove roundtrip OK');

  // Overflow detection
  const big = await core.addWatermark(srcBytes, { text: 'A VERY LONG WATERMARK TEXT', fontSize: 200, rotation: 0 }, null);
  assert.deepEqual(big.overflowPages, [1, 2, 3, 4]);
  const small = await core.addWatermark(srcBytes, { text: 'OK', fontSize: 20, rotation: 0 }, null);
  assert.deepEqual(small.overflowPages, []);
  console.log('overflow OK');

  // Double watermark, then remove both
  const twice = await core.addWatermark((await core.addWatermark(srcBytes, { text: 'ONE' })).bytes, { text: 'TWO' });
  assert.equal((await core.removeWatermarks(twice.bytes)).removed, 8);
  console.log('double OK');

  // Unencodable char with standard font
  await assert.rejects(core.addWatermark(srcBytes, { text: 'Hello 漢' }), /not available in this font/);
  // åäö works in WinAnsi
  await core.addWatermark(srcBytes, { text: 'UTKAST – ÅÄÖ åäö' });
  console.log('encoding OK');

  // Acrobat-style watermark with tricky strings, inline image and a named-properties variant
  const ac = await PDFDocument.create();
  const pg = ac.addPage([595, 842]);
  const font = await ac.embedFont(StandardFonts.Helvetica);
  pg.drawText('keep me', { x: 10, y: 10, size: 10, font });
  const fontName = Object.keys(Object.fromEntries(pg.node.Resources().lookup(PDFName.of('Font')).entries().map(([k, v]) => [k.asString().slice(1), v])))[0];
  const body = `q BT /${fontName} 12 Tf 50 50 Td (normal text with EMC and BDC \) inside) Tj ET Q
/P <</MCID 0>> BDC BT /${fontName} 12 Tf 50 80 Td (tagged keep) Tj ET EMC
/Artifact <</Subtype /Watermark /Type /Pagination>> BDC q 0.5 g BT /${fontName} 60 Tf 100 400 Td (ACROBAT WM \(EMC\)) Tj ET
BI /W 2 /H 1 /BPC 8 /CS /G ID \x00EMC EI
Q EMC
/Artifact /WM1 BDC BT /${fontName} 30 Tf 100 300 Td (NAMED WM) Tj ET EMC
BT /${fontName} 12 Tf 50 20 Td [(after)] TJ ET`;
  const ref = ac.context.register(ac.context.flateStream(body));
  pg.node.Contents().push(ref);
  const props = ac.context.obj({ WM1: { Type: 'Pagination', Subtype: 'Watermark' } });
  pg.node.Resources().set(PDFName.of('Properties'), props);
  // Watermark annotation
  const annot = ac.context.register(ac.context.obj({ Type: 'Annot', Subtype: 'Watermark', Rect: [0, 0, 10, 10] }));
  pg.node.addAnnot(annot);
  const acBytes = await ac.save();
  const rm = await core.removeWatermarks(acBytes);
  assert.equal(rm.removed, 3, 'acrobat block + named + annotation');
  const d3 = await PDFDocument.load(rm.bytes);
  const c3 = await pageContent(d3, 0);
  assert(!c3.includes('ACROBAT WM') && !c3.includes('NAMED WM'), 'acrobat wm stripped');
  for (const keep of ['keep me', 'normal text with EMC', 'tagged keep', '(after)']) assert(c3.includes(keep) || c3.toUpperCase().includes(Buffer.from(keep).toString('hex').toUpperCase()), 'kept ' + keep);
  assert.equal(d3.getPages()[0].node.Annots().size(), 0);
  console.log('acrobat-style removal OK');

  // No watermark -> unchanged bytes
  const none = await core.removeWatermarks(srcBytes);
  assert.equal(none.removed, 0); assert.equal(none.bytes, srcBytes);

  // Preview page
  const sd = await core.loadPdf(srcBytes);
  const pv = await core.previewPage(sd, 2, { text: 'X' });
  assert.equal((await PDFDocument.load(pv.bytes)).getPageCount(), 1);
  assert.equal((await PDFDocument.load(pv.bytes)).getPages()[0].getRotation().angle, 90);
  console.log('preview OK');

  // Garbage input
  await assert.rejects(core.addWatermark(new Uint8Array([1, 2, 3]), {}), /could not be read/);
  
  
  console.log('ALL OK');
})().catch(e => { console.error(e); process.exit(1); });
