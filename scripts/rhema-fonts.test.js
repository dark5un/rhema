'use strict';
// coding gate B1 (2026-10-18): a mistyped Google Fonts URL saved a 404 HTML
// page as gfs-didot-latin .woff2 — and the sha256 recorded in
// RHEMA-ANCHORS.md verified the lie. exportFontFaces embeds whatever
// @font-face points at, so a bad font rides into every print/EPUB export.
// Magic bytes are the cheap tripwire the sha check was not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('vendored GFS Didot fonts are real WOFF2 files', () => {
  for (const f of ['gfs-didot-greek-400-normal.woff2', 'gfs-didot-greek-ext-400-normal.woff2', 'gfs-didot-latin-400-normal.woff2']) {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'fonts', f));
    assert.equal(buf.slice(0, 4).toString('latin1'), 'wOF2', f + ' is not a WOFF2');
    const declared = buf.readUInt32BE(8); // WOFF2 header: uint32 total length
    assert.ok(declared > 1000 && declared < 500000, f + ' declares an implausible size');
    assert.equal(declared, buf.length, f + ' truncated or padded');
  }
});
