# RHEMA anchors

Every place Rhema touches a NEO-owned file. All Rhema edits in core files
are marked `/* RHEMA */` (or a `RHEMA` block comment) and listed here. At
each upstream **cherry-pick**, `grep -in rhema <core files>` must match this
list — renamed or moved wrapped functions show up at pick time, not at
runtime. (The check is case-INsensitive: rename sites read 'Rhema', guards
read 'RHEMA'.)

Project posture (Stone 18, 2026-10-18): Rhema is a NEW project based on NEO,
not a fork that merges upstream. New features live in NEW files (`poetry.js`,
`scraps.js`, `compare.js`, `ai.js`, `poemai.js`, `rhema-settings.js`,
`qrmark.js`, `drawings.js`, `rhema-assets.js`, …); NEO-owned files carry
anchors. Where identity is at stake (names, ids, runtime artifacts, URLs),
Rhema's own wins and cherry-picks resolve around it — see "Identity" below.

## app.js

| Anchor | What | Phase |
|--------|------|-------|
| `RHEMA — hook bus` block after the i18n preamble | `NeoHooks` — `on`/`emit`/`emitTrue`/`emitList`/`has` + `registerFormat`/`format` registry. `emitTrue` (Phase 2) = veto: first listener returning true stops the host's handling. `emitList` (2e) = merge: array results from every listener concatenated (menu surfaces several features share). Additive: no listeners = no-op. | 0–2 |
| `const poemBook = ...` right after the bus block | true when the open book's format is a registered poem format | 2 |
| shelf `+` contextmenu: `New Poem Collection` + `NeoHooks.format('poetry').createOnShelf` | the poet's new-book flow, beside New Book / New Script. UX gate BLOCKER-2 (2h): poems are NOT a "more feature" — in simple mode the right-click answers with the poem item alone (was a silent no-op) | 2+2h |
| shelf blank card: `poemBlank` (`.new-book.rhema-new-poem`, label `t('Poem')`) appended after `blank` on unbound shelves | UX gate BLOCKER-2: the poet's first action is a visible second tile, not a hidden gesture | 2h |
| `prose()` in `buildPrintHtml()`: `lastPoem` reduce + `break-after:avoid` on the last poetry paragraph (poem books only) | UX gate S3: the poem's last stanza is tied to its colophon — the mark never orphans at a page top | 2h |
| Enter-hint toast: `NeoHooks.emit('enterHint') ?? t(...)` | poets get the poem rhythm wording | 2 |
| keydown: `if (poemBook()) { ... }` branch after the `isScript()` branch | poem books: `NeoHooks.emitTrue('poemKey', …)` then the delete guards + smartKeys; prose poetry/flush/section-break rules never run | 2 |
| beforeinput: `if (poemBook()) { e.preventDefault(); NeoHooks.emit('poemLineBreak', …); return; }` | an IME's line break becomes a real `<br>` via poetry.js | 2 |
| `syncChapter()`: `NeoHooks.emit('chapterSynced', body, chId)` | poetry.js marks every paragraph verse before capture | 2 |
| `openBook()`: `NeoHooks.emit('bookOpened', book)` | fork features re-arm per book (scraps.js tab visibility + sidecar reset, poetry.js) | 2c |
| inside `chapterMenu()` (host names in doc were wrong — anchors sit in `chapterMenu()`, not `chapterMenuItems/Choice`): `emitList('chapterMenuItems', …)` + `emitTrue('chapterMenuChoice', …)` | poem status items (draft/fair copy/done, 2b) and per-poem Poem QR…/Poem drawing… submenus (2e) grow on the card + nav chapter menus; choices answer themselves | 2b+2e |
| `deleteChapterQuiet()`: `NeoHooks.emit('chapterDeleted', chId)` (anchor host is deleteChapterQuiet, not deleteChapter) | per-chapter fork metadata (poem status) is pruned with the chapter | 2b |
| `renderNav()` item: `NeoHooks.emit('navItem', item, chId)` | status dots in the chapter nav | 2b |
| `renderBoard()` board + `chapterCard()` card: `NeoHooks.emit('boardRendered', board)` / `emit('poemCard', cell, chId)` (anchor hosts are renderBoard/chapterCard, not renderOutline) | collection progress chip; rich poem cards (title, first line, line count, status dot) | 2b |
| `switchTab()`: scraps-drawer hide + `name === 'scraps'` branch (`emit('scrapsTabShown')`) | the scraps drawer belongs to its tab alone (class selector, never `$('#…')` — Pocket id-parity); Scraps tab wiring | 2c |
| `renderFootnoteList()`: `if (!chapter) return;` guard | defensive fix for a LATENT UPSTREAM bug: snapshot views leave `.chapter-body` nodes outside any `.chapter`, and `openBook → renderChapters → renderAllFootnoteLists` crashes on them (repro in plain NEO: open a snapshot, back to shelf, open a book). Exposed by the compare e2e. Candidate to report upstream via Panos. | 2d |
| `showSnapshot()`: `NeoHooks.emit('snapshotShown', v)` | compare.js turns a poem snapshot side-by-side (Then/Now + added-word marks) | 2d |
| `backToShelf()`: `NeoHooks.emit('shelfShown')` | fork features disarm on the shelf (poetry.js clears the poem-terms map) | 2h-fix |
| `emitList()` separator cleanup | several listeners each prepend '-': runs collapse, trailing '-' drops (chapter menu double-separator fix) | 2h-fix |
| `renderChapters()` loop end: `NeoHooks.emit('chapterRendered', sec, chId)` | the poem mark (QR + watermarked drawing) is appended to the section, outside `.chapter-body` — never captured into the chapter file (qrmark.js) | 2e |
| `buildHtml()` chapter branch + `buildPrintHtml()` chapter loop: `NeoHooks.emit('exportSectionEnd', sec, d)` | the same mark prints in PDF/HTML exports and the chapbook; listener checks `poemBook()` (shelf exports borrow `book` first) | 2e |
| shelf card menu (both paths): `emitList('shelfCardMenu', meta)` + `emitTrue('shelfCardChoice', meta, choice)` | poem books grow Set/Remove collection-drawing items (qrmark.js) | 2e |
| `document.title = ... 'Rhema' /* RHEMA */` in `showWindowTitle()` | window title says Rhema | 0 |
| `checkForUpdate()` `state === 'off'` branch | honest "Updates arrive by hand" notice instead of a fake "up to date" (Stone 15) | 0 |
| `showAbout()` `<h2>Rhema</h2>` | About modal heading (hardcoded, bypasses t()) | 0 |
| `requestPaint()` provider line + `hasSecret` guard | `RhemaSettings.configured()` routes covers through ai.js (provider `'rhema'`); the key check is skipped for local endpoints | 1 |
| `requestPaint()` nudge toast | reworded for Rhema builds: points at File → Rhema Settings… (local models), not at an OpenAI key | 1 |
| `refreshCover()` `hasKey` line | a configured Rhema AI counts as "paintable" without an OpenAI secret | 1 |
| `refreshCover()` paint-menu desc | on the Rhema path: "about a minute, on your own machine" — no "few cents" | 1 |
| `snapsToThin(snaps, now, keepDays)` | Stone 6: retention parameter (default = upstream 30; 0/Infinity = unlimited); call site passes `RhemaSettings.snapKeepDays()` | 1 |
| `WINDOWS` list + `msg.type === 'rhemaSettings'` | File → Rhema Settings… opens `RhemaSettings.open()` | 1 |
| bookTile export menu: `Chapbook PDF (5×8)…` label for poem books (value stays `'paperback'`) | poets print chapbooks (Stone 13) | 3a |
| `importChaptersIntoBook()`: `poemBook() ? NeoHooks.format('poetry').poemChapterHTML(ch) : importedChapterHTML(ch)` | a poem book takes imported chapters as poems: stanzas + soft breaks | 3a |
| `importDroppedChapters()`: pdf in the drop filter + `{ poetry: true }` when `poemBook()` | dropped files into an open collection keep lines | 3a |
| `importChapters()`: `{ chapters: true, poetry: true }` for poem books | the in-book Import… keeps lines | 3a |
| `printPaperback()` ×2 (trim preselect + `let trim`): `bp.trim || (poemBook() ? '5x8' : '5.5x8.5')` | the paperback dialog opens as a chapbook for poem books (upstream `PRINT_TRIMS` already has 5×8) | 3a |
| `buildMd()`: `p.poetry` branch — `'  \n> '` between lines | Markdown export keeps verse lines (hard break, continuing blockquote) | 3a |
| `buildPrintHtml()` section class `+ ' poem'` (kept for Stone 17) + `prose()` prevPoetry flag: poem-book stanzas after the first get inline `margin-top:0.9em` | stanza gaps read as gaps in the chapbook (~2x line pitch, UX round-2 note); inline survives Paged.js page cloning where the ancestor CSS selector did not; novels' poetry-in-prose untouched | 3c |
| `buildPrintHtml()` chapter head: `label = poemBook() && own ? '' : chapterName(…)` | a titled poem prints its title alone in the chapbook too — the print template builds label+title separately from chapterHeading (found in the 3b re-render) | 3b |
| `chapterHeading()`: poem books get the title alone (no 'Poem 1 — Κεριά' double-name in print/EPUB; untitled keeps the 'Poem n' fallback) | UX gate: chapter chrome leaked into the chapbook and EPUB h1 | 3b |
| `printPaperback()` dialog chrome: h2 `Chapbook PDF` + KDP-free hint when `poemBook()`; `pm-fiction` and `pm-review` checkboxes default OFF for poem books (explicit on still works) | the menu says Chapbook, the dialog must too; a poetry chapbook is not 'a work of fiction' and does not beg for Amazon reviews by default (UX gate) | 3b |
| `buildTxt()`: `p.poetry` takes text from runs (`{ br, text:'\n' }`) | plain-text export keeps verse lines — `p.innerText` on the detached holder never renders, so `<br>` vanished and lines ran together (found by e2e; novels have no soft breaks, prose path untouched) | 3a |
| EPUB chapter `inner`: `NeoHooks.emit('epubSectionEnd', ch, d)` | the poem mark closes each EPUB chapter (qrmark.js emits XHTML: closed `<img/>`, no contenteditable) | 3a |
| `onMenu`: `msg.type === 'importPoems'` → `NeoHooks.format('poetry').importPoems()` | File → Import Poems… | 3a |
| (future) enter-key call-site, menu call-sites, cards, export formats | one `NeoHooks.emit(...)` per hook surface | 2+ |

