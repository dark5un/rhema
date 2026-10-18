#!/bin/sh
# Rhema — installer for her machine (one run, no root).
# Puts the AppImage in ~/Applications, the menu entry in
# ~/.local/share/applications, and the icon in the hicolor theme.
# Run from the folder that also holds Rhema-<version>.AppImage, rhema.png
# and rhema.desktop:  sh install-rhema.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
# Pick the AppImage for this machine's architecture.
case $(uname -m) in
  aarch64|arm64) appimage=$(ls "$here"/Rhema-*-arm64.AppImage 2>/dev/null | head -1) ;;
  *)             appimage=$(ls "$here"/Rhema-*.AppImage 2>/dev/null | grep -v arm64 | head -1) ;;
esac
[ -n "$appimage" ] || { echo "Δεν βρέθηκε αρχείο Rhema-*.AppImage δίπλα στο script."; exit 1; }

mkdir -p "$HOME/Applications" "$HOME/.local/share/applications" \
         "$HOME/.local/share/icons/hicolor/1024x1024/apps"

install -m 755 "$appimage" "$HOME/Applications/Rhema.AppImage"
install -m 644 "$here/rhema.png" "$HOME/.local/share/icons/hicolor/1024x1024/apps/rhema.png"

# Fill the desktop-entry template. Plain string splicing in awk (no sed
# replacement semantics, so & or | in $HOME cannot corrupt the result),
# written to a temp file and landed with install — install unlinks the
# destination first, so a planted symlink is never followed.
tmp=$(mktemp)
RHEMA_APP="$HOME/Applications/Rhema.AppImage" \
RHEMA_ICON="$HOME/.local/share/icons/hicolor/1024x1024/apps/rhema.png" \
awk '{ if ((i=index($0,"@RHEMA_APPIMAGE@"))>0) $0=substr($0,1,i-1) ENVIRON["RHEMA_APP"] substr($0,i+16)
       if ((j=index($0,"@RHEMA_ICON@"))>0) $0=substr($0,1,j-1) ENVIRON["RHEMA_ICON"] substr($0,j+12)
       print }' "$here/rhema.desktop" > "$tmp"
install -m 644 "$tmp" "$HOME/.local/share/applications/rhema.desktop"
rm -f "$tmp"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" || true

echo "Έτοιμο: βρείτε το Ρήμα στο μενού (Γραφείο)."
