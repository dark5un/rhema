// Site screenshot harness (W6, rhema.guide tutorials) — derived from the
// proven poetry.e2e.js setup (2026-10-17 pattern: bolt shot() onto a proven
// suite; never write a standalone screenshot script). Drives the app through
// the states the new tutorials teach and captures each at 1700x1100.
// Run:  SITE_LANG=en NEO_SHOTS=<dir> xvfb-run -a node scripts/site-shots.tmp.js
//       SITE_LANG=el NEO_SHOTS=<dir> xvfb-run -a node scripts/site-shots.tmp.js
'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const LANG = process.env.SITE_LANG === 'el' ? 'el' : 'en';
const SHOTS = process.env.NEO_SHOTS;
if (!SHOTS) { console.error('set NEO_SHOTS=<dir>'); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `site-shots-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({ uiLanguage: LANG, window: { width: 1700, height: 1100, x: 0, y: 0 } }));
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
// RHEMA — Hyprland tiles/replaces the size of MAPPED Wayland windows
// (1271px observed; setBounds is a request the compositor ignores). Hide the
// window first: an unmapped surface keeps the size Electron was given, and
// capturePage works on hidden windows.

// --- mock OpenAI-compatible endpoint (Reader's Eye / titles only; the
// screenshots show the UI, the canned answers are fixture text) ---
const PORT = 31999;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.endsWith('/models')) return send({ data: [{ id: 'mock-poet' }] });
    if (req.url.endsWith('/chat/completions')) {
      let sys = '';
      try { sys = JSON.parse(body).messages[0].content; } catch {}
      const content = sys.includes('first reader')
        ? '1. Η εικόνα «σειρά κεράκια αναμμένα» κρατά τη στροφή.\n2. Το «χρυσά, ζεστά, και ζωηρά» επιβραδύνει σωστά τον ρυθμό.\n3. Ο τίτλος «Κεριά» ακούγεται μετά το τέλος — καλή κίνηση.'
        : 'Σειρά κεράκια\nΧρυσά κεράκια\nΤου μέλλοντος μέρες\nΖεστά φώτα\nΕμπροστά μας';
      return send({ choices: [{ message: { role: 'assistant', content } }] });
    }
    send({});
  });
});
server.listen(PORT, '127.0.0.1');

require('../main.js');

let wc;
let dbg = null;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (name) => {
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(SHOTS, `${name}-${LANG}.png`), img.toPNG());
  console.log('shot', name, LANG);
};
const safe = async (label, fn) => {
  try { await fn(); } catch (err) { console.error('SKIP', label, err.message); }
};

app.whenReady().then(async () => {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0] || await new Promise((resolve) => app.once('browser-window-created', (_e, w) => resolve(w)));
  wc = win.webContents;
  await new Promise((resolve) => wc.once('did-finish-load', resolve));
  // poll for the compositor to settle at 1700x1100 (a float+size rule must
  // be applied externally or by the sizing helper below)
  let iw = 0;
  for (let i = 0; i < 60; i++) {
    iw = await js('innerWidth');
    if (iw >= 1600) break;
    await tick(500);
  }
  console.log('window innerWidth:', iw, 'bounds:', JSON.stringify(win.getBounds()), 'visible:', win.isVisible());
  if (iw < 1600) { console.error('window too small — abort'); app.exit(2); }
  for (let i = 0; i < 50 && !(await js('typeof RhemaSettings !== "undefined" && typeof book !== "undefined"')); i++) await tick(100);
  try {
    dbg = wc.debugger;
    await dbg.attach();
  } catch {}

  // --- fixture: import two Kavafis poems (the proven poetry.e2e.js path) ---
  const { dialog } = require('electron');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(tmp, 'imported-poems.txt')] });
  fs.writeFileSync(path.join(tmp, 'imported-poems.txt'), [
    '# Κεριά',
    'Του μέλλοντος οι μέρες στέκοντ’ εμπροστά μας',
    'σα μια σειρά κεράκια αναμμένα —',
    '',
    'χρυσά, ζεστά, και ζωηρά κεράκια.',
    '',
    '',
    '# Η πόλις',
    'Σαράντα χρόνια θα περάσουν στη ζωή σου',
    'κι άλλες πόλεις δεν θα βρεις παρά τις πόλεις.'
  ].join('\n') + '\n');
  await js(`NeoHooks.format('poetry').importPoems()`);
  await tick(700);
  const ids = await js('library.shelves[0].bookIds.slice()');
  const bookId = ids[ids.length - 1];
  assert.ok(bookId, 'imported book exists');
  await js(`openBook(${JSON.stringify(bookId)})`);
  await tick(600);
  assert.equal(await js('poemBook()'), true, 'poem book open');

  // 09: the Rhema Settings pane (AI section top)
  await safe('ai-pane', async () => {
    await js('RhemaSettings.open()');
    await tick(300);
    await shot('09-ai-pane');
  });

  // 10: the pane with every advanced section open
  await safe('ai-pane-advanced', async () => {
    await js('[...document.querySelectorAll("details")].forEach(d => d.open = true)');
    await tick(200);
    await shot('10-ai-pane-advanced');
    // fill the text endpoint with the mock and save (proven rhema-settings.e2e.js path)
    await js(`(() => {
      const set = (id, v) => { const el = document.querySelector('#' + id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('ra-base', 'http://127.0.0.1:${PORT}/v1');
      set('ra-model', 'mock-poet');
      document.querySelector('.m-ok').click();
    })()`);
    await tick(400);
  });

  // 11: File → Cover Art… pane
  await safe('cover-pane', async () => {
    await js('openCoverArt()');
    await tick(400);
    await shot('11-cover-pane');
    await js('document.querySelector(".m-ok") && document.querySelector(".m-ok").click()');
    await tick(200);
  });

  // 12: Reader's Eye filed into the Notes tab (mock endpoint)
  await safe('readers-eye', async () => {
    await js('currentChapterId = currentChapterId || book.chapterOrder[0]'); // openBook alone leaves it unset (poetry.e2e.js sets it explicitly)
    const chId = await js('currentChapterId');
    await js(`RhemaPoemAi.readersEye(${JSON.stringify(chId)})`);
    for (let i = 0; i < 40; i++) {
      const filed = await js(`(book.chapterNotes[${JSON.stringify(chId)}] || '').includes('Reader') || (book.chapterNotes[${JSON.stringify(chId)}] || '').includes('Ρήμα')`);
      if (filed) break;
      await tick(250);
    }
    await js('document.querySelector(\'.tab[data-tab="notes"]\').click()');
    await tick(300);
    await js(`openNotesPage(${JSON.stringify(chId)})`); // open the CHAPTER's notes page, where the observations land
    await tick(400);
    console.log('EYE-DEBUG', await js(`JSON.stringify({
      notesPage: notesPage, chId: currentChapterId,
      stored: ((book.chapterNotes || {})[currentChapterId] || '').slice(0, 60),
      outline: (() => { const el = document.querySelector('#notes-outline');
        if (!el) return 'missing';
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          hidden: el.hidden, display: cs.display, opacity: cs.opacity, whiteSpace: cs.whiteSpace };
      })(),
      auxTitle: document.querySelector('#aux-title') && document.querySelector('#aux-title').textContent
    })`));
    await shot('12-readers-eye');
    await js('document.querySelector(\'.tab[data-tab="manuscript"]\').click()');
    await tick(200);
  });

  // 13: View → Keyboard Shortcuts…
  await safe('shortcuts', async () => {
    await js('showHelp()');
    await tick(400);
    await shot('13-shortcuts');
    await js('document.querySelector(".m-ok") && document.querySelector(".m-ok").click()');
    await tick(200);
  });

  // 14: Focus Mode (sentence)
  await safe('focus', async () => {
    await js('setFocus("sentence")');
    await tick(300);
    await shot('14-focus');
    await js('setFocus("off")');
    await tick(150);
  });

  // 15: Darlings tab with a snapshot
  await safe('darlings', async () => {
    await js('takeSnapshot(SNAP_KEPT)');
    await tick(400);
    await js('document.querySelector(\'.tab[data-tab="darlings"]\').click()');
    await tick(400);
    await shot('15-darlings');
    await js('document.querySelector(\'.tab[data-tab="manuscript"]\').click()');
    await tick(200);
  });

  // 16: the shelf (library organisation)
  await safe('shelf', async () => {
    await js('document.getElementById("back-to-shelf").click()');
    await tick(500);
    await shot('16-shelf');
  });

  server.close();
  console.log('done', LANG);
  app.exit(0);
}).catch((err) => { console.error(err); server.close(); app.exit(1); });
