#!/usr/bin/env bash
# W6 site screenshots (rhema.guide tutorials) — one command, both UI languages.
# Hyprland tiles mapped windows and ignores Electron's setBounds, so this
# script floats + resizes the window via hyprctl while the harness polls for
# innerWidth >= 1600 (window 1700x1130 -> web contents exactly 1700x1100,
# the site's lightbox native res).
set -e
cd "$(dirname "$0")/.."
OUT=${1:-$PWD/.w6-shots}
mkdir -p "$OUT"
for L in en el; do
  SITE_LANG=$L NEO_SHOTS=$OUT npx electron scripts/site-shots.tmp.js &
  PID=$!
  ADDR=""
  for _ in $(seq 1 60); do
    ADDR=$(hyprctl clients -j 2>/dev/null | python3 -c "import json,sys; a=[c['address'] for c in json.load(sys.stdin) if c['class']=='electron']; print(a[0] if a else '')")
    [ -n "$ADDR" ] && break
    sleep 0.5
  done
  if [ -n "$ADDR" ]; then
    # the new window is active when mapped: float it, size it, park it
    hyprctl eval "hl.dispatch(hl.dsp.window.float({ action = 'toggle' }))" >/dev/null
    hyprctl eval "hl.dispatch(hl.dsp.window.resize({ x = 1700, y = 1130, exact = true }))" >/dev/null
  fi
  wait $PID
done
identify -format '%f %wx%h\n' "$OUT"/*.png
