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
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (opts) => js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(opts)})))`);
const enter = () => key({ key: 'Enter', code: 'Enter' });
const type = async (s) => {
  await js(`document.execCommand('insertText', false, ${JSON.stringify(s)})`);
  await js('enterRun = 0'); // real typing resets the Enter rhythm; execCommand does not
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

test('Enter once breaks the line, twice opens a stanza, three times a new poem', async () => {
  await caretToEnd();
  await type('First line');
  await enter(); await tick();
  await type('second');
  let st = await stanzas();
  assert.deepEqual(st[0].lines, ['First line', 'second'], 'soft break inside the stanza');
  await enter(); await tick();
  await enter(); await tick();
  st = await stanzas();
  assert.equal(st.length, 2, 'the second Enter opened a new stanza');
  assert.deepEqual(st[0].lines, ['First line', 'second']);
  assert.deepEqual(st[1].lines, ['']);
  await type('new stanza');
  st = await stanzas();
  assert.deepEqual(st[1].lines, ['new stanza']);
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
  await type('tail');
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
  assert.deepEqual(st.map((s) => s.lines), [['x', 'y', 'z'], ['']], 'the line crossed into the stanza before');
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
  await js(`(() => { book.chapterTitles[book.chapterOrder[0]] = 'August'; saveMeta(); })()`);
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
  assert.equal(card.title, 'August');
  assert.equal(card.line, '“First line”', 'first written line, quoted');
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

test('a novel still gets NEO\'s Enter rhythm (anchors change nothing)', async () => {
  await js(`(async () => {
    await addImportedBooks([{ name: 'A Novel', chapters: [{ title: 'One', paras: [{ text: 'Prose here.' }, { text: 'More prose.' }] }] }], library.shelves[0]);
    const ids = library.shelves[0].bookIds;
    await openBook(ids[ids.length - 1]);
  })()`);
  await tick(500);
  assert.equal(await js('poemBook()'), false);
  await caretToEnd();
  await enter(); await tick();
  await enter(); await tick();
  const cls = await js(`Array.from(document.querySelector('.chapter[data-id="' + (${CHID}) + '"] .chapter-body').children).map((p) => p.className)`);
  assert.ok(cls.includes('scene-break'), 'double Enter still makes a section break in prose');
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
