/* ==================================================================== */
/*  RHEMA — the drawing kinds that need no AI (Stone 17, Phase 2h)      */
/*                                                                      */
/*  The poem-mark drawing slot accepts vector or raster — the poet's    */
/*  choice. This file generates the deterministic vectors:              */
/*                                                                      */
/*   • built-in ornaments — fleuron, asterism (⁂), Greek meander,       */
/*     drop-cap initial from the poem's first letter: classic book      */
/*     craft, hand-authored here, public domain by construction.        */
/*   • poem fingerprint — seeded monoline line art, deterministic from  */
/*     a hash of the poem text: every poem gets its own abstract        */
/*     drawing, zero AI, always vector.                                 */
/*   • monogram seal — the poet's initials in a ring, like a stamp.     */
/*                                                                      */
/*  These kinds are NOT files: the poem record carries 'kind:<name>'    */
/*  and the mark renders the SVG INLINE. That is what makes them        */
/*  theme-adaptive — currentColor inside an <img src="data:..."> would  */
/*  resolve to black and vanish on the night theme, while inline SVG    */
/*  inherits the page's ink (and prints black ink, like the QR).        */
/*  Deterministic means live too: the drop-cap and the fingerprint      */
/*  follow the poem as it changes. Imported and AI drawings are the     */
/*  ones that become asset files (rhema-drawing*.svg), rendered as      */
/*  data-URL <img> — the safe posture for content this app did not      */
/*  author.                                                             */
/* ==================================================================== */

