// Rhema — AI plumbing (main process) /* RHEMA */
//
// Generalizes art.js's provider pattern for local endpoints: the base URL,
// model name and token parameter come from settings (library.rhema.ai), the
// OpenAI catalog regex is skipped for custom bases (a local server lists its
// own models), and the picture can come from ComfyUI instead of an
// /images/generations endpoint. The text brief and the image paint are two
// independent providers; abstract canvas covers (covers.js) remain the
// no-AI fallback.
//
// Settings shape (library.rhema.ai):
//   text:  { base, model, tokenParam }                  // OpenAI-compatible
//   image: { provider: 'comfyui' | 'openai', url, model,
//            checkpoint, width, height, steps, cfg, seed, workflow }
// The API key (optional — local endpoints usually have none) lives under the
// secret name 'rhema-ai', never in the library folder.

'use strict';

// ---------------------------------------------------------------------------
// The brief: an art director's paragraph, tuned for a poetry collection
// ---------------------------------------------------------------------------

const BRIEF_SYSTEM = `You are an art director briefing an illustrator for the cover of a poetry collection. Read the poems and write ONE paragraph of 90 to 130 words describing the cover image. It must look like a real, beautiful poetry cover — painterly, evocative, the kind that lives on a shelf for decades — not a logo and not a literal scene report.

Decide these, in this order, and state them plainly:
1. STYLE — commit to one: painterly impressionism, watercolour, engraving, risograph poster, tonal abstract, dreamlike surrealism, etc. Choose what suits the poems' voice.
2. IMAGE — one central visual idea drawn from the poems' world: an object, a landscape, a quality of light. Metaphor over literal illustration.
3. LIGHT AND PALETTE — the light and two or three dominant colours, named plainly.
4. MOOD — one line.
5. COMPOSITION — where the subject sits and which third of the frame stays calm so the title can be set there later.

Never describe or request any text, lettering, title, author name, logo, or border. Reply with the paragraph only, in the language the request is written in.`;

const PAINT_SUFFIX = ' Fine art book cover illustration, full-bleed, portrait format, rich atmosphere, strong focal point, high production value. The image contains absolutely no text, letters, words, numbers, watermarks, signatures, borders, or logos of any kind.';

const DEFAULT_NEGATIVE = 'text, letters, words, watermark, signature, border, frame, low quality, blurry, deformed';

// Same trim as art.js: the opening carries the world, the ending the weight.
function excerpt(text) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= 6000) return words.join(' ');
  return words.slice(0, 4500).join(' ') + '\n\n[…]\n\n' + words.slice(-1500).join(' ');
}

// ---------------------------------------------------------------------------
// HTTP plumbing (the art.js pattern, generalized)
// ---------------------------------------------------------------------------

function isModelError(status, body) {
  const code = body && body.error && (body.error.code || body.error.type || body.error.status || '');
  const msg = (body && body.error && body.error.message) || '';
  return status === 404 || /model/i.test(String(code)) || /model|not (found|supported|exist|available)|no longer|deprecated|retired/i.test(msg);
}

async function post(url, headers, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = (body && body.error && (body.error.message || body.error.msg)) || (body && body.message) || (body && body.error);
    const err = new Error(typeof msg === 'string' ? msg : ('The provider returned ' + res.status));
    err.status = res.status;
    err.modelProblem = isModelError(res.status, body);
    throw err;
  }
  return body;
}

async function withModels(preferred, defaults, fn) {
  const list = [...new Set([preferred, ...defaults].filter(Boolean))];
  let lastErr = null;
  for (const model of list) {
    try {
      return { model, result: await fn(model) };
    } catch (err) {
      lastErr = err;
      if (!err.modelProblem) throw err;
    }
  }
  throw lastErr || new Error('No model available');
}

function authHeaders(apiKey) {
  return apiKey ? { Authorization: 'Bearer ' + apiKey } : {};
}

