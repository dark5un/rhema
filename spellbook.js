/* ==================================================================== */
/*  RHEMA — the book's languages (Stone 19/20, Phase 6)                 */
/*                                                                      */
/*  A book declares the languages it speaks: book.spellLanguages, an    */
/*  ordered set of dictionary codes (primary first). Spellcheck         */
/*  union-accepts — a word is left alone if ANY declared dictionary     */
/*  knows it (Panos: a correctly spelled foreign word must never be     */
/*  flagged "as it is not true") — while suggestions and quote style    */
/*  follow the primary. The interface language never enters this file.  */
/*  Loaded AFTER app.js; speaks through the NeoHooks bus only.          */
/* ==================================================================== */

let rhemaSpellLangs = null;   // [{code,label}] from main, fetched once
let rhemaSpellSynced = null;  // the set last loaded into main, joined

async function rhemaSpellLanguages() {
  if (!rhemaSpellLangs || !rhemaSpellLangs.length) { // gate round-1: an empty fetch must not cache permanently
    try { rhemaSpellLangs = await window.neo.spellLanguageList(); } catch { rhemaSpellLangs = null; }
    if (!Array.isArray(rhemaSpellLangs)) rhemaSpellLangs = [];
  }
  return rhemaSpellLangs;
}

const rhemaValidSet = (arr) => {
  const codes = (Array.isArray(arr) ? arr : []).filter((c) => typeof c === 'string');
  const out = [];
  for (const c of codes) if (!out.includes(c)) out.push(c);
  return out.slice(0, 5); // main caps too; keep the picker honest
};

// Push the open book's set into the spell helper when it differs from
// what main currently holds. A book that declares nothing inherits the
// library default (Edit → Spellcheck Language) — never the UI language.
async function syncBookSpell() {
  const langs = await rhemaSpellLanguages();
  const known = (arr) => rhemaValidSet(arr).filter((c) => langs.some((l) => l.code === c));
  let set = known(book && book.spellLanguages);
  if (!set.length) set = known([library && library.spellLanguage].filter(Boolean));
  if (!set.length) set = ['en-US'];
  const key = set.join(',');
  if (key === rhemaSpellSynced) return true;
  const ok = await window.neo.setBookSpellLanguages(set);
  if (ok) rhemaSpellSynced = key;
  return ok;
}

// The same re-check changeSpellLanguage does in app.js: forget the marks,
// rescan what is on screen.
function rhemaRescanSpelling() {
  spellCache.clear();
  spellScanned = new Set();
  spellRanges = new Map();
  capsRanges.clear();
  CSS.highlights.delete('neo-spell');
  if (spellOn) scanSpellingHere();
}

async function bookSpellPicker() {
  if (!book) { toast(t('Open a book first, then choose its languages.')); return; }
  const langs = await rhemaSpellLanguages();
  if (!langs.length) { toast(t('The dictionary list could not be read.')); return; }
  const declared = rhemaValidSet(book.spellLanguages);
  const primary = declared[0] || (library && library.spellLanguage) || 'en-US';
  const also = new Set(declared.slice(1));

  const bd = document.createElement('div');
  bd.className = 'modal-backdrop sb-picker';
  const rows = langs.map((l) => `
    <label style="display:flex;gap:8px;align-items:center;padding:3px 0">
      <input type="checkbox" data-code="${l.code}" ${also.has(l.code) ? 'checked' : ''} ${l.code === primary ? 'disabled' : ''} />
      <span>${escHtml(l.label)}</span>
    </label>`).join('');
  const opts = langs.map((l) => `<option value="${l.code}" ${l.code === primary ? 'selected' : ''}>${escHtml(l.label)}</option>`).join('');
  bd.innerHTML = `
    <div class="modal" style="width:440px">
      <h2 style="font-size:16px">${t("This book's languages…")}</h2>
      <p>${t('A word is left alone if any language you pick here knows it. Suggestions and quotes follow the primary.')}</p>
      <label style="display:block;margin:8px 0">${t('Primary language')}
        <select id="sb-primary" style="width:100%;margin-top:4px">${opts}</select>
      </label>
      <div style="margin:6px 0 2px">${t('Also accept words from')}</div>
      <div id="sb-also" style="max-height:220px;overflow:auto">${rows}</div>
      <div style="text-align:right;margin-top:10px">
        <button class="m-cancel btn-quiet">${t('Cancel')}</button>
        <button class="m-save" style="margin-left:8px">${t('Save')}</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const primarySel = bd.querySelector('#sb-primary');
  const syncDisabled = () => bd.querySelectorAll('#sb-also input').forEach((i) => { i.disabled = i.dataset.code === primarySel.value; });
  primarySel.onchange = syncDisabled;
  syncDisabled();
  const done = () => bd.remove();
  bd.querySelector('.m-cancel').onclick = done;
  bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
  bd.querySelector('.m-save').onclick = async () => {
    // Gate round-1: saveMeta() is a no-op while a shelf export borrows the
    // open book — wait for it to finish, same guard openBook uses.
    while (shelfExport) await new Promise((r) => setTimeout(r, 50));
    const p = primarySel.value;
    const extra = [...bd.querySelectorAll('#sb-also input:checked')].map((i) => i.dataset.code).filter((c) => c !== p);
    const set = rhemaValidSet([p, ...extra]);
    book.spellLanguages = set;
    await saveMeta();
    done();
    const ok = await syncBookSpell();
    if (!ok) { toast(t('That dictionary would not load')); return; }
    rhemaRescanSpelling();
    toast(t('{n} languages for this book', { n: set.length }));
  };
}

NeoHooks.on('bookOpened', () => { rhemaSpellSynced = null; syncBookSpell().then(rhemaRescanSpelling); });
NeoHooks.on('spellDefaultChanged', () => { rhemaSpellSynced = null; syncBookSpell().then(rhemaRescanSpelling); });
NeoHooks.on('bookSpellLanguages', bookSpellPicker);
