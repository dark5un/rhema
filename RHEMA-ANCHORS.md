# RHEMA anchors

Every place this fork touches an upstream file. All fork edits in core files
are marked `/* RHEMA */` (or a `RHEMA` block comment) and listed here. At
each upstream merge, `grep -n "RHEMA" <core files>` must match this list —
renamed or moved wrapped functions show up at merge time, not at runtime.

Fork posture: new features live in NEW files (`poetry.js`, `scraps.js`,
`compare.js`, `ai.js`, `rhema-settings.js`, `qrmark.js`, …); core files only
carry anchors. Target: <300 changed lines across core files.

## app.js

| Anchor | What | Phase |
|--------|------|-------|
| `RHEMA — hook bus` block after the i18n preamble | `NeoHooks` — `on`/`emit`/`has` + `registerFormat`/`format` registry (~25 lines). Additive: no listeners = no-op. | 0 |
| `document.title = ... 'Rhema' /* RHEMA */` in `showWindowTitle()` | window title says Rhema | 0 |
| (future) enter-key call-site, menu call-sites, cards, export formats, settings panes | one `NeoHooks.emit(...)` per hook surface | 2+ |

## i18n.js

| Anchor | What | Phase |
|--------|------|-------|
| brand replace inside `t()` | Display-only rebrand: `\bNEO\b` → `Rhema` applied to the translated/English template BEFORE variable fill (writer's own words in `{vars}` are never touched; strings containing `hughhowey` skipped). Shared by main process and window, so every visible string — dialogs, menus, toasts, all locales — rebrands through this one line. Upstream keys and all `locales/*.json` stay byte-identical: zero merge friction. | 0 |

## Rebrand strategy (Panos, 2026-10-17)

Only what is VISIBLE says Rhema. Code identifiers, comments, env vars
(`NEO_TRY_DIR`), locale keys, and upstream string literals keep "NEO" —
renaming them would collide with upstream on every merge. The i18n.js brand
line is the single seam; `index.html` title/h1 and the main.js library-folder
name are the only literal renames (both listed above).

## main.js

| Anchor | What | Phase |
|--------|------|-------|
| `const RHEMA_AUTO_UPDATE = false` (updater section) | Stone 15: auto-update disabled. Flip to `true` to re-enable the whole path; `publish` in package.json already points at our repo. Guards: `getUpdater()` early-return, `checkForUpdates()` early-return, `update:check` handler early-return. | 0 |
| `Rhema Library` (5 sites, was `NEO Library`) | library folder name | 0 |
| `applicationName: 'Rhema'` (about panel) | product name | 0 |
| (future) `ai:*` IPC handlers, import formats, snapshot retention setting | | 1–3 |

## preload.js

| Anchor | What | Phase |
|--------|------|-------|
| (future) `window.neo.rhema` bridge | namespaced IPC for Rhema features | 1+ |

## index.html

| Anchor | What | Phase |
|--------|------|-------|
| `<title>Rhema</title>`, `<h1>Rhema</h1>` | product name | 0 |
| (future) Rhema `<script>` tags (~4 lines) | new fork files | 2+ |

## package.json (no comments possible — listed here instead)

- `name: rhema`, `productName: Rhema` (both places)
- `appId: io.onlyascii.rhema` (Stone 16 placeholder; final name at ship time)
- `publish: github dark5un/rhema` — kept on purpose (Stone 15 clean
  auto-update re-enable path); never removed.

## Deliberately NOT touched

- `LICENSE` + Hugh Howey attribution + About-box credits — MIT posture.
- Crash-report string `github.com/hughhowey/neo/issues:` — upstream code
  crashes go upstream.
- `locales/*.json` keys — English source strings are translation keys;
  product-name strings inside locales are handled with the Greek top-up
  pass (Stone 11), not by renaming keys.
- `upstream` remote is fetch-only (`--push no_push`); never contact upstream.
