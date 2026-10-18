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

test('tokens fill EVERY occurrence and $-sequences in a brief stay literal', () => {
  // review finding (coding, Phase 1): repeated tokens and "$'"/"$&" used to
  // corrupt the graph — replacement must be global and function-escaped
  const custom = {
    A: { class_type: 'CLIPTextEncode', inputs: { text: '{{POSITIVE}}' } },
    B: { class_type: 'CLIPTextEncode', inputs: { text: '{{POSITIVE}}' } },
    C: { class_type: 'KSampler', inputs: { seed: '{{SEED}}', steps: '{{SEED}}' } }
  };
  const g = ai.buildWorkflow(custom, {
    positive: "she said $'cause & then $& stopped", negative: '', checkpoint: 'm',
    width: 8, height: 9, steps: 1, cfg: 2, seed: 7
  });
  assert.equal(g.A.inputs.text, g.B.inputs.text);
  assert.equal(g.A.inputs.text, "she said $'cause & then $& stopped");
  assert.equal(g.C.inputs.seed, 7);
  assert.equal(g.C.inputs.steps, 7);
  assert.doesNotMatch(JSON.stringify(g), /\{\{[A-Z]+\}\}/);
});

test('a set seed stays set (0 included); big seeds are not truncated', () => {
  const seedOf = (seed) => ai.buildWorkflow(null, {
    positive: 'p', negative: 'n', checkpoint: 'm',
    width: 1, height: 1, steps: 1, cfg: 1, seed
  })['5'].inputs.seed;
  assert.equal(seedOf(0), 0);
  assert.equal(seedOf(3000000000), 3000000000);
});

test('comfyuiPaint randomizes only an absent seed', async () => {
  let graph;
  const capture = async (url, init) => {
    if (String(url).includes('/prompt')) {
      graph = JSON.parse(init.body).prompt;
      return jsonResponse({ prompt_id: 'p1' });
    }
    if (String(url).includes('/view')) return jsonResponse(null);
    return jsonResponse({ p1: { status: { status_str: 'success' }, outputs: { '7': { images: [{ filename: 'c.png' }] } } } });
  };
  await withFetch(capture, () => ai.comfyuiPaint({ url: 'http://x', brief: 'b', seed: 0 }));
  assert.equal(graph['5'].inputs.seed, 0);
  await withFetch(capture, () => ai.comfyuiPaint({ url: 'http://x', brief: 'b' }));
  assert.equal(typeof graph['5'].inputs.seed, 'number');
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

// ---------------------------------------------------------------------------
// The polling loop and the brief retry, on a fake fetch (review: the
// riskiest paths were only covered by the live script)
// ---------------------------------------------------------------------------

const withFetch = async (handler, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(); } finally { globalThis.fetch = real; }
};
const jsonResponse = (obj, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => obj, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
});

test('comfyuiPaint surfaces the real exception_message from an execution error', async () => {
  await withFetch(async (url) => {
    if (String(url).includes('/prompt')) return jsonResponse({ prompt_id: 'p1' });
    return jsonResponse({ p1: { status: { status_str: 'error', messages: [
      ['execution_error', { node_id: '5', exception_type: 'ValueError', exception_message: 'checkpoint not found' }]
    ] } } });
  }, () => ai.comfyuiPaint({ url: 'http://x', brief: 'b' }).then(
    () => assert.fail('should have thrown'),
    (err) => assert.match(err.message, /ComfyUI: checkpoint not found/)
  ));
});

test('comfyuiPaint: completed without a picture is an error, a picture is a buffer', async () => {
  await withFetch(async (url) => {
    if (String(url).includes('/prompt')) return jsonResponse({ prompt_id: 'p1' });
    if (String(url).includes('/view')) return jsonResponse(null); // unused; ok path below
    return jsonResponse({ p1: { status: { status_str: 'success', completed: true }, outputs: {} } });
  }, () => ai.comfyuiPaint({ url: 'http://x', brief: 'b' }).then(
    () => assert.fail('should have thrown'),
    (err) => assert.match(err.message, /finished without producing a picture/)
  ));
  const out = await withFetch(async (url) => {
    if (String(url).includes('/prompt')) return jsonResponse({ prompt_id: 'p1' });
    if (String(url).includes('/view')) return jsonResponse(null);
    return jsonResponse({ p1: { status: { status_str: 'success' }, outputs: { '7': { images: [{ filename: 'cover-00001.png', subfolder: 'rhema', type: 'output' }] } } } });
  }, () => ai.comfyuiPaint({ url: 'http://x', brief: 'b' }));
  assert.equal(out.ext, 'png');
  assert.equal(out.buffer.length, 3);
});

