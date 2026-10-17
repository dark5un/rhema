/* ==================================================================== */
/*  RHEMA — the scraps drawer (Stone 5, Phase 2)                        */
/*                                                                      */
/*  A cut line or stanza goes to Scraps, tagged with the poem it came   */
/*  from, and can be put back into any poem — by button or by drag.     */
/*  Storage: the rhema-scraps.json sidecar (same json:read/json:write   */
/*  path darlings use). Loaded after poetry.js; leans on the poem      */
/*  format's stanza helpers.                                            */
/* ==================================================================== */

const RhemaScraps = (() => {
  'use strict';

  let scraps = [];
  let scrapsFor = null;

  const poemFormat = () => (book ? NeoHooks.format(book.format) : null);
  const isPoem = () => !!(book && poemFormat() && poemFormat().poem);

  async function ensure() {
    if (!book) { scraps = []; scrapsFor = null; return; }
    if (scrapsFor !== book.id) {
      scrapsFor = book.id;
      scraps = await window.neo.readJSON(book.id, 'rhema-scraps', []);
    }
  }
  const save = () => { if (book) writeSidecar(book.id, 'rhema-scraps', scraps); };

  /* ---------------- capture ---------------- */

  // fragment -> array of line strings (<br> separates lines)
  function fragmentLines(fragHost) {
    const lines = [''];
    for (const n of fragHost.childNodes) {
      if (n.nodeName === 'BR') lines.push('');
      else lines[lines.length - 1] += n.textContent;
    }
    return lines.filter((l) => l.trim() !== '');
  }

  async function cut(body, chId) {
    if (!isPoem()) return false;
    await ensure();
    const dom = poemFormat().dom;
    const sel = window.getSelection();
    let lines = [];
    let undo = null;
    if (sel.rangeCount && !sel.isCollapsed) {
      const holder = document.createElement('div');
      holder.appendChild(sel.getRangeAt(0).cloneContents());
      lines = fragmentLines(holder);
      undo = () => document.execCommand('delete');
    } else {
      const block = caretBlock(body);
      if (block && block.classList.contains('poetry')) {
        const at = dom.caretLine(block);
        if (at) {
          const parts = dom.stanzaParts(block);
          const holder = document.createElement('div');
          for (const n of parts[at.k]) holder.appendChild(n.cloneNode(true));
          lines = fragmentLines(holder);
          if (lines.length) {
            undo = () => {
              parts.splice(at.k, 1);
              dom.setParts(block, parts.length ? parts : [[]]);
            };
          }
        }
      }
    }
    if (!lines.length) return true; // chord pressed, nothing worth keeping
    snapshotStructure('scrap');
    undo();
    const origin = book.chapterTitles && book.chapterTitles[chId]
      ? book.chapterTitles[chId] : chapterName(chId);
    scraps.unshift({
      id: 'sc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      lines,
      originChId: chId,
      originTitle: origin,
      date: new Date().toISOString()
    });
    dom.commit(body, chId);
    save();
    render();
    toast(t('Saved to Scraps — {key} puts it back', { key: KZ }), 5000);
    return true;
  }

  // Alt+Shift+X in a poem book (poetry.js's poemKey already passed on it)
  function scrapKey(e, body, chId) {
    if (!isPoem()) return false;
    if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyX') {
      e.preventDefault();
      cut(body, chId);
      return true;
    }
    return false;
  }

  /* ---------------- putting back ---------------- */

  function putIn(scrap) {
    if (!isPoem() || !book) return false;
    const chId = currentChapterId;
    const body = chId && document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
    if (!body) { toast(t('Open a poem first')); return false; }
    const dom = poemFormat().dom;
    body.focus({ preventScroll: true });
    let block = caretBlock(body) || body.querySelector('p.poetry');
    if (!block) {
      block = document.createElement('p');
      block.className = 'poetry';
      block.innerHTML = '<br>';
      body.appendChild(block);
    }
    const at = dom.caretLine(block) || { k: dom.stanzaParts(block).length - 1, col: 0 };
    snapshotStructure('scrap in');
    const parts = dom.stanzaParts(block);
    parts.splice(at.k + 1, 0, ...scrap.lines.map((ln) => [document.createTextNode(ln)]));
    dom.setParts(block, parts);
    dom.commit(body, chId);
    const last = at.k + scrap.lines.length;
    const lastLen = (dom.stanzaParts(block)[last] || []).reduce((n, x) => n + x.textContent.length, 0);
    dom.setCaretLine(block, last, lastLen);
    render();
    return true;
  }

  /* ---------------- the drawer ---------------- */

  function drawerEl() {
    let el = document.getElementById('rhema-scraps');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rhema-scraps';
      el.className = 'rhema-scraps-drawer';
      el.hidden = true;
      document.getElementById('aux-paper').appendChild(el);
    }
    return el;
  }

  function render() {
    const el = drawerEl();
    if (currentTab !== 'scraps') return;
    el.hidden = false;
    el.innerHTML = '';
    if (!scraps.length) {
      const p = document.createElement('div');
      p.className = 'rhema-scraps-empty';
      p.textContent = t('Cut a line or a stanza with Alt+Shift+X and it waits here for another poem.');
      el.appendChild(p);
      return;
    }
    for (const s of scraps) {
      const card = document.createElement('div');
      card.className = 'rhema-scrap';
      card.draggable = true;
      card.dataset.scrap = s.id;
      const text = document.createElement('div');
      text.className = 'rhema-scrap-text';
      text.innerHTML = s.lines.map((l) => escHtml(l)).join('<br>');
      const meta = document.createElement('div');
      meta.className = 'rhema-scrap-meta';
      meta.textContent = t('from {poem} · {date}', { poem: s.originTitle || t('Untitled'), date: (s.date || '').slice(0, 10) });
      const btns = document.createElement('div');
      btns.className = 'rhema-scrap-btns';
      const put = document.createElement('button');
      put.textContent = t('Put in');
      put.className = 'rhema-scrap-put';
      put.addEventListener('click', () => putIn(s));
      const del = document.createElement('button');
      del.textContent = t('Delete');
      del.className = 'rhema-scrap-del';
      del.addEventListener('click', () => {
        scraps = scraps.filter((x) => x.id !== s.id);
        save();
        render();
      });
      btns.append(put, del);
      card.append(text, meta, btns);
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-rhema-scrap', s.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.appendChild(card);
    }
  }

  // a scrap card dropped on a poem lands at the drop point
  document.addEventListener('dragover', (e) => {
    if (!isPoem() || !e.target.closest || !e.target.closest('.chapter-body')) return;
    if (!Array.from(e.dataTransfer.types || []).includes('application/x-rhema-scrap')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', (e) => {
    if (!isPoem() || !e.target.closest || !e.target.closest('.chapter-body')) return;
    const id = e.dataTransfer.getData('application/x-rhema-scrap');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    const scrap = scraps.find((s) => s.id === id);
    if (!scrap) return;
    const body = e.target.closest('.chapter-body');
    currentChapterId = body.closest('.chapter').dataset.id;
    body.focus({ preventScroll: true });
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r) {
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
    }
    putIn(scrap);
  });

  /* ---------------- per-book wiring ---------------- */

  function bookOpened(meta) {
    const poem = !!(meta && NeoHooks.format(meta.format) && NeoHooks.format(meta.format).poem);
    const tab = document.querySelector('.tab[data-tab="scraps"]');
    if (tab) tab.hidden = !poem;
    const i = TAB_ORDER.indexOf('scraps');
    if (poem && i < 0) TAB_ORDER.splice(3, 0, 'scraps');
    else if (!poem && i >= 0) TAB_ORDER.splice(i, 1);
    scrapsFor = null; // the next look reads this book's sidecar
    if (!poem && currentTab === 'scraps') switchTab('manuscript');
  }

  NeoHooks.on('poemKey', scrapKey);
  NeoHooks.on('scrapsTabShown', async () => { await ensure(); render(); });
  NeoHooks.on('bookOpened', bookOpened);

  return { cut, putIn, list: () => scraps, render };
})();
