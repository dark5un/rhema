/* ==================================================================== */
/*  RHEMA — the compare view (Stone 6, Phase 2)                         */
/*                                                                      */
/*  NEO's snapshot view already shows the book as it was and marks the  */
/*  words that are gone. For a poem collection this file turns each     */
/*  differing poem into two columns — then and now — and marks the      */
/*  words that were ADDED, with the same CSS Highlight API. Novels and  */
/*  scripts keep NEO's stacked view untouched.                          */
/* ==================================================================== */

const RhemaCompare = (() => {
  'use strict';

  const isPoem = () => !!(book && NeoHooks.format(book.format) && NeoHooks.format(book.format).poem);

  function enhance(v) {
    if (!isPoem() || !snapShown) return;
    v.classList.add('rhema-compare');
    if (window.CSS && CSS.highlights) CSS.highlights.delete('rhema-snap-added');
    const added = [];
    for (const sec of v.querySelectorAll('.snap-chapter')) {
      const ch = snapShown.chapters.find((c) => c.chId === sec.dataset.id);
      if (!ch || ch.same || ch.now === null) continue;
      const snapBody = sec.querySelector('.snap-body');
      if (!snapBody) continue;
      // two columns: the poem as it was, the poem as it is
      const grid = document.createElement('div');
      grid.className = 'rhema-compare-grid';
      sec.insertBefore(grid, snapBody);
      const col = (labelText, body) => {
        const c = document.createElement('div');
        c.className = 'rhema-compare-col';
        const lab = document.createElement('div');
        lab.className = 'rhema-compare-label';
        lab.textContent = labelText;
        c.append(lab, body);
        grid.appendChild(c);
      };
      col(t('Then'), snapBody);
      const nowBody = document.createElement('div');
      nowBody.className = 'chapter-body snap-body rhema-now';
      nowBody.appendChild(snapHolderEl(ch.now));
      col(t('Now'), nowBody);
      // words in NOW that the snapshot never had
      const marks = wordsGone(htmlParas(ch.now), htmlParas(ch.html));
      [...nowBody.children].forEach((p, k) => {
        const g = marks[k];
        if (!g) return;
        if (g === 'all') { p.classList.add('rhema-added-all'); return; }
        added.push(...wordRanges(p, new Set(g)));
      });
    }
    if (added.length && window.CSS && CSS.highlights && window.Highlight) {
      CSS.highlights.set('rhema-snap-added', new Highlight(...added));
    }
  }

  NeoHooks.on('snapshotShown', enhance);
  return { enhance };
})();
