// End-to-end test for the Rhema poetry format: a new poem collection, the
// Enter rhythm (line / stanza / poem), the line operations (move, duplicate,
// merge, indent), structural undo, and that a novel's Enter rhythm is
// untouched by the fork's anchors. Run with `npm run test:poetry` (under
// xvfb-run without a display).

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-poetry-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-poetry-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
// RHEMA — the fork's default UI language is Greek (Stone 11); this suite reads English strings
fs.mkdirSync(app.getPath('userData'), { recursive: true });
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({ uiLanguage: 'en' }));
app.setPath('documents', tmp);
const LIB = path.join(tmp, 'Rhema Library');
fs.mkdirSync(LIB);
fs.writeFileSync(path.join(LIB, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night', hintShown: true,
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

/* RHEMA — the import tests answer the real File → Import Poems… picker from
   the main-process side: window.neo is a contextBridge object and its
   properties are read-only in the renderer, so a renderer stub silently
   fails and the real dialog hangs the suite (seen 2026-10-17). main.js
   looks up dialog.showOpenDialog at call time on the shared electron
   module object, so patching it here exercises the real import:pick path
   (filters, titles, all of it). */
const { dialog } = require('electron');
let pickedFiles = [];
dialog.showOpenDialog = async () =>
  pickedFiles.length ? { canceled: false, filePaths: pickedFiles } : { canceled: true, filePaths: [] };

let wc;
let dbg = null; // webContents.debugger once attached (viewport pin + text input)
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (opts) => js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(opts)})))`);
const enter = () => key({ key: 'Enter', code: 'Enter' });
const type = async (s) => {
  // CDP Input.insertText needs only DOM focus; execCommand('insertText') also
  // demands WM focus, which Hyprland does not give the harness window when it
  // opens on another workspace (2026-10-17: 8 tests failed on silent no-op typing).
  if (dbg) await dbg.sendCommand('Input.insertText', { text: s });
  else await js(`document.execCommand('insertText', false, ${JSON.stringify(s)})`);
  await js('enterRun = 0'); // real typing resets the Enter rhythm; insertText does not
};
// the stanzas of the chapter being read, as arrays of lines
const CHID = `currentChapterId || book.chapterOrder.filter((c) => isStory(c))[0]`;
const stanzasOf = (i) => js(`(() => {
  const body = document.querySelector('.chapter[data-id="' + book.chapterOrder[${i}] + '"] .chapter-body');
  if (!body) return [];
  return Array.from(body.querySelectorAll('p')).map((p) => {
    if (!p.textContent) return { cls: p.className, lines: [''] };
    const parts = [[]];
    for (const n of p.childNodes) { if (n.nodeName === 'BR') parts.push([]); else parts[parts.length - 1].push(n.textContent); }
    if (parts.length > 1 && !parts[parts.length - 1].length) parts.pop();
    return { cls: p.className, lines: parts.map((a) => a.join('')) };
  });
})()`);
const stanzas = () => js(`(() => {
  const body = document.querySelector('.chapter[data-id="' + (${CHID}) + '"] .chapter-body');
  return Array.from(body.querySelectorAll('p')).map((p) => {
    if (!p.textContent) return { cls: p.className, lines: [''] }; // NEO's empty paragraph: one line
    const parts = [[]];
    for (const n of p.childNodes) { if (n.nodeName === 'BR') parts.push([]); else parts[parts.length - 1].push(n.textContent); }
    if (parts.length > 1 && !parts[parts.length - 1].length) parts.pop(); // trailing placeholder br
    return { cls: p.className, lines: parts.map((a) => a.join('')) };
  });
})()`);
const caretToEnd = () => js(`(() => {
  const body = document.querySelector('.chapter[data-id="' + (${CHID}) + '"] .chapter-body');
  currentChapterId = body.closest('.chapter').dataset.id;
  body.focus();
  const ps = body.querySelectorAll('p');
  const last = ps[ps.length - 1];
  const r = document.createRange();
  if (!last.textContent) r.setStart(last, 0); // an empty stanza: before its br
  else { r.selectNodeContents(last); r.collapse(false); }
  getSelection().removeAllRanges();
  getSelection().addRange(r);
})()`);
const caretInLine = (s, k, col) => js(`(() => {
  const body = document.querySelector('.chapter[data-id="' + (${CHID}) + '"] .chapter-body');
  currentChapterId = body.closest('.chapter').dataset.id;
  body.focus();
  const p = body.querySelectorAll('p')[${s}];
  const parts = [[]];
  for (const n of p.childNodes) { if (n.nodeName === 'BR') parts.push([]); else parts[parts.length - 1].push(n); }
  let left = ${col};
  for (const n of parts[${k}]) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.length >= left) {
      const r = document.createRange(); r.setStart(n, left); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r); return;
    }
    left -= n.textContent.length;
  }
})()`);
const chapterFile = (i) => js(`(() => {
  const chId = book.chapterOrder[${i}];
  return chId;
})()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('a new poem collection opens as verse', async () => {
  await js(`RhemaPoetry.createOnShelf(library.shelves[0])`);
  await tick(500);
  assert.equal(await js('book.format'), 'poetry');
  assert.equal(await js('poemBook()'), true);
  assert.equal(await js('book.chapterOrder.length'), 1);
  const st = await stanzas();
  assert.equal(st.length, 1);
  assert.equal(st[0].cls, 'poetry');
});

