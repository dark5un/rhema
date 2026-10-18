// Site screenshot harness (rhema website plan §4): renders the poetry UX with
// real Kavafis verse and captures the site's screenshot matrix. Throwaway UI
// driving is fine here — this is a capture tool, not a test — but every state
// it visits is one a proven e2e suite already reaches.
//
// Usage:  UI_LANG=en THEME=night node-capture scripts/site-shots.js OUT_DIR
//         (run via: electron scripts/site-shots.js OUT_DIR)
// Env:    UI_LANG = en|el   (interface language)   THEME = night|light
// Output: OUT_DIR/{NN}-{state}-{lang}-{theme}.png  + PROBE lines (DOM checks)
'use strict';
const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

const UI = process.env.UI_LANG || 'en';
const THEME = process.env.THEME || 'night';
const OUT = process.argv[2] || '.';
const ROOT = path.resolve(__dirname, '..');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^rhema-site-shots-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `rhema-site-shots-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({ uiLanguage: UI }));
app.setPath('documents', tmp);
const LIB = path.join(tmp, 'Rhema Library'); fs.mkdirSync(LIB);
fs.writeFileSync(path.join(LIB, 'library.json'), JSON.stringify({
  authorName: UI === 'el' ? 'Κ. Π. Καβάφης' : 'C. P. Cavafy',
  penNames: [], firstRunDone: true, moreFeatures: true,
  pageTheme: THEME, hintShown: true,
  shelves: [{ id: 's1', name: UI === 'el' ? 'Ποιήματα' : 'Poems', bookIds: [] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (f, o) { return loadFile.call(this, path.resolve(ROOT, f), o); };
require(path.join(ROOT, 'main.js'));

// Kavafis public-domain fixtures (the same poems the e2e suites use).
const KERIA = [
  ["Του μέλλοντος οι μέρες στέκοντ' εμπροστά μας", "σα μια σειρά κεράκια αναμμένα —", "χρυσά, ζεστά, και ζωηρά κεράκια."],
  ["Οι περασμένες μέρες πίσω μένουν,", "μια θλιβερή γραμμή κεριών σβησμένων·", "τα πιο κοντά βγάζουν καπνόν ακόμη,", "κρύα κεριά, λιωμένα, και κυρτά."],
  ["Δεν θέλω να τα βλέπω· με λυπεί η μορφή των,", "και με λυπεί το πρώτο φως των να θυμούμαι.", "Εμπρός κοιτάζω τ' αναμμένα μου κεριά."],
  ["Δεν θέλω να γυρίσω να μη διω και φρίξω", "τί γρήγορα που η σκοτεινή γραμμή μακραίνει,", "τί γρήγορα που τα σβηστά κεριά πληθαίνουν."]
];
const POLI = [
  ["Είπες· «Θα πάγω σ' άλλη γη, θα πάγω σ' άλλη θάλασσα.", "Μια πόλις άλλη θα βρεθεί καλλίτερη από αυτή.", "Κάθε προσπάθεια μου μια καταδίκη είναι γραφτή·", "κ' είν' η καρδιά μου — σαν νεκρός — θαμένη.", "Ο νους μου ως πότε μες στον μαρασμόν αυτόν θα μένει.", "Όπου το μάτι μου γυρίσω, όπου κι αν δω", "ερείπια μαύρα της ζωής μου βλέπω εδώ,", "που τόσα χρόνια πέρασα και ρήμαξα και χάλασα.»"],
  ["Καινούριους τόπους δεν θα βρεις, δεν θάβρεις άλλες θάλασσες.", "Η πόλις θα σε ακολουθεί. Στους δρόμους θα γυρνάς τους ίδιους.", "Και στες γειτονιές τες ίδιες θα γερνάς·", "και μες στα ίδια σπίτια αυτά θ' ασπρίζεις.", "Πάντα στην πόλι αυτή θα φθάνεις.", "Για τα αλλού — μη ελπίζεις — δεν έχει πλοίο για σε, δεν έχει οδό.", "Έτσι που τη ζωή σου ρήμαξες εδώ στην κώχη τούτη την μικρή,", "σ' όλην την γη την χάλασες."]
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const poemHtml = (stanzas) => stanzas.map((st) => `<p class="poetry">${st.map(esc).join('<br>')}</p>`).join('');

let wc, dbg = null;
const js = (c) => wc.executeJavaScript(c, true);
const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  if (!dbg) throw new Error('no debugger attached — cannot capture');
  const img = await dbg.sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}-${UI}-${THEME}.png`), Buffer.from(img.data, 'base64'));
  console.log('shot', `${name}-${UI}-${THEME}.png`);
}
// DOM probe: the UI must speak UI_LANG. Vision garbles Greek text; the DOM
// does not. Every expected label must appear somewhere in the document.
async function probe(label, expect) {
  const found = await js(`(() => {
    const want = ${JSON.stringify(expect)};
    const text = document.body.textContent;
    return want.filter((w) => !text.includes(w));
  })()`);
  assert.deepEqual(found, [], `probe "${label}": missing UI strings for ${UI}: ${JSON.stringify(found)}`);
  console.log('PROBE ok', label, UI, THEME);
}
const elLocale = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/el.json'), 'utf8'));
const t = (k) => (UI === 'el' ? elLocale[k] : k);

