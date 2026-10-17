// Rhema — AI settings pane /* RHEMA */
//
// File → Rhema Settings…: the local text endpoint (OpenAI-compatible), the image
// endpoint (ComfyUI or OpenAI-compatible), and the backup/snapshot retention
// knobs (Stone 6, unlimited included). Everything lives in library.rhema —
// namespaced so upstream's library.json keys never collide. The API key goes
// through secret:set ('rhema-ai'), never into the library folder.
//
// Loaded before app.js; exposes window.RhemaSettings (the NeoCovers pattern).

'use strict';

const RhemaSettings = (() => {

  const cfg = () => library.rhema || {};
  const aiSettings = () => cfg().ai || {};
  const retention = () => cfg().retention || {};

  // retention values: undefined -> default; days -> days; 0/'unlimited' -> keep all
  const keepValue = (v, dflt) => {
    if (v === 'unlimited' || v === 0) return Infinity;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : dflt;
  };

  // A text base plus an image endpoint is enough to paint through Rhema's own
  // plumbing (ai.js in the main process); until then the upstream OpenAI path
  // stays in charge.
  const configured = () => {
    const ai = aiSettings();
    return !!(ai.text && ai.text.base && ai.image && ai.image.provider && ai.image.url);
  };
  /* RHEMA — Stone 17: the drawing kinds are offered by availability, not
     by the all-or-nothing cover gate: monoline line art needs the text
     endpoint (LLM-SVG) or ComfyUI (line-art + vectorize); an AI
     illustration needs the image endpoint. */
  const hasText = () => { const a = aiSettings(); return !!(a.text && a.text.base); };
  const hasImage = () => { const a = aiSettings(); return !!(a.image && a.image.url); };
  const hasComfyui = () => { const a = aiSettings(); return !!(a.image && a.image.provider === 'comfyui' && a.image.url); };

  // Snapshot thinning days for snapsToThin (app.js); Infinity = keep everything.
  const snapKeepDays = () => keepValue(retention().snapshots, 30);

  // The addresses this machine's stack answers on (Strata :11434, ComfyUI :3101)
  const DEFAULT_BASE = 'http://localhost:11434/v1';
  const DEFAULT_COMFY = 'http://localhost:3101';

  function open() {
    const ai = aiSettings();
    const ret = retention();
    const text = ai.text || {};
    const img = ai.image || {};
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    // a select that keeps values outside its option list: a hand-edited
    // library must not be silently rewritten by opening this pane
    const sel = (v, opts) => {
      const list = opts.slice();
      if (v !== '' && !list.some((o) => String(o[0]) === String(v))) list.unshift([v, String(v)]);
      return list.map((o) => `<option value="${escHtml(String(o[0]))}"${String(v) === String(o[0]) ? ' selected' : ''}>${escHtml(t(String(o[1])))}</option>`).join('');
    };
    bd.innerHTML = `
      <div class="modal" style="width:600px">
        <h2 style="font-size:17px">${t('Rhema Settings')}</h2>
        <p>${t('Rhema can read a book once it passes {n} words and paint its cover with your own local models: a language model writes the brief, an image model paints it. When the addresses below point to this computer, nothing leaves it. Here you can also choose how long Rhema keeps your backups and snapshots.', { n: PAINT_AT })}</p>
        <div class="stats-row">
          <label>${t('Where your language model lives')} <input id="ra-base" type="text" spellcheck="false" style="width:300px" placeholder="${DEFAULT_BASE}"/></label>
        </div>
        <div class="stats-row">
          <label>${t('Model name')} <input id="ra-model" type="text" spellcheck="false" style="width:220px" placeholder="qwen3.8-flash-next-iq3_s"/></label>
          <label>${t('API key')} <input id="ra-key" type="password" autocomplete="off" spellcheck="false" style="width:220px"/></label>
        </div>
        <p class="soft" id="ra-keynote" style="margin:-6px 0 12px;font-size:12px"></p>
        <div class="stats-row">
          <label>${t('Paint with')}
            <select id="ra-imgprovider">${sel(img.provider || '', [['', 'no image endpoint'], ['comfyui', 'ComfyUI'], ['openai', 'OpenAI-compatible']])}</select>
          </label>
          <label>${t('Image URL')} <input id="ra-imgurl" type="text" spellcheck="false" style="width:240px" placeholder="${DEFAULT_COMFY}"/></label>
        </div>
        <details class="st-advanced"${img.provider === 'comfyui' ? ' open' : ''}>
          <summary class="soft">${t('ComfyUI')}</summary>
          <div class="stats-row">
            <label>${t('Checkpoint')} <input id="ra-ckpt" type="text" spellcheck="false" style="width:240px" placeholder="juggernautXL_v9.safetensors"/></label>
            <label>${t('Size')}
              <select id="ra-size">${sel(img.width ? img.width + 'x' + img.height : '832x1216', [['832x1216', '832 × 1216'], ['1024x1536', '1024 × 1536'], ['672x1344', '672 × 1344']])}</select>
            </label>
            <label>${t('Steps')} <input id="ra-steps" type="number" min="10" max="100" style="width:64px" value="${img.steps || 30}"/></label>
            <label>${t('CFG')} <input id="ra-cfg" type="number" min="1" max="20" step="0.5" style="width:64px" value="${img.cfg || 6}"/></label>
          </div>
          <p class="soft" style="font-size:12px;margin:0 0 6px">${t('The workflow is built for you; a custom ComfyUI API workflow (with {{POSITIVE}}, {{SEED}}…) can be set in the library file.')}</p>
        </details>
        <details class="st-advanced">
          <summary class="soft">${t('Backups and snapshots')}</summary>
          <div class="stats-row">
            <label>${t('Keep daily backups for')}
              <select id="ra-retbackups">${sel(ret.backups === undefined ? 14 : ret.backups, [[14, '14 days'], [30, '30 days'], [90, '90 days'], [365, '365 days'], ['unlimited', 'unlimited']])}</select>
            </label>
            <label>${t('Keep automatic snapshots for')}
              <select id="ra-retsnaps">${sel(ret.snapshots === undefined ? 30 : ret.snapshots, [[30, '30 days'], [90, '90 days'], [365, '365 days'], ['unlimited', 'unlimited']])}</select>
            </label>
          </div>
          <p class="soft" style="font-size:12px;margin:0 0 6px">${t('Snapshots you take yourself ({key}) are always kept. “Unlimited” never deletes — the library folder just grows.', { key: K('⌘S', 'Ctrl+S') })}</p>
        </details>
        <details class="st-advanced">
          <summary class="soft">${t('Poem QR')}</summary>
          <div class="stats-row">
            <label>${t('Each poem’s QR encodes')} <input id="ra-qr" type="text" spellcheck="false" style="width:340px" placeholder="https://example.com/{collection}/{title}"/></label>
          </div>
          <p class="soft" style="font-size:12px;margin:0 0 6px">${t('Leave it empty and the QR carries the poem’s title and author as plain text. A template can use {title}, {collection} and {author}.')}</p>
        </details>
        <details class="st-advanced">
          <summary class="soft">${t('Importing poems')}</summary>
          <div class="stats-row">
            <label>${t('Split a file into poems')}
              <select id="ra-split">${sel((cfg().import || {}).split || 'auto', [['auto', 'headings, separators, page breaks and wide gaps'], ['headings', 'headings, separators and page breaks only'], ['whole', 'never — one file, one poem']])}</select>
            </label>
          </div>
          <p class="soft" style="font-size:12px;margin:0 0 6px">${t('A single blank line is always a stanza break. Whatever the split, you can join poems or split them again in the editor: press Enter three times to start a new poem.')}</p>
        </details>
        <div style="text-align:right;margin-top:14px">
          <button id="ra-test" class="btn-quiet" style="margin-right:10px;border:1px solid rgba(255,255,255,.35);padding:5px 14px">${t('Test')}</button>
          <button class="m-cancel btn-quiet" style="margin-right:10px">${t('Cancel')}</button>
          <button class="m-ok btn-gold">${t('Save')}</button>
        </div>
        <p class="soft" id="ra-testnote" style="margin:8px 0 0;font-size:12px"></p>
      </div>`;
    document.body.appendChild(bd);
    // values land through the DOM (the openCoverArt pattern): no attribute
    // escaping needed, and a quote in a saved URL cannot break out. The
    // localhost defaults are pre-filled, not just hinted in placeholders.
    const fill = (id, v) => { bd.querySelector('#' + id).value = v == null ? '' : String(v); };
    fill('ra-base', text.base || DEFAULT_BASE);
    fill('ra-model', text.model);
    fill('ra-imgurl', img.url || DEFAULT_COMFY);
    fill('ra-ckpt', img.checkpoint);
    fill('ra-qr', (cfg().qr || {}).template);
    const note = bd.querySelector('#ra-keynote');
    const key = bd.querySelector('#ra-key');
    window.neo.hasSecret('rhema-ai').then((has) => {
      note.textContent = has
        ? t('A key is saved, encrypted, outside your library folder. Paste a new one to replace it, or type “{remove}” to forget it.', { remove: t('remove') })
        : t('Local endpoints usually need no key. If yours does, it is stored encrypted on this computer and only ever sent to the address above.');
    });
    const done = () => bd.remove();
    bd.querySelector('.m-cancel').onclick = done;
    bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
    const collect = () => {
      const size = (bd.querySelector('#ra-size').value || '832x1216').split('x');
      const provider = bd.querySelector('#ra-imgprovider').value;
      return {
        text: {
          base: bd.querySelector('#ra-base').value.trim().replace(/\/+$/, '') || undefined,
          model: bd.querySelector('#ra-model').value.trim() || undefined,
          tokenParam: 'max_tokens'
        },
        image: provider ? {
          provider,
          url: bd.querySelector('#ra-imgurl').value.trim().replace(/\/+$/, '') || undefined,
          checkpoint: bd.querySelector('#ra-ckpt').value.trim() || undefined,
          width: parseInt(size[0], 10) || 832,
          height: parseInt(size[1], 10) || 1216,
          steps: parseInt(bd.querySelector('#ra-steps').value, 10) || 30,
          cfg: parseFloat(bd.querySelector('#ra-cfg').value) || 6
        } : undefined
      };
    };
    bd.querySelector('#ra-test').onclick = async () => {
      const tn = bd.querySelector('#ra-testnote');
      tn.textContent = t('Testing…');
      const res = await window.neo.rhema.test(collect()).catch((err) => ({ text: { ok: false, kind: 'error', error: String(err) }, image: { ok: false, kind: 'error', error: String(err) } }));
      // plain language for a writer, not Node's vocabulary
      const line = (r) => {
        if (!r) return '—';
        if (r.ok) return r.models ? '✓ ' + t('ok — {n} models', { n: String(r.models.length) }) : '✓ ' + t('ok');
        const say = {
          unreachable: t('can’t be reached — is the model server running?'),
          auth: t('asked for a key — type it in the API key box, Save, then Test again'),
          no_checkpoint: t('answers, but the Checkpoint named below isn’t installed') + (r.checkpoints && r.checkpoints.length ? ' (' + t('installed: {list}', { list: r.checkpoints.join(', ') }) + ')' : ''),
          unset: t('is not set')
        }[r.kind] || t('failed: {error}', { error: r.error || '?' });
        return '✗ ' + say;
      };
      const bad = (res.text && !res.text.ok) || (res.image && !res.image.ok);
      tn.style.color = bad ? 'var(--warn, #d9a441)' : '';
      tn.textContent = t('Text: {text} · Paint: {image}', { text: line(res.text), image: line(res.image) });
      if (res.image && res.image.kind === 'no_checkpoint') bd.querySelector('details.st-advanced').open = true;
    };
    bd.querySelector('.m-ok').onclick = async () => {
      const k = key.value.trim();
      if (k === 'remove' || k === t('remove')) await window.neo.setSecret('rhema-ai', '');
      else if (k) await window.neo.setSecret('rhema-ai', k);
      const back = bd.querySelector('#ra-retbackups').value;
      const snaps = bd.querySelector('#ra-retsnaps').value;
      const qrTemplate = bd.querySelector('#ra-qr').value.trim();
      const split = bd.querySelector('#ra-split').value; /* RHEMA — Stone 12 split knob */
      // merge, never replace: other library.rhema sub-keys (Phase 2+) survive
      library.rhema = Object.assign({}, cfg(), {
        ai: collect(),
        qr: { ...(cfg().qr || {}), template: qrTemplate || undefined },
        import: { ...(cfg().import || {}), split: split !== 'auto' ? split : undefined },
        retention: {
          backups: back === 'unlimited' ? 'unlimited' : parseInt(back, 10),
          snapshots: snaps === 'unlimited' ? 'unlimited' : parseInt(snaps, 10)
        }
      });
      await writeLibrary(library);
      done();
      toast(t('Saved. Rhema will paint a cover once a book passes {n} words.', { n: PAINT_AT }), 5000);
    };
    bd.querySelector('#ra-base').focus();
  }

  return {
    configured, hasText, hasImage, hasComfyui, aiSettings, retention, keepValue, snapKeepDays, open
  };
})();
