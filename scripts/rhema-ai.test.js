'use strict';

// Rhema Phase 1 /* RHEMA */ — ai.js plumbing, retention knobs, settings gate.
// Hermetic: no network. The live endpoint test is scripts/rhema-ai-live.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ai = require('../ai.js');

// ---------------------------------------------------------------------------
// ComfyUI workflow builder
// ---------------------------------------------------------------------------

test('the default ComfyUI workflow fills its tokens and keeps the graph shape', () => {
  const g = ai.buildWorkflow(null, {
    positive: 'A lighthouse in fog, "quoted" words',
    negative: 'text, blurry',
    checkpoint: 'juggernautXL_v9.safetensors',
    width: 832, height: 1216, steps: 30, cfg: 6, seed: 12345
  });
  assert.equal(g['1'].class_type, 'CheckpointLoaderSimple');
  assert.equal(g['1'].inputs.ckpt_name, 'juggernautXL_v9.safetensors');
  assert.equal(g['2'].inputs.text, 'A lighthouse in fog, "quoted" words');
  assert.equal(g['3'].inputs.text, 'text, blurry');
  assert.equal(g['4'].inputs.width, 832);
  assert.equal(g['4'].inputs.height, 1216);
  assert.equal(g['5'].inputs.seed, 12345);
  assert.equal(g['5'].inputs.steps, 30);
  assert.equal(g['5'].inputs.cfg, 6);
  // links survive the JSON round-trip
  assert.deepEqual(g['5'].inputs.model, ['1', 0]);
  assert.deepEqual(g['7'].inputs.images, ['6', 0]);
  // no tokens left unfilled
  assert.doesNotMatch(JSON.stringify(g), /\{\{[A-Z]+\}\}/);
});

test('a custom workflow uses the same tokens', () => {
  const custom = {
    A: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{CHECKPOINT}}' } },
    B: { class_type: 'CLIPTextEncode', inputs: { text: '{{POSITIVE}}' } },
    C: { class_type: 'KSampler', inputs: { seed: '{{SEED}}', steps: '{{STEPS}}', cfg: '{{CFG}}' } },
    D: { class_type: 'EmptyLatentImage', inputs: { width: '{{WIDTH}}', height: '{{HEIGHT}}' } }
  };
  const g = ai.buildWorkflow(custom, {
    positive: 'p', negative: 'n', checkpoint: 'm.safetensors',
    width: 640, height: 1024, steps: 20, cfg: 7.5, seed: 1
  });
  assert.equal(g.B.inputs.text, 'p');
  assert.equal(g.C.inputs.seed, 1);
  assert.equal(g.C.inputs.cfg, 7.5);
  assert.equal(g.D.inputs.width, 640);
});

// ---------------------------------------------------------------------------
// Retention (Stone 6)
// ---------------------------------------------------------------------------

test('keepValue: default, days, and unlimited', () => {
  assert.equal(ai.keepValue(undefined, 14), 14);
  assert.equal(ai.keepValue(null, 14), 14);
  assert.equal(ai.keepValue('nonsense', 14), 14);
  assert.equal(ai.keepValue(30, 14), 30);
  assert.equal(ai.keepValue('unlimited', 14), Infinity);
  assert.equal(ai.keepValue(0, 14), Infinity);
  assert.equal(ai.keepValue(-5, 14), 14);
});

// the snapshot thinning rule, loaded from app.js the way snapshots.test.js does
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('const SNAP_KEPT'), app.indexOf('// (the rules above are plain functions: scripts/snapshots.test.js)')), ctx);
vm.runInContext('this.snapsToThin = snapsToThin;', ctx);
const DAY = 86400000;

test('snapsToThin: default keeps the upstream rule; unlimited and custom days are Rhema knobs', () => {
  const now = Date.UTC(2026, 9, 9);
  const s = (daysAgo, kind) => ({ name: kind + daysAgo, at: now - daysAgo * DAY, kind });
  const snaps = [s(90, 'd'), s(60, 'k'), s(45, 'r'), s(29, 'd'), s(1, 'd')];
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(ctx.snapsToThin(snaps, now)).sort(), ['d90', 'r45']); // default 30
  assert.deepEqual(plain(ctx.snapsToThin(snaps, now, Infinity)), []);          // unlimited
  assert.deepEqual(plain(ctx.snapsToThin(snaps, now, 0)), []);                 // unlimited via 0
  assert.deepEqual(plain(ctx.snapsToThin(snaps, now, 120)), []);               // long window
  assert.deepEqual(plain(ctx.snapsToThin(snaps, now, 50)), ['d90']);           // short window
  // the newest still stays even past the window
  assert.deepEqual(plain(ctx.snapsToThin([s(90, 'd')], now, 30)), []);
});

// ---------------------------------------------------------------------------
// The settings gate (rhema-settings.js, renderer globals in a vm)
// ---------------------------------------------------------------------------

test('RhemaSettings.configured needs a text base AND an image endpoint with a URL', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rhema-settings.js'), 'utf8');
  const lib = {};
  const rctx = vm.createContext({ library: lib, window: {}, t: (s) => s, escHtml: (s) => s });
  vm.runInContext(src + '\n;this.RhemaSettings = RhemaSettings;', rctx);
  const RS = rctx.RhemaSettings;
  assert.equal(RS.configured(), false);
  lib.rhema = { ai: { text: { base: 'http://x/v1' } } };
  assert.equal(RS.configured(), false);
  lib.rhema = { ai: { text: { base: 'http://x/v1' }, image: { provider: 'comfyui', url: 'http://y' } } };
  assert.equal(RS.configured(), true);
  assert.equal(RS.snapKeepDays(), 30);
  lib.rhema.retention = { snapshots: 'unlimited' };
  assert.equal(RS.snapKeepDays(), Infinity);
  lib.rhema.retention = { snapshots: 90 };
  assert.equal(RS.snapKeepDays(), 90);
});

// ---------------------------------------------------------------------------
// Brief plumbing
// ---------------------------------------------------------------------------

test('excerpt keeps the opening and the ending', () => {
  const text = Array.from({ length: 7000 }, (_, i) => 'w' + i).join(' ');
  const out = ai.excerpt(text);
  assert.ok(out.startsWith('w0 '));
  assert.ok(out.endsWith(' w6999'));
  assert.ok(out.includes('[…]'));
  assert.ok(out.split(' ').length < 6100);
});

test('the brief and paint prompts forbid text in the picture', () => {
  assert.match(ai.BRIEF_SYSTEM, /Never describe or request any text/i);
  assert.match(ai.PAINT_SUFFIX, /absolutely no text/i);
  assert.match(ai.DEFAULT_NEGATIVE, /text/);
});