test('writeBrief gives a reasoning model more room once, then gives up honestly', async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    if (String(url).includes('/models')) return jsonResponse({ data: [{ id: 'm1' }] });
    const body = JSON.parse((init && init.body) || '{}');
    calls.push(body[tokenKey(body)]);
    if (calls.length === 1) return jsonResponse({ choices: [{ message: { content: '', reasoning_content: 'thinking...' } }] });
    return jsonResponse({ choices: [{ message: { content: 'a real brief' } }] });
  }, async () => {
    const r = await ai.writeBrief({ base: 'http://x/v1', apiKey: '', model: 'm1', text: 'poem' });
    assert.equal(r.result, 'a real brief');
  });
  function tokenKey(body) { return body.max_tokens !== undefined ? 'max_tokens' : 'max_completion_tokens'; }
  assert.equal(calls.length, 2);
  assert.ok(calls[1] > calls[0]); // the retry asked for more room
});

test('testEndpoints calls a missing checkpoint out instead of a false all-clear', async () => {
  const out = await withFetch(async (url) => {
    if (String(url).includes('/system_stats')) return jsonResponse({ system: { comfyui_version: '0.34.0' } });
    if (String(url).includes('/object_info')) return jsonResponse({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['other.safetensors']] } } } });
    return jsonResponse({ data: [] });
  }, () => ai.testEndpoints({ settings: { text: { base: 'http://x/v1' }, image: { provider: 'comfyui', url: 'http://y', checkpoint: 'missing.safetensors' } }, apiKey: '' }));
  assert.equal(out.image.ok, false);
  assert.equal(out.image.kind, 'no_checkpoint');
  assert.deepEqual(out.image.checkpoints, ['other.safetensors']);
});

// ---------------------------------------------------------------------------
// Stone 17 — AI poem drawings (hermetic: fake fetch, no network)
// ---------------------------------------------------------------------------

test('extractSvg digs the SVG out of prose and code fences', () => {
  assert.equal(ai.extractSvg('Sure! ```xml\n<svg xmlns="x"><path/></svg>\n``` hope it helps'), '<svg xmlns="x"><path/></svg>');
  assert.equal(ai.extractSvg('<svg><path/></svg>'), '<svg><path/></svg>');
  assert.equal(ai.extractSvg('I cannot draw.'), '');
});

test('drawMonolineSvg: a motif request goes to the text endpoint and the SVG comes back', async () => {
  const calls = [];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="72" height="72"><path d="M10 40C30 10 50 70 70 40" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  await withFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (String(url).endsWith('/models')) return jsonResponse({ data: [{ id: 'm1' }] });
    return jsonResponse({ choices: [{ message: { content: '```xml\n' + svg + '\n```' } }] });
  }, async () => {
    const got = await ai.drawMonolineSvg({ base: 'http://x/v1', apiKey: '', model: 'm1', motif: 'a lighthouse in fog', text: 'Του μέλλοντος…' });
    assert.equal(got, svg, 'the fenced SVG is extracted whole');
  });
  const chat = calls.find((b) => b.messages);
  assert.match(chat.messages[0].content, /monoline/i, 'the system prompt demands monoline line art');
  assert.match(chat.messages[1].content, /MOTIF \(draw this\): a lighthouse in fog/, 'the poet\u2019s motif leads');
});

