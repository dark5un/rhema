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
  // Gate round-2 (UI): rows and toast speak with one voice — the
  // t()-translated names app.js already uses, endonym label as fallback.
  // Gate round-3 (coding+UX caught this): SPELL_LANGUAGE_NAMES is a
  // top-level const in classic-script app.js — a global lexical binding,
  // NOT a window property; reference it bare (typeof-guarded).
  const nameOf = (l) => (typeof SPELL_LANGUAGE_NAMES === 'object' && SPELL_LANGUAGE_NAMES[l.code]) || l.label;
  const declared = rhemaValidSet(book.spellLanguages);
  let primary = declared[0] || (library && library.spellLanguage) || 'en-US';
  // Gate round-2 (UX): a Greek poet opening the picker on a book that
  // declares nothing must not meet "English (US)" as her primary. This
  // pre-fills the dropdown ONLY — the interface still never drives the
  // dictionary (Stone 20); it takes effect only if she saves.
  if (!declared.length && !(library && library.spellLanguage)) {
    const ui = (NeoI18n.getLocale() || 'en').split('-')[0];
    const hit = langs.find((l) => l.code === ui || l.code.split('-')[0] === ui);
    if (hit) primary = hit.code;
  }
  const also = new Set(declared.slice(1));

  const bd = document.createElement('div');
  bd.className = 'modal-backdrop sb-picker';
  const rows = langs.map((l) => `
    <label style="display:flex;gap:8px;align-items:center;padding:3px 0">
      <input type="checkbox" data-code="${escAttr(l.code)}" ${also.has(l.code) ? 'checked' : ''} ${l.code === primary ? 'disabled' : ''} />
      <span>${escHtml(nameOf(l))}</span>
    </label>`).join('');
  const opts = langs.map((l) => `<option value="${escAttr(l.code)}" ${l.code === primary ? 'selected' : ''}>${escHtml(nameOf(l))}</option>`).join('');
  bd.innerHTML = `
    <div class="modal" style="width:440px">
      <h2 style="font-size:16px">${t("This book's languages…")}</h2>
      <p>${t('So that correctly spelled foreign words are never marked wrong: a word is left alone if any language you pick here knows it. Suggestions and quotes follow the primary language.')}</p>
      <label style="display:block;margin:8px 0">${t('Primary language')}
        <select id="sb-primary" style="width:100%;margin-top:4px">${opts}</select>
      </label>
      <div style="margin:6px 0 2px">${t('Also accept words from')}</div>
      <div id="sb-also" style="max-height:220px;overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(200,200,200,.55) transparent">${rows}</div>
      <div style="font-size:12px;opacity:.7;margin-top:4px">${t('Up to 5 languages per book')}</div>
      <div style="text-align:right;margin-top:10px">
        <button class="m-cancel btn-quiet">${t('Cancel')}</button>
        <button class="m-save" style="margin-left:8px">${t('Save')}</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const primarySel = bd.querySelector('#sb-primary');
  const boxes = () => [...bd.querySelectorAll('#sb-also input')];
  // Gate round-2 (UX): the cap of five is spoken, not silent — once the
  // set is full the remaining boxes grey out; and a box promoted to
  // primary unchecks itself (a checked-but-greyed box reads as "also").
  const syncDisabled = () => {
    const full = 1 + boxes().filter((i) => i.checked).length >= 5;
    boxes().forEach((i) => {
      if (i.dataset.code === primarySel.value) { i.checked = false; i.disabled = true; }
      else i.disabled = full && !i.checked;
    });
  };
  // Gate round-3 (coding+UX): demoting the old primary must not silently
  // drop it from the book — it re-joins as an also-accept language when
  // the cap has room.
  let curPrimary = primarySel.value;
  primarySel.onchange = () => {
    const room = 1 + boxes().filter((i) => i.checked).length < 5;
    if (room && curPrimary !== primarySel.value) {
      const ob = boxes().find((i) => i.dataset.code === curPrimary);
      if (ob && !ob.checked) ob.checked = true;
    }
    curPrimary = primarySel.value;
    syncDisabled();
  };
  bd.querySelectorAll('#sb-also input').forEach((i) => { i.onchange = syncDisabled; });
  syncDisabled();
  const done = () => bd.remove();
  bd.querySelector('.m-cancel').onclick = done;
  bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
  bd.querySelector('.m-save').onclick = async () => {
    // Gate round-1: saveMeta() is a no-op while a shelf export borrows the
    // open book — wait for it to finish, same guard openBook uses.
    while (shelfExport) await new Promise((r) => setTimeout(r, 50));
    const p = primarySel.value;
    const extra = boxes().filter((i) => i.checked).map((i) => i.dataset.code).filter((c) => c !== p);
    const set = rhemaValidSet([p, ...extra]);
    book.spellLanguages = set;
    await saveMeta();
    done();
    const ok = await syncBookSpell();
    if (!ok) { toast(t('That dictionary would not load')); return; }
    rhemaRescanSpelling();
    // Gate round-2 (UX): the toast names the primary — the checkpoint
    // against the likeliest mistake (primary left in the wrong language).
    const label = nameOf(langs.find((l) => l.code === set[0]) || { code: set[0], label: set[0] });
    toast(set.length > 1
      ? `${t('Primary: {lang}', { lang: label })} · ${t('{n} more', { n: set.length - 1 })}`
      : t('Primary: {lang}', { lang: label }));
  };
}

NeoHooks.on('bookOpened', () => { rhemaSpellSynced = null; syncBookSpell().then(rhemaRescanSpelling); });
NeoHooks.on('spellDefaultChanged', () => { rhemaSpellSynced = null; syncBookSpell().then(rhemaRescanSpelling); });
NeoHooks.on('bookSpellLanguages', bookSpellPicker);
