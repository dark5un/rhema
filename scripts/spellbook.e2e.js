// End-to-end test for Stone 19/20 (Phase 6): the book's language set.
// The picker opens from the real Edit → "This book's languages…" message,
// saves book.spellLanguages to book.json, and the real Hunspell worker
// union-accepts: a correctly spelled Greek word and a correctly spelled
// English word both pass under ['el','en-US'] while a French word is
// flagged — and the same Greek word IS flagged in a book that declares
// nothing (the library default, en-US, governs). Quote style follows the
// book's primary, never the interface. Run with `npm run test:spellbook`.

'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-spellbook-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-spellbook-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
// RHEMA — this suite pins the UI language to English for determinism; it reads English strings
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

let wc;
let dbg = null;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const type = async (s) => {
  if (dbg) await dbg.sendCommand('Input.insertText', { text: s });
  else await js(`document.execCommand('insertText', false, ${JSON.stringify(s)})`);
  await js('enterRun = 0');
};
const flagged = () => js(`[...(CSS.highlights.get('neo-spell') || [])].map((r) => r.toString())`);
const waitFlagged = async (want, ms = 6000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const f = await flagged();
    if (f.includes(want)) return f;
    await tick(100);
  }
  assert.fail(`never flagged: ${want} (saw: ${JSON.stringify(await flagged())}; synced: ${await js('rhemaSpellSynced')}; body: ${JSON.stringify((await js(`document.querySelector('.chapter .chapter-body').textContent`)).slice(0, 60))})`);
};
const settle = async (ms = 800) => {
  const until = Date.now() + ms;
  let last = null;
  while (Date.now() < until) {
    const f = await flagged();
    if (last && JSON.stringify(f) === JSON.stringify(last)) return f;
    last = f;
    await tick(150);
  }
  return last;
};
// Gate round-1 (coding BLOCKER): settle() returns the first two IDENTICAL
// samples — if the marks are stable before an async dictionary load +
// rescan lands, it hands back the OLD marks. When a test changes the
// book's language set, wait for the expected marks, not for stability.
const waitFlags = async (pred, ms = 8000) => {
  const until = Date.now() + ms;
  let f = [];
  while (Date.now() < until) {
    f = await flagged();
    if (pred(f)) return f;
    await tick(150);
  }
  return f;
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const focusBody = async () => js(`(() => { const b = document.querySelector('.chapter .chapter-body'); b.focus();
    const r = document.createRange(); r.selectNodeContents(b); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r); currentChapterId = book.chapterOrder[0]; return true; })()`);
const typeInto = async (s) => {
  await focusBody();
  await type(s);
  // the text must actually be in the editor before any scan is judged
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    if (await js(`document.querySelector('.chapter .chapter-body').textContent.includes(${JSON.stringify(s.trim())})`)) return;
    await focusBody(); await type(s); await tick(150);
  }
  assert.fail('typing never landed in the editor');
};

test('a poem collection opens, spellcheck is on, and the default set is en-US', async () => {
  await js(`RhemaPoetry.createOnShelf(library.shelves[0])`);
  await tick(500);
  assert.equal(await js('poemBook()'), true);
  await js('if (!spellOn) toggleSpellcheck()');
  assert.equal(await js('spellOn'), true);
  // focus the chapter and type a trilingual line
  await typeInto('καλημέρα poem bonjour');
  // en-US only: the Greek word is flagged (no false comfort), French too
  await waitFlagged('καλημέρα');
  const f = await settle();
  assert.ok(f.includes('καλημέρα'), 'Greek flagged under the en-US default');
  assert.ok(f.includes('bonjour'), 'French flagged under the en-US default');
  assert.ok(!f.includes('poem'), 'English passes');
});

