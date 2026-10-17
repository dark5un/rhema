/* ==================================================================== */
/*  RHEMA — poetry format (Phase 2)                                     */
/*                                                                      */
/*  A poem is a chapter; a stanza is a p.poetry paragraph; a line is   */
/*  a soft break (<br>) inside it. Loaded AFTER app.js: it registers    */
/*  the 'poetry' format into the NeoHooks bus (app.js) and answers the */
/*  poemKey hook, so app.js never names this file. Nothing here runs   */
/*  for a novel or a script.                                          */
/*                                                                      */
/*  Enter rhythm (Stone 1): once = new line in the stanza; twice = a   */
/*  new stanza; three times = a new poem (the chapter splits).         */
/*  Line ops (Stone 2), all structural-undoable: Alt+↑/↓ move the     */
/*  line (across stanzas), Alt+D duplicate, Alt+J merge with the       */
/*  line above, Tab / Shift+Tab indent and unindent the line.          */
/* ==================================================================== */

// ---- poetry rules: pure functions of stanzas and a caret, no DOM ----
// A poem model is an array of stanzas; a stanza is an array of line
// strings. The caret is { s: stanza, k: line, col: character in line }.
// scripts/poetry.test.js runs this section on its own, in a vm.

const RHEMA_INDENT = '\u2003\u2003'; // two em spaces — what NEO's Tab types

const rhemaBlank = (line) => (line || '').replace(/\u2003/g, '').trim() === '';

// What one Enter does, given the rhythm count (NEO's enterRun).
// 'line'   — a soft break at the caret (the stanza grows a line)
// 'stanza' — the caret's empty line becomes the gap between stanzas
// 'poem'   — the chapter splits here: a new poem begins
// 'none'   — nothing (Enter on an already-empty line, first press)
function poemEnterRule(stanzas, caret, enterRun) {
  const line = ((stanzas[caret.s] || [])[caret.k] || '');
  const empty = rhemaBlank(line);
  const atStart = caret.col === 0;
  if (enterRun >= 3 && (empty || atStart)) return 'poem';
  if (enterRun >= 2 && (empty || atStart)) return 'stanza';
  if (empty) return 'none';
  return 'line';
}

// Which line the split consumes as the gap: the caret's own line when it
// is empty, else the empty line just above the caret (Enter at the start
// of a line pushed one down). -1 = nothing to consume; the caret's line
// itself begins the new stanza.
function poemGap(lines, k) {
  if (rhemaBlank(lines[k])) return k;
  if (k > 0 && rhemaBlank(lines[k - 1])) return k - 1;
  return -1;
}

// Enter twice: the stanza splits at the caret. Returns the new whole-poem
// model and where the caret lands (the first line of the new stanza).
function poemStanzaSplit(stanzas, caret) {
  const st = stanzas[caret.s] || [];
  const gap = poemGap(st, caret.k);
  const a = st.slice(0, gap < 0 ? caret.k : gap);
  const b = st.slice(gap < 0 ? caret.k : gap + 1);
  const out = stanzas.slice();
  out.splice(caret.s, 1, a.length ? a : [''], b.length ? b : ['']);
  return { stanzas: out, caret: { s: caret.s + 1, k: 0, col: 0 } };
}

// Enter three times: everything from the caret's line becomes the next
// poem. Returns the two halves (either may be empty).
function poemPoemSplit(stanzas, caret) {
  const st = stanzas[caret.s] || [];
  const gap = poemGap(st, caret.k);
  const a = st.slice(0, gap < 0 ? caret.k : gap);
  const b = st.slice(gap < 0 ? caret.k : gap + 1);
  const first = stanzas.slice(0, caret.s).concat(a.length ? [a] : []);
  const second = (b.length ? [b] : []).concat(stanzas.slice(caret.s + 1));
  return { first, second };
}

// Move the caret's line one up or down inside its stanza. null = the line
// is at the stanza's edge; the caller carries it across stanzas.
function poemMoveLine(lines, k, dir) {
  const j = k + dir;
  if (j < 0 || j >= lines.length) return null;
  const out = lines.slice();
  out.splice(j, 0, out.splice(k, 1)[0]);
  return { lines: out, k: j };
}

