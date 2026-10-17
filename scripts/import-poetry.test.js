'use strict';

// Rhema — poem import (Stone 12, Phase 3a) /* RHEMA */
//
// The real main.js runs in a sandbox (the import.test.js pattern), and a
// poem file goes in the way a poet's file comes home: every line stays a
// line, stanzas keep their gaps, and the split knob decides where one poem
// ends and the next begins. The verse is K. P. Cavafy — public domain
// everywhere (the rationale is recorded in poetry.e2e.js); plain poem
// text only, no critical-edition apparatus.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { describe, test } = require('node:test');

const root = path.join(__dirname, '..');
const localRequire = createRequire(path.join(root, 'main.js'));
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rhema-import-'));
const LIB = path.join(tmp, 'Rhema Library');
fs.mkdirSync(LIB);
const handlers = new Map();
const electron = {
  app: { commandLine: { appendSwitch() {} }, getPath: () => tmp, getLocale: () => 'en', requestSingleInstanceLock: () => true, whenReady: () => ({ then() {} }), on() {} },
  ipcMain: { on() {}, handle: (name, fn) => handlers.set(name, fn) },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
  dialog: { showMessageBox: () => Promise.resolve({}) },
  utilityProcess: { fork: () => ({ on() {}, postMessage() {} }) },
  screen: {}
};
vm.runInContext(source, vm.createContext({
  require: (name) => name === 'electron' ? electron : localRequire(name),
  __dirname: root, process: { platform: process.platform, on() {} }, console
}), { filename: path.join(root, 'main.js') });

// the split knob lives in library.json — rewrite it, then import
function setSplit(split) {
  fs.writeFileSync(path.join(LIB, 'library.json'), JSON.stringify({ rhema: split ? { import: { split } } : {} }));
}
async function importOne(name, data, opts = { poetry: true }) {
  const fp = path.join(tmp, name);
  fs.writeFileSync(fp, data);
  const [r] = await handlers.get('import:files')(null, [fp], opts);
  return r;
}
// vm-realm arrays need a JSON round-trip before deepEqual (the texts() pattern)
const linesOf = (ch) => JSON.parse(JSON.stringify(ch.paras.filter((p) => p.text).map((p) => p.text)));
const stanzaCount = (ch) => ch.paras.filter((p) => p.gap).length + 1;

const L1 = "Του μέλλοντος οι μέρες στέκοντ' εμπροστά μας";
const L2 = 'σα μια σειρά κεράκια αναμμένα —';
const L3 = 'χρυσά, ζεστά, και ζωηρά κεράκια.';
const P1 = 'Δεν θα βρεις άλλες πόλεις παρά τις πόλεις.';

