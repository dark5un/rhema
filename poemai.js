/* ==================================================================== */
/*  RHEMA — the poet AI (Phase 4, Stones 7+8)                            */
/*                                                                       */
/*  Reader's Eye: Ctrl/Cmd+Shift+E on an open poem (or the poem's ⋯     */
/*  menu) -> 3-5 concrete observations land in the poem's notes.         */
/*  Title suggestions: the poem's ⋯ menu -> 'Suggest titles…' -> pick   */
/*  one -> it becomes the chapter title. Both are READ posture: the     */
/*  poem file is never written to — the confirmed rule (Stone 7).       */
/*  Stone 8: the model answers in the poem's own language; the prompt   */
/*  says so and the poem itself is the language sample. The AI chain    */
/*  lives in main (rhema:poemai) behind the cover:paint trust boundary; */
/*  this file only asks, shows, and files the answer.                   */
/*                                                                       */
/*  Gate fixes (round 1): the chord moved off Ctrl+Shift+R — that is    */
/*  Format > Align Right in more-features menus (a main.js accelerator, */
/*  invisible to a renderer-only grep; UI gate B1). Shift+E is free     */
/*  against BOTH the menu accelerators (C/F/I/J/L/O/R/T) and the        */
/*  renderer's chords (D/N/S/X/Z). Model titles are escHtml'd before    */
/*  they reach optionModal's innerHTML (security gate BLOCKER).         */
/* ==================================================================== */

const RhemaPoemAi = (() => {
  'use strict';

  // coding gate discipline (Stone 17): the model call is long — if the
  // poet opens another book mid-flight, nothing may be filed into the
  // wrong book
  function guard(bookId) { return () => !book || book.id !== bookId; }

  async function readersEye(chId) {
    chId = chId || currentChapterId;
    if (!poemBook()) return;
    if (!chId) { toast(t('Open a poem first.'), 2500); return; } // UX gate: no silent dead presses
    if (!RhemaSettings.hasText()) { toast(RhemaDraw.aiError({ kind: 'unset' }), 4000); return; }
    const bookId = book.id;
    const gone = guard(bookId);
    toast(t('The AI is reading the poem…'), 30000); // UX gate S7: a local model can take half a minute; the finish toast replaces it
    const got = await window.neo.rhema.poemAi(bookId, chId, 'eye', RhemaDraw.poemText(chId));
    if (gone()) return;
    if (got && got.busy) { toast(t('One reading at a time — the last one is still going.'), 2500); return; }
    if (!got || !got.obs) { toast(RhemaDraw.aiError(got), 5000); return; }
    book.chapterNotes = book.chapterNotes || {};
    const prev = book.chapterNotes[chId] || '';
    // UX gate S2: date AND time — two same-day runs must be tellable apart
    const block = t("Reader's Eye") + ' — ' + fmtDate(new Date(), { hour: '2-digit', minute: '2-digit' }) + '\n'
      + got.obs.map((o) => '· ' + o).join('\n');
    book.chapterNotes[chId] = prev ? prev + '\n\n' + block : block;
    scheduleMetaSave();
    if (currentTab === 'notes') renderNotesSide();
    scheduleNavRefresh(); // UX gate S1: the nav note peek must not stay stale
    toast(t("Reader's Eye filed {n} observations in the notes", { n: got.obs.length }), 3500);
  }

  async function titleIdeas(chId) {
    chId = chId || currentChapterId;
    if (!poemBook()) return;
    if (!chId) { toast(t('Open a poem first.'), 2500); return; }
    if (!RhemaSettings.hasText()) { toast(RhemaDraw.aiError({ kind: 'unset' }), 4000); return; }
    const bookId = book.id;
    const gone = guard(bookId);
    toast(t('The AI is suggesting titles…'), 30000);
    const got = await window.neo.rhema.poemAi(bookId, chId, 'titles', RhemaDraw.poemText(chId), book.title);
    if (gone()) return;
    if (got && got.busy) { toast(t('One suggestion at a time — the last one is still going.'), 2500); return; }
    if (!got || !got.titles) { toast(RhemaDraw.aiError(got), 5000); return; }
    const current = ((book.chapterTitles || {})[chId] || '').trim();
    // security gate BLOCKER: model text is network content — optionModal
    // builds its buttons through innerHTML, so labels escape here (the
    // value stays whole; escHtml is the codebase's caller-escapes rule)
    const options = got.titles.map((x) => ({ label: escHtml(x), value: x }));
    // UX gate S3: honest wording (the TITLE changes; the text does not)
    // and the current title shown — acceptance over an existing title is
    // a visible choice, not a silent overwrite
    const msg = t('Pick a title — or cancel. The poem’s text never changes.')
      + (current ? ' ' + t('Current title: {title}', { title: escHtml(current) }) : ''); // the message slot is innerHTML too
    const pick = await optionModal(t('Title suggestions'), msg, options);
    if (!pick || gone()) return;
    book.chapterTitles = book.chapterTitles || {};
    book.chapterTitles[chId] = pick;
    scheduleMetaSave();
    renderChapters();
    renderNav();
  }

  // the hotkey: Ctrl/Cmd+Shift+E (E for Eye). Verified free against the
  // main-menu accelerators AND the renderer's chords at 2026-10-18 — the
  // first pick, Shift+R, collided with Format > Align Right (UI gate B1).
  // The listener lives here so the fork adds no app.js anchor for it.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || e.repeat) return; // coding gate: no key-repeat spam
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'KeyE') {
      if (!poemBook()) return;
      e.preventDefault();
      readersEye();
    }
  });

  // the poem's menu: both AI reading features get visible entries (UX
  // gate B1: invisible entry + silent dead presses was a BLOCKER — the
  // Phase 2h first-action ruling applies). Offered only when a text
  // endpoint is configured AND the book is a poem collection (UI gate
  // B2: a novel's chapter menu must not grow poem chrome).
  NeoHooks.on('chapterMenuItems', () =>
    RhemaSettings.hasText() && poemBook()
      ? ['-', { label: t("Reader's Eye…"), value: 'rhemaEye' }, { label: t('Suggest titles…'), value: 'rhemaTitles' }]
      : []);
  NeoHooks.on('chapterMenuChoice', (chId, choice) => {
    if (choice === 'rhemaEye') { readersEye(chId); return true; }
    if (choice !== 'rhemaTitles') return false;
    titleIdeas(chId);
    return true;
  });

  return { readersEye, titleIdeas };
})();