test('the picker opens from the Edit menu message and saves the book set', async () => {
  wc.send('menu', { type: 'bookSpellLanguages' });
  const until = Date.now() + 4000;
  while (Date.now() < until && !(await js('!!document.querySelector(".sb-picker #sb-primary")'))) await tick(100);
  assert.ok(await js('!!document.querySelector(".sb-picker #sb-primary")'), 'the picker modal opened');
  // primary el, also accept en-US
  await js(`(() => { const s = document.querySelector('#sb-primary'); s.value = 'el'; s.dispatchEvent(new Event('change'));
    const box = [...document.querySelectorAll('#sb-also input')].find((i) => i.dataset.code === 'en-US');
    box.checked = true; })()`);
  await js(`document.querySelector('.sb-picker .m-save').click()`);
  const gone = Date.now() + 12000; // saveMeta flushes dirty chapters (debounced) before resolving
  while (Date.now() < gone && (await js('!!document.querySelector(".sb-picker")'))) await tick(100);
  if (await js('!!document.querySelector(".sb-picker")'))
    console.log('DEBUG backdrops:', await js(`document.querySelectorAll('.modal-backdrop').length`),
      'titles:', await js(`[...document.querySelectorAll('.modal-backdrop h2')].map((h) => h.textContent)`));
  assert.ok(!(await js('!!document.querySelector(".sb-picker")')), 'modal closed');
  // book.json on disk carries the declaration, primary first
  const bookId = await js('book.id');
  const meta = JSON.parse(fs.readFileSync(path.join(LIB, bookId, 'book.json'), 'utf8'));
  assert.deepEqual(meta.spellLanguages, ['el', 'en-US']);
});

test('union-acceptance: Greek and English pass, French is still flagged', async () => {
  // the save rescanned; wait for the NEW set's marks (gate round-1: not
  // for mark-stability — the old marks were already stable)
  const f = await waitFlags((x) => !x.includes('καλημέρα') && !x.includes('poem') && x.includes('bonjour'));
  assert.ok(!f.includes('καλημέρα'), 'Greek accepted by the el dictionary');
  assert.ok(!f.includes('poem'), 'English accepted by the en-US dictionary');
  assert.ok(f.includes('bonjour'), 'French is not in the set — flagged, honestly');
});

test('the Edit menu really carries the picker entry', () => {
  const menu = Menu.getApplicationMenu();
  const edit = menu.items.find((i) => i.submenu && i.submenu.items.some((s) => s.label === "This book's languages…"));
  assert.ok(edit, 'an Edit submenu holds "This book\'s languages…" (the guide\'s path exists)');
});

test('the book primary drives quote style, not the English interface', async () => {
  assert.equal(await js('writingLanguage()'), 'el');
  assert.equal(await js('quoteStyle().open'), '«');
});

test('a second book that declares nothing inherits the library default', async () => {
  const firstId = await js('book.id');
  await js(`RhemaPoetry.createOnShelf(library.shelves[0])`);
  const until = Date.now() + 4000;
  while (Date.now() < until && (await js('book.id')) === firstId) await tick(100);
  assert.notEqual(await js('book.id'), firstId, 'the new collection is the open book');
  await typeInto('καλημέρα poem');
  await waitFlagged('καλημέρα');
  const f = await settle();
  assert.ok(f.includes('καλημέρα'), 'the new book inherits en-US: Greek flagged again');
  assert.ok(!f.includes('poem'));
  assert.equal(await js('writingLanguage()'), 'en-US');
});

test('learning a word quiets it in every declared language', async () => {
  // back to the bilingual book
  const ids = await js('library.shelves[0].bookIds.slice()');
  await js(`openBook(${JSON.stringify(ids[0])})`);
  const until = Date.now() + 4000;
  while (Date.now() < until && (await js('book.id')) !== ids[0]) await tick(100);
  assert.equal(await js('book.id'), ids[0]);
  await typeInto(' μπλαχμπλαχ');
  await waitFlagged('μπλαχμπλαχ');
  await js(`window.neo.spellLearn('μπλαχμπλαχ')`);
  await js('rhemaRescanSpelling()');
  const f = await settle();
  assert.ok(!f.includes('μπλαχμπλαχ'), 'learned word passes under the bilingual set');
});

(async () => {
  app.whenReady().then(async () => {
    const w = BrowserWindow.getAllWindows()[0];
    wc = w.webContents;
    try { dbg = wc.debugger; await dbg.attach('1.3'); await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }); } catch { dbg = null; }
    let failed = 0;
    for (const { name, fn } of tests) {
      try { await fn(); console.log('ok   ' + name); }
      catch (err) { failed++; console.log('FAIL ' + name + '\n     ' + (err.stack || err).split('\n').slice(0, 4).join('\n     ')); }
    }
    console.log(`${tests.length - failed} passed, ${failed} failed`);
    app.exit(failed ? 1 : 0);
  });
})();
