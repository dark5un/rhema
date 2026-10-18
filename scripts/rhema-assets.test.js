'use strict';

// Rhema Stone 17 /* RHEMA */ — rhema-assets.js: names, SVG gate, writes.
// Hermetic: a temp dir, no Electron, no network.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const A = require('../rhema-assets.js');

// ---------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------

test('asset names: collection and per-poem globs; hostile keys refused', () => {
  assert.ok(A.assetGlob('collection').test('rhema-drawing.png'));
  assert.ok(A.assetGlob('collection').test('rhema-drawing.svg')); /* Stone 17: vectors */
  assert.ok(A.assetGlob('ch-12').test('rhema-drawing-ch-12.jpg'));
  assert.equal(A.assetGlob('collection').test('cover-1.png'), false, 'never matches upstream cover files');
  assert.equal(A.assetGlob('collection').test('rhema-drawing.exe'), false);
  assert.equal(A.assetGlob('../../etc/passwd'), null, 'path traversal in the key is refused');
  assert.equal(A.assetGlob('CH_1'), null, 'keys are slugs');
});

// ---------------------------------------------------------------------------
// the SVG gate
// ---------------------------------------------------------------------------

const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9" stroke="#000"/></svg>';

test('sanitizeSvg: a plain vector picture passes', () => {
  assert.equal(A.sanitizeSvg(CLEAN), null);
  assert.equal(A.sanitizeSvg('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' + CLEAN), null, 'the Inkscape/Illustrator opening (prolog + DOCTYPE) is legal lead-in');
  assert.equal(A.sanitizeSvg('<div/>'), 'not-an-svg', 'anything whose root is not svg is refused');
  assert.equal(A.sanitizeSvg('<html><svg>' + CLEAN.slice(5)), 'not-an-svg');
});

test('sanitizeSvg: scripting, handlers, and outside references are refused', () => {
  assert.equal(A.sanitizeSvg('<svg><script>alert(1)</script></svg>'), 'script');
  assert.equal(A.sanitizeSvg('<svg><SCRIPT>x</SCRIPT></svg>'), 'script', 'case-insensitive');
  assert.equal(A.sanitizeSvg('<svg><foreignObject><body>hi</body></foreignObject></svg>'), 'script');
  assert.equal(A.sanitizeSvg('<svg><use href="#x"/></svg>'), 'script', 'use can pull geometry from an outside document');
  assert.equal(A.sanitizeSvg('<svg onload="alert(1)"><rect/></svg>'), 'script');
  assert.equal(A.sanitizeSvg('<svg><image xlink:href="https://evil/x.png"/></svg>'), 'external');
  assert.equal(A.sanitizeSvg('<svg><image href="//cdn/x.png"/></svg>'), 'external');
  assert.equal(A.sanitizeSvg('<svg><image href="data:image/png;base64,xx"/></svg>'), 'external', 'data: inside the drawing is refused too — the asset itself is already a data URL');
  assert.equal(A.sanitizeSvg('<svg><rect fill="url(#g)"/></svg>'), null, 'internal fragment references stay legal');
  assert.equal(A.sanitizeSvg('<div/>'), 'not-an-svg');
  assert.equal(A.sanitizeSvg(''), 'not-an-svg');
  assert.equal(A.sanitizeSvg('<svg>' + 'x'.repeat(2 * 1024 * 1024) + '</svg>'), 'too-big');
});

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

function tmpBook() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rhema-assets-'));
}

test('saveAsset: writes the fixed name and replaces the other extension', () => {
  const dir = tmpBook();
  try {
    const png = Buffer.from('89504e47', 'hex');
    assert.equal(A.saveAsset(dir, 'collection', 'png', png), 'rhema-drawing.png');
    // a vector arrives: the old raster goes, one drawing per key
    assert.equal(A.saveAsset(dir, 'collection', 'svg', CLEAN), 'rhema-drawing.svg');
    const left = fs.readdirSync(dir);
    assert.deepEqual(left, ['rhema-drawing.svg'], 'exactly one drawing for the key');
    // per-poem key keeps its own name
    assert.equal(A.saveAsset(dir, 'ch-7', 'svg', CLEAN), 'rhema-drawing-ch-7.svg');
    // hostile inputs
    assert.equal(A.saveAsset(dir, '../x', 'svg', CLEAN), null, 'bad key');
    assert.equal(A.saveAsset(dir, 'collection', 'exe', png), null, 'bad extension');
    assert.deepEqual(A.saveAsset(dir, 'collection', 'svg', '<svg><script>x</script></svg>'), { rejected: 'script' }, 'a hostile SVG is refused with its reason');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['rhema-drawing-ch-7.svg', 'rhema-drawing.svg'], 'the refusal wrote nothing');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('findAsset / clearAsset: one drawing in, none out', () => {
  const dir = tmpBook();
  try {
    assert.equal(A.findAsset(dir, 'collection'), null);
    A.saveAsset(dir, 'collection', 'jpg', Buffer.from('ffd8ff', 'hex'));
    assert.equal(A.findAsset(dir, 'collection'), 'rhema-drawing.jpg');
    assert.equal(A.clearAsset(dir, 'collection'), true);
    assert.equal(A.findAsset(dir, 'collection'), null);
    assert.equal(A.findAsset(dir, '../x'), null, 'bad key reads nothing');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sanitizeSvg catches the deny-list gaps (security gate NICE-4)', () => {
  assert.equal(A.sanitizeSvg('<svg><x:script/></svg>'), 'script', 'namespaced script tag');
  assert.equal(A.sanitizeSvg('<svg><animate attributeName="href" to="http://x/"/></svg>'), 'script', 'SMIL can repoint href after the gate ran');
  assert.equal(A.sanitizeSvg('<svg><set attributeName="href" to="javascript:alert(1)"/></svg>'), 'script', 'SMIL set');
  assert.equal(A.sanitizeSvg('<svg><style>path{mask:url(http://x)}</style></svg>'), 'external', 'CSS url() outside reference');
  assert.equal(A.sanitizeSvg('<svg><a href="&#106;avascript:alert(1)">t</a></svg>'), 'external', 'entity-decoded scheme');
  assert.equal(A.sanitizeSvg('<svg><a href="javascript:alert(1)">t</a></svg>'), 'external', 'plain javascript: scheme');
  assert.equal(A.sanitizeSvg('<svg><path d="M0 0L10 10"/></svg>'), null, 'the honest monoline still passes');
});

test('sanitizeSvg does not false-positive on honest internal url(#..) refs (coding gate S1)', () => {
  const honest = '<svg><style>.a{fill:red}</style><path filter="url(#f)" d="M0 0L9 9"/></svg>';
  assert.equal(A.sanitizeSvg(honest), null, 'style block + internal filter ref passes');
  const clip = '<svg><defs><clipPath id="c"><rect width="9" height="9"/></clipPath></defs><style>.a{fill:red}</style><path clip-path="url(#c)" d="M0 0L9 9"/></svg>';
  assert.equal(A.sanitizeSvg(clip), null, 'clipPath ref passes');
  assert.equal(A.sanitizeSvg('<svg><style>.a{mask:url(http://x)}</style><path d="M0 0"/></svg>'), 'external', 'external url inside style still refused');
});