// Real verse for the visible fixtures: K. P. Cavafy, "Κεριά" (broadside
// 1893/1899) and "Η πόλις" (1910 collection) — chosen because Kavafis is
// the family's favourite poet and an inspiration for this project.
// Copyright, settled: the poems are public domain everywhere. The poet
// died 1933 — EU/Greece (life+70) left copyright 1 Jan 2004; in the US
// both poems were published decades before the 1929 cutoff, and Greek
// law's then-term (life+50) had already lapsed in 1983, so no URAA
// restoration applies. We use the plain poem text only — no modern
// critical-edition apparatus, no translations (those ARE copyrighted).
// The Onassis Foundation Cavafy Archive (cavafy.onassis.org) puts its
// digitised objects under CC BY-SA 4.0; attribution: Cavafy Archive,
// Onassis Foundation. The poet's UX deserves real poems.
const L1 = "Του μέλλοντος οι μέρες στέκοντ' εμπροστά μας";
const L2 = "σα μια σειρά κεράκια αναμμένα —";
const L3 = "χρυσά, ζεστά, και ζωηρά κεράκια.";

test('Enter once breaks the line, twice opens a stanza, three times a new poem', async () => {
  await caretToEnd();
  await type(L1);
  await enter(); await tick();
  await type(L2);
  let st = await stanzas();
  assert.deepEqual(st[0].lines, [L1, L2], 'soft break inside the stanza');
  await enter(); await tick();
  await enter(); await tick();
  st = await stanzas();
  assert.equal(st.length, 2, 'the second Enter opened a new stanza');
  assert.deepEqual(st[0].lines, [L1, L2]);
  assert.deepEqual(st[1].lines, ['']);
  await type(L3);
  st = await stanzas();
  assert.deepEqual(st[1].lines, [L3]);
  await enter(); await tick();
  await enter(); await tick();
  await enter(); await tick(120);
  assert.equal(await js('book.chapterOrder.length'), 2, 'three Enters split the poem');
  st = await stanzasOf(1);
  assert.equal(st.length, 1, 'the new poem starts on one stanza');
  assert.equal(st[0].cls, 'poetry', 'and it is verse, not prose');
  await js('currentChapterId = book.chapterOrder[1]');
});

test('⌘Z undoes the stanza split (structural undo)', async () => {
  await js('currentChapterId = book.chapterOrder[1]');
  await caretToEnd();
  await type("Καινούργιους τόπους δεν θα βρεις,");
  await enter(); await tick();
  await enter(); await tick();
  let st = await stanzasOf(1);
  assert.equal(st.length, 2, 'stanza split happened');
  await key({ key: 'z', code: 'KeyZ', ctrlKey: true });
  await tick(120);
  st = await stanzasOf(1);
  assert.equal(st.length, 1, 'one ⌘Z un-split the stanza');
});

test('Alt+up/down moves the line, across stanzas too', async () => {
  // fresh poem: three lines in one stanza
  await js(`(() => { currentChapterId = currentChapterId || book.chapterOrder.filter((c) => isStory(c))[0]; chapterHTML[currentChapterId] = '<p class="poetry">a<br>b<br>c</p>'; renderChapters(); })()`);
  await tick(120);
  await caretInLine(0, 2, 1); // 'c', after the c... col 1
  await key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true });
  await tick();
  let st = await stanzas();
  assert.deepEqual(st[0].lines, ['a', 'c', 'b'], 'line moved up');
  await key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true });
  await key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true });
  st = await stanzas();
  assert.deepEqual(st[0].lines, ['c', 'a', 'b'], 'moved to the top');
  await key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true });
  st = await stanzas();
  assert.deepEqual(st[0].lines, ['c', 'a', 'b'], 'past the top: nothing moves');
  // across stanzas
  await js(`(() => { currentChapterId = currentChapterId || book.chapterOrder.filter((c) => isStory(c))[0]; chapterHTML[currentChapterId] = '<p class="poetry">x<br>y</p><p class="poetry">z</p>'; renderChapters(); })()`);
  await tick(120);
  await caretInLine(1, 0, 1); // 'z' in the second stanza
  await key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true });
  await tick();
  st = await stanzas();
  // the emptied stanza goes away (review 2026-10-17: no orphan empty stanza)
  assert.deepEqual(st.map((s) => s.lines), [['x', 'y', 'z']], 'the line crossed into the stanza before, which stays; the emptied stanza goes');
});

test('Alt+D duplicates the line; Alt+J merges it upward', async () => {
  await js(`(() => { currentChapterId = currentChapterId || book.chapterOrder.filter((c) => isStory(c))[0]; chapterHTML[currentChapterId] = '<p class="poetry">one<br>two</p>'; renderChapters(); })()`);
  await tick(120);
  await caretInLine(0, 0, 2);
  await key({ key: 'd', code: 'KeyD', altKey: true });
  await tick();
  let st = await stanzas();
  assert.deepEqual(st[0].lines, ['one', 'one', 'two'], 'line duplicated under the caret');
  await key({ key: 'j', code: 'KeyJ', altKey: true });
  await tick();
  st = await stanzas();
  assert.deepEqual(st[0].lines, ['oneone', 'two'], 'the copy merged back up');
});

