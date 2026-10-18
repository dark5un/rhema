'use strict';

// Rhema /* RHEMA */ — update-core.js: tag-suffix-safe version comparison.
// Hermetic: no Electron, no network. The updater-target fix plan, 2026-10-18.

const assert = require('node:assert/strict');
const { test } = require('node:test');

const U = require('../update-core.js');

test('releaseVersionFromTag: both tag shapes reduce to the numeric core', () => {
  assert.equal(U.releaseVersionFromTag('v1.5.9'), '1.5.9');
  assert.equal(U.releaseVersionFromTag('v1.5.9-rhema'), '1.5.9');
  assert.equal(U.releaseVersionFromTag('1.5.9-rhema'), '1.5.9');
  assert.equal(U.releaseVersionFromTag(''), '');
  assert.equal(U.releaseVersionFromTag(null), '');
  assert.equal(U.releaseVersionFromTag('latest'), '', 'garbage never becomes NaN');
  assert.equal(U.releaseVersionFromTag('beta-1.5'), '', 'anchored: a number mid-string is not a version');
});

test('compareVersions: suffixed tags compare like clean ones (the old NaN trap)', () => {
  // the exact regression: '1.5.9-rhema' vs app version '1.5.9' used to be NaN
  assert.equal(U.compareVersions('1.5.9-rhema', '1.5.9'), 0, 'same release, no update');
  assert.ok(U.compareVersions('1.5.10-rhema', '1.5.9') > 0, 'newer release offers an update');
  assert.ok(U.compareVersions('1.5.8-rhema', '1.5.9') < 0, 'older release stays quiet');
  assert.ok(U.compareVersions('1.6', '1.5.9-rhema') > 0, 'minor bumps cross the suffix');
  assert.ok(U.compareVersions('1.5.10', '1.5.9') > 0, 'two-digit patch compares numerically');
  assert.ok(U.compareVersions('2', '1.9.9') > 0, 'short tags pad with zeros');
});

test('compareVersions: never returns NaN for any input pair', () => {
  for (const a of ['1.5.9-rhema', 'v1.5.9', '', 'x', null, '1.5']) {
    for (const b of ['1.5.9', '', 'garbage', '2.0-beta']) {
      assert.ok(Number.isFinite(U.compareVersions(a, b)), `finite: ${a} vs ${b}`);
    }
  }
});
