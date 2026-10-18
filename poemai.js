/* ==================================================================== */
/*  RHEMA — the poet AI (Phase 4, Stones 7+8)                            */
/*                                                                       */
/*  Reader's Eye: Cmd/Ctrl+Shift+R on an open poem -> 3-5 concrete      */
/*  observations land in the notes pane. Title suggestions: the poem's  */
/*  menu grows 'Suggest titles…' -> pick one -> it becomes the chapter  */
/*  title. Both are READ posture: the poem file is never written to —   */
/*  the confirmed rule from the plan (Stone 7). Stone 8: the model      */
/*  answers in the poem's own language; the prompt says so and the      */
/*  poem itself is the language sample. The AI chain lives in main      */
/*  (rhema:poemai) behind the cover:paint trust boundary; this file     */
/*  only asks, shows, and files the answer.                             */
/* ==================================================================== */

const RhemaPoemAi = (() => {
  'use strict';

  // coding gate discipline (Stone 17): the model call is long — if the
  // poet opens another book mid-flight, nothing may be filed into the
  // wrong book
  function guard(bookId) { return () => !book || book.id !== bookId; }

  async function readersEye(chId) {
    chId = chId || currentChapterId;
    if (!poemBook() || !chId) return;
    const bookId = book.id;
    const gone = guard(bookId);
    toast(t('Reading the poem…'), 2000);
    const got = await window.neo.rhema.poemAi(bookId, chId, 'eye', RhemaDraw.poemText(chId));
    if (gone()) return;
    if (got && got.busy) { toast(t('One at a time — the last reading is still going.'), 2500); return; }
    if (!got || !got.obs) { toast(RhemaDraw.aiError(got), 5000); return; }
    book.chapterNotes = book.chapterNotes || {};
    const prev = book.chapterNotes[chId] || '';
    const block = t("Reader's Eye") + ' — ' + fmtDate(new Date()) + '\n'
      + got.obs.map((o) => '· ' + o).join('\n');
    book.chapterNotes[chId] = prev ? prev + '\n\n' + block : block;
    scheduleMetaSave();
    if (currentTab === 'notes') renderNotesSide();
    toast(t("Reader's Eye filed {n} observations in the notes", { n: got.obs.length }), 3500);
  }

  async function titleIdeas(chId) {
    chId = chId || currentChapterId;
    if (!poemBook() || !chId) return;
    const bookId = book.id;
    const gone = guard(bookId);
    toast(t('The AI is suggesting titles…'), 2000);
    const got = await window.neo.rhema.poemAi(bookId, chId, 'titles', RhemaDraw.poemText(chId), book.title);
    if (gone()) return;
    if (got && got.busy) { toast(t('One at a time — the last reading is still going.'), 2500); return; }
    if (!got || !got.titles) { toast(RhemaDraw.aiError(got), 5000); return; }
    const pick = await optionModal(
      t('Suggest titles'),
      t('Pick a title — or cancel. The poem itself never changes.'),
      got.titles.map((x) => ({ label: x, value: x })));
    if (!pick || gone()) return;
    book.chapterTitles = book.chapterTitles || {};
    book.chapterTitles[chId] = pick;
    scheduleMetaSave();
    renderChapters();
    renderNav();
  }

  // the hotkey: Cmd/Ctrl+Shift+R (⌘⇧R reads naturally on mac, Ctrl on
  // Linux/Windows — the same cmd test the app's other chords use). KeyR
  // is free upstream (verified 2026-10-18); the listener lives here so
  // the fork adds no app.js anchor for it.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'KeyR') {
      if (!poemBook() || !RhemaSettings.hasText()) return; // honest: no endpoint, no hotkey
      e.preventDefault();
      readersEye();
    }
  });

  // the poem's menu: Suggest titles… (offered whenever a text endpoint
  // is configured — the same availability rule as the AI drawing kinds)
  NeoHooks.on('chapterMenuItems', () =>
    RhemaSettings.hasText() ? ['-', { label: t('Suggest titles…'), value: 'rhemaTitles' }] : []);
  NeoHooks.on('chapterMenuChoice', (chId, choice) => {
    if (choice !== 'rhemaTitles') return false;
    titleIdeas(chId);
    return true;
  });

  return { readersEye, titleIdeas };
})();