test('Tab indents the line, Shift+Tab takes it back', async () => {
  await js(`(() => { currentChapterId = currentChapterId || book.chapterOrder.filter((c) => isStory(c))[0]; chapterHTML[currentChapterId] = '<p class="poetry">verse<br>line</p>'; renderChapters(); })()`);
  await tick(120);
  await caretInLine(0, 1, 2);
  await key({ key: 'Tab', code: 'Tab' });
  await tick();
  let st = await stanzas();
  assert.deepEqual(st[0].lines, ['verse', '\u2003\u2003line'], 'the line stepped in');
  await key({ key: 'Tab', code: 'Tab', shiftKey: true });
  await tick();
  st = await stanzas();
  assert.deepEqual(st[0].lines, ['verse', 'line'], 'and back out');
});

test('emphasis inside a line survives the line operations', async () => {
  await js(`(() => { currentChapterId = currentChapterId || book.chapterOrder.filter((c) => isStory(c))[0]; chapterHTML[currentChapterId] = '<p class="poetry">a <i>bird</i><br>two</p>'; renderChapters(); })()`);
  await tick(120);
  await caretInLine(0, 0, 1);
  await key({ key: 'ArrowDown', code: 'ArrowDown', altKey: true });
  await tick();
  const html = await js(`document.querySelector('.chapter[data-id="' + (${CHID}) + '"] .chapter-body').innerHTML`);
  assert.match(html, /two<br>a <i>bird<\/i>/, 'the italic moved with its line');
});

test('the chapter file on disk keeps the poetry paragraphs', async () => {
  const chId = await chapterFile(0);
  const file = path.join(LIB, fs.readdirSync(LIB).find((d) => d.startsWith('book-')), 'chapters', chId + '.html');
  await js('flushAllSaves && (clearTimeout(saveTimers.meta), saveMeta())');
  await js(`(() => { for (const id in saveTimers) if (id !== 'meta') { clearTimeout(saveTimers[id]); } return persistChapter(currentChapterId); })()`);
  await tick(200);
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<p class="poetry">/, 'saved as verse');
  assert.doesNotMatch(html, /<span/, 'no engine junk saved');
});

test('the outline card shows title, first line, line count and status dot', async () => {
  // give the first poem a title and a status
  await js(`(() => { book.chapterTitles[book.chapterOrder[0]] = 'Κεριά'; saveMeta(); })()`);
  await js(`NeoHooks.format('poetry').setStatus(book.chapterOrder[0], 'done')`);
  await tick(300);
  await js(`document.querySelector('.tab[data-tab="outline"]').click()`);
  await tick(400);
  const card = await js(`(() => {
    const cell = document.querySelector('.ob-cell[data-ch="' + book.chapterOrder[0] + '"] .ob-card');
    if (!cell) return null;
    const q = (s) => { const el = cell.querySelector(s); return el ? el.textContent : null; };
    return {
      title: q('.rhema-card-title'),
      line: q('.rhema-card-line'),
      count: q('.ob-words'),
      dot: !!cell.querySelector('.rhema-dot.st-done')
    };
  })()`);
  assert.ok(card, 'the poem has an outline card');
  assert.equal(card.title, 'Κεριά');
  assert.equal(card.line, '“' + L1 + '”', 'first written line, quoted');
  assert.match(card.count, /\d+ lines/, 'line count, not words');
  assert.equal(card.dot, true, 'status dot on the card');
  // the nav carries the dot too
  const navDot = await js(`!!document.querySelector('.nav-item[data-id="' + book.chapterOrder[0] + '"] .n-rhema-dot.st-done')`);
  assert.equal(navDot, true, 'status dot in the nav');
  // progress: one of two poems finished
  const chip = await js(`document.querySelector('.rhema-progress') && document.querySelector('.rhema-progress').textContent`);
  assert.match(chip, /1 of 2 poems finished/);
  await js(`document.querySelector('.tab[data-tab="manuscript"]').click()`);
  await tick(200);
});

test('deleting a poem prunes its status record', async () => {
  await js(`NeoHooks.format('poetry').setStatus(book.chapterOrder[1], 'draft')`);
  await js(`(() => { book.rhema.poems[book.chapterOrder[1]].note = 'x'; })()`); // any record
  const gone = await js(`(async () => {
    const chId = book.chapterOrder[1];
    await deleteChapterQuiet(chId);
    return !book.rhema.poems[chId];
  })()`);
  assert.equal(gone, true, 'book.rhema.poems follows the chapter out');
});

