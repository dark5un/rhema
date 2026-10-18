// Rhema Phase 1 e2e /* RHEMA */ — the File → Rhema Settings… pane: it opens,
// saves library.rhema (endpoints + retention, unlimited included), and the
// Test button reaches the bridge. Screenshots with NEO_SHOTS for the UX gate.
// Run with `npm run test:rhema-settings`.

'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `rhema-settings-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
// RHEMA — this suite pins the UI language to English for determinism; it reads English strings
fs.mkdirSync(app.getPath('userData'), { recursive: true });
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({ uiLanguage: 'en' }));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'Rhema Library');
fs.mkdirSync(lib);
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, pageTheme: 'night',
  moreFeatures: true,
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const onDisk = () => JSON.parse(fs.readFileSync(path.join(lib, 'library.json'), 'utf8'));
const shot = async (name) => {
  if (!process.env.NEO_SHOTS) return;
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(process.env.NEO_SHOTS, name + '.png'), img.toPNG());
};

const results = [];
const check = (name, ok, extra) => {
  results.push((ok ? 'ok   ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) process.exitCode = 1;
};

app.whenReady().then(async () => {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0] || await new Promise((resolve) => app.once('browser-window-created', (_e, w) => resolve(w)));
  wc = win.webContents;
  await new Promise((resolve) => wc.once('did-finish-load', resolve));
  for (let i = 0; i < 50 && !(await js('typeof RhemaSettings !== "undefined" && typeof book !== "undefined"')); i++) await tick(100);

  check('the pane module loads and the menu item exists',
    await js('typeof RhemaSettings === "object" && typeof RhemaSettings.open === "function"'));

  // open the pane (the menu sends { type: 'rhemaSettings' }; call it directly)
  await js('RhemaSettings.open()');
  await tick(200);
  check('the pane opens with endpoint and retention fields',
    await js('!!document.querySelector("#ra-base") && !!document.querySelector("#ra-imgprovider") && !!document.querySelector("#ra-retbackups") && !!document.querySelector("#ra-retsnaps") && !!document.querySelector("#ra-auto")')); /* RHEMA — Updates opt-in */
  check('auto-update defaults to OFF (the user\'s choice, Panos 2026-10-18)',
    await js('document.querySelector("#ra-auto").checked === false'));
  check('the local defaults are pre-filled, not just placeholders',
    await js('document.querySelector("#ra-base").value === "http://localhost:11434/v1" && document.querySelector("#ra-imgurl").value === "http://localhost:3101"'));
  await shot('rhema-settings-pane');

  // fill it like a writer would: local Strata + local ComfyUI, unlimited backups
  await js(`(() => {
    const set = (id, v) => { const el = document.querySelector('#' + id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    set('ra-base', 'http://localhost:11434/v1');
    set('ra-model', 'qwen3.8-flash-next-iq3_s');
    set('ra-imgprovider', 'comfyui');
    set('ra-imgurl', 'http://localhost:3101');
    set('ra-retbackups', 'unlimited');
    set('ra-retsnaps', 90);
    set('ra-split', 'whole'); /* RHEMA — Stone 12 split knob round-trip */
    document.querySelector('#ra-auto').checked = true; /* RHEMA — opt in to auto-update */
    document.querySelector('.m-ok').click();
  })()`);
  await tick(300);
  const rhema = onDisk().rhema;
  check('library.rhema.ai saved (text base + comfyui url)',
    !!(rhema && rhema.ai && rhema.ai.text && rhema.ai.text.base === 'http://localhost:11434/v1' &&
       rhema.ai.image && rhema.ai.image.provider === 'comfyui' && rhema.ai.image.url === 'http://localhost:3101'),
    JSON.stringify(rhema && rhema.ai));
  check('retention saved with unlimited backups and 90-day snapshots',
    !!(rhema && rhema.retention && rhema.retention.backups === 'unlimited' && rhema.retention.snapshots === 90),
    JSON.stringify(rhema && rhema.retention));
  check('the import split knob saved beside its siblings (merge, not replace)',
    !!(rhema && rhema.import && rhema.import.split === 'whole'),
    JSON.stringify(rhema && rhema.import));
  check('auto-update opt-in saved (library.rhema.autoUpdate)',
    !!(rhema && rhema.autoUpdate === true),
    JSON.stringify(rhema && rhema.autoUpdate));
  // opt-out round-trip (security gate SHOULD, 2026-10-18): OFF persists
  // AND disarms a wired-up updater immediately via update:rearm
  await js('RhemaSettings.open()');
  await tick(200);
  await js(`(() => { document.querySelector('#ra-auto').checked = false; document.querySelector('.m-ok').click(); })()`);
  await tick(300);
  const rhemaOff = onDisk().rhema;
  check('auto-update opt-out removes the key from library.rhema',
    rhemaOff && rhemaOff.autoUpdate === undefined, JSON.stringify(rhemaOff && rhemaOff.autoUpdate));
  check('update:rearm reports OFF after opt-out (updater disarmed path live)',
    await js('window.neo.rhema.rearm()') === false);
  check('the configured app now counts as paintable without any OpenAI key',
    await js('RhemaSettings.configured() === true && RhemaSettings.snapKeepDays() === 90'));

  // the Test button goes through the preload bridge to ai:test
  await js('RhemaSettings.open()');
  await tick(150);
  // a future Phase 2 sub-key under library.rhema must survive the pane's Save
  await js('library.rhema.poetry = { seeded: true }');
  const testRes = await js('window.neo.rhema.test({ text: { base: "http://127.0.0.2:9/v1" }, image: { provider: "comfyui", url: "http://127.0.0.2:9" } })');
  check('ai:test answers and reports dead endpoints as failed (no crash)',
    !!(testRes && testRes.text && testRes.text.ok === false && testRes.text.kind === 'unreachable' &&
       testRes.image && testRes.image.ok === false),
    JSON.stringify(testRes));
  await js('document.querySelector(".m-ok").click()');
  for (let i = 0; i < 20 && !(onDisk().rhema && onDisk().rhema.poetry); i++) await tick(100);
  check('saving the pane merges, never wipes, other library.rhema sub-keys',
    !!(onDisk().rhema && onDisk().rhema.poetry && onDisk().rhema.poetry.seeded === true));

  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  app.exit(process.exitCode || 0);
}).catch((err) => { console.error(err); app.exit(1); });