## i18n.js

| Anchor | What | Phase |
|--------|------|-------|
| poem-terms map inside `t()` (`setTerms`) | Display-only poem chrome: while a poem book is open, chapter words in the TRANSLATED template become poem words (en + el maps ride together; before variable fill, so writer's words untouched). poetry.js arms on `bookOpened`, clears on `shelfShown`. Covers header, footer counter, nav, add card, snapshot labels, exports — zero new core anchors. Locale files stay byte-identical. | 2h-fix |
| brand replace inside `t()` | Display-only rebrand: `\bNEO\b` → `Rhema` applied to the translated/English template BEFORE variable fill (writer's own words in `{vars}` are never touched; strings containing `hughhowey` skipped). Shared by main process and window, so every visible string — dialogs, menus, toasts, all locales — rebrands through this one line. Upstream keys and all `locales/*.json` stay byte-identical: zero merge friction. | 0 |

## Rebrand strategy (Panos 2026-10-17; updated by Stone 18, 2026-10-18)

2026-10-17 rule: only what is VISIBLE says Rhema; the i18n.js brand line is
the display seam, and locale keys/literals stayed byte-identical to minimize
merge friction.

2026-10-18 (Stone 18): "This is not a fork. This is a new project." The
display seam stays (it works, and it is one line), but identity strings are
now Rhema's own AT THE SOURCE where identity matters — see Identity below.
Code identifiers that carry no identity (`window.neo`, `NeoHooks`,
`NeoCovers`, `NeoManuscript`, `NeoPdf`, `NEO_TRY_DIR`, CSS classes,
`simple-neo.test.js`) stay: churn without truth. Cherry-pick conflicts on
identity lines are expected and resolved in Rhema's favor.

## main.js

| Anchor | What | Phase |
|--------|------|-------|
| `const RHEMA_AUTO_UPDATE = true` + `rhemaAutoUpdateOn()` (updater section) | Stone 15 gate; master switch ENABLED 2026-10-18 (Panos) after the updater-target fix (a0050c0). Auto-update is the USER's choice (Panos 2026-10-18): library.rhema.autoUpdate (Rhema Settings → Updates, default off) gates getUpdater(), the background look, and installs; installs only on quit (autoInstallOnAppQuit) or an explicit Restart to update — never mid-session. The plain-API fallback (Help → Check for Update…) always works. | 0 |
| `Rhema Library` (6 sites, was `NEO Library`) | library folder name | 0 |
| `applicationName: 'Rhema'` (about panel) | product name | 0 |
| startup migration block after `LIBRARY_FILE` | first-run adoption: if Rhema Library is empty but a NEO Library exists, ask once to open it (books from NEO never look "gone"). The NEO references ride a `{neo}` variable on purpose — the brand seam fills variables AFTER branding, so "NEO Library" survives as the upstream's name. | 0 |
| `cover:paint` handler | provider `'rhema'` branch → `ai.js` `paintCover`; settings read from the user's library file (never renderer-supplied), secret name `rhema-ai`, key optional for local endpoints | 1 |
| `rhemaAiSettings()` + `ai:test` handler | library.rhema.ai read (main-side source of truth); the Test button, with the saved key attached only when the tested base equals the saved base | 1 |
| `dailyBackup()` `keep:` + `rhemaBackupKeep()` | Stone 6: backup retention from library.rhema.retention.backups (default 14, `'unlimited'` → keep all) | 1 |
| File menu `Rhema Settings…` item (was `Rhema AI…` — the pane holds AI, QR, import split and retention; renamed at the Phase 3 UX gate) | opens the Rhema settings pane — UNGATED at the Phase 5 gate (no longer behind Show More Features: the guide's step 13 must be findable on first run); `Language` (View) and `Spellcheck Language` (Edit) ungated the same batch, pinned in simple-neo.test.js SIMPLE | 1+3b+5 |
| `initLanguage()`: `loadLanguage(saved || 'en')` | Stone 11 as amended by Panos 2026-10-18: first launch is English regardless of the system language; Greek is fully supported one switch away (View → Language). The saved choice always wins. Spellcheck follows the interface. | 2f |
| shortcuts window: `...(poemBook() ? [[⌘⇧E, Reader's Eye…]] : [])` | Phase 4 shortcut-reference row (added in c6b9e8f; marker recorded at the Phase 5 gate — the line itself predates it); Phase 5: ungated for poem books, matching the guide teaching the chord on first run | 4+5 |
| `rhema:asset:pick/set/read/clear/write` handlers | Stone 1a: poem-mark drawings — `rhema-drawing.(png|jpg|webp|svg)` (collection) and `rhema-drawing-<chId>.*` (one poem); slug-validated key, fixed names; reuses readCover (svg mime added). **2h-fix (security review): `set` takes a one-time token issued by `pick`, never a renderer path** — a compromised renderer cannot stage an arbitrary image-extension file from disk; handler wrapped in try/catch. **Stone 17 (2h): names/gate/writes extracted to `rhema-assets.js` (unit-testable); ASSET_EXTS splits from COVER_EXTS (upstream covers stay raster-only); `write` is the generated-SVG channel (ornaments/fingerprints/AI), same fixed-name gate; every SVG passes `sanitizeSvg` (no script/foreignObject/use/handlers/external refs — refused whole with the reason)** | 2e+2h-fix+2h |
| `importFile(fp, opts)` | Stone 12: `opts.poetry` keeps every line a line — txt/md poem files stream `{ text, line, indent }` + `{ gap, wide }` paras; docx empty Word paragraphs become stanza gaps (the split's `cont` flag from the first draft was dead and removed — the flatMap line stays byte-identical to upstream); `.pdf` joins via `require('./pdfimport.js').pdfParas` (lazy pdfjs-dist load) | 3a |
| `poemize()` inside `importFile` | the multi-poem splitter: split knob `library.rhema.import.split` = `'auto'` / `'headings'` (gaps never split) / `'whole'`. 3b (UX gate BLOCKER): `'auto'` learns from the file — when it carries explicit structure (headings, separators, page breaks) gaps NEVER split (Η πόλις was cut mid-poem by a double blank line); only structure-free files split on wide gaps. Consecutive blanks collapse to one stanza gap; Title-styled first line names the book; prologue/epilogue roles ride along | 3a+3b |
| `import:files` + `import:pick` handlers | carry `opts` (poetry mode); `.pdf` in the filter only for poetry picks; poetry dialog title 'Bring your poems home' | 3a |
| File menu `Import Poems…` item | `sendToWindow({ type: 'importPoems' })` — each file becomes a poem collection | 3a |
| `pdfimport.js` (new fork file, main-process only — no `<script>` tag) | PDF → paragraph stream: text items sharing a baseline join into lines; the 25th-percentile pitch separates stanza gaps (×1.6) from poem gaps (×2.4); pushed-in lines get the indent flag | 3a |
| `rhema-assets.js` (new fork file, main-process only — no `<script>` tag) | Stone 17: the drawing-asset rules — fixed names, ASSET_EXTS (svg added, split from COVER_EXTS), `sanitizeSvg` gate, `saveAsset`/`findAsset`/`clearAsset`; required by main.js, unit-tested in `scripts/rhema-assets.test.js` | 2h |
| `rhema:draw` handler | Stone 17: AI poem drawings — settings from the library file + key from the secret store (the cover:paint trust boundary; the renderer names only book/poem/kind/motif/text); 'monoline' = LLM-SVG when a text endpoint is set (sanitized before it can be saved), else ComfyUI line art returned as a picture for the renderer to vectorize; 'illustration' = the SDXL chain saved as raster; one job at a time (global ceiling, security gate); errors carry ai.js errKind for plain-language toasts | 2h |
| `latestReleaseFromGitHub()` | FIXED 2026-10-18 (updater-target plan): fetches `api.github.com/repos/dark5un/rhema/releases/latest` with UA 'Rhema-App'; version reduced to the numeric core via `releaseVersionFromTag` so the `v1.5.9-rhema` tag shape compares cleanly. | 15-re |
| `update-core.js` (new fork file, main-process only — no `<script>` tag) | updater version arithmetic: `numericCore`/`releaseVersionFromTag`/`compareVersions` — numeric-core compare kills the old `[1,5,NaN]` trap where a suffixed tag never reported an update; required by main.js, unit-tested in `scripts/update-core.test.js` | 15-re |

## preload.js

| Anchor | What | Phase |
|--------|------|-------|
| `rhema:poemai` handler | Phase 4 (Stones 7+8): the poet AI — 'eye' = Reader's Eye observations, 'titles' = title suggestions; same trust boundary as rhema:draw (library-file settings, secret-store key, renderer names only book/poem/kind/text/collection); shares the one-job-at-a-time ceiling; read posture — the answer goes to notes/title metadata, the poem file is never written | 4 |
| `window.neo.rhema` bridge | namespaced IPC (`test` → `ai:test`; `assetPick/assetSet/assetWrite/assetRead/assetClear` → `rhema:asset:*`; `draw` → `rhema:draw`; `poemAi` → `rhema:poemai`) | 1+ |
| `importFiles: (paths, opts)` | opts carries the poetry mode through `import:files` | 3a |

## index.html

| Anchor | What | Phase |
|--------|------|-------|
| `<title>Rhema</title>`, `<h1>Rhema</h1>` | product name | 0 |
| `<link rel="stylesheet" href="rhema-poetry.css" />` | the poetry format styles (fork CSS file; styles.css stays upstream-clean) | 2b |
| `<script src="rhema-settings.js">` | the Rhema settings pane module (before app.js) | 1 |
| `<script src="poetry.js">` (after app.js) | the poetry format — registers into the hook bus at load; app.js init is async so it lands before any book opens | 2 |
| `<script src="scraps.js">` (after poetry.js) | the scraps drawer (Stone 5) | 2c |
| `<script src="compare.js">` (after scraps.js) | the compare view (Stone 6) | 2d |
| `<script src="qrcode-generator.js">` + `<script src="qrmark.js">` | vendored MIT QR encoder (Kazuhiko Arase, qrcode-generator@1.4.4, unmodified — sha256 18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780, byte-identical to the npm tarball's qrcode.js, verified 2026-10-17) + the poem mark (Stone 1a) | 2e |
| `fonts/gfs-didot-{greek,greek-ext,latin}-400-normal.woff2` + `fonts/gfs-didot-OFL.txt` | GFS Didot (Greek Font Society, SIL OFL 1.1, Google Fonts v18 subsets — sha256 greek edd09b417c95a4d765076f3c52e2625bc1807e150dbcb1b2819f6734c3299f98, greek-ext 847f8505aa2ccc19d28b1b2681bb0b8ded127541084c54ad197968ed226e6238, latin f1748a5240008ec0964d1b001b64bc81b9abb171311110d558ef4b7acf508823, re-verified 2026-10-18 after coding gate B1 caught a 404 HTML page saved as the latin font; scripts/rhema-fonts.test.js now asserts wOF2 magic bytes on every load). Google ships it as three subsets: greek is monotonic-only, greek-ext carries polytonic (ᾨ, Ἀ), latin carries Latin. UX gate S1: the bundled Libre Bodoni subset has no Greek glyphs and the upstream drop-cap stack matches nothing on Linux — GFS Didot leads `--dropcap-font` (override names `html[lang^="el"]` too, or upstream's Greek rule out-specifies it — coding gate B2) and `DROPCAP_FONTS.literary`, so app drop-caps, the mark's initial/monogram and exportFontFaces' print/EPUB embedding all agree on one true Greek Didot | 2h |
| `<script src="imagetracer.js">` (before qrmark.js) | vendored raster→vector tracer for the ComfyUI line-art fallback (imagetracerjs@1.2.6, The Unlicense, unmodified — sha256 1f7e21062196c53f2565120fc0708eac197c8403ec1bea28b381056ea0c3fdb9, byte-identical to the npm tarball's imagetracer_v1.2.6.js, verified 2026-10-17; LICENSE kept as imagetracer-LICENSE.txt). Chosen over @visioncortex/vtracer, whose npm line is alpha-only (1.0.0-alpha.4) — revisit when vtracer ships stable | 2h |
| `<script src="drawings.js">` (after qrmark.js) | Stone 17 generated drawings: ornaments (fleuron/asterism/meander/drop-cap), poem fingerprint (FNV-1a + mulberry32 harmonograph), monogram seal; the AI drawing flow + renderer-side vectorize (canvas lives here, never in main — canvas-prune contract) | 2h |
| `<script src="poemai.js">` (after drawings.js) | Phase 4 renderer: the ⌘⇧R/Ctrl+Shift+R Reader's Eye hotkey (KeyR free upstream — listener lives in the fork file, no app.js anchor), the Suggest titles… chapter-menu items via the hook bus, notes filing (`book.chapterNotes` + dated labeled block), title acceptance (`book.chapterTitles` metadata); book-switch guards; offered only when a text endpoint is configured | 4 |
| (future) more Rhema `<script>` tags | new fork files | 2+ |

## package.json (no comments possible — listed here instead)

- `name: rhema`, `productName: Rhema` (both places)
- `appId: io.onlyascii.rhema` (Stone 16 placeholder; final name at ship time)
- `publish: github dark5un/rhema` — kept on purpose (Stone 15 clean
  auto-update re-enable path); never removed.
- `linux.executableName/desktopName: rhema` + `syncDesktopName: true` —
  runtime WM_CLASS is lowercase "rhema" (verified via xprop); without this
  the .desktop entry's StartupWMClass (Rhema) never matches and windows
  don't associate with the desktop icon (Phase 5 depends on it).
- `homepage` and `linux.maintainer` (Hugh Howey) KEPT as attribution —
  explicit decision (review 2026-10-17); revisit only at public release.
- `test:rhema-settings` script — runs scripts/rhema-settings.e2e.js (Electron pane test).
- `dependencies: pdfjs-dist 6.4.299` (exact pin, house convention) — Stone 12
  PDF import (legacy build, lazily imported by pdfimport.js only during a PDF
  import; getDocument runs isEvalSupported:false + standardFontDataUrl into
  the packaged standard_fonts/).
- `build.files: !node_modules/@napi-rs/canvas-*/**` — prunes pdfjs's optional
  canvas binaries (same posture as koffi): the text-only import path never
  instantiates NodeCanvasFactory; if a future feature touches PDF image
  conversion, keep the host platform back.

## scripts/

| File | What |
|------|------|
| `scripts/library-folder.test.js` | expectations follow the 'Rhema Library' rename (marked) |
| `scripts/filesystem.test.js` | catalog header expectation follows the i18n brand seam (marked) |
| `scripts/*.e2e.js` (9) + `scripts/try.js` | seed 'Rhema Library' to match main.js default; verified at upstream baseline parity (words 22/0, tabs 9/0, notes 14/0, footnotes 24/0, caret 14/0, cover-text 2/0, manuscript 5/0, simple 14/0, pages 9/4 = 4 pre-existing env failures) |
| `scripts/rhema-ai.test.js` | Phase 1: ComfyUI workflow builder, retention knobs (keepValue + snapsToThin unlimited), settings gate, brief plumbing — hermetic. Stone 17 adds: extractSvg from fences, drawMonolineSvg (motif leads / poem derives, reasoning-budget retry 3000→8000 pinned from the live pitfall, hostile-SVG refusal), paintLineart (ink-on-paper prompt, square size), drawIllustration (rides the SDXL settings). Phase 4 adds: readersEye (Stone 8 language rule + read posture pinned from the prompt, honest failure on unnumbered prose), suggestTitles (bullets/numbers/guillemets stripped, collection context rides), chatText reasoning-retry budget 2500→8000 |
| `scripts/rhema-ai-live.js` | NOT in npm test: live chain check (Strata brief → ComfyUI render) against this machine's endpoints; Stone 17 adds the live LLM-SVG monoline draw. Key from STRATA_API_KEY env (on this machine: the strata quadlet's service.env API_KEY) — never hardcoded |
| `scripts/poetry.test.js` | Phase 2: the pure poetry rules sliced from poetry.js (Enter rhythm, stanza/poem split, line ops) — vm harness, hermetic |
| `scripts/poetry.e2e.js` (`test:poetry`) | Phase 2: real Electron — new poem collection, Enter rhythm, line ops, structural undo, disk format, poem mark (QR/drawing per poem), and the novel's Enter rhythm unchanged. Visible fixtures are real public-domain Kavafis verse («Κεριά», «Η πόλις»), not placeholder words (Panos 2026-10-17). 3a adds: .txt import → poem collection (lines/stanzas/titles/mark kept), md/txt/EPUB export keeps verse + XHTML-safe mark, chapbook dialog opens at 5×8, shelf-card Import poems… joins the collection. Phase 4 adds: Reader's Eye via the real hotkey onto a canned loopback chat server (observations filed in notes, block labeled, poem file byte-identical), Suggest titles… via the menu path (title lands in metadata, poem file still byte-identical), and the item hidden with no endpoint |
| `scripts/import-poetry.test.js` | Phase 3a: main.js in a vm — poemize split knob (auto/headings/whole), Kavafis txt/md/docx fixtures, PDF line/pitch grouping (pdfimport pure functions), novels untouched (no opts = old chapterize) — hermetic |
| `scripts/rhema-assets.test.js` | Stone 17: rhema-assets.js — name globs (hostile keys), the sanitizeSvg gate (prolog lead-in, script/handler/external refusal), saveAsset replace-by-extension + refusal-writes-nothing — hermetic |
| `scripts/import-chapters.test.js` | upstream suite; harness gained `poemBook: () => false` + `NeoHooks.format: () => null` stubs for the poem-book seam (novel path always answers) |
| `scripts/*.e2e.js` (12) | each pins `uiLanguage: 'en'` in its temp settings.json — determinism for suites that read English strings (the first-run default is English since the 2026-10-18 amendment; a saved Greek choice still wins) |
| `scripts/spellcheck.test.js` | interface language set via saved settings (the fork never derives it from the system); pinned fork case: first launch = en + en-US dictionary whatever the system language (2026-10-18 amendment) |

## Phase 6 — the book's languages (Stone 19/20, 2026-10-18)
Every anchor of the increment in one place; the per-file tables above stay
the running list, this section is the cherry-pick map for the spellchange.

| File | Anchor | Phase |
|---|---|---|
| `spellbook.js` (new fork file) | the book's language set: `syncBookSpell()` pushes the open book's `book.spellLanguages` (or the library default, or en-US) into main when it differs; `bookSpellPicker()` — Edit → "This book's languages…" modal (primary select + also-accept checkboxes, primary disabled in the list, cap 5); `rhemaRescanSpelling()` mirrors changeSpellLanguage's rescan; listens on bookOpened / spellDefaultChanged / bookSpellLanguages; the picker backdrop carries `.sb-picker` (first-run modals also use `.modal-backdrop` — scope queries) | 6 |
| `index.html` | `<script src="spellbook.js">` after scraps.js | 6 |
| `app.js` | `writingLanguage()`: book primary → library default → 'en-US' — the interface locale NEVER enters (upstream fell back to `NeoI18n.getLocale()`); quote style + focus Segmenter follow it. `SPELL_LANGUAGE_NAMES` gained `'el'` (the fork's dictionary had no toast name). `changeSpellLanguage` emits `spellDefaultChanged`. menu msg `bookSpellLanguages` → `NeoHooks.emit`. `usesMoreFeatures`'s spellLanguage≠UI clause KEPT (legacy-library migration only — Stone 20 makes it normal for new libraries, and `moreFeatures` is already decided by then) | 6 |
| `main.js` | `loadSpellDictionary(codes)` takes an array (primary first, validated against SPELL_LANGUAGES, cap 5) and sends `{type:'load', languages:[{language,dir}]}`; `spellLoaded` → `spellLoadedSet` (crash-respawn reloads the whole set); `defaultSpellLanguage()` → always 'en-US' (follow rule abolished, Stone 20); `setUiLanguage()` never touches dictionaries; `spell:setBookLanguages` + `spell:listLanguages` handlers; Edit menu "This book's languages…" (ungated) | 6 |
| `spell-worker.js` (upstream file, anchored) | `spell` → `spells` array; load accepts `languages:[…]` and still answers the legacy single `language`+`dir` shape (cherry-pick safety); `correct` = ANY dictionary (union-acceptance); `suggest` = primary; `add` = every dictionary; a failed member load keeps the previous set whole | 6 |
| `preload.js` | `setBookSpellLanguages`, `spellLanguageList` | 6 |
| `locales/el.json` + `en.json` | picker strings + '{n} languages for this book' plurals; 'Greek' toast name | 6 |
| `scripts/spellcheck.test.js` | follow-rule cases RE-PINNED as the decoupling rule (UI switch never reloads; every locale lands en-US; explicit default wins incl. el); new: `spell:setBookLanguages` gate (validation, cap, order) + worker union (el+en-US accept, fr flags, primary suggests, learn joins, failed member load keeps the set) | 6 |
| `scripts/spellbook.e2e.js` + `npm run test:spellbook` | real app: default en-US flags Greek; picker via the real menu message; book.json carries `spellLanguages:['el','en-US']`; union-acceptance on screen (French still honestly flagged); quote style « » from the book primary under an English UI; a second book inherits the default; learning quiets under the set | 6 |

## Hook bus semantics (note for Phase 2)

`NeoHooks.emit` returns the LAST non-undefined listener result
(last-wins). If Phase 2 enter-key/line-op hooks need veto or first-wins
semantics, extend emit then — don't special-case call-sites.

## Deliberately NOT touched

- `LICENSE` + Hugh Howey attribution + About-box credits — MIT posture.
- Desktop locale keys containing "NEO Library" — the brand seam displays
  them as Rhema Library, so the display is already truthful; renaming the
  keys would churn 15 files for zero visible change. (Stone 18 renamed the
  three POCKET-owned toast keys, which the desktop seam never renders.)
- el.json topped up 2026-10-17 (295 new Greek entries incl. every Rhema
  string; en.json gained the fork's three English plurals).

## Identity (Stone 18, 2026-10-18) — Rhema's own at the source

Cherry-pick contract: these lines are Rhema's; upstream edits to them
conflict and resolve in Rhema's favor.

- Runtime artifacts: `rhema-errors.log` (was neo-errors.log), backup zips
  `rhema-backup-YYYY-MM-DD.zip` (backup-worker's retention regex matches
  BOTH `rhema-` and legacy `neo-` names so pre-rename backups still prune).
- Crash-report URL: `github.com/dark5un/rhema/issues` in main.js + all 31
  locale sites (the seam maps the word NEO, never URLs).
- Library folder `Rhema Library` (Phase 0) + Pocket's functional
  `ROOT`/`folderName` now read it too.
- Pocket: name **Rhema Pocket**, ids `io.onlyascii.rhemapocket` (capacitor,
  gradle namespace/applicationId/keyAlias, strings.xml, pbxproj, Info.plist,
  entitlements iCloud container `iCloud.io.onlyascii.rhemapocket`).
  Not shipped yet (Stone 14); CI parked.
- Workflows parked: build.yml fires only on `rhema-never-*` tags,
  pocket.yml only on branch `never-rhema-ci`; both keep workflow_dispatch.
- Docs (README, AGENTS, TUTORIAL, TRANSLATING, CONTRIBUTING, print/,
  pocket/, scripts/*-spellcheck.md) are Rhema's own prose — upstream doc
  edits never cherry-pick without a manual truth pass.
- `upstream` remote is fetch-only (`--push no_push`); never contact upstream.
