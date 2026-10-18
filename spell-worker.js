// NEO's spellchecker, in its own process. main.js forks this with
// Electron's utilityProcess and talks to it with plain messages: load,
// check, suggest, add.
//
// The engine is Hunspell itself (the checker LibreOffice uses), compiled to
// WebAssembly. It reads the same .aff/.dic files as-is and applies the affix
// rules on lookup instead of expanding every word form into memory up front,
// so even the big dictionaries (French, Portuguese) load in well under a
// second. See licenses/hunspell for its license and source.
'use strict';

const fs = require('fs');
const path = require('path');
const { loadModule } = require('@farscrl/hunspell-wasm');
const { normalizeRomanianWord } = require('./spell-ro');

let factory = null;       // the WebAssembly module, loaded once
// RHEMA — Stone 19/20: a BOOK may speak several languages. `spell` became
// `spells`: an array, primary first. A word is correct if ANY loaded
// dictionary knows it (union-acceptance — a correctly spelled foreign word
// is never flagged); suggestions and learning normalize by the primary.
let spells = [];          // [{ hunspell, files, normalize }]
let mounts = 0;

function reply(msg, extra) {
  process.parentPort.postMessage({ id: msg.id, ...extra });
}

function correct(word) {
  if (!word) return true;
  if (!spells.length) return true;
  return spells.some((s) => s.hunspell.spell(s.normalize(word)));
}

async function loadOne(factory, language, dir) {
  const aff = fs.readFileSync(path.join(dir, 'index.aff'));
  const dic = fs.readFileSync(path.join(dir, 'index.dic'));
  const normalize = language === 'ro' ? normalizeRomanianWord : (word) => word;
  const n = ++mounts;
  // Gate round-1: mounts land incrementally so a throw on the SECOND
  // mountBuffer still unmounts the first (no wasm mount leak).
  const files = [];
  let hunspell;
  try {
    files.push(factory.mountBuffer(aff, `neo-${n}.aff`));
    files.push(factory.mountBuffer(dic, `neo-${n}.dic`));
    hunspell = factory.create(files[0], files[1]);
  } catch (err) {
    for (const f of files) { try { factory.unmount(f); } catch { /* gone */ } }
    throw err;
  }
  return { hunspell, files, normalize };
}

async function load(msg) {
  if (!factory) factory = await loadModule();
  // RHEMA: `languages: [{ language, dir }]`; the single language+dir shape
  // still answers (upstream callers, cherry-pick safety).
  const wanted = Array.isArray(msg.languages) && msg.languages.length
    ? msg.languages
    : [{ language: msg.language, dir: msg.dir }];
  const fresh = [];
  try {
    for (const w of wanted) fresh.push(await loadOne(factory, w.language, w.dir));
  } catch (err) {
    for (const s of fresh) {
      try { s.hunspell.dispose(); } catch { /* freed */ }
      for (const f of s.files) { try { factory.unmount(f); } catch { /* gone */ } }
    }
    throw err; // a failed load keeps the old set whole
  }
  for (const w of msg.custom || []) {
    if (typeof w === 'string' && w) for (const s of fresh) s.hunspell.addWord(s.normalize(w));
  }
  // only now let go of the previous set: a failed load keeps it
  const old = spells;
  spells = fresh;
  for (const s of old) {
    try { s.hunspell.dispose(); } catch { /* freed */ }
    for (const f of s.files) { try { factory.unmount(f); } catch { /* gone */ } }
  }
}

async function handle(msg) {
  try {
    if (msg.type === 'load') {
      await load(msg);
      reply(msg, { ok: true });
    } else if (msg.type === 'check') {
      const out = {};
      // dictionary still loading: report everything correct rather than crying wolf
      for (const w of msg.words || []) out[w] = correct(w);
      reply(msg, { ok: true, result: out });
    } else if (msg.type === 'suggest') {
      // RHEMA: suggestions come from the PRIMARY dictionary (the book's
      // main language) — union-acceptance never guesses across languages.
      const primary = spells[0];
      reply(msg, { ok: true, result: primary && msg.word ? primary.hunspell.suggest(primary.normalize(msg.word)).slice(0, 6) : [] });
    } else if (msg.type === 'add') {
      // RHEMA: a learned word joins every loaded dictionary — if the poet
      // says a word is right, it is right in this book, in any of its
      // languages. (library.customWords persists it across loads.)
      if (typeof msg.word === 'string' && msg.word) for (const s of spells) s.hunspell.addWord(s.normalize(msg.word));
      reply(msg, { ok: true });
    } else {
      reply(msg, { ok: false, error: 'unknown message' });
    }
  } catch (err) {
    reply(msg, { ok: false, error: String(err && err.stack || err) });
  }
}

// One message at a time, in the order they came: a check sent after a load
// is answered by the new dictionary, never by a half-loaded one.
let queue = Promise.resolve();
process.parentPort.on('message', (e) => {
  const msg = e.data || {};
  queue = queue.then(() => handle(msg));
});