const RhemaDraw = (() => {
  'use strict';

  const MONO = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  // security gate (NICE-6): escHtml is quote-blind; attribute sites use this
  const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;');

  function frame(inner) {
    // fixed pixel size: the mark's colophon box is 72px tall
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="72" height="72" role="img" aria-label="${escAttr(t('Poem drawing'))}">${inner}</svg>`;
  }

  // ---- ornaments (hand-authored monoline vectors) ----

  function fleuron() {
    // a printer's fleuron: mirrored leaf-curls meeting at a central diamond
    const leaf = 'M6 30C14 18 26 14 38 16C30 20 24 26 21 33C27 30 33 29 38 30C30 34 22 36 15 34';
    return frame(
      `<g ${MONO} stroke-width="2"><path d="${leaf}"/><path transform="translate(80 0) scale(-1 1)" d="${leaf}"/>` +
      `<path d="M40 22l4 8-4 8-4-8z" fill="currentColor" stroke="none"/></g>`);
  }
  function asterism() {
    // ⁂ — three six-ray asterisks in a triangle
    let stars = '';
    const at = (x, y) => {
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        stars += `<line x1="${x}" y1="${y}" x2="${(x + 7 * Math.cos(a)).toFixed(1)}" y2="${(y + 7 * Math.sin(a)).toFixed(1)}"/>`;
      }
    };
    at(40, 22); at(26, 50); at(54, 50);
    return frame(`<g ${MONO} stroke-width="1.5">${stars}</g>`);
  }
  function meander() {
    // the Greek key: one continuous squared spiral, repeated three times
    const unit = 'M0 30V6h24v18h-12v-6h6';
    return frame(
      `<g ${MONO} stroke-width="3"><path transform="translate(4 4)" d="${unit}"/><path transform="translate(28 4)" d="${unit}"/><path transform="translate(52 4)" d="${unit}"/></g>`);
  }
  function poemText(chId) {
    const body = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
    return (body && body.textContent) || '';
  }
  function dropCap(chId) {
    // the poem's first letter, set big — the classic initial
    const txt = poemText(chId).replace(/[\s\u2003]+/g, ' ').trim();
    const letter = txt ? txt[0].toUpperCase() : '✦';
    return frame(
      `<circle cx="40" cy="40" r="34" stroke="currentColor" fill="none" stroke-width="1.5"/>` +
      `<text x="40" y="54" text-anchor="middle" font-family="'GFS Didot', 'Libre Bodoni', Didot, Georgia, serif" font-size="44" fill="currentColor">${escHtml(letter)}</text>`);
  }

  // ---- poem fingerprint: seeded monoline, deterministic from the text ----

  function textHash(s) {
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fingerprint(chId) {
    const txt = poemText(chId) || String(chId);
    const rnd = mulberry32(textHash(txt));
    // a small harmonograph: two sines make one continuous line; the poem's
    // hash picks the frequencies and phases, so the same poem always
    // draws the same mark and every different poem differs.
    // frequencies capped at 5 (UX gate): at 72px a denser harmonograph
    // reads as noise, and the gift is in the uniqueness being legible
    const f1 = 2 + Math.floor(rnd() * 3), f2 = 3 + Math.floor(rnd() * 3);
    const f3 = 2 + Math.floor(rnd() * 4), f4 = 1 + Math.floor(rnd() * 4);
    const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2;
    const d = 0.0006 + rnd() * 0.0008; // gentle damping: the line breathes
    let path = '';
    for (let i = 0; i <= 900; i++) {
      const t = i * 0.02;
      const k = Math.exp(-d * t * t * 100);
      const x = 40 + 32 * k * Math.sin(f1 * t + p1) + 6 * (1 - k) * Math.sin(f3 * t);
      const y = 40 + 32 * k * Math.sin(f2 * t + p2) + 6 * (1 - k) * Math.sin(f4 * t);
      path += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return frame(`<path d="${path}" stroke="currentColor" fill="none" stroke-width="1.2"/>`);
  }

  // ---- monogram seal: the poet's initials in a ring ----

  function monogram() {
    const name = ((book && book.author) || '').trim();
    // split on whitespace, not \b: Greek words have no ASCII word boundary
    const words = name.split(/\s+/).filter(Boolean);
    const initials = words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '✦';
    return frame(
      `<circle cx="40" cy="40" r="34" stroke="currentColor" fill="none" stroke-width="1.5"/>` +
      `<circle cx="40" cy="40" r="29" stroke="currentColor" fill="none" stroke-width="0.75"/>` +
      `<text x="40" y="51" text-anchor="middle" font-family="'GFS Didot', 'Libre Bodoni', Didot, Georgia, serif" font-size="26" letter-spacing="1" fill="currentColor">${escHtml(initials)}</text>`);
  }

  // ---- AI kinds (Stone 17): offered by availability, generated in the
  // main process (the cover:paint trust boundary), saved as assets. The
  // ComfyUI line-art fallback arrives as a picture and is vectorized
  // HERE — the canvas lives in the renderer, so the main process never
  // grows one (the canvas-prune contract from the Phase 3 security gate).
  // The poet may name a motif; empty means "derive it from the poem". ----

  function hexLum(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  // keep the ink, drop the paper, recolor to theme ink
  function recolorTraced(svgText) {
    const doc = new DOMParser().parseFromString(String(svgText || ''), 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return '';
    let kept = 0;
    for (const p of Array.from(svg.querySelectorAll('path'))) {
      if (hexLum(p.getAttribute('fill')) > 0.72) { p.remove(); continue; }
      p.setAttribute('fill', 'currentColor');
      p.removeAttribute('stroke');
      kept++;
    }
    if (!kept) return '';
    if (!svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', '0 0 ' + (svg.getAttribute('width') || 1024) + ' ' + (svg.getAttribute('height') || 1024));
    }
    svg.setAttribute('width', '72');
    svg.setAttribute('height', '72');
    return new XMLSerializer().serializeToString(svg);
  }
  function vectorize(raster) {
    return new Promise((resolve) => {
      if (typeof ImageTracer === 'undefined') return resolve('');
      const img = new Image();
      img.onload = () => {
        // trace at a sane working size: imagetracer is O(pixels)
        const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(recolorTraced(ImageTracer.imagedataToSVG(ctx.getImageData(0, 0, w, h), { roundcoords: 1, desc: false, blurradius: 1 }))); }
        catch (err) { resolve(''); }
      };
      img.onerror = () => resolve('');
      img.src = 'data:' + raster.mime + ';base64,' + raster.base64;
    });
  }

  function aiError(got) {
    const k = got && got.kind;
    if (k === 'unreachable') return t('The AI endpoint did not answer — is it running?');
    if (k === 'auth') return t('The endpoint refused the saved key.');
    if (k === 'unset') return t('No AI endpoint is configured — set one under File → Rhema Settings…');
    if (k === 'bad_svg') return t('What the AI drew is not a clean drawing — it was not saved.');
    if (k === 'save') return t('The drawing could not be saved.');
    // UI gate: the Greek toast never carries raw internal English — the
    // detail goes to the console, the poet gets one honest sentence
    console.warn('rhema draw:', (got && got.error) || got);
    return t('Something went wrong with the AI.');
  }

  async function aiDrawing(chId, kind) {
    // coding gate: the AI call is long — if the poet opens another book
    // mid-flight, nothing may be written into the wrong book
    const bookId = book.id;
    const gone = () => !book || book.id !== bookId;
    const rec = (book.rhema && book.rhema.poems && book.rhema.poems[chId]) || {};
    const ask = await askInput(
      t('The drawing of “{title}”', { title: escHtml(shownTitle(chapterName(chId))) }),
      t('What should the AI draw? Leave it empty to derive it from the poem.'),
      typeof rec.motif === 'string' ? rec.motif : '');
    if (ask === null || gone()) return false;
    RhemaQr.setPoemField(chId, 'motif', ask.trim() || undefined); // remembered for the next draw
    toast(t('The AI is drawing…'), 2500);
    const got = await window.neo.rhema.draw(bookId, chId, kind, ask.trim(), poemText(chId));
    if (gone()) return false;
    if (got && got.busy) { toast(t('One drawing at a time — the last one is still going.'), 2500); return false; }
    if (got && got.raster) {
      // the picture is already saved main-side (coding gate: it really
      // does stay a picture); a successful trace replaces it with a vector
      const svg = await vectorize(got.raster);
      if (gone()) return false;
      if (svg) {
        const wrote = await window.neo.rhema.assetWrite(bookId, chId, svg);
        if (!gone() && typeof wrote === 'string') {
          await RhemaQr.loadDrawing(bookId, chId);
          if (gone()) return false;
          RhemaQr.setPoemField(chId, 'drawing', wrote);
          renderChapters();
          return true;
        }
        // coding gate NICE: the trace worked but the vector save did not —
        // say so, then keep the picture below
        if (!gone()) toast(t('The vector could not be saved — the picture is kept.'), 4000);
      }
      await RhemaQr.loadDrawing(bookId, chId);
      if (gone()) return false;
      RhemaQr.setPoemField(chId, 'drawing', got.fname);
      renderChapters();
      if (!svg) toast(t('The line drawing could not be turned into vectors — it stays a picture.'), 4000);
      return true;
    }
    if (got && got.fname) {
      await RhemaQr.loadDrawing(bookId, chId);
      if (gone()) return false;
      RhemaQr.setPoemField(chId, 'drawing', got.fname);
      renderChapters();
      return true;
    }
    toast(aiError(got), 5000);
    return false;
  }

  // ---- the kinds menu (per poem; the collection keeps imported art) ----

  const KINDS = [
    { v: 'fleuron', label: () => t('Fleuron') },
    { v: 'asterism', label: () => t('Asterism') },
    { v: 'meander', label: () => t('Greek meander') },
    { v: 'dropcap', label: () => t('Drop-cap initial') },
    { v: 'fingerprint', label: () => t('Poem fingerprint') },
    { v: 'monogram', label: () => t('Monogram seal') }
  ];

  // the inline SVG for a 'kind:<name>' declaration ('' if unknown — the
  // mark then shows nothing, and the menu never offers an unknown kind)
  function svgFor(decl, chId) {
    const kind = String(decl || '').slice(5);
    if (kind === 'fleuron') return fleuron();
    if (kind === 'asterism') return asterism();
    if (kind === 'meander') return meander();
    if (kind === 'dropcap') return dropCap(chId);
    if (kind === 'fingerprint') return fingerprint(chId);
    if (kind === 'monogram') return monogram();
    return '';
  }

  return { KINDS, svgFor, textHash, mulberry32, aiDrawing, aiError, poemText,
    fleuron, asterism, meander, dropCap, fingerprint, monogram };
})();
