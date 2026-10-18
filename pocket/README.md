# Rhema Pocket

**Status in Rhema: not shipped yet.** Rhema is desktop-only for now (Stone 14);
this code is kept design-compatible so a companion app can come later. The
ids and names below are Rhema's own (`io.onlyascii.rhemapocket`); the
upstream robot that auto-builds APKs belongs to NEO, not this repo —
Rhema's Pocket CI is parked.

Rhema Pocket is the planned Android and iOS companion to Rhema: open a WIP,
write, close. The manuscript editor is desktop Rhema's own code (`app.js` /
`styles.css`, copied in at build time), running in a Capacitor shell with a
pocket-sized implementation of the `window.neo` bridge
(`www/pocket-bridge.js`). Same plain files as the desktop, no accounts.

- **Android:** files live in `Documents/Rhema Library`, shared with the
  desktop via Syncthing.
- **iOS:** files live in the app's own folder. With iCloud Drive on, that's
  iCloud Drive → Rhema Pocket → Rhema Library (still local files; Apple
  carries changes in the background), and desktop Rhema can point at the
  same folder with File → Library Folder…. With iCloud Drive off, it's On
  My iPad → Rhema Pocket. Nothing is required on the desktop side: Rhema
  stays local unless the writer chooses that folder.

## Building

No robots here (yet): build locally, or re-enable the parked
`.github/workflows/pocket.yml` with a real branch trigger and Rhema's own
signing secrets (`POCKET_KEYSTORE_BASE64`, `POCKET_KEYSTORE_PASSWORD`).
Upstream NEO's robot publishes its own APK at
https://github.com/hughhowey/neo/releases — that is NEO Pocket, a different
app id; it will not install over or beside Rhema Pocket.

First install only: sideload, then grant **All files access**
(Settings → Apps → Rhema Pocket).

Local builds need Android Studio and: `npm install` at the top of the repo,
`node scripts/pocket-www.js` (copies the editor, fonts, locales, and the
spellchecker with its dictionaries into `www/`), then `cd pocket && npm install`,
`npx cap sync android`, and build from `android/`. Local builds are debug-signed.

## Building for iOS

Needs Xcode (with the iOS simulator), CocoaPods (`brew install cocoapods`),
and an Apple Developer account for a real device. Then:

    npm install && node scripts/pocket-www.js
    cd pocket && npm install
    npx cap sync ios
    npx cap open ios

In Xcode: pick your Team under Signing & Capabilities, add the **iCloud**
capability with **iCloud Documents** ticked and the container
`iCloud.io.onlyascii.rhemapocket`, choose an iPad simulator or a plugged-in
iPad, and press Run. After changing `app.js`, `styles.css` or anything in
`www/`, repeat `node scripts/pocket-www.js` (from the top of the repo) and
`npx cap copy ios`, then Run again.

`ios/App/App/LibraryHome.swift` is the one piece of native code: it tells the
bridge where the library folder is (iCloud or on-device) and pulls down files
another device wrote before they're read.

To test with real books in the simulator, run Pocket once, then:

    open "$(xcrun simctl get_app_container booted io.onlyascii.rhemapocket data)/Documents"

and copy a `Rhema Library` folder in there (simulators have no iCloud, so this
is the On My iPad path).

## Status — early alpha (upstream lineage)

Working: bookshelf, opening books, writing (hardware keyboard), autosave to
the shared library, pen-name switching, chapter list via the ☰ button or a
swipe from the left edge, Notes & Comments via a swipe from the right edge.
the ⋯ button for the desktop's Format and View choices (typeface, text
size, drop cap, page, focus, typewriter, poetry) plus Goals. Android's bars
stay hidden (swipe an edge to peek), the back gesture returns to the shelf,
and on Android the on-screen keyboard stays down — long-press ☰ (or use the
⋯ sheet) to summon it. On iPad the keyboard behaves normally and hides
itself when a hardware keyboard is attached.

Punch list, in rough order:
- Verify pocket-v0.1.5 fixed: dead Shelf button + system bars overlapping
  the UI (both were edge-to-edge enforcement; now targeting SDK 35 with
  opt-out) and missing cover art (now served via Capacitor file URLs)
- Stable APK signing key (repo secret) so updates install without
  uninstalling first
- A small settings sheet: page theme, text size (desktop syncs these via
  library.json, but the phone deserves local control)
- On-screen keyboard testing: composition/autocorrect vs. the editor's
  keydown handlers (hardware keyboards work well already)
- Syncthing conflict detection: warn when *.sync-conflict files exist
- Home-screen widget: the bookshelf with real covers, tap a book to write
  (native Android work; the dream feature)

## Not planned

Email and import stay on the desktop. Pocket is
the writing chair, not the cockpit.