describe('poem import', () => {

  test('a .txt of two poems keeps every line a line', async () => {
    setSplit(null);
    const r = await importOne('keria.txt', [L1, L2, '', L3, '', '', P1].join('\n') + '\n');
    assert.equal(r.poetry, true);
    assert.equal(r.chapters.length, 2, 'the double blank line opened the second poem');
    assert.deepEqual(linesOf(r.chapters[0]), [L1, L2, L3]);
    assert.equal(stanzaCount(r.chapters[0]), 2, 'the single blank line stayed a stanza gap');
    assert.deepEqual(linesOf(r.chapters[1]), [P1]);
    assert.ok(r.chapters[0].paras.every((p) => p.gap || p.line), 'every verse para is flagged a line');
  });

  test('markdown headings name the poems', async () => {
    setSplit(null);
    const r = await importOne('poems.md', '# Κεριά\n' + L1 + '\n' + L2 + '\n\n# Η πόλις\n' + P1 + '\n');
    assert.equal(r.chapters.length, 2);
    assert.equal(r.chapters[0].title, 'Κεριά');
    assert.equal(r.chapters[1].title, 'Η πόλις');
    assert.deepEqual(linesOf(r.chapters[0]), [L1, L2]);
  });

  // the UX gate BLOCKER (2026-10-17): 'auto' cut Η πόλις in half because a
  // double blank line inside the poem read as a wide gap. With explicit
  // structure in the file, 'auto' now trusts headings/separators/page breaks
  // and leaves the poet's stanza spacing alone.
  test('auto with headings: a wide gap inside a poem stays a stanza break', async () => {
    setSplit(null);
    const r = await importOne('polis-widegap.md',
      '# Η πόλις\n' + P1 + '\n\n\n' + L1 + '\n\n# Κεριά\n' + L2 + '\n');
    assert.equal(r.chapters.length, 2, 'the heading opened the second poem');
    assert.deepEqual(linesOf(r.chapters[0]), [P1, L1], 'the triple blank line stayed inside poem one');
    assert.equal(stanzaCount(r.chapters[0]), 2, 'and rode in as a stanza gap');
  });

  test('auto without structure: wide gaps still split (no headings to trust)', async () => {
    setSplit(null);
    const r = await importOne('bare.txt', L1 + '\n\n\n' + P1 + '\n');
    assert.equal(r.chapters.length, 2, 'a bare file still becomes two poems');
  });

  test('the split knob: whole keeps one poem; headings ignore gaps', async () => {
    setSplit('whole');
    let r = await importOne('whole.txt', L1 + '\n\n' + P1 + '\n');
    assert.equal(r.chapters.length, 1, 'whole: the file is one poem');
    assert.equal(stanzaCount(r.chapters[0]), 2, 'whole keeps stanza gaps (review 2026-10-17)');
    setSplit('headings');
    r = await importOne('heads.txt', L1 + '\n\n\n\n' + P1 + '\n');
    assert.equal(r.chapters.length, 1, 'headings: no gap splits');
    r = await importOne('heads2.txt', '# Α\n' + L1 + '\n\n\n\n# Β\n' + P1 + '\n');
    assert.equal(r.chapters.length, 2, 'headings: headings still split');
    setSplit(null);
  });

  test('a Word file keeps its line breaks as verse lines', async () => {
    setSplit(null);
    const JSZip = localRequire('jszip');
    const zip = new JSZip();
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
      `<w:p><w:r><w:t>${L1}</w:t></w:r><w:r><w:br/><w:t>${L2}</w:t></w:r></w:p>` +
      `<w:p></w:p>` +
      `<w:p><w:r><w:t>${L3}</w:t></w:r></w:p>` +
      `<w:p><w:r><w:br w:type="page"/><w:t>${P1}</w:t></w:r></w:p>` +
      `</w:body></w:document>`);
    const fp = path.join(tmp, 'poems.docx');
    fs.writeFileSync(fp, await zip.generateAsync({ type: 'nodebuffer' }));
    const [r] = await handlers.get('import:files')(null, [fp], { poetry: true });
    assert.equal(r.chapters.length, 2, 'the page break opened the second poem');
    assert.deepEqual(linesOf(r.chapters[0]), [L1, L2, L3]);
    assert.ok(r.chapters[0].paras.some((p) => p.gap), 'the empty Word paragraph became a stanza gap');
  });

  test('leading spaces ride in as the indent flag', async () => {
    setSplit(null);
    const r = await importOne('indented.txt', L1 + '\n  ' + L2 + '\n');
    const indented = r.chapters[0].paras.find((p) => p.indent);
    assert.ok(indented, 'the pushed-in line is flagged');
    assert.equal(indented.text, L2, 'and its spaces are stripped');
  });

  test('a one-poem file named for itself: the title page line is harvested', async () => {
    setSplit(null);
    const r = await importOne('Η πόλις.txt', 'Η πόλις\nby C. P. Cavafy\n' + P1 + '\n');
    assert.equal(r.title, 'Η πόλις');
    assert.equal(r.author, 'C. P. Cavafy');
    assert.deepEqual(linesOf(r.chapters[0]), [P1], 'the harvested lines left the poem');
  });

  test('novels are untouched: no opts, the old chapterize path', async () => {
    setSplit(null);
    const r = await importOne('novel.txt', 'Chapter 1\nIt was late.\nShe left.\nChapter 2\nMorning came.\n', { poetry: false });
    assert.equal(r.poetry, false);
    assert.equal(r.chapters.length, 2);
    assert.equal(r.chapters[0].paras[0].text, 'It was late.', 'one line per paragraph, as before');
  });
});

