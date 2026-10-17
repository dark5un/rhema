/* ==================================================================== */
/*  RHEMA — the poem mark: QR + watermarked drawing (Stone 1a)          */
/*                                                                      */
/*  Every poem can end with a small mark: a QR of the poem and the      */
/*  poet's drawing shown as a watermark. Both are declared PER POEM,     */
/*  independently of each other, in book.rhema.poems[<chId>]:            */
/*                                                                      */
/*    .qr      undefined = the library template (or title — author),     */
/*             string    = this poem's own URL/text (placeholders ok),  */
/*             'off'     = no QR for this poem                           */
/*    .drawing undefined = the collection's drawing,                    */
/*             fname     = this poem's own asset (rhema-drawing-<chId>) */
/*             'off'     = no drawing for this poem                     */
/*                                                                      */
/*  The mark lives OUTSIDE .chapter-body, so it never enters the        */
/*  chapter file, and the same code builds it in the editor, the        */
/*  PDF/HTML export (buildHtml) and the chapbook print (buildPrintHtml).*/
/*  QR encoding: qrcode-generator.js (MIT, Kazuhiko Arase), vendored.   */
/* ==================================================================== */

const RhemaQr = (() => {
  'use strict';

  const drawings = new Map(); // key ('collection' or chId) -> dataUrl|null

  function cfg() { return (library.rhema && library.rhema.qr) || {}; }
  function poemRec(chId) { return (book && book.rhema && book.rhema.poems && book.rhema.poems[chId]) || null; }

  // ---- payload (per poem first, then the library template knob) ----
  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }
  function payload(chId, title, collection, author) {
    const vars = {
      title: (title || '').trim(),
      collection: (collection || '').trim(),
      author: (author || '').trim()
    };
    const own = chId && poemRec(chId) && poemRec(chId).qr;
    if (typeof own === 'string' && own) return fill(own, vars);
    const template = cfg().template || '';
    if (template) return fill(template, vars);
    // nothing declared: the QR carries the poem's name and author
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
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="${escHtml(t('QR code'))}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
    } catch (err) {
      if (window.neo && neo.logError) neo.logError('rhema-qr: ' + ((err && err.message) || err));
      return '';
    }
  }

  // ---- the mark: drawing (watermarked) beside the QR, each per poem ----
  function markHtml(chId, title, collection, author) {
    const rec = poemRec(chId);
    const qrOff = rec && rec.qr === 'off';
    const svg = qrOff ? '' : qrSvg(payload(chId, title, collection, author), 84);
    const key = rec && typeof rec.drawing === 'string' && rec.drawing !== 'off' ? chId : 'collection';
    const art = (rec && rec.drawing === 'off') ? null : drawings.get(key);
    if (!svg && !art) return '';
    const artImg = art
      ? `<img class="rhema-mark-drawing" src="${art}" alt="" style="max-height:84px;max-width:120px;opacity:.35;object-fit:contain">`
      : '';
    // inline styles only: the export CSS stays untouched (merge posture)
    // centered under the heading: a deliberate colophon, not stray squares
    // (full mark restyle — vector drawings, monoline — is Stone 17 / 2h)
    return `<div class="rhema-poem-mark" contenteditable="false" style="display:flex;align-items:flex-end;justify-content:center;gap:14px;margin-top:1.6em">${artImg}${svg ? `<span class="rhema-mark-qr" style="display:inline-block">${svg}</span>` : ''}</div>`;
  }

  // ---- editor: the mark sits at the end of the chapter section ----
  function chapterRendered(sec, chId) {
    if (!poemBook()) return;
    const old = sec.querySelector('.rhema-poem-mark');
    if (old) old.remove();
    const html = markHtml(chId, poemTitle(chId), book.title, book.author);
    if (!html) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    sec.appendChild(wrap.firstElementChild);
  }

  // ---- exports: buildHtml + buildPrintHtml ask for the same mark.
  // The book being exported is always the open one (shelf exports borrow
  // `book` first), so poemBook() is the format check. ----
  function exportSectionEnd(sec, d) {
    if (!poemBook() || !sec || sec.kind !== 'chapter' || !sec.chId) return undefined;
    return markHtml(sec.chId, sec.heading || poemTitle(sec.chId), (d && d.title) || book.title, (d && d.author) || book.author);
  }

  // ---- EPUB (Stone 13): the same mark, written as XHTML — a reading app
  // refuses an unclosed <img>, and contenteditable means nothing there ----
  function epubSectionEnd(sec, d) {
    const html = exportSectionEnd(sec, d);
    if (!html) return undefined;
    return html
      .replace(/ contenteditable="false"/g, '')
      .replace(/<img\b([^>]*?)(?<!\/)>/g, '<img$1/>'); // (?<!/) also catches a bare <img>
  }

  // ---- the drawings (rhema-drawing.* / rhema-drawing-<chId>.* in the book folder) ----
  async function loadDrawing(bookId, key) {
    try {
      const got = await window.neo.rhema.assetRead(bookId, key);
      drawings.set(key, got && got.base64 ? `data:${got.mime};base64,${got.base64}` : null);
    } catch (err) { drawings.set(key, null); }
  }
  async function loadAllDrawings(meta) {
    drawings.clear();
    await loadDrawing(meta.id, 'collection');
    const poems = (meta.rhema && meta.rhema.poems) || {};
    for (const chId of Object.keys(poems)) {
      if (typeof poems[chId].drawing === 'string' && poems[chId].drawing !== 'off') await loadDrawing(meta.id, chId);
    }
  }

  function setPoemField(chId, field, value) {
    if (!book) return;
    if (!book.rhema) book.rhema = {};
    if (!book.rhema.poems) book.rhema.poems = {};
    if (!book.rhema.poems[chId]) book.rhema.poems[chId] = {};
    const r = book.rhema.poems[chId];
    if (value === undefined) delete r[field]; else r[field] = value;
    if (!Object.keys(r).length) delete book.rhema.poems[chId];
    saveMeta();
  }

  // ---- per-poem menus (the chapter menu of a poem book) ----
  function chapterMenuItems(chId) {
    if (!poemBook()) return undefined;
    return ['-',
      { label: t('Poem QR…'), value: 'rhemaQr' },
      { label: t('Poem drawing…'), value: 'rhemaDrawing' }];
  }
  async function chapterMenuChoice(chId, choice) {
    if (choice === 'rhemaQr') { await qrMenu(chId); return true; }
    if (choice === 'rhemaDrawing') { await drawingMenu(chId); return true; }
    return false;
  }
  async function qrMenu(chId) {
    const rec = poemRec(chId);
    const own = rec && typeof rec.qr === 'string' && rec.qr !== 'off';
    const off = rec && rec.qr === 'off';
    const choice = await optionModal(t('This poem’s QR'), null, [
      { label: t('Set a link or text for this poem…'), value: 'set' },
      ...(own ? [{ label: t('Remove it (use the default)'), value: 'clear' }] : []),
      ...(off ? [{ label: t('Show a QR here again'), value: 'on' }]
              : [{ label: t('Never show a QR for this poem'), value: 'off' }])
    ]);
    if (!choice) return;
    if (choice === 'set') {
      const v = await askInput(t('The QR of “{title}”', { title: escHtml(shownTitle(chapterName(chId))) }),
        t('a link, or any text — {title} and {author} work too'), (rec && rec.qr !== 'off' && rec.qr) || '');
      if (v === null) return;
      setPoemField(chId, 'qr', v || undefined);
    } else if (choice === 'clear') setPoemField(chId, 'qr', undefined);
    else if (choice === 'off') setPoemField(chId, 'qr', 'off');
    else if (choice === 'on') setPoemField(chId, 'qr', undefined);
    renderChapters();
  }
  async function drawingMenu(chId) {
    const rec = poemRec(chId);
    const own = rec && typeof rec.drawing === 'string' && rec.drawing !== 'off';
    const off = rec && rec.drawing === 'off';
    const choice = await optionModal(t('This poem’s drawing'), null, [
      { label: t('Set this poem’s drawing…'), value: 'set' },
      ...(own ? [{ label: t('Remove it (use the collection’s)'), value: 'clear' }] : []),
      ...(off ? [{ label: t('Show a drawing here again'), value: 'on' }]
              : [{ label: t('Never show a drawing for this poem'), value: 'off' }])
    ]);
    if (!choice) return;
    if (choice === 'set') {
      const token = await window.neo.rhema.assetPick(); // one-time token, not a path
      if (!token) return;
      const fname = await window.neo.rhema.assetSet(book.id, token, chId);
      if (!fname) { toast(t('That image could not be added.')); return; }
      setPoemField(chId, 'drawing', fname);
      await loadDrawing(book.id, chId);
    } else if (choice === 'clear') {
      await window.neo.rhema.assetClear(book.id, chId);
      drawings.delete(chId);
      setPoemField(chId, 'drawing', undefined);
    } else if (choice === 'off') setPoemField(chId, 'drawing', 'off');
    else if (choice === 'on') setPoemField(chId, 'drawing', undefined);
    renderChapters();
  }

  // ---- collection drawing: shelf card menu ----
  async function rememberDrawing(meta, fname) {
    meta.rhema = { ...(meta.rhema || {}) };
    if (fname) meta.rhema.drawing = fname; else delete meta.rhema.drawing;
    if (!Object.keys(meta.rhema).length) delete meta.rhema;
    await writeBookMeta(meta.id, meta).catch(() => {});
  }
  async function pickDrawing(meta) {
    const token = await window.neo.rhema.assetPick(); // one-time token, not a path
    if (!token) return false;
    const fname = await window.neo.rhema.assetSet(meta.id, token, 'collection');
    if (!fname) { toast(t('That image could not be added.')); return false; }
    await rememberDrawing(meta, fname);
    await loadDrawing(meta.id, 'collection');
    if (book && book.id === meta.id) renderChapters();
    toast(t('The collection has its drawing.'), 3000);
    return true;
  }
  async function clearDrawing(meta) {
    await window.neo.rhema.assetClear(meta.id, 'collection');
    drawings.set('collection', null);
    await rememberDrawing(meta, null);
    if (book && book.id === meta.id) renderChapters();
  }
  function shelfCardMenu(meta) {
    if (!(NeoHooks.format(meta.format) && NeoHooks.format(meta.format).poem)) return undefined;
    const has = !!(meta.rhema && meta.rhema.drawing);
    return ['-',
      { label: t('Set poem drawing…'), value: 'rhemaDrawing' },
      ...(has ? [{ label: t('Remove poem drawing'), value: 'rhemaDrawingOff', danger: true }] : [])];
  }
  function shelfCardChoice(meta, choice) {
    if (choice === 'rhemaDrawing') { pickDrawing(meta); return true; }
    if (choice === 'rhemaDrawingOff') { clearDrawing(meta); return true; }
    return false;
  }

  NeoHooks.on('chapterRendered', chapterRendered);
  NeoHooks.on('exportSectionEnd', exportSectionEnd);
  NeoHooks.on('epubSectionEnd', epubSectionEnd); /* RHEMA — the mark rides into EPUB too */
  // the drawings load over IPC; when they land, re-render so the mark is
  // complete on first open (bookOpened fires before renderChapters, and the
  // async load would otherwise lose the race — review 2026-10-17)
  NeoHooks.on('bookOpened', async (meta) => {
    const id = meta.id;
    try {
      await loadAllDrawings(meta);
      if (book && book.id === id && poemBook()) renderChapters();
    } catch (err) { if (window.neo && neo.logError) neo.logError('rhema-qr-open: ' + ((err && err.message) || err)); }
  });
  NeoHooks.on('chapterMenuItems', chapterMenuItems);
  NeoHooks.on('chapterMenuChoice', chapterMenuChoice);
  NeoHooks.on('shelfCardMenu', shelfCardMenu);
  NeoHooks.on('shelfCardChoice', shelfCardChoice);

  return { payload, qrSvg, markHtml, pickDrawing, clearDrawing, loadDrawing,
    hasDrawing: (key) => !!drawings.get(key || 'collection') };
})();