test('scraps: Alt+Shift+X cuts the line, the drawer holds it tagged, Put in returns it', async () => {
  // poem 0 stands: stanzas [L1,L2] + [L3]
  await js('currentChapterId = book.chapterOrder[0]');
  await caretInLine(0, 1, 0); // caret on the second line of the first stanza
  await key({ key: 'x', code: 'KeyX', altKey: true, shiftKey: true });
  await tick(120);
  const list = await js('RhemaScraps.list()');
  assert.equal(list.length, 1, 'the line landed in Scraps');
  assert.deepEqual(list[0].lines, [L2]);
  assert.equal(list[0].originChId, await js('book.chapterOrder[0]'), 'tagged with its poem');
  let st = await stanzasOf(0);
  assert.deepEqual(st[0].lines, [L1], 'and left the poem');
  // the drawer shows it, with the Scraps tab visible for a poem book
  assert.equal(await js('document.querySelector(\'.tab[data-tab="scraps"]\').hidden'), false);
  await js('document.querySelector(\'.tab[data-tab="scraps"]\').click()');
  await tick(200);
  const cards = await js('document.querySelectorAll("#rhema-scraps .rhema-scrap").length');
  assert.equal(cards, 1, 'the drawer lists the scrap');
  // put it back into the other stanza
  await js('document.querySelector(\'.tab[data-tab="manuscript"]\').click()');
  await tick(200);
  await js('currentChapterId = book.chapterOrder[0]');
  await caretInLine(1, 0, 0); // the stanza below
  await js('RhemaScraps.putIn(RhemaScraps.list()[0])');
  await tick(120);
  st = await stanzasOf(0);
  assert.deepEqual(st[1].lines, [L3, L2], 'the line came back under the caret');
  // and it is on disk
  const sidecar = path.join(LIB, fs.readdirSync(LIB).find((d) => d.startsWith('book-')), 'rhema-scraps.json');
  await js('flushSidecars && flushSidecars()');
  await tick(300);
  assert.ok(fs.existsSync(sidecar), 'rhema-scraps.json written');
  assert.equal(JSON.parse(fs.readFileSync(sidecar, 'utf8')).length, 1);
});

test('compare: a poem snapshot shows then/now columns and marks added words', async () => {
  await js('currentChapterId = book.chapterOrder[0]');
  const snapName = await js(`(async () => { const r = await takeSnapshot(SNAP_KEPT); return r && r.snap && r.snap.name; })()`);
  assert.ok(snapName, 'a snapshot was taken');
  await caretInLine(0, 0, 10); // mid the first line
  await type(' πικρά');
  await tick(150);
  await js(`document.querySelector('.tab[data-tab="darlings"]').click()`);
  await tick(250);
  await js(`showSnapshot(${JSON.stringify(snapName)})`);
  await tick(400);
  const cmp = await js(`(() => {
    const grid = document.querySelector('.rhema-compare-grid');
    if (!grid) return null;
    const now = grid.querySelector('.rhema-now');
    return {
      cols: grid.querySelectorAll('.rhema-compare-col').length,
      thenHasHeron: grid.querySelector('.rhema-compare-col .snap-body:not(.rhema-now)').textContent.includes('πικρά'),
      nowHasHeron: now && now.textContent.includes('πικρά'),
      added: CSS.highlights.has('rhema-snap-added') ? CSS.highlights.get('rhema-snap-added').size : 0
    };
  })()`);
  assert.ok(cmp, 'the poem snapshot went side-by-side');
  assert.equal(cmp.cols, 2, 'then and now columns');
  assert.equal(cmp.thenHasHeron, false);
  assert.equal(cmp.nowHasHeron, true);
  assert.ok(cmp.added >= 1, 'the added word is marked');
  // Geometry guard (gate lesson, 2026-10-17): take 1 probed width only, take 2
  // left translateX(-50%) unreset and the paper rendered off-screen. Require
  // the paper on-screen AND every compare paragraph's rendered line-box count
  // equal to its <br>-split line count — verse keeps its line structure.
  const geo = await js(`(() => {
    const ps = document.getElementById('paper-scroll');
    const paras = document.querySelectorAll('.rhema-compare p.poetry');
    const wrap = [];
    for (const p of paras) {
      const r = document.createRange(); r.selectNodeContents(p);
      const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
      const textLines = p.innerHTML.split('<br>').length;
      if (tops.size > textLines) wrap.push({ text: p.textContent.slice(0, 40), tops: tops.size, textLines });
    }
    return { paperLeft: Math.round(ps.getBoundingClientRect().left), paras: paras.length, wrap };
  })()`);
  assert.ok(geo.paras >= 2, 'the geometry probe saw the compare paragraphs');
  assert.ok(geo.paperLeft >= 0, 'the compare paper is on-screen (take-2 regression guard)');
  assert.deepEqual(geo.wrap, [], 'no verse line wraps inside the compare columns');
  await js(`document.querySelector('.tab[data-tab="manuscript"]').click()`);
  await tick(200);
});

test('qr mark: every poem ends with a QR in the editor, and exports carry it', async () => {
  const mark = await js(`(() => {
    const sec = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"]');
    const m = sec.querySelector(':scope > .rhema-poem-mark');
    return { has: !!m, svg: !!(m && m.querySelector('svg rect')), inBody: !!sec.querySelector('.chapter-body .rhema-poem-mark') };
  })()`);
  assert.ok(mark.has, 'the poem section ends with the mark');
  assert.ok(mark.svg, 'the mark carries a real QR');
  assert.equal(mark.inBody, false, 'and it never enters the editable text');
  // payload: the plain-text default, then the library template knob
  assert.equal(await js('RhemaQr.payload(null, "Sea", "Col", "Panos")'), 'Sea — Panos');
  await js(`library.rhema = Object.assign(library.rhema || {}, { qr: { template: 'https://onlyascii.io/{collection}/{title}' } })`);
  assert.equal(await js('RhemaQr.payload(null, "Sea", "Col", "Panos")'), 'https://onlyascii.io/Col/Sea');
  // both export builders carry the mark for a poem book
  const html = await js('buildHtml()');
  assert.ok(html.includes('rhema-poem-mark') && html.includes('<svg'), 'the PDF/HTML export carries the mark');
  const print = await js(`buildPrintHtml(bookExportData(), { trim: '5x8', fonts: '' })`);
  assert.ok(print.includes('rhema-poem-mark'), 'the chapbook print carries the mark');
});