function poemDuplicateLine(lines, k) {
  const out = lines.slice();
  out.splice(k + 1, 0, lines[k]);
  return { lines: out, k: k + 1 };
}

// Merge the caret's line into the one above. null = the line is the
// stanza's first; the caller merges the stanza into the one before.
function poemMergeLine(lines, k) {
  if (k === 0) return null;
  const out = lines.slice();
  const prev = out[k - 1] || '';
  const joined = prev + (out[k] || '');
  out.splice(k - 1, 2, joined);
  return { lines: out, k: k - 1, col: prev.length };
}

// Indent / unindent one line: NEO's Tab rhythm (up to two em spaces).
function poemIndentLine(lines, k, on) {
  const out = lines.slice();
  const line = out[k] || '';
  if (on) {
    if (!line.startsWith('\u2003')) out[k] = RHEMA_INDENT + line;
  } else {
    let s = line, n = 0;
    while (n < 2 && s.startsWith('\u2003')) { s = s.slice(1); n++; }
    out[k] = s;
  }
  return { lines: out };
}

// ---- end of poetry rules ----

const RhemaPoetry = (() => {
  'use strict';

  const isPoemBook = () => !!(book && NeoHooks.format(book.format) && NeoHooks.format(book.format).poem);

  /* ---------------- DOM <-> model ---------------- */

  // a stanza paragraph's lines, as arrays of child nodes split on <br>.
  // A wholly empty paragraph is ONE empty line (NEO's <p><br></p> seed).
  // A trailing empty part is Chromium's line placeholder, not a line:
  // 'a<br>' is one line; 'a<br><br>' is two ('a' and the empty one).
  function stanzaParts(p) {
    if (!p.textContent) return [[]];
    const parts = [[]];
    for (const n of [...p.childNodes]) {
      if (n.nodeName === 'BR') parts.push([]);
      else parts[parts.length - 1].push(n);
    }
    if (parts.length > 1 && !parts[parts.length - 1].length) parts.pop();
    return parts;
  }
  const lineText = (nodes) => nodes.map((n) => n.textContent).join('');

  function setParts(p, parts) {
    p.innerHTML = '';
    parts.forEach((nodes, i) => {
      if (i) p.appendChild(document.createElement('br'));
      for (const n of nodes) p.appendChild(n);
    });
    // a real trailing empty line needs the double break (see stanzaParts)
    if (parts.length > 1 && !parts[parts.length - 1].length) p.appendChild(document.createElement('br'));
    if (!p.childNodes.length) p.innerHTML = '<br>';
  }

  // the whole chapter as the pure model (for the rules above)
  function chapterModel(body) {
    return [...body.querySelectorAll('p.poetry')].map((p) => stanzaParts(p).map(lineText));
  }
  function stanzaIndex(body, p) {
    return [...body.querySelectorAll('p.poetry')].indexOf(p);
  }

  // caret position inside a stanza: which <br>-separated line, which column
  function caretLine(p) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!p.contains(r.startContainer)) return null;
    if (r.startContainer === p) {
      let k = 0, col = 0;
      for (let i = 0; i < r.startOffset && i < p.childNodes.length; i++) {
        const c = p.childNodes[i];
        if (c.nodeName === 'BR') { k++; col = 0; } else col += c.textContent.length;
      }
      return { k, col };
    }
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let k = 0, col = 0, n;
    while ((n = walker.nextNode())) {
      if (n === r.startContainer) { col += r.startOffset; break; }
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.nodeName === 'BR') { k++; col = 0; }
        continue;
      }
      col += n.textContent.length;
    }
    return { k, col };
  }

  function setCaretLine(p, k, col) {
    if (k === 0 && col === 0) { placeCaret(p, 0); return; }
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let line = 0, seen = 0, n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.nodeName !== 'BR') continue;
        if (line === k - 1 && col === 0) { placeCaret(p, [...p.childNodes].indexOf(n) + 1); return; }
        line++; seen = 0;
        continue;
      }
      if (line !== k) continue;
      const len = n.textContent.length;
      if (seen + len >= col) { placeCaret(n, Math.min(Math.max(col - seen, 0), len)); return; }
      seen += len;
    }
    placeCaret(p, p.childNodes.length);
  }

  // the tail of every structural operation: save, then seal the native
  // undo (contentEditable toggle) — and only then place the caret, because
  // restoreCaret maps a line-start caret to the previous line's end (its
  // offset is text-only), which would silently undo our placement
  function commit(body, chId) {
    syncChapter(body, chId);
    resetNativeUndo();
    breakRun++;
  }

  /* ---------------- the Enter rhythm ---------------- */

  function poemEnter(e, body, chId) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return true;
    const block = caretBlock(body);
    if (!block) return true;
    if (block.classList.contains('scene-break')) return true;
    if (!block.classList.contains('poetry')) block.classList.add('poetry');
    const at = caretLine(block);
    if (!at) return true;
    const stanzas = chapterModel(body);
    const caret = { s: stanzaIndex(body, block), k: at.k, col: at.col };
    const run = (e.key === 'Enter' && !e.shiftKey) ? enterRun : 1;
    const op = poemEnterRule(stanzas, caret, run);
    e.preventDefault();
    if (op === 'none') return true;
    if (op === 'line') {
      insertLineBreakDom(body, chId);
      return true;
    }
    if (op === 'stanza') { stanzaSplit(body, chId, block, at.k); return true; }
    poemSplit(body, chId, block, at.k);
    return true;
  }

  // a soft break at the caret, by hand: NEO's editor is pre-wrap, so the
  // engine's own insertLineBreak would type a raw newline instead of a <br>
  // (which is why app.js intercepts it for prose too). Structural undo owns it.
  function insertLineBreakDom(body, chId) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const block = caretBlock(body);
    if (!block) return;
    if (block.querySelector('span:not(.ph-mark):not(.fn)')) stripJunkSpans(block);
    snapshotStructure('line break');
    const r = sel.getRangeAt(0);
    r.deleteContents();
    // at the very end of the stanza a second <br> keeps the new line real:
    // Chromium types BEFORE a trailing break, so one break alone would put
    // the next words back on the old line. Between two breaks they land right.
    const after = document.createRange();
    after.selectNodeContents(block);
    try { after.setStart(r.startContainer, r.startOffset); } catch { /* odd caret: single break */ }
    const atEnd = after.toString() === '';
    const br = document.createElement('br');
    r.insertNode(br);
    if (atEnd) br.after(document.createElement('br'));
    commit(body, chId);
    const parent = br.parentNode;
    placeCaret(parent, [...parent.childNodes].indexOf(br) + 1);
    if (!typewriterEnabled) revealCaret();
  }

  function stanzaSplit(body, chId, block, k) {
    snapshotStructure('stanza split');
    const parts = stanzaParts(block);
    const gap = poemGap(parts.map(lineText), k);
    const a = parts.slice(0, gap < 0 ? k : gap);
    const b = parts.slice(gap < 0 ? k : gap + 1);
    const np = document.createElement('p');
    np.className = 'poetry';
    setParts(block, a.length ? a : [[]]);
    setParts(np, b.length ? b : [[]]);
    block.after(np);
    commit(body, chId);
    setCaretLine(np, 0, 0);
    if (!typewriterEnabled) revealCaret();
  }

  function poemSplit(body, chId, block, k) {
    snapshotStructure('chapter split');
    // make the caret's line the first line of its own stanza, so the
    // chapter split (which moves whole paragraphs) starts exactly there
    const parts = stanzaParts(block);
    const gap = poemGap(parts.map(lineText), k);
    const firstLines = parts.slice(0, gap < 0 ? k : gap);
    const movedLines = parts.slice(gap < 0 ? k : gap + 1);
    let target = block;
    if (k > 0 || gap >= 0) {
      const np = document.createElement('p');
      np.className = 'poetry';
      setParts(block, firstLines.length ? firstLines : [[]]);
      setParts(np, movedLines.length ? movedLines : [[]]);
      block.after(np);
      target = np;
      setCaretLine(np, 0, 0);
    }
    const was = caretHeight();
    splitChapterAt(body, chId, target, window.getSelection(), was);
    // a poem opens on verse, never on a plain paragraph
    const idx = book.chapterOrder.indexOf(chId);
    const newId = book.chapterOrder[idx + 1];
    if (newId && (!chapterHTML[newId] || chapterHTML[newId] === '<p><br></p>')) {
      chapterHTML[newId] = '<p class="poetry"><br></p>';
      persistChapter(newId);
    }
  }

  /* ---------------- line operations ---------------- */

  function poemKeyAlt(e, body, chId) {
    const block = caretBlock(body);
    if (!block || !block.classList.contains('poetry')) return true; // swallow anyway
    const at = caretLine(block);
    if (!at) return true;
    const code = e.code || '';
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { moveLine(e, body, chId, block, at, e.key === 'ArrowDown' ? 1 : -1); return true; }
    if (code === 'KeyD') { duplicateLine(body, chId, block, at); return true; }
    if (code === 'KeyJ') { mergeLine(e, body, chId, block, at); return true; }
    return false;
  }

  function moveLine(e, body, chId, block, at, dir) {
    const parts = stanzaParts(block);
    const moved = poemMoveLine(parts.map(lineText), at.k, dir);
    if (moved) {
      snapshotStructure('line move');
      // rebuild keeping node identity: splice the arrays, not the texts
      const nodeParts = parts.slice();
      nodeParts.splice(moved.k, 0, nodeParts.splice(at.k, 1)[0]);
      setParts(block, nodeParts);
      commit(body, chId);
      setCaretLine(block, moved.k, at.col);
      return;
    }
    // across stanzas: the line crosses into the neighbour paragraph
    const sib = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
    if (!sib || !sib.classList.contains('poetry')) return;
    snapshotStructure('line move');
    const sp = stanzaParts(sib);
    const nodes = parts[at.k];
    parts.splice(at.k, 1);
    if (dir < 0) sp.push(nodes); else sp.unshift(nodes);
    setParts(sib, sp);
    setParts(block, parts.length ? parts : [[]]);
    const sk = dir < 0 ? sp.length - 1 : 0;
    commit(body, chId);
    setCaretLine(sib, sk, at.col);
  }

  function duplicateLine(body, chId, block, at) {
    const parts = stanzaParts(block);
    snapshotStructure('line duplicate');
    parts.splice(at.k + 1, 0, parts[at.k].map((n) => n.cloneNode(true)));
    setParts(block, parts);
    commit(body, chId);
    setCaretLine(block, at.k + 1, at.col);
  }

  function mergeLine(e, body, chId, block, at) {
    const parts = stanzaParts(block);
    const merged = poemMergeLine(parts.map(lineText), at.k);
    if (merged) {
      snapshotStructure('line merge');
      const nodeParts = parts.slice();
      nodeParts.splice(at.k - 1, 2, nodeParts[at.k - 1].concat(nodeParts[at.k]));
      setParts(block, nodeParts);
      commit(body, chId);
      setCaretLine(block, merged.k, lineText(parts[at.k - 1]).length);
      return;
    }
    // the stanza's first line: it joins the last line of the stanza before
    const prev = block.previousElementSibling;
    if (!prev || !prev.classList.contains('poetry')) return;
    snapshotStructure('stanza merge');
    const pp = stanzaParts(prev);
    const joinAt = pp.length - 1;
    const joinCol = lineText(pp[joinAt]).length;
    pp[joinAt] = pp[joinAt].concat(parts[0]);
    for (let i = 1; i < parts.length; i++) pp.push(parts[i]);
    setParts(prev, pp);
    block.remove();
    commit(body, chId);
    setCaretLine(prev, joinAt, joinCol);
  }

  function indentLine(e, body, chId) {
    const block = caretBlock(body);
    if (!block || !block.classList.contains('poetry')) return false;
    const at = caretLine(block);
    if (!at) return false;
    const parts = stanzaParts(block);
    const on = !e.shiftKey;
    const res = poemIndentLine(parts.map(lineText), at.k, on);
    if (res.lines[at.k] === parts.map(lineText)[at.k]) return true; // nothing to do
    snapshotStructure(on ? 'line indent' : 'line unindent');
    if (on) {
      const first = parts[at.k][0];
      const indented = first && first.nodeType === Node.TEXT_NODE && first.textContent.startsWith('\u2003');
      if (!indented) parts[at.k].unshift(document.createTextNode('\u2003\u2003'));
    } else {
      // strip up to two leading em spaces across the line's leading text nodes
      let left = 2;
      for (const n of [...parts[at.k]]) {
        if (n.nodeType !== Node.TEXT_NODE || left === 0) break;
        let cut = 0;
        while (cut < n.textContent.length && n.textContent[cut] === '\u2003' && left > 0) { cut++; left--; }
        if (cut) {
          n.textContent = n.textContent.slice(cut);
          if (!n.textContent) parts[at.k].splice(parts[at.k].indexOf(n), 1);
        }
      }
    }
    setParts(block, parts);
    commit(body, chId);
    setCaretLine(block, at.k, Math.max(at.col + (on ? 2 : 0), 0));
    return true;
  }

  /* ---------------- the hook ---------------- */

  function poemKey(e, body, chId) {
    if (!isPoemBook()) return false;
    if (!isStory(chId)) return false; // pages keep NEO's plain Enter
    if (e.key === 'Enter') return poemEnter(e, body, chId);
    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) return poemKeyAlt(e, body, chId);
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) return indentLine(e, body, chId);
    if (e.key === 'Backspace') {
      // at a stanza's start NEO's prose rule would turn it to plain text;
      // in a poem the native merge (line to line, stanza to stanza) is right
      const block = caretBlock(body);
      if (block && block.classList.contains('poetry')) {
        const at = caretLine(block);
        if (at && at.k === 0 && at.col === 0) return true; // let the chain's guards run native
      }
    }
    return false;
  }

  // every paragraph of a poem book is verse: pasted or typed plain
  // paragraphs join the format as the chapter syncs
  function chapterSynced(body, chId) {
    if (!isPoemBook()) return;
    for (const p of body.querySelectorAll('p')) {
      if (p.classList.contains('poetry') || p.classList.contains('scene-break') || p.classList.contains('ghost')) continue;
      p.classList.add('poetry');
    }
  }

  // the first-run hint, in a poet's words
  function enterHint(current) {
    if (!isPoemBook()) return undefined;
    return t('Enter once = a new line · twice = a new stanza · three times = a new poem');
  }

  // ---- the shelf: a new poem collection ----
  async function createOnShelf(shelf) {
    const meta = await window.neo.createBook({ author: displayAuthor() });
    const chId = 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    await window.neo.writeChapter(meta.id, chId, '<p class="poetry"><br></p>');
    meta.format = 'poetry';
    meta.chapterOrder = [chId];
    meta.tabNames = { notes: (library.tabDefaults && library.tabDefaults.notes) || 'Notes', outline: 'Outline' };
    await writeBookMeta(meta.id, meta);
    await placeTitle(shelf, meta.id);
    await writeLibrary(library);
    await openBook(meta.id);
  }

  /* ---------------- status & progress (Stone 4) ---------------- */

  // book.rhema.poems[<chId>].status — blank → draft → fair copy → done.
  // Unknown book.json keys survive upstream save paths untouched.
  const POEM_STATUSES = [
    { v: 'draft', label: () => t('Draft') },
    { v: 'fair', label: () => t('Fair copy') },
    { v: 'done', label: () => t('Done') }
  ];
  const statusLabel = (v) => (POEM_STATUSES.find((s) => s.v === v) || { label: () => v }).label();

  function poemRec(chId, create) {
    if (!book) return null;
    if (create) {
      if (!book.rhema) book.rhema = {};
      if (!book.rhema.poems) book.rhema.poems = {};
      if (!book.rhema.poems[chId]) book.rhema.poems[chId] = {};
    }
    return (book.rhema && book.rhema.poems && book.rhema.poems[chId]) || null;
  }
  function poemStatus(chId) {
    const r = poemRec(chId);
    return (r && r.status) || '';
  }
  function setPoemStatus(chId, v) {
    const r = poemRec(chId, true);
    if (v) r.status = v; else delete r.status;
    if (!Object.keys(r).length) delete book.rhema.poems[chId];
    saveMeta();
    renderNav();
    if (currentTab === 'outline') renderOutline();
  }

  // written (non-blank) lines of a poem, straight from its saved HTML
  function poemLines(chId) {
    const html = chapterHTML[chId] || '';
    if (!html.trim()) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    for (const p of doc.querySelectorAll('p')) {
      for (const seg of p.innerHTML.split(/<br\s*\/?>/i)) {
        const txt = seg.replace(/<[^>]*>/g, '').replace(/\u2003/g, ' ').trim();
        if (txt) out.push(txt);
      }
    }
    return out;
  }

  /* ---------------- card, nav, menu, progress ---------------- */

  function poemCard(cell, chId) {
    if (!isPoemBook()) return;
    const lines = poemLines(chId);
    const words = cell.querySelector('.ob-words');
    if (words) words.textContent = t('{n} lines', { n: lines.length });
    const status = poemStatus(chId);
    if (status) {
      const dot = document.createElement('span');
      dot.className = 'rhema-dot st-' + status;
      dot.title = statusLabel(status);
      cell.querySelector('.ob-head').appendChild(dot);
    }
    // the rich card: poem title, then its first line quoted
    const title = (book.chapterTitles || {})[chId] || '';
    const text = cell.querySelector('.ob-text');
    if (text && (title || lines.length)) {
      text.classList.remove('excerpt', 'empty');
      text.innerHTML = '';
      if (title) {
        const ts = document.createElement('div');
        ts.className = 'rhema-card-title';
        ts.textContent = title;
        text.appendChild(ts);
      }
      if (lines.length) {
        const fs = document.createElement('div');
        fs.className = 'rhema-card-line';
        fs.textContent = quoted(lines[0]);
        text.appendChild(fs);
      }
    }
  }

  function navItemDot(item, chId) {
    if (!isPoemBook()) return;
    const status = poemStatus(chId);
    if (!status) return;
    const dot = document.createElement('span');
    dot.className = 'n-rhema-dot st-' + status;
    dot.title = statusLabel(status);
    const flex = item.querySelector('.n-row > span[style]') || item.querySelector('.n-row');
    flex.appendChild(dot);
  }

  function chapterMenuItems(chId) {
    if (!isPoemBook() || !isStory(chId)) return undefined;
    return ['-', { label: t('Poem status…'), value: 'rhemaStatus' }];
  }

  function chapterMenuChoice(chId, choice) {
    if (choice !== 'rhemaStatus') return false;
    openStatusMenu(chId); // answers itself; the menu above has already closed
    return true;
  }

  async function openStatusMenu(chId) {
    const cur = poemStatus(chId);
    const items = POEM_STATUSES.map((s) => ({ label: s.label(), value: s.v, checked: s.v === cur }));
    items.push({ label: t('No status'), value: '', checked: !cur });
    const from = document.querySelector(`.nav-item[data-id="${chId}"] .n-row`) ||
      document.querySelector(`.ob-cell[data-ch="${chId}"]`);
    const pick = await popMenu(0, 0, items, { title: t('Poem status'), from });
    if (pick === null || pick === undefined) return;
    if (pick !== cur) setPoemStatus(chId, pick);
  }

  function boardProgress(board) {
    if (!isPoemBook()) return;
    const poems = book.chapterOrder.filter((c) => isStory(c));
    const done = poems.filter((c) => poemStatus(c) === 'done').length;
    const chip = document.createElement('div');
    chip.className = 'rhema-progress';
    chip.textContent = t('{done} of {total} poems finished', { done, total: poems.length });
    board.prepend(chip);
  }

  function chapterDeleted(chId) {
    if (book && book.rhema && book.rhema.poems) delete book.rhema.poems[chId];
  }

  /* ---------------- registration ---------------- */

  NeoHooks.registerFormat('poetry', {
    poem: true,
    createOnShelf,
    isPoemBook,
    setStatus: setPoemStatus,
    getStatus: poemStatus,
    lines: poemLines
  });
  NeoHooks.on('poemKey', poemKey);
  NeoHooks.on('poemLineBreak', insertLineBreakDom);
  NeoHooks.on('chapterSynced', chapterSynced);
  NeoHooks.on('enterHint', enterHint);
  NeoHooks.on('poemCard', poemCard);
  NeoHooks.on('navItem', navItemDot);
  NeoHooks.on('chapterMenuItems', chapterMenuItems);
  NeoHooks.on('chapterMenuChoice', chapterMenuChoice);
  NeoHooks.on('boardRendered', boardProgress);
  NeoHooks.on('chapterDeleted', chapterDeleted);

  // test/probe window into the internals (harmless in production)
  window.RhemaPoetryDebug = { caretLine, stanzaParts, insertLineBreakDom, poemEnterRule };

  return { createOnShelf, isPoemBook };
})();