// A custom base lists its own models; no gpt-* name filter (that regex is
// OpenAI's catalog only). Used as fallback candidates when a configured
// model name has gone away.
async function listModels(base, apiKey) {
  const res = await fetch(base + '/models', { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error('Could not list models (' + res.status + ')');
  return ((await res.json()).data || []).map((m) => String(m.id || '')).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Text provider — any OpenAI-compatible /chat/completions endpoint
// ---------------------------------------------------------------------------

async function writeBrief({ base, apiKey, model, tokenParam, text }) {
  if (!base) throw new Error('No AI base URL set — add one under File → Rhema AI…');
  const defaults = [model];
  try { defaults.push(...(await listModels(base, apiKey))); } catch { /* the configured name will have to do */ }
  return withModels(model, defaults, async (m) => {
    const payload = {
      model: m,
      messages: [
        { role: 'system', content: BRIEF_SYSTEM },
        { role: 'user', content: 'POEMS:\n\n' + excerpt(text) }
      ],
      [tokenParam || 'max_tokens']: 2000
    };
    const body = await post(base + '/chat/completions', authHeaders(apiKey), payload);
    const msg = body.choices && body.choices[0] && body.choices[0].message;
    let out = msg && msg.content;
    // a reasoning model can spend the whole budget thinking; give it more room once
    if ((!out || !out.trim()) && msg && msg.reasoning_content) {
      payload[tokenParam || 'max_tokens'] = 6000;
      const again = await post(base + '/chat/completions', authHeaders(apiKey), payload);
      out = again.choices && again.choices[0] && again.choices[0].message && again.choices[0].message.content;
    }
    if (!out || !out.trim()) throw new Error('The model returned an empty brief');
    return out.trim();
  });
}

// ---------------------------------------------------------------------------
// Image provider A — OpenAI-compatible /images/generations (local servers
// like llama.cpp's image endpoints speak it)
// ---------------------------------------------------------------------------

async function paintOpenaiCompat({ url, apiKey, model, prompt }) {
  const body = await post(url + '/images/generations', authHeaders(apiKey), {
    model: model || 'image',
    prompt: prompt + PAINT_SUFFIX,
    n: 1,
    size: '1024x1536',
    response_format: 'b64_json'
  });
  const b64 = body.data && body.data[0] && (body.data[0].b64_json || body.data[0].b64);
  if (!b64) throw new Error('The image model returned no picture');
  return { buffer: Buffer.from(b64, 'base64'), ext: 'jpg' };
}

// ---------------------------------------------------------------------------
// Image provider B — ComfyUI (workflow submit → poll → /view)
// ---------------------------------------------------------------------------

// The default SDXL txt2img graph in ComfyUI's API format. A custom workflow
// (settings.image.workflow) is this same JSON shape with {{TOKENS}} replaced.
const DEFAULT_WORKFLOW = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{CHECKPOINT}}' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: '{{POSITIVE}}' } },
  '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: '{{NEGATIVE}}' } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: '{{WIDTH}}', height: '{{HEIGHT}}', batch_size: 1 } },
  '5': { class_type: 'KSampler', inputs: {
    model: ['1', 0], positive: ['2', 0], negative: ['3', 0],
    seed: '{{SEED}}', steps: '{{STEPS}}', cfg: '{{CFG}}',
    sampler_name: 'euler', scheduler: 'normal', denoise: 1.0,
    latent_image: ['4', 0]
  } },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'rhema/cover' } }
};