test('qr mark: QR and drawing are declared per poem, and can each be off', async () => {
  await js('createChapterAt(storyEnd())'); // the delete test took poem 1; grow a second poem
  await tick(250);
  const ch0 = await js('book.chapterOrder[0]');
  const ch1 = await js('book.chapterOrder[1]');
  // this poem's own QR payload, independent of the library template
  await js(`(() => { if (!book.rhema) book.rhema = {}; book.rhema.poems = book.rhema.poems || {}; book.rhema.poems[${JSON.stringify(ch0)}] = Object.assign({}, book.rhema.poems[${JSON.stringify(ch0)}], { qr: 'https://poem.example/{title}' }); saveMeta(); })()`);
  await js('renderChapters()');
  await tick(200);
  assert.equal(await js(`RhemaQr.payload(${JSON.stringify(ch0)}, "Κεριά", "Col", "Panos")`), 'https://poem.example/Κεριά');
  // poem 1 still follows the library template
  assert.match(await js(`RhemaQr.payload(${JSON.stringify(ch1)}, "X", "Col", "Panos")`), /^https:\/\/onlyascii\.io\//);
  // this poem opts out of the QR entirely
  await js(`(() => { book.rhema.poems[${JSON.stringify(ch0)}].qr = 'off'; saveMeta(); })()`);
  await js('renderChapters()');
  await tick(200);
  const off = await js(`(() => {
    const m = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"] > .rhema-poem-mark');
    return { any: !!m, svg: !!(m && m.querySelector('svg')) };
  })()`);
  assert.equal(off.any, false, 'a poem with qr off and no drawing shows no mark');
  // poem 1 keeps its mark
  assert.ok(await js(`!!document.querySelector('.chapter[data-id="' + book.chapterOrder[1] + '"] > .rhema-poem-mark svg')`), 'the other poem keeps its QR');
  await js(`(() => { delete book.rhema.poems[${JSON.stringify(ch0)}].qr; saveMeta(); })()`);
});

test('qr mark: the collection drawing sits watermarked, a poem can override it', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const bookId = await js('book.id');
  const ch0 = await js('book.chapterOrder[0]');
  const dir = path.join(LIB, fs.readdirSync(LIB).find((d) => d.startsWith('book-')));
  // security review (2026-10-17): asset:set takes a one-time pick token,
  // never a renderer-supplied path — a raw path is refused outright
  const refused = await js(`window.neo.rhema.assetSet(${JSON.stringify(bookId)}, '/etc/hostname', 'collection')`);
  assert.equal(refused, null, 'a raw path is no longer trusted');
  // stage the asset the way the pick dialog leaves it: in the book folder
  fs.writeFileSync(path.join(dir, 'rhema-drawing.png'), png);
  await js(`RhemaQr.loadDrawing(${JSON.stringify(bookId)}, 'collection')`);
  await js('renderChapters()');
  await tick(250);
  const art = await js(`(() => {
    const m = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"] > .rhema-poem-mark');
    const img = m && m.querySelector('img.rhema-mark-drawing');
    return { has: !!img, faded: !!(img && /opacity:\\s*\\.35/.test(img.getAttribute('style') || '')), data: !!(img && img.src.startsWith('data:image/png')) };
  })()`);
  assert.ok(art.has && art.faded && art.data, 'the drawing shows watermarked next to the QR');
  // a poem's own drawing, declared independently (and its own file)
  fs.writeFileSync(path.join(dir, 'rhema-drawing-' + ch0 + '.png'), png);
  const own = 'rhema-drawing-' + ch0 + '.png';
  await js(`(() => { book.rhema.poems[${JSON.stringify(ch0)}] = Object.assign({}, book.rhema.poems[${JSON.stringify(ch0)}], { drawing: ${JSON.stringify(own)} }); saveMeta(); })()`);
  await js(`RhemaQr.loadDrawing(${JSON.stringify(bookId)}, ${JSON.stringify(ch0)})`);
  await js('renderChapters()');
  await tick(250);
  const both = await js(`(() => {
    const a = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"] > .rhema-poem-mark img');
    const b = document.querySelector('.chapter[data-id="' + book.chapterOrder[1] + '"] > .rhema-mark img, .chapter[data-id="' + book.chapterOrder[1] + '"] > .rhema-poem-mark img');
    return { a: !!a, b: !!b };
  })()`);
  assert.ok(both.a && both.b, 'both poems show a drawing — the poem its own, the other the collection’s');
  // and it survives a reopen (read straight from the book folder)
  const got = await js(`window.neo.rhema.assetRead(${JSON.stringify(bookId)}, 'collection')`);
  assert.ok(got && got.base64.length > 0, 'rhema-drawing.png reads back');
  const cleared = await js(`window.neo.rhema.assetClear(${JSON.stringify(bookId)}, 'collection')`);
  assert.ok(cleared);
  assert.equal(await js(`window.neo.rhema.assetRead(${JSON.stringify(bookId)}, 'collection')`), null, 'and clears');
});

