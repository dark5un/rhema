// Rhema — update version arithmetic (main process) /* RHEMA */
//
// The pure rules behind Help → Check for Update…, kept out of main.js so
// they are unit-testable without Electron (same pattern as rhema-assets.js).
//
// Why this exists: Rhema's release tags carry a suffix — v1.5.9-rhema —
// while app.getVersion() is the clean package.json number (1.5.9). The old
// compareVersions split '1.5.9-rhema' into [1, 5, NaN], so every comparison
// against a suffixed tag returned NaN and hasUpdate was always false. The
// numeric core is what both sides actually share, so that is what compares.

'use strict';

// the leading dotted-number of a version string: 'v1.5.9-rhema' -> '1.5.9';
// '' when there is no number to find (garbage in, empty out — never NaN).
// Anchored: a number only counts at the start (after an optional v), so a
// label like 'beta-1.5' can never masquerade as a version (gate NICE 2026-10-18).
function numericCore(s) {
  const m = String(s == null ? '' : s).match(/^v?(\d+(?:\.\d+)*)/i);
  return m ? m[1] : '';
}

// GitHub release tag -> comparable version (also used for display)
function releaseVersionFromTag(tag) {
  return numericCore(tag);
}

// > 0 if a is newer than b, < 0 older, 0 equal; compares numeric cores so
// '-rhema' (or any) suffixes can never poison the result
function compareVersions(a, b) {
  const pa = numericCore(a).split('.').map(Number);
  const pb = numericCore(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

module.exports = { numericCore, releaseVersionFromTag, compareVersions };
