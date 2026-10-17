'use strict';

// Rhema Phase 1 live check /* RHEMA */ — NOT part of npm test.
// Proves the whole chain on this machine: Strata (5090) writes the brief,
// ComfyUI (4070 Ti) paints it. Run: node scripts/rhema-ai-live.js
// The text endpoint key comes from STRATA_API_KEY (never hardcoded).

const ai = require('../ai.js');

const settings = {
  text: {
    base: process.env.RHEMA_TEST_BASE || 'http://localhost:11434/v1',
    model: process.env.RHEMA_TEST_MODEL || 'qwen3.8-flash-next-iq3_s',
    tokenParam: 'max_tokens'
  },
  image: {
    provider: 'comfyui',
    url: process.env.RHEMA_TEST_COMFY || 'http://localhost:3101',
    checkpoint: 'juggernautXL_v9.safetensors',
    width: 832, height: 1216, steps: 30, cfg: 6
  }
};

const poems = `Still Point

The loom stops mid-breath;
the shuttle hangs like a comma
over a sentence the river keeps writing.

Ash and Olive

Grandmother's oil burns low in the window —
one lamp for two harbours,
the dark between them all sea.`;

(async () => {
  console.log('testing endpoints…');
  console.log(await ai.testEndpoints({ settings, apiKey: process.env.STRATA_API_KEY || '' }));
  console.log('painting a cover (brief + ComfyUI render)…');
  const out = await ai.paintCover({ settings, apiKey: process.env.STRATA_API_KEY || '', text: poems });
  const file = require('node:path').join(process.env.TMPDIR || '.', 'rhema-live-cover.' + out.ext);
  require('node:fs').writeFileSync(file, out.buffer);
  console.log('BRIEF:', out.brief);
  console.log('text model:', out.textModel, '| image:', out.imageModel);
  console.log('WROTE', file, out.buffer.length, 'bytes');
  // Stone 17: the AI monoline path — the local LLM emits the SVG directly
  console.log('drawing a monoline (Stone 17, LLM-SVG)…');
  const svg = await ai.drawMonolineSvg({
    base: settings.text.base, apiKey: process.env.STRATA_API_KEY || '',
    model: settings.text.model, motif: '', text: poems
  });
  const svgFile = require('node:path').join(process.env.TMPDIR || '.', 'rhema-live-drawing.svg');
  require('node:fs').writeFileSync(svgFile, svg);
  console.log('WROTE', svgFile, svg.length, 'chars |', svg.slice(0, 120).replace(/\n/g, ' '));
})().catch((err) => { console.error('FAILED:', err && err.message || err); process.exit(1); });