test('scraps: drag a card, the poem body marks itself, the drop lands the line', async () => {
  const ok = await js(`(() => {
    const card = document.querySelector('#rhema-scraps .rhema-scrap');
    if (!card) return { err: 'no card' };
    const body = document.querySelector('.chapter[data-id="' + book.chapterOrder[1] + '"] .chapter-body');
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    if (!dt.getData('application/x-rhema-scrap')) return { err: 'dragstart set nothing' };
    const p = body.querySelector('p'); // a fresh poem may still hold a plain <p> until synced
    const r = p.getBoundingClientRect();
    const x = Math.max(r.left + 5, 1), y = Math.max(r.top + 2, 1);
    body.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }));
    const marked = body.classList.contains('rhema-drop-target');
    body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }));
    return { marked };
  })()`);
  assert.ok(!ok.err, ok.err || 'drag ran');
  assert.ok(ok.marked, 'dragover marks the poem body as a drop target');
  await tick(150);
  const st = await stanzasOf(1);
  const flat = st.map((s) => s.lines).flat();
  assert.ok(flat.includes(L2), 'the dropped scrap line landed in the other poem');
  assert.equal(await js(`document.querySelector('.chapter[data-id="' + book.chapterOrder[1] + '"] .chapter-body').classList.contains('rhema-drop-target')`), false, 'the marker clears on drop');
});

test('⌘Z undoes a line move and a scrap cut (structural undo coverage)', async () => {
  await js(`(() => { chapterHTML[book.chapterOrder[0]] = '<p class="poetry">a<br>b<br>c</p>'; currentChapterId = book.chapterOrder[0]; renderChapters(); })()`);
  await tick(150);
  await caretInLine(0, 2, 1);
  await key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true });
  await tick(120);
  let st = await stanzasOf(0);
  assert.deepEqual(st[0].lines, ['a', 'c', 'b'], 'the move happened');
  await key({ key: 'z', code: 'KeyZ', ctrlKey: true });
  await tick(150);
  st = await stanzasOf(0);
  assert.deepEqual(st[0].lines, ['a', 'b', 'c'], '⌘Z undid the line move');
  await caretInLine(0, 1, 0);
  await key({ key: 'x', code: 'KeyX', altKey: true, shiftKey: true });
  await tick(150);
  st = await stanzasOf(0);
  assert.deepEqual(st[0].lines, ['a', 'c'], 'the cut took the line');
  await key({ key: 'z', code: 'KeyZ', ctrlKey: true });
  await tick(150);
  st = await stanzasOf(0);
  assert.deepEqual(st[0].lines, ['a', 'b', 'c'], '⌘Z undid the scrap cut');
});

test('status: clearing a poem\'s status removes its record', async () => {
  const ch = await js('book.chapterOrder[0]');
  await js(`NeoHooks.format('poetry').setStatus(${JSON.stringify(ch)}, 'fair')`);
  assert.equal(await js(`NeoHooks.format('poetry').getStatus(${JSON.stringify(ch)})`), 'fair');
  await js(`NeoHooks.format('poetry').setStatus(${JSON.stringify(ch)}, '')`);
  assert.equal(await js(`NeoHooks.format('poetry').getStatus(${JSON.stringify(ch)})`), '');
  // the record loses the status key; other per-poem keys (drawing) stay
  assert.equal(await js(`!book.rhema.poems[${JSON.stringify(ch)}] || !('status' in book.rhema.poems[${JSON.stringify(ch)}])`), true, 'the status key is gone, not blanked');
});

test('the drawing is there on first open — no explicit load (bookOpened race fix)', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const bookId = await js('book.id');
  const dir = path.join(LIB, fs.readdirSync(LIB).find((d) => d.startsWith('book-')));
  fs.writeFileSync(path.join(dir, 'rhema-drawing.png'), png);
  await js('backToShelf()');
  await tick(300);
  await js(`openBook(${JSON.stringify(bookId)})`);
  await tick(700); // the async asset load + the re-render it triggers
  const art = await js(`(() => {
    const m = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"] > .rhema-poem-mark');
    return !!(m && m.querySelector('img.rhema-mark-drawing'));
  })()`);
  assert.ok(art, 'the mark carries the drawing after a plain reopen');
});

test('a novel still gets NEO\'s Enter rhythm (anchors change nothing)', async () => {
  await js(`(async () => {
    await addImportedBooks([{ name: 'A Novel', chapters: [{ title: 'One', paras: [{ text: 'Prose here.' }, { text: 'More prose.' }] }] }], library.shelves[0]);
    const ids = library.shelves[0].bookIds;
    await openBook(ids[ids.length - 1]);
  })()`);
  await tick(500);
  assert.equal(await js('poemBook()'), false);
  assert.equal(await js('document.querySelectorAll(".rhema-poem-mark").length'), 0, 'a novel gets no poem mark');
  assert.ok(!(await js('buildHtml()')).includes('rhema-poem-mark'), 'and no poem mark in a novel export');
  await caretToEnd();
  await enter(); await tick();
  await enter(); await tick();
  const cls = await js(`Array.from(document.querySelector('.chapter[data-id="' + (${CHID}) + '"] .chapter-body').children).map((p) => p.className)`);
  assert.ok(cls.includes('scene-break'), 'double Enter still makes a section break in prose');
  // Leak guard: after a poem's compare view has been open, a NOVEL's snapshot
  // view must get no compare chrome and keep NEO's stacked layout.
  await js(`document.querySelector('.tab[data-tab="darlings"]').click()`);
  await tick(250);
  const nsnap = await js(`(async () => { const r = await takeSnapshot(SNAP_KEPT); return r && r.snap && r.snap.name; })()`);
  assert.ok(nsnap, 'the novel snapshot was taken');
  await js(`showSnapshot(${JSON.stringify(nsnap)})`);
  await tick(400);
  assert.equal(await js('document.querySelectorAll(".rhema-compare, .rhema-compare-grid").length'), 0, 'a novel snapshot gets no compare chrome');
  await js(`document.querySelector('.tab[data-tab="manuscript"]').click()`);
  await tick(200);
});