// Fill the workflow's {{TOKENS}}. Numbers stay numbers; the prompt is
// inserted as a plain string (JSON-escaped by the round-trip).
function buildWorkflow(workflow, { positive, negative, checkpoint, width, height, steps, cfg, seed }) {
  const json = JSON.stringify(workflow || DEFAULT_WORKFLOW);
  const filled = json
    .replace('"{{POSITIVE}}"', JSON.stringify(positive))
    .replace('"{{NEGATIVE}}"', JSON.stringify(negative || DEFAULT_NEGATIVE))
    .replace('"{{CHECKPOINT}}"', JSON.stringify(checkpoint))
    .replace('"{{WIDTH}}"', String(width))
    .replace('"{{HEIGHT}}"', String(height))
    .replace('"{{SEED}}"', String(seed))
    .replace('"{{STEPS}}"', String(steps))
    .replace('"{{CFG}}"', String(cfg));
  return JSON.parse(filled);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function comfyuiPaint({ url, workflow, brief, checkpoint, width, height, steps, cfg, seed, timeoutMs = 5 * 60 * 1000 }) {
  if (!url) throw new Error('No ComfyUI URL set — add one under File → Rhema AI…');
  const positive = String(brief) + PAINT_SUFFIX;
  const graph = buildWorkflow(workflow ? JSON.parse(workflow) : DEFAULT_WORKFLOW, {
    positive,
    negative: DEFAULT_NEGATIVE,
    checkpoint: checkpoint || 'juggernautXL_v9.safetensors',
    width: width || 832, height: height || 1216,
    steps: steps || 30, cfg: cfg || 6,
    seed: seed ? (seed | 0) : Math.floor(Math.random() * 2 ** 31)
  });
  const submitted = await post(url + '/prompt', {}, { prompt: graph, client_id: 'rhema' });
  if (!submitted || !submitted.prompt_id) throw new Error('ComfyUI did not accept the workflow');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1500);
    let hist = null;
    try {
      const res = await fetch(url + '/history/' + encodeURIComponent(submitted.prompt_id));
      if (res.ok) hist = await res.json();
    } catch { /* server busy; keep polling */ }
    const entry = hist && hist[submitted.prompt_id];
    if (!entry) continue;
    const status = entry.status || {};
    if (status.status_str && status.status_str !== 'success' && status.status_str !== 'completed') {
      const msgs = (status.messages || []).map((m) => (m && m.message && m.message[1] && String(m.message[1].error || '')) || '').filter(Boolean);
      throw new Error('ComfyUI: ' + (msgs[0] || status.status_str));
    }
    for (const out of Object.values(entry.outputs || {})) {
      const img = out && out.images && out.images[0];
      if (!img) continue;
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
      const res = await fetch(url + '/view?' + q.toString());
      if (!res.ok) throw new Error('ComfyUI could not serve the picture (' + res.status + ')');
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf, ext: /\.png$/i.test(img.filename) ? 'png' : 'jpg' };
    }
    if (status.completed) throw new Error('ComfyUI finished without producing a picture');
  }
  throw new Error('ComfyUI took too long (over ' + Math.round(timeoutMs / 60000) + ' minutes)');
}

// ---------------------------------------------------------------------------
// The whole job: poems in, { buffer, ext, brief, textModel, imageModel } out
// ---------------------------------------------------------------------------

async function paintCover({ settings, apiKey, text }) {
  const s = settings || {};
  const img = s.image || {};
  const b = await writeBrief({
    base: (s.text || {}).base, apiKey,
    model: (s.text || {}).model, tokenParam: (s.text || {}).tokenParam,
    text: String(text || '')
  });
  const painted = img.provider === 'comfyui'
    ? await comfyuiPaint({
        url: img.url, workflow: img.workflow, brief: b.result,
        checkpoint: img.checkpoint, width: img.width, height: img.height,
        steps: img.steps, cfg: img.cfg, seed: img.seed
      })
    : await paintOpenaiCompat({ url: img.url, apiKey, model: img.model, prompt: b.result });
  return {
    buffer: painted.buffer, ext: painted.ext,
    brief: b.result, textModel: b.model,
    imageModel: img.provider === 'comfyui' ? (img.checkpoint || 'comfyui') : painted.model || img.model
  };
}

// The settings pane's Test button: what answers, what doesn't.
async function testEndpoints({ settings, apiKey }) {
  const s = settings || {};
  const out = {};
  const base = (s.text || {}).base;
  if (base) {
    try {
      const models = await listModels(base.replace(/\/+$/, ''), apiKey);
      out.text = { ok: true, models: models.slice(0, 20) };
    } catch (err) { out.text = { ok: false, error: String(err.message || err) }; }
  } else out.text = { ok: false, error: 'no base URL' };
  const img = s.image || {};
  if (img.provider === 'comfyui' && img.url) {
    try {
      const res = await fetch(img.url.replace(/\/+$/, '') + '/system_stats');
      const body = res.ok ? await res.json() : null;
      out.image = res.ok
        ? { ok: true, version: body && body.system && body.system.comfyui_version }
        : { ok: false, error: 'HTTP ' + res.status };
    } catch (err) { out.image = { ok: false, error: String(err.message || err) }; }
  } else if (img.provider === 'openai' && img.url) {
    out.image = { ok: true, note: 'will use ' + img.url + '/images/generations' };
  } else out.image = { ok: false, error: 'no image endpoint configured' };
  return out;
}

// Stone 6: retention values shared by the backup keep and the snapshot thinnings.
// undefined -> default; a positive number -> days; 0 or 'unlimited' -> keep all.
function keepValue(v, dflt) {
  if (v === 'unlimited' || v === 0) return Infinity;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

module.exports = {
  paintCover, testEndpoints, writeBrief, comfyuiPaint, paintOpenaiCompat,
  buildWorkflow, DEFAULT_WORKFLOW, keepValue, excerpt,
  BRIEF_SYSTEM, PAINT_SUFFIX, DEFAULT_NEGATIVE
};