test('drawMonolineSvg: with no motif the poem itself is the brief', async () => {
  await withFetch(async (url, init) => {
    if (String(url).endsWith('/models')) return jsonResponse({ data: [] });
    const body = JSON.parse(init.body);
    assert.match(body.messages[1].content, /POEM \(derive one central image/, 'no motif: the poem is the request');
    return jsonResponse({ choices: [{ message: { content: '<svg xmlns="x"><path/></svg>' } }] });
  }, () => ai.drawMonolineSvg({ base: 'http://x/v1', apiKey: '', model: 'm1', motif: '', text: 'σα μια σειρά κεράκια αναμμένα' }));
});

test('drawMonolineSvg: a reasoning model gets one bigger-budget retry (live 2026-10-17 pitfall)', async () => {
  const svg = '<svg xmlns="x"><path/></svg>';
  const budgets = [];
  await withFetch(async (url, init) => {
    if (String(url).endsWith('/models')) return jsonResponse({ data: [] });
    const body = JSON.parse(init.body);
    budgets.push(body.max_tokens);
    if (budgets.length === 1) return jsonResponse({ choices: [{ message: { content: null, reasoning_content: 'thinking, thinking, thinking…' }, finish_reason: 'length' }] });
    return jsonResponse({ choices: [{ message: { content: svg }, finish_reason: 'stop' }] });
  }, async () => {
    const got = await ai.drawMonolineSvg({ base: 'http://x/v1', apiKey: '', model: 'm1', motif: 'x', text: 'y' });
    assert.equal(got, svg, 'the second try, with room to think, produced the SVG');
  });
  assert.deepEqual(budgets, [3000, 8000], 'exactly one bigger retry');
});

test('drawMonolineSvg: a model that answers without an SVG is retried, then refused honestly', async () => {
  let n = 0;
  await withFetch(async (url, init) => {
    if (String(url).endsWith('/models')) return jsonResponse({ data: [{ id: 'm1' }, { id: 'm2' }] });
    n++;
    return jsonResponse({ choices: [{ message: { content: 'I am a language model, not a drawing tool.' } }] });
  }, () => ai.drawMonolineSvg({ base: 'http://x/v1', apiKey: '', model: 'm1', motif: 'x', text: 'y' }).then(
    () => assert.fail('should have thrown'),
    (err) => assert.match(err.message, /without an SVG/)
  ));
  assert.equal(n, 2, 'each candidate model got one honest try');
});

test('drawMonolineSvg: a scripting SVG from the model never reaches the book', async () => {
  await withFetch(async (url) => {
    if (String(url).endsWith('/models')) return jsonResponse({ data: [] });
    return jsonResponse({ choices: [{ message: { content: '<svg xmlns="x"><script>alert(1)</script></svg>' } }] });
  }, () => ai.drawMonolineSvg({ base: 'http://x/v1', apiKey: '', model: 'm1', motif: 'x', text: 'y' }).then(
    () => assert.fail('should have thrown'),
    (err) => { assert.equal(err.kind, 'bad_svg'); assert.match(err.message, /plain vector picture/); }
  ));
});

test('paintLineart: the ComfyUI fallback asks for ink line art at square size', async () => {
  let graph = null;
  await withFetch(async (url, init) => {
    if (String(url).includes('/prompt')) { graph = JSON.parse(init.body).prompt; return jsonResponse({ prompt_id: 'p1' }); }
    if (String(url).includes('/history')) return jsonResponse({ p1: { status: { status_str: 'success' }, outputs: { '7': { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } } });
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  }, async () => {
    const out = await ai.paintLineart({ url: 'http://y', motif: 'an open door', text: 'poem', checkpoint: 'c.safetensors', steps: 25, cfg: 5, seed: 7 });
    assert.equal(out.ext, 'png');
  });
  assert.match(graph['2'].inputs.text, /black ink line drawing/);
  assert.match(graph['2'].inputs.text, /an open door/);
  assert.match(graph['3'].inputs.text, /shading, gradient/);
  assert.equal(graph['4'].inputs.width, 1024);
  assert.equal(graph['4'].inputs.height, 1024);
});

test('drawIllustration: the poem book chain rides the existing SDXL settings', async () => {
  let graph = null;
  await withFetch(async (url, init) => {
    if (String(url).includes('/prompt')) { graph = JSON.parse(init.body).prompt; return jsonResponse({ prompt_id: 'p1' }); }
    if (String(url).includes('/history')) return jsonResponse({ p1: { status: { status_str: 'success' }, outputs: { '7': { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } } });
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  }, async () => {
    const out = await ai.drawIllustration({ settings: { image: { provider: 'comfyui', url: 'http://y', checkpoint: 'c.safetensors', width: 832, height: 1216 } }, apiKey: '', motif: 'two harbours', text: 'ignored when motif is set' });
    assert.ok(out.buffer.length === 3);
  });
  assert.match(graph['2'].inputs.text, /two harbours/);
  assert.match(graph['2'].inputs.text, /book cover illustration/);
  assert.equal(graph['4'].inputs.width, 832);
});

test('drawMonolineSvg refuses a non-http base at the call site (security gate NICE-5)', async () => {
  await assert.rejects(
    () => ai.drawMonolineSvg({ base: 'file:///etc', apiKey: 'k', model: 'm', motif: 'a lamp', text: 'x' }),
    /http\(s\) URL: the text model URL/);
});
