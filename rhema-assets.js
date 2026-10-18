// Rhema — poem-mark drawing assets (main process) /* RHEMA */
//
// The rules for rhema-drawing files, kept out of main.js so they are
// unit-testable without Electron (Stone 17). main.js owns the IPC surface
// and the one-time pick tokens; this module owns the names, the kinds,
// and the writes.
//
// Fixed names in the book folder — 'rhema-drawing.(png|jpg|webp|svg)' for
// the collection, 'rhema-drawing-<chId>.*' for one poem; the key is
// slug-validated, so no user input ever reaches the path. Stone 17 added
// SVG: vector drawings (ornaments, fingerprints, AI line art) sit beside
// the raster ones — the poet's choice. SVGs are sanitized on the way in
// and always reach the page as <img src="data:...">, where a document
// inside the SVG cannot script.

'use strict';

const fs = require('fs');
const path = require('path');

const ASSET_KEY = /^[a-z0-9-]{0,64}$/;
const ASSET_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'svg']; /* RHEMA — deliberately NOT COVER_EXTS: upstream covers stay raster-only */

function assetGlob(key) {
  const k = String(key || 'collection');
  if (!ASSET_KEY.test(k)) return null;
  return k === 'collection' ? /^rhema-drawing\.(png|jpg|webp|svg)$/ : new RegExp('^rhema-drawing-' + k + '\\.(png|jpg|webp|svg)$');
}

// An SVG about to become a book asset must be a plain picture: no scripts,
// no event handlers, no external references (a remote href would phone
// home from the page and from every export), no <use> pulling foreign
// geometry in. Rejected whole — a silently gutted drawing is worse than
// an honest "that file can't be used". Returns null when clean, else the
// reason (the renderer turns it into plain language).
function sanitizeSvg(text) {
  let t = String(text || '').trim();
  // real-world SVGs open with an XML prolog / DOCTYPE / comments — strip
  // the lead-in, then the root element must be <svg> (anything else that
  // reached an "image" is not a picture)
  t = t.replace(/^(?:<\?xml[^>]*\?>\s*|<!DOCTYPE[^>]*>\s*|<!--[\s\S]*?-->\s*)+/i, '');
  if (!/^<svg[\s>]/i.test(t)) return 'not-an-svg';
  if (t.length > 2 * 1024 * 1024) return 'too-big';
  if (/<\s*(script|foreignObject|use)\b/i.test(t)) return 'script';
  // security gate (defense-in-depth, NICE-4): namespaced script tags,
  // SMIL animation (animate/set can repoint href after the gate ran),
  // CSS url() outside references, and scheme values that only decode
  // through HTML entities
  if (/<\s*[A-Za-z0-9_.-]+:\s*(script|foreignObject)\b/i.test(t)) return 'script';
  if (/<\s*(animate|animateTransform|set)\b/i.test(t)) return 'script';
  if (/<style[^>]*>(?:(?!<\/style>)[\s\S])*?url\s*\(/i.test(t)) return 'external'; // coding gate S1: bounded — [\s\S]*? alone ran past </style> and refused honest SVGs with internal url(#..) refs
  if (/(?:xlink:)?href\s*=\s*["'][^"']*&#/i.test(t)) return 'external';
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:javascript|vbscript|data|file):/i.test(t)) return 'external';
  if (/\son[a-z]+\s*=/i.test(t)) return 'script';
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|file:|data:)/i.test(t)) return 'external';
  return null;
}

// Write the drawing under its fixed name, replacing any other extension
// for the same key. `data` is the raw bytes (raster) or the SVG text.
// Returns the stored filename, or { rejected } for an unsafe SVG, or null
// for a bad key/extension.
function saveAsset(dir, key, ext, data) {
  const re = assetGlob(key);
  const e = String(ext || '').toLowerCase();
  if (!re || !ASSET_EXTS.includes(e)) return null;
  if (!fs.existsSync(dir)) return null;
  if (e === 'svg') {
    const why = sanitizeSvg(Buffer.isBuffer(data) ? data.toString('utf8') : data);
    if (why) return { rejected: why };
  }
  const stem = key && key !== 'collection' ? 'rhema-drawing-' + key + '.' : 'rhema-drawing.';
  const fname = stem + (e === 'jpeg' ? 'jpg' : e);
  fs.writeFileSync(path.join(dir, fname), data);
  for (const f of fs.readdirSync(dir)) {
    if (re.test(f) && f !== fname) fs.unlinkSync(path.join(dir, f));
  }
  return fname;
}

// The current drawing file for a key, if any (name only — the caller reads it).
function findAsset(dir, key) {
  const re = assetGlob(key);
  if (!re || !fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).find((f) => re.test(f)) || null;
}

// Delete the drawing(s) for a key.
function clearAsset(dir, key) {
  const re = assetGlob(key);
  if (!re) return false;
  if (!fs.existsSync(dir)) return true;
  for (const f of fs.readdirSync(dir)) {
    if (re.test(f)) fs.unlinkSync(path.join(dir, f));
  }
  return true;
}

module.exports = { ASSET_KEY, ASSET_EXTS, assetGlob, sanitizeSvg, saveAsset, findAsset, clearAsset };