test('poem chrome: chapter words become poem words in the open book, and back on the shelf', async () => {
  const poemId = await js(`(async () => { const id = library.shelves[0].bookIds[0]; await openBook(id); return id; })()`);
  await tick(600);
  assert.equal(await js('poemBook()'), true);
  assert.equal(await js(`chapterName(book.chapterOrder[0])`), 'Poem 1', 'the unit is a poem');
  assert.equal(await js(`t('Chapters')`), 'Poems', 'the nav header follows');
  assert.equal(await js(`t('+ Chapter')`), '+ Poem', 'the add card follows');
  assert.equal(await js(`t('chapter {ch} of {total}', { ch: 1, total: 2 })`), 'poem 1 of 2', 'the footer follows');
  assert.equal(await js(`document.querySelector('#nav-add [data-i18n]').textContent`), 'Poem');
  assert.ok(!(await js(`buildHtml()`)).includes('Chapter 1'), 'exports say Poem too');
  await js('backToShelf()');
  await tick(300);
  assert.equal(await js(`t('Chapters')`), 'Chapters', 'the shelf keeps NEO\'s words');
  assert.equal(await js(`t('Chapter {n}', { n: 3 })`), 'Chapter 3');
});

test('import: a real .txt of two Kavafis poems becomes a poem collection, lines kept', async () => {
  const fp = path.join(tmp, 'imported-poems.txt');
  fs.writeFileSync(fp, [
    '# Κεριά',
    L1, L2, '', L3, '', '',
    '# Η πόλις',
    'Σαράντα χρόνια θα περάσουν στη ζωή σου',
    'κι άλλες πόλεις δεν θα βρεις παρά τις πόλεις.'
  ].join('\n') + '\n');
  // the picker is a dialog; answer it with the file we just wrote
  pickedFiles = [fp]; // the patched picker answers with the file we just wrote
  await js(`NeoHooks.format('poetry').importPoems()`);
  await tick(600);
  const ids = await js('library.shelves[0].bookIds.slice()');
  const newId = ids[ids.length - 1];
  assert.equal(await js(`(async () => (await window.neo.readBookMeta(${JSON.stringify(newId)})).format)()`), 'poetry', 'the imported book is a poem collection');
  assert.equal(await js(`(async () => (await window.neo.readBookMeta(${JSON.stringify(newId)})).chapterOrder.length)()`), 2, 'two poems, split at the markdown headings');
  await js(`openBook(${JSON.stringify(newId)})`);
  await tick(500);
  assert.equal(await js('poemBook()'), true);
  const st = await stanzasOf(0);
  assert.equal(st.length, 2, 'the blank line kept the stanza break');
  assert.deepEqual(st[0].lines, [L1, L2], 'the verse lines survived as one stanza');
  assert.equal(st[0].cls, 'poetry');
  assert.equal(await js(`book.chapterTitles[book.chapterOrder[0]]`), 'Κεριά', 'the heading became the poem title');
  assert.equal(await js(`document.querySelectorAll('.chapter[data-id="' + book.chapterOrder[0] + '"] > .rhema-poem-mark').length`), 1, 'the imported poem carries its mark');
});

test('export: verse survives md, txt and EPUB; the chapbook opens at 5×8', async () => {
  const md = await js('buildMd()');
  assert.ok(md.includes('> ' + L1 + '  \n> ' + L2), 'markdown keeps the line with a hard break and a continuing quote');
  const txt = await js('buildTxt()');
  assert.ok(txt.includes(L1 + '\n' + L2), 'plain text keeps the lines');
  const entries = await js('buildEpubEntries()');
  const chs = JSON.parse(JSON.stringify(entries.filter((e) => /^OEBPS\/ch\d+\.xhtml$/.test(e.path)).map((e) => e.content)));
  assert.ok(chs.some((c) => c.includes('<br/>')), 'the EPUB chapter keeps the soft line break');
  assert.ok(chs.some((c) => c.includes('class="poetry"')), 'and the poetry class the EPUB CSS styles');
  assert.ok(chs.some((c) => c.includes('rhema-poem-mark')), 'and the poem mark rides into the EPUB');
  assert.ok(chs.every((c) => !/<img[^>]*[^/]>/.test(c)), 'the mark is XHTML: no unclosed <img>');
  // the chapbook preset: a poem book opens the paperback dialog at 5x8
  const trimSel = await js(`(async () => {
    printPaperback(); // opens the dialog; we read it and cancel
    // the dialog opens after flushAllSaves + the shelf scan: poll, don't guess
    let sel = null;
    for (let i = 0; i < 40 && !sel; i++) {
      await new Promise((r) => setTimeout(r, 100));
      sel = document.querySelector('.print-modal [data-trim].sel');
    }
    const id = sel ? sel.dataset.trim : null;
    const cancel = document.querySelector('.print-modal .m-cancel');
    if (cancel) cancel.click();
    await new Promise((r) => setTimeout(r, 200));
    return id;
  })()`);
  assert.equal(trimSel, '5x8', 'the chapbook dialog opens at 5 × 8 for a poem book');
});

