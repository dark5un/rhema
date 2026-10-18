# Rhema (Ρήμα)

**A distraction-free word processor for authors — novels, screenplays, and poetry.**

Rhema understands from the moment you install it that you are writing *books* and nothing else. No bloat, no distractions, with manuscripts that look like books as you write them. And now poems look like poems: line by line, the way you typed them.

Rhema runs locally. WIPs are saved in plain files on your disk. No accounts or subscriptions. AI, when you use it, runs on your own machine.

Rhema is a new project based on [Hugh Howey's NEO](https://github.com/hughhowey/neo) (MIT), which it keeps whole — every novel, screenplay, KDP and export feature works untouched — and grows a first-class poetry format on top.

## Status: alpha

Rhema is **alpha-quality software, shared as-is with no liability** — the MIT license already disclaims all warranty, and we mean it plainly: this is built for one working poet first and tested on her books, not hardened for the world. Expect rough edges. Your words are always recoverable inside Rhema (Darlings, trash, snapshots), but keep your own backups of your library folder regardless. Bug reports are welcome — they're how alpha becomes stable.

## Download

Binaries are built by CI and posted on the [Releases page](https://github.com/dark5un/rhema/releases): Linux **AppImage** (x64 + arm64), Windows installer + portable, and macOS dmg/zip (arm64 + x64). The macOS builds are unsigned for now — Gatekeeper will warn; open with right-click → Open. On Linux, if the AppImage complains about a sandbox (common on Ubuntu 24.04 and newer), run it as `./Rhema-*.AppImage --no-sandbox`. Your library lives in `~/Documents/Rhema Library`; File → Library Folder… moves it anywhere you like. On first run Rhema notices an existing `NEO Library` and offers to open it — nothing from NEO is ever left behind or moved without asking.

## Poetry, the third format

A **New Poem Collection** sits on the shelf beside novels and scripts. Inside it:

- **Enter is the rhythm.** One Enter: a new line. Two: a new stanza. Three: a new poem. Lines are soft breaks inside one file per poem, so the machinery that protects novels protects verses.
- **Line surgery with full undo:** move a line up/down across stanzas (Alt+↑/↓), duplicate (Alt+D), join/split at the caret (Alt+J), indent (Tab). Every op is ⌘Z-able.
- **Outline cards** per poem: title, first line, line count, status dot (draft → fair copy → done), with a progress chip for the collection. Drag to sequence.
- **Scraps drawer:** cut a line or stanza you love-but-can't-keep (Alt+Shift+X) and it waits, tagged with its origin poem, for a better home.
- **Then/Now compare:** daily and manual snapshots side by side with added-word marks.
- **A colophon at each poem's end:** a QR and a drawing — five kinds per poem (AI monoline line art, AI illustration, public-domain ornaments, a procedural fingerprint drawn from the poem's own text, or your own SVG/PNG and monogram).
- **Import** your existing backlog: txt/md, docx, PDF — one file becomes one collection, split into poems.
- **Export** as EPUB, a 5×8 chapbook PDF («Φυλλάδιο»), or plain text/markdown, colophon included.

## The poet's AI — local, and never in your text

Point **File → Rhema Settings…** at a local OpenAI-compatible text model and (optionally) ComfyUI on the same machine. When the addresses point to this computer, nothing leaves it.

- **Reader's Eye** (⌘⇧E / Ctrl+Shift+E, or the poem's menu): the model reads the poem and files 3–5 concrete observations in the notes pane — in the poem's own language. It never writes into the poem. Ever.
- **Title suggestions** for an untitled poem; accepting one sets the title, not the text.
- Cover art and poem drawings ride the same local chain; with no endpoint configured, the app simply never offers AI — the abstract seeded covers remain.

## Everything else Rhema keeps from NEO

**The bookshelf** — labeled shelves, progress bars, drag-and-drop, cover art. **Just a blank page** — drop caps, curly quotes, no red squiggles until you ask. **Enter, Enter, Enter** — paragraph, section break, new chapter. **Darlings** — kill them, keep the bodies. **Placeholders** — ⌘⇧X and a sticky note. **Outline cards** for novels and scripts. **Goals and sprints.** **Bound shelves** for omnibuses. **Screenplays** with automatic formatting, Fountain and Final Draft in, industry PDF out. **Exports** — EPUB 3, .docx, PDF, HTML, markdown, plain text, and a timestamped emailed PDF with a SHA-256 fingerprint (⌘E). **Backups** — continuous autosave, daily zip backups with retention you choose in Rhema Settings, including unlimited; everything plain files.

**View → Keyboard Shortcuts…** (or ⌘/ / Ctrl+/) opens the shortcut reference.

## Your files

Everything lives in `~/Documents/Rhema Library` — one folder per book, chapters and poems as readable HTML, metadata as JSON. Open them in your favorite text editor. If Rhema disappeared tomorrow, every word you wrote would still be there.

## Languages

Rhema opens in English on first run and switches to any other language in one click under **View → Language**: Greek, French, Spanish, Portuguese, German, Italian, Dutch, Polish, Romanian, Hungarian, Korean, Russian, Turkish. Greek is first-class: « » quotes, Greek hyphenation, Greek plurals throughout. Adding a language is a single file, no programming needed: see [TRANSLATING.md](TRANSLATING.md).

## Building from source (for the eggheads)

Requires [Node.js](https://nodejs.org).

```
git clone https://github.com/dark5un/rhema.git
cd rhema
npm install
npm start
```

To build the AppImage: `npm run package:linux`. Output lands in `dist/`.

The app is very simple: an Electron shell (`main.js`), a preload bridge (`preload.js`), and a renderer (`app.js` + `styles.css` + `index.html`), with Rhema's poetry features in their own files hung on a small hook bus. [AGENTS.md](AGENTS.md) and [RHEMA-ANCHORS.md](RHEMA-ANCHORS.md) map it all; [TUTORIAL.md](TUTORIAL.md) teaches the writer's side.

## Contributing

Rhema is public — pull requests and issues are welcome, read [CONTRIBUTING.md](CONTRIBUTING.md) first. It exists because Hugh Howey built NEO and opened it under MIT; his LICENSE, attribution and philosophy travel with it. Upstream NEO fixes are cherry-picked in when they matter. Hugh's fair warning stands: writing apps die of bloat, and the bar for anything new is "does this help a working writer write, finish, and publish?"

## License

[MIT](LICENSE) — Hugh's license, kept whole, with a notice for Rhema's own portions. Free to use, free to modify, free to share.
