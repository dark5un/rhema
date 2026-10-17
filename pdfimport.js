// Rhema — PDF text for poem import /* RHEMA */ (Stone 12, Phase 3a)
//
// Reads a PDF's text and hands main.js the same paragraph stream the txt/md
// poetry path builds: { text, line, indent } for a verse line, { gap, wide }
// for the space between stanzas (wide = a poem break in the 'auto' split),
// { pageEnd } at a page's end. pdfjs-dist's legacy build is loaded lazily —
// a PDF import is the only thing that ever pulls it in, and the AppImage
// stays lean the rest of the time.
//
// Lines come back the way they were set: pdfjs hands over each text item
// with its position on the page, so items sharing a baseline join into one
// line, and the vertical pitch between lines tells stanzas from poems.

'use strict';

// group positioned text items into lines: items on one baseline (within a
// tolerance of the line's own height) join, left to right; a space goes in
// where the gap between items is wider than a quarter em
function pdfLines(items) {
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (!it.str && !it.hasEOL) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    const h = Math.max(it.height || 0, 1);
    if (cur && Math.abs(y - cur.y) <= h * 0.6) {
      if (it.str) {
        const gap = x - cur.right;
        cur.parts.push((gap > h * 0.25 && cur.parts.length ? ' ' : '') + it.str);
        cur.right = Math.max(cur.right, x + (it.width || 0));
      }
      cur.h = Math.max(cur.h, h);
    } else {
      if (cur) lines.push(cur);
      cur = { y, x, right: x + (it.width || 0), h, parts: it.str ? [it.str] : [] };
    }
  }
  if (cur) lines.push(cur);
  return lines
    .filter((l) => l.parts.join('').trim())
    .map((l) => ({ text: l.parts.join('').replace(/\s+$/g, ''), x: l.x, y: l.y, h: l.h }));
}

// the paragraph stream: line gaps become stanza gaps, wide gaps and page
// ends become poem boundaries, and a line set further in than its
// neighbours carries the indent flag
function pdfParasFromPages(pages) {
  const paras = [];
  // the stanza's own line pitch: the 25th percentile of the pitches on the
  // page — the median would be dragged up by the stanza gaps themselves
  const basePitch = (a) => {
    if (!a.length) return 0;
    const s = a.slice().sort((p, q) => p - q);
    return s[Math.floor((s.length - 1) * 0.25)];
  };
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p];
    if (!lines.length) continue;
    // the stanza's left edge: the smallest x on the page
    const minX = Math.min(...lines.map((l) => l.x));
    const pitch = [];
    for (let i = 1; i < lines.length; i++) pitch.push(lines[i - 1].y - lines[i].y);
    const medPitch = basePitch(pitch);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && medPitch > 0) {
        const gap = lines[i - 1].y - lines[i].y;
        if (gap > medPitch * 1.6) paras.push({ text: '', gap: true, wide: gap > medPitch * 2.4 });
      }
      const t = lines[i].text;
      const lead = /^[\t ]{2,}/.test(t);
      const pushedIn = lines[i].x > minX + lines[i].h * 1.2;
      paras.push({ text: t.trim(), line: true, indent: lead || pushedIn });
    }
    if (p < pages.length - 1) paras.push({ text: '', pageEnd: true });
  }
  return paras;
}

// read a PDF file into the paragraph stream (main process; fp is a real path)
async function pdfParas(fp) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fs = require('node:fs');
  const data = new Uint8Array(fs.readFileSync(fp));
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(pdfLines(content.items));
  }
  await doc.destroy();
  return pdfParasFromPages(pages);
}

module.exports = { pdfParas, pdfLines, pdfParasFromPages };
