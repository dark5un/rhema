/* ==================================================================== */
/*  RHEMA — the poem mark: QR + watermarked drawing (Stone 1a)          */
/*                                                                      */
/*  Every poem ends with a small mark: a QR of the poem (payload from   */
/*  library.rhema.qr.template — a knob, see the plan §5) and, when the  */
/*  collection has one, the poet's drawing shown as a watermark. The    */
/*  mark lives OUTSIDE .chapter-body, so it never enters the chapter    */
/*  file, and it is built by the same code in the editor, the PDF/HTML  */
/*  export (buildHtml) and the chapbook print (buildPrintHtml).         */
/*  QR encoding: qrcode-generator.js (MIT, Kazuhiko Arase), vendored.   */
/* ==================================================================== */

const RhemaQr = (() => {
  'use strict';

  let drawing = null; // { dataUrl } for the open book; null = none

  function cfg() { return (library.rhema && library.rhema.qr) || {}; }
  function on() { return cfg().off !== true; }

  // ---- payload (the knob: a URL template, or a plain text fallback) ----
  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }
  function payload(title, collection, author) {
    const vars = {
      title: (title || '').trim(),
      collection: (collection || '').trim(),
      author: (author || '').trim()
    };
    const template = cfg().template || '';
    if (template) return fill(template, vars);
    // no URL configured yet: the QR carries the poem's name and author
    return [vars.title || t('Untitled'), vars.author || t('Anonymous')].filter(Boolean).join(' — ');
  }
  function poemTitle(chId) {
    return ((book && book.chapterTitles || {})[chId] || '').trim() || (chId && chapterName(chId)) || '';
  }

  // ---- the QR itself: a compact SVG, black on white, print-safe ----
  function qrSvg(text, px) {
    if (typeof qrcode === 'undefined') return '';
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; // Greek poems
      const q = qrcode(0, 'M'); // smallest type that fits
      q.addData(text);
      q.make();
      const n = q.getModuleCount();
      let cells = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (q.isDark(r, c)) cells += `<rect x="${c}" y="${r}" width="1" height="1"/>`;
        }
      }
      // a quiet margin, or scanners refuse the print
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
    } catch (err) {
      if (window.neo && neo.logError) neo.logError('rhema-qr: ' + ((err && err.message) || err));
      return '';
    }
  }

  // ---- the mark: drawing (watermarked) beside the QR ----
  function markHtml(title, collection, author) {
    const svg = qrSvg(payload(title, collection, author), 84);
    if (!svg && !drawing) return '';
    const art = drawing
      ? `<img class="rhema-mark-drawing" src="${drawing.dataUrl}" alt="" style="max-height:84px;max-width:120px;opacity:.35;object-fit:contain">`
      : '';
    // inline styles only: the export CSS stays untouched (merge posture)
    return `<div class="rhema-poem-mark" contenteditable="false" style="display:flex;align-items:flex-end;gap:14px;margin-top:1.6em">${art}${svg ? `<span class="rhema-mark-qr" style="display:inline-block">${svg}</span>` : ''}</div>`;
  }

  // ---- editor: the mark sits at the end of the chapter section ----
  function chapterRendered(sec, chId) {
    if (!poemBook() || !on()) return;
    const old = sec.querySelector('.rhema-poem-mark');
    if (old) old.remove();
    const html = markHtml(poemTitle(chId), book.title, book.author);
    if (!html) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    sec.appendChild(wrap.firstElementChild);
  }

  // ---- exports: buildHtml + buildPrintHtml ask for the same mark.
  // The book being exported is always the open one (shelf exports borrow
  // `book` first), so poemBook() is the format check. ----
  function exportSectionEnd(sec, d) {
    if (!poemBook() || !on() || !sec || sec.kind !== 'chapter' || !sec.chId) return undefined;
    return markHtml(sec.heading || poemTitle(sec.chId), (d && d.title) || book.title, (d && d.author) || book.author);
  }

  // ---- the collection's drawing (rhema-drawing.* in the book folder) ----
  async function loadDrawing(bookId) {
    drawing = null;
    try {
      const got = await window.neo.rhema.assetRead(bookId);
      if (got && got.base64) drawing = { dataUrl: `data:${got.mime};base64,${got.base64}` };
    } catch (err) { /* none is the normal case */ }
  }

  async function rememberDrawing(meta, fname) {
    // book.rhema.drawing: which collection has one (the shelf menu reads it)
    meta.rhema = { ...(meta.rhema || {}) };
    if (fname) meta.rhema.drawing = fname; else delete meta.rhema.drawing;
    if (!Object.keys(meta.rhema).length) delete meta.rhema;
    await writeBookMeta(meta.id, meta).catch(() => {});
  }

  async function pickDrawing(meta) {
    const src = await window.neo.rhema.assetPick();
    if (!src) return false;
    const fname = await window.neo.rhema.assetSet(meta.id, src);
    if (!fname) { toast(t('That image could not be added.')); return false; }
    await rememberDrawing(meta, fname);
    await loadDrawing(meta.id);
    // an open book shows it right away
    if (book && book.id === meta.id) renderChapters();
    toast(t('The collection has its drawing.'), 3000);
    return true;
  }

  async function clearDrawing(meta) {
    await window.neo.rhema.assetClear(meta.id);
    await rememberDrawing(meta, null);
    drawing = null;
    if (book && book.id === meta.id) renderChapters();
  }

  // ---- shelf card menu: poem books grow a Drawing item ----
  function shelfCardMenu(meta) {
    if (!(NeoHooks.format(meta.format) && NeoHooks.format(meta.format).poem)) return undefined;
    const has = !!(meta.rhema && meta.rhema.drawing);
    return [
      '-',
      { label: t('Set poem drawing…'), value: 'rhemaDrawing' },
      ...(has ? [{ label: t('Remove poem drawing'), value: 'rhemaDrawingOff', danger: true }] : [])
    ];
  }
  function shelfCardChoice(meta, choice) {
    if (choice === 'rhemaDrawing') { pickDrawing(meta); return true; }
    if (choice === 'rhemaDrawingOff') { clearDrawing(meta); return true; }
    return false;
  }

  NeoHooks.on('chapterRendered', chapterRendered);
  NeoHooks.on('exportSectionEnd', exportSectionEnd);
  NeoHooks.on('bookOpened', (meta) => { loadDrawing(meta.id); });
  NeoHooks.on('shelfCardMenu', shelfCardMenu);
  NeoHooks.on('shelfCardChoice', shelfCardChoice);

  return { payload, qrSvg, markHtml, pickDrawing, clearDrawing, loadDrawing, hasDrawing: () => !!drawing };
})();
