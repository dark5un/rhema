# Contributing to Rhema

Rhema is a **family project, private today and public at ship time** — once
the repo is public, pull requests and issues are welcome, and the ground
rules below will apply to them. If you were pointed here from NEO, thank
you: Rhema is a new project based on [Hugh Howey's
NEO](https://github.com/hughhowey/neo) (MIT), and the best place to
contribute to the shared roots is upstream, where Hugh welcomes issues and PRs.

## The philosophy (inherited from Hugh, kept on purpose)

Writing apps were eventually ruined by bloat. The bar for new features is not
"would this be cool?" but "does this help a working writer write, finish, and
publish books — or poems?"

Good territory: bug fixes, performance, accessibility, better import/export
precision, and the poetry workflow.

## How the code works

- `main.js` — the Electron main process: window, menus, file system, import/export, backups.
- `preload.js` — the bridge. Every capability the UI has is listed here.
- `app.js` — the entire UI: bookshelf, editor, outline, search, goals.
- `styles.css` — all styling, with CSS variables at the top.
- `poetry.js`, `scraps.js`, `compare.js`, `qrmark.js`, `drawings.js`, `ai.js`, `poemai.js`, `rhema-settings.js`, `rhema-assets.js` — Rhema's own files, hung on the hook bus in `app.js`.

Books are folders of plain files in `~/Documents/Rhema Library`: `book.json`
for metadata, `chapters/*.html` for text, JSON files for
darlings/stickies/scraps.

## Ground rules

1. **Nothing interrupts a writer mid-sentence.** No popups, no squiggles, no notifications while typing.
2. **UI stays invisible until hovered.**
3. **Words are never lost.** Any feature that removes text must route it somewhere recoverable.
4. **Plain files.** No databases, no proprietary formats. Future-proof, please!
5. **AI never writes into the manuscript.** Feedback goes to the notes pane only.

## Working in this repo

- Run from source: `npm install && npm start` (needs Node.js).
- [AGENTS.md](AGENTS.md) is the technical map; [RHEMA-ANCHORS.md](RHEMA-ANCHORS.md) lists every anchored seam in upstream-owned files and the cherry-pick contract.
- Crash reports: include the OS, what you did, what happened, and the tail of `~/Documents/Rhema Library/rhema-errors.log` — and send them to Panos, not to a public tracker.