describe('pdf text for poems', () => {
  const { pdfLines, pdfParasFromPages } = require(path.join(root, 'pdfimport.js'));

  const item = (str, x, y, h = 10) => ({ str, transform: [1, 0, 0, 1, x, y], width: str.length * 5, height: h, hasEOL: false });

  test('items on one baseline join into a line', () => {
    const lines = pdfLines([item('Δεν θα', 50, 700), item('βρεις', 84, 700), item('άλλες', 114, 699.5), item('πόλεις.', 140, 620)]);
    assert.deepEqual(lines.map((l) => l.text), ['Δεν θα βρεις άλλες', 'πόλεις.']);
  });

  test('vertical pitch: stanza gaps, wide gaps, page ends', () => {
    const page = pdfLines([
      item('A1', 50, 700), item('A2', 50, 680),          // one stanza, 20pt pitch
      item('B1', 50, 640),                                // 40pt gap -> stanza break
      item('C1', 50, 560),                                // 80pt gap -> wide (poem break)
      item('D1', 70, 540)                                 // back to pitch, pushed in -> indent
    ].map((it, i) => ({ ...it, hasEOL: true })));
    const paras = pdfParasFromPages([page]);
    const gaps = paras.filter((p) => p.gap);
    assert.equal(gaps.length, 2);
    assert.ok(gaps[1].wide, 'the 80pt gap is a poem boundary');
    assert.ok(paras.find((p) => p.text === 'D1').indent, 'the pushed-in line is flagged');
  });


  // the BLOCKER guard (security review 2026-10-17): the real pdfjs-dist path —
  // getDocument/getTextContent/cleanup — was never exercised; only the pure
  // helpers were. A hand-built one-page PDF runs importFile end to end.
  test('a real PDF imports end to end (the pdfjs path itself)', async () => {
    // one page, Helvetica, four lines: 20pt pitch, a 40pt stanza gap, a 60pt poem gap
    const stream = 'BT /F1 12 Tf 50 700 Td (alpha one) Tj 0 -20 Td (beta two) Tj 0 -40 Td (gamma three) Tj 0 -60 Td (delta four) Tj ET';
    const objs = [
      '<</Type/Catalog/Pages 2 0 R>>',
      '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
      `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
    ];
    let pdf = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
      offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
      `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
    const r = await importOne('verse.pdf', Buffer.from(pdf, 'latin1'));
    assert.equal(r.error, undefined, 'the PDF parsed: ' + r.error);
    assert.equal(r.poetry, true);
    assert.equal(r.chapters.length, 2, 'the 60pt gap opened the second poem');
    assert.deepEqual(linesOf(r.chapters[0]), ['alpha one', 'beta two', 'gamma three']);
    assert.ok(r.chapters[0].paras.some((p) => p.gap && !p.wide), 'the 40pt gap stayed a stanza break');
    assert.deepEqual(linesOf(r.chapters[1]), ['delta four']);
  });

  test('pages end with a pageEnd boundary', () => {
    const paras = pdfParasFromPages([pdfLines([{ ...item('one', 50, 700), hasEOL: true }]), pdfLines([{ ...item('two', 50, 700), hasEOL: true }])]);
    assert.ok(paras.some((p) => p.pageEnd));
    assert.equal(paras.filter((p) => p.text).length, 2);
  });
});