test('import into an open collection: the shelf card menu path', async () => {
  const fp = path.join(tmp, 'one-more.txt');
  fs.writeFileSync(fp, '# Το πλεονέκτημα\nΜια λέξη μόνο.\n');
  const before = await js('library.shelves[0].bookIds.length');
  pickedFiles = [fp]; /* RHEMA — the patched picker (see top of file) */
  const colId = await js('library.shelves[0].bookIds[library.shelves[0].bookIds.length - 1]');
  // the real card path: the hook answers the choice (fire-and-forget), so
  // poll for the result instead of guessing a tick
  await js(`(async () => { const meta = await shelfMeta(${JSON.stringify(colId)}); await NeoHooks.emit('shelfCardChoice', meta, 'rhemaImportPoems'); })()`);
  let joined = 2;
  for (let i = 0; i < 30 && joined < 3; i++) {
    await tick(100);
    joined = await js(`(async () => (await window.neo.readBookMeta(${JSON.stringify(colId)})).chapterOrder.length)()`);
  }
  assert.equal(await js('library.shelves[0].bookIds.length'), before, 'no new collection was made');
  assert.equal(joined, 3, 'the poem joined the collection');
});

test('import: the in-book Import… keeps verse for a poem book (the app.js seam)', async () => {
  // importChaptersIntoBook's poemBook() branch: the file's poems join the
  // OPEN book as stanzas + soft breaks, not as prose paragraphs
  const fp = path.join(tmp, 'inbook.txt');
  fs.writeFileSync(fp, '# Σέσαμο\n' + L1 + '\n' + L2 + '\n');
  pickedFiles = [fp];
  const before = await js('book.chapterOrder.length');
  await js(`(() => { importChapters(); return true; })()`);
  await tick(900);
  assert.equal(await js('book.chapterOrder.length'), before + 1, 'the poem joined the open book');
  const st = await stanzasOf(before);
  assert.equal(st[0].cls, 'poetry', 'verse, not prose paragraphs');
  assert.deepEqual(st[0].lines, [L1, L2], 'the lines survived as one stanza');
});

test('chapbook: a real 5x8 PDF renders with the verse, the mark, and 5x8 pages', async () => {
  // the footnotes.e2e paperback pattern: answer the save dialog from main,
  // click Make PDFs, wait for the file (Paged.js lays it out in the print window)
  const until = async (fn, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn()) return true; await tick(200); }
    return false;
  };
  const to = path.join(tmp, 'chapbook-5x8.pdf');
  try { fs.unlinkSync(to); } catch { /* new */ }
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: to });
  await js(`(() => { window.__pb = printPaperback(); })()`);
  assert.ok(await until(() => js(`!!document.querySelector('.modal-backdrop .m-ok')`), 15000), 'the chapbook dialog opened');
  await js(`document.querySelector('.modal-backdrop .m-ok').click()`);
  assert.ok(await until(() => fs.existsSync(to) && fs.statSync(to).size > 0), 'the chapbook PDF was written');
  const info = require('node:child_process').execFileSync('pdfinfo', [to]).toString();
  assert.match(info, /Page size:\s+360 x 576 pts/, '5 x 8 in: 360x576 pt pages');
  const text = require('node:child_process').execFileSync('pdftotext', [to, '-']).toString();
  assert.ok(text.includes(L1), 'the Kavafis verse is in the printed book');
  // the cover template rides along (coding review coverage note)
  const cover = to.replace(/\.pdf$/i, '') + ' - cover template.pdf';
  assert.ok(fs.existsSync(cover) && fs.statSync(cover).size > 0, 'the cover template was written');
  // the poem mark: the QR renders as vector paths; the mark div carries the class
  const html = await js(`buildPrintHtml(bookExportData(), { trim: '5x8', paper: 'white', links: {}, alsoByText: '', reviewText: '', reviewWords: '' })`);
  assert.ok(html.includes('rhema-poem-mark'), 'the print HTML carries the poem mark');
  assert.ok(!html.includes('class="ch-num"'), 'a titled poem prints its title alone — no POEM n label (UX gate)');
  assert.ok(html.includes('class="poetry" style="margin-top:0.9em"'), 'the second stanza of a poem carries the widened stanza gap inline (UX round 2)');
  await js(`(async () => { try { await window.__pb; } catch {} })()`); // settle the job
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    wc.on('console-message', (a, b, c, d, e2) => {
      const det = typeof b === 'object' ? b : { level: b, message: c, sourceId: e2 };
      const lvl = det.level;
      if (lvl === 2 || lvl === 3 || lvl === 'error' || lvl === 'warning') console.log('[renderer]', det.message, '@', det.sourceId);
    });
    while (!(await js(`typeof library !== 'undefined' && !!library && typeof library.moreFeatures === 'boolean'`).catch(() => false))) await tick(50);
    await tick(300);
    win.focus();
    // Pin the layout viewport: Hyprland tiles the harness window and ignores
    // setBounds, so the geometry assertions below need a known width. (Gate
    // lesson 2026-10-17: the compare-view wrap BLOCKER regressed twice because
    // probes measured at whatever size the WM happened to give.)
    try {
      wc.debugger.attach('1.3');
      dbg = wc.debugger;
      await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    } catch (err) { console.log('[harness] debugger unavailable, falling back to execCommand:', err.message); }
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
