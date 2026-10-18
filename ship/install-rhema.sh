#!/bin/sh
# Rhema — installer for her machine (one run, no root).
# Puts the AppImage in ~/Applications, the menu entry in
# ~/.local/share/applications, and the icon in the hicolor theme.
# Run from the folder that also holds Rhema-<version>.AppImage, rhema.png
# and rhema.desktop:  sh install-rhema.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
appimage=$(ls "$here"/Rhema-*.AppImage 2>/dev/null | grep -v arm64 | head -1)
[ -n "$appimage" ] || { echo "Δεν βρέθηκε αρχείο Rhema-*.AppImage δίπλα στο script."; exit 1; }

mkdir -p "$HOME/Applications" "$HOME/.local/share/applications" \
         "$HOME/.local/share/icons/hicolor/1024x1024/apps"

install -m 755 "$appimage" "$HOME/Applications/Rhema.AppImage"
install -m 644 "$here/rhema.png" "$HOME/.local/share/icons/hicolor/1024x1024/apps/rhema.png"

sed -e "s|@RHEMA_APPIMAGE@|$HOME/Applications/Rhema.AppImage|" \
    -e "s|@RHEMA_ICON@|$HOME/.local/share/icons/hicolor/1024x1024/apps/rhema.png|" \
    "$here/rhema.desktop" > "$HOME/.local/share/applications/rhema.desktop"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" || true

echo "Έτοιμο: βρείτε το Ρήμα στο μενού (Γραφείο)."