async function main() {
  await app.whenReady();
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
  win.setContentSize(1700, 1100);
  wc = win.webContents;
  try { dbg = wc.debugger; await dbg.attach('1.3'); await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1100, deviceScaleFactor: 1, mobile: false }); } catch { dbg = null; }
  while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
  await tick(400);
  await js(`RhemaPoetry.createOnShelf(library.shelves[0])`);
  await tick(600);
  await js(`(() => { book.title = ${JSON.stringify(UI === 'el' ? 'Κεριά και άλλα ποιήματα' : 'Keria and other poems')}; saveMeta(); showWindowTitle(); })()`);
  await tick(200);
  await js(`(async () => {
    const order = book.chapterOrder;
    const htmls = ${JSON.stringify([poemHtml(KERIA), poemHtml(POLI)])};
    currentChapterId = order[0];
    chapterHTML[order[0]] = htmls[0];
    book.chapterTitles[order[0]] = 'Κεριά';
    await persistChapter(order[0]);
    createChapterAt(storyEnd());
    chapterHTML[book.chapterOrder[1]] = htmls[1];
    book.chapterTitles[book.chapterOrder[1]] = 'Η πόλις';
    await persistChapter(book.chapterOrder[1]);
    NeoHooks.format('poetry').setStatus(order[0], 'done');
    NeoHooks.format('poetry').setStatus(book.chapterOrder[1], 'fair');
    if (!book.rhema) book.rhema = {};
    book.rhema.poems[book.chapterOrder[1]].qr = 'https://onlyascii.io/kavafis/i-poli';
    saveMeta();
    renderChapters();
  })()`);
  await tick(500);
  // a collection drawing, staged the way the file dialog would
  const png = fs.readFileSync(path.join(__dirname, 'site-shots-drawing.png'));
  const bookDir = path.join(LIB, fs.readdirSync(LIB).find((d) => d.startsWith('book-')));
  fs.writeFileSync(path.join(bookDir, 'rhema-drawing.png'), png);
  const bookId = await js('book.id');
  await js(`RhemaQr.loadDrawing(${JSON.stringify(bookId)}, 'collection')`);
  await js('renderChapters()');
  await tick(400);

  // 01 manuscript (hero): Κεριά at the top
  await js(`(() => { const c = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"]'); if (c) c.scrollIntoView({ block: 'start' }); })()`);
  await tick(300);
  await probe('manuscript tabs', [t('Scraps'), t('Darlings'), t('Outline')]);
  await shot('01-manuscript');

  // 02 outline cards
  await js(`document.querySelector('.tab[data-tab="outline"]').click()`);
  await tick(600);
  await shot('02-outline');

  // 03 scraps drawer: cut one line from Κεριά
  await js(`document.querySelector('.tab[data-tab="manuscript"]').click()`);
  await tick(300);
  await js(`(async () => {
    currentChapterId = book.chapterOrder[0];
    renderChapters();
    const body = document.querySelector('.chapter[data-id="' + currentChapterId + '"] .chapter-body');
    body.focus();
    const p = body.querySelectorAll('p')[1];
    const r = document.createRange(); r.selectNodeContents(p.lastChild); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    RhemaScraps.cut(body, currentChapterId);
  })()`);
  await tick(400);
  await js(`document.querySelector('.tab[data-tab="scraps"]').click()`);
  await tick(500);
  await probe('scraps', [t('Scraps')]);
  await shot('03-scraps');

  // 04 compare view: snapshot, edit, Then/Now
  await js(`document.querySelector('.tab[data-tab="manuscript"]').click()`);
  await tick(300);
  await js(`(async () => {
    currentChapterId = book.chapterOrder[0];
    await takeSnapshot(SNAP_KEPT);
    const body = document.querySelector('.chapter[data-id="' + currentChapterId + '"] .chapter-body');
    body.focus();
    const p = body.querySelectorAll('p')[0];
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertText', false, ' — αναμμένα');
    syncChapter(body, currentChapterId);
  })()`);
  await tick(400);
  await js(`document.querySelector('.tab[data-tab="darlings"]').click()`);
  await tick(400);
  const snapName = await js(`(async () => { const l = await window.neo.snapshotList(book.id); return l && l.length ? l[l.length - 1].name : null; })()`);
  await js(`showSnapshot(${JSON.stringify(snapName)})`);
  // the compare columns render async (snapshot read from disk) — poll, don't guess
  const cmpUntil = Date.now() + 6000;
  while (Date.now() < cmpUntil && (await js('document.querySelectorAll(".rhema-compare-label").length')) < 2) await tick(150);
  await tick(400);
  await probe('compare', [t('Then'), t('Now')]);
  console.log('VIS', await js('(() => { const l = document.querySelectorAll(".rhema-compare-label"); return [...l].map((x) => ({ txt: x.textContent, vis: !!x.offsetParent, w: Math.round(x.getBoundingClientRect().width) })); })()'));
  await shot('04-compare');

  // 05 poem mark close-up at the end of Η πόλις
  await js(`document.querySelector('.tab[data-tab="manuscript"]').click()`);
  await tick(300);
  await js(`(() => { currentChapterId = book.chapterOrder[1]; renderChapters(); })()`);
  await tick(500);
  await js(`(() => { const m = document.querySelector('.chapter[data-id="' + book.chapterOrder[1] + '"] .rhema-poem-mark'); if (m) m.scrollIntoView({ block: 'end' }); })()`);
  await tick(400);
  await shot('05-poem-mark');

  // 06 the book-languages picker (Edit menu message — the proven p6 path)
  wc.send('menu', { type: 'bookSpellLanguages' });
  const until = Date.now() + 4000;
  while (Date.now() < until && !(await js('!!document.querySelector(".sb-picker #sb-primary")'))) await tick(100);
  assert.ok(await js('!!document.querySelector(".sb-picker #sb-primary")'), 'the picker modal opened');
  await probe('picker', [t("This book's languages…")]);
  await shot('06-picker');
  // 07 the bilingual set: primary el, en-US also declared (the p6 path)
  await js(`(() => { const s = document.querySelector('#sb-primary'); s.value = 'el'; s.dispatchEvent(new Event('change'));
    [...document.querySelectorAll('#sb-also input')].find((i) => i.dataset.code === 'en-US').checked = true; })()`);
  await tick(200);
  await shot('07-picker-bilingual');
  await js(`document.querySelector('.sb-picker .m-save').click()`);
  const gone = Date.now() + 12000;
  while (Date.now() < gone && (await js('!!document.querySelector(".sb-picker")'))) await tick(100);
  assert.ok(!(await js('!!document.querySelector(".sb-picker")')), 'picker saved and closed');

  // 08 union spellcheck: a mixed line in a fresh poem — the foreign word
  // flagged, the declared languages' words left alone (the p6 assertion)
  await js(`if (!spellOn) toggleSpellcheck()`);
  await tick(200);
  await js(`(() => { currentChapterId = book.chapterOrder[0]; renderChapters();
    const b = document.querySelector('.chapter[data-id="' + currentChapterId + '"] .chapter-body');
    b.focus();
    const r = document.createRange(); r.selectNodeContents(b); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertText', false, '\\n\\nbonjour poem Κεριά');
    syncChapter(b, currentChapterId); return true; })()`);
  const flagUntil = Date.now() + 8000;
  let flags = [];
  while (Date.now() < flagUntil) {
    flags = await js(`[...(CSS.highlights.get('neo-spell') || [])].map((r) => r.toString())`);
    if (flags.some((f) => f.includes('bonjour')) && !flags.some((f) => f.includes('poem'))) break;
    await tick(150);
  }
  assert.ok(flags.some((f) => f.includes('bonjour')), 'French flagged under the el+en-US set');
  assert.ok(!flags.some((f) => f.includes('poem')), 'English passes under the set');
  await js(`(() => { const c = document.querySelector('.chapter[data-id="' + book.chapterOrder[0] + '"]'); if (c) c.scrollIntoView({ block: 'end' }); })()`);
  await tick(300);
  await shot('08-union-flags');

  app.exit(0);
}
main().catch((err) => { console.error('HARNESS FAIL:', err.stack || err); app.exit(1); });
