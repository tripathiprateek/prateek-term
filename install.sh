#!/bin/sh
# Prateek-Term installer for Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/tripathiprateek/prateek-term/main/install.sh | sh
#   curl -fsSL ... | sh -s -- --channel rc          # release candidates
#   curl -fsSL ... | sh -s -- --version v1.5.0-rc.1 # pin an exact version
#   curl -fsSL ... | sh -s -- --uninstall
#
# The `sh -s --` form is required to pass arguments through a pipe.
#
# Installs an AppImage to a per-user location — no sudo, which also avoids the
# classic `curl | sh` failure where a password prompt cannot read from stdin
# because stdin is the pipe.
set -eu

REPO="tripathiprateek/prateek-term"
LIB="$HOME/.local/lib/prateek-term"
BIN="$HOME/.local/bin"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"

# The AppImage filename is deliberately NOT versioned. The app writes its own
# .desktop entry with Exec=<the real AppImage path> (src/main/integrations/
# linux-integrations.js), so a versioned filename would orphan that entry — and
# the Nautilus script — on every single upgrade.
APPIMAGE="$LIB/Prateek-Term.AppImage"

CHANNEL=""
PIN=""
ACTION=install

usage() {
  cat <<EOF
Prateek-Term installer

  --channel stable|rc   Which releases to track (default: stable, or whatever
                        this machine is already on)
  --version vX.Y.Z      Install one exact version and stop tracking a channel
  --uninstall           Remove Prateek-Term (settings are kept)
  -h, --help            Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --channel)   CHANNEL="${2:-}"; shift 2 ;;
    --version)   PIN="${2:-}";     shift 2 ;;
    --uninstall) ACTION=uninstall; shift ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

# ── uninstall ───────────────────────────────────────────────────────────────
if [ "$ACTION" = uninstall ]; then
  rm -rf "$LIB"
  rm -f  "$BIN/prateek-term" \
         "$APPS/prateek-term.desktop" \
         "$ICONS/prateek-term.png" \
         "$HOME/.local/share/nautilus/scripts/Open in Prateek-Term" 2>/dev/null || true
  update-desktop-database "$APPS" 2>/dev/null || true
  say "Prateek-Term removed."
  say ""
  say "Your settings and connection profiles were kept. To delete them too:"
  say "  rm -rf ~/.config/Prateek-Term"
  exit 0
fi

# Re-running with no --channel keeps whatever channel this machine is on.
[ -n "$CHANNEL" ] || CHANNEL=$(cat "$LIB/CHANNEL" 2>/dev/null || echo stable)
case "$CHANNEL" in
  stable|rc) ;;
  *) die "--channel must be 'stable' or 'rc' (got '$CHANNEL')" ;;
esac

command -v curl >/dev/null 2>&1 || die "curl is required."

# electron-builder names AppImages with the AppImage arch convention: x86_64
# (NOT x64, which it uses for every other target) and arm64. Verified against
# the published v1.5.0-rc.1 assets — an earlier x64 guess 404'd on every Intel
# and AMD machine.
case "$(uname -m)" in
  x86_64|amd64)  ARCH=x86_64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "unsupported architecture: $(uname -m) (x86_64 and aarch64 are supported)" ;;
esac

# ── resolve the tag ─────────────────────────────────────────────────────────
# Deliberately no jq dependency: the two channels map onto two endpoints, and
# /releases/latest already excludes pre-releases by definition.
tag_from_json() { grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\(v[^"]*\)".*/\1/'; }

if [ -n "$PIN" ]; then
  TAG="$PIN"
elif [ "$CHANNEL" = rc ]; then
  # Releases are listed newest-first, so the first entry is the newest of
  # {stable ∪ pre-release} — which is exactly the rc channel.
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=10" | tag_from_json)
else
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | tag_from_json)
fi
[ -n "$TAG" ] || die "could not determine the latest $CHANNEL release."

VERSION="${TAG#v}"
FILE="Prateek-Term-${VERSION}-${ARCH}.AppImage"
BASE="https://github.com/$REPO/releases/download/$TAG"

if [ "$(cat "$LIB/VERSION" 2>/dev/null || true)" = "$VERSION" ]; then
  say "Prateek-Term $VERSION is already installed. Nothing to do."
  exit 0
fi

# ── download + verify ───────────────────────────────────────────────────────
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

say "Installing Prateek-Term $VERSION ($ARCH, $CHANNEL channel)..."
curl -fL --progress-bar -o "$TMP/$FILE" "$BASE/$FILE" \
  || die "download failed: $BASE/$FILE"

if curl -fsSL -o "$TMP/SHA256SUMS" "$BASE/SHA256SUMS" 2>/dev/null; then
  if   command -v sha256sum >/dev/null 2>&1; then SUM="sha256sum"
  elif command -v shasum    >/dev/null 2>&1; then SUM="shasum -a 256"
  else die "need sha256sum or shasum to verify the download."
  fi
  # SHA256SUMS carries bare filenames (see the CI step that generates it).
  ( cd "$TMP" && grep " ${FILE}\$" SHA256SUMS | $SUM -c - >/dev/null 2>&1 ) \
    || die "checksum verification FAILED for $FILE — refusing to install."
  say "Checksum verified."
else
  say "warning: SHA256SUMS not published for $TAG — skipping verification."
fi

# ── install ─────────────────────────────────────────────────────────────────
mkdir -p "$LIB" "$BIN" "$APPS" "$ICONS"
install -m 0755 "$TMP/$FILE" "$APPIMAGE"
printf '%s\n' "$VERSION" > "$LIB/VERSION"
printf '%s\n' "$CHANNEL" > "$LIB/CHANNEL"

# Wrapper, because Ubuntu 22.04+ ships without libfuse2 and a bare AppImage
# then fails with a confusing mount error. This is the single most common
# "AppImage doesn't work" report.
cat > "$BIN/prateek-term" <<'WRAPPER'
#!/bin/sh
APPIMG="$HOME/.local/lib/prateek-term/Prateek-Term.AppImage"
if [ -e /dev/fuse ] && { command -v fusermount >/dev/null 2>&1 || command -v fusermount3 >/dev/null 2>&1; }; then
  exec "$APPIMG" "$@"
fi
exec "$APPIMG" --appimage-extract-and-run "$@"
WRAPPER
chmod 0755 "$BIN/prateek-term"

curl -fsSL -o "$ICONS/prateek-term.png" \
  "https://raw.githubusercontent.com/$REPO/$TAG/build/icon.png" 2>/dev/null || true

# Mirrors what the app writes itself (linux-integrations.js) so the launcher
# entry exists before the user ever opens Settings. The app will later rewrite
# this file with the same values, so there is no conflict.
cat > "$APPS/prateek-term.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Prateek-Term
Comment=Terminal emulator and SSH/serial connection manager
Exec=$APPIMAGE %u
Icon=prateek-term
Terminal=false
Categories=Utility;TerminalEmulator;System;
MimeType=x-scheme-handler/prateekterm;inode/directory;
StartupWMClass=prateek-term
EOF
chmod 0644 "$APPS/prateek-term.desktop"

update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true

say ""
say "Prateek-Term $VERSION installed."
say "  Launch:    prateek-term   (or find it in your applications menu)"
say "  Upgrade:   re-run this installer"
say "  Uninstall: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --uninstall"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    say ""
    say "NOTE: $BIN is not on your PATH. Add it with:"
    say "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.profile"
    ;;
esac
