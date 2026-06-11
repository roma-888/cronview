#!/usr/bin/env bash
# cronview installer — downloads the latest release binary for this platform.
#   curl -fsSL https://raw.githubusercontent.com/roma-888/cronview/main/scripts/install.sh | bash
set -euo pipefail

REPO="roma-888/cronview"

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "cronview: unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) echo "cronview: unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

asset="cronview-${os}-${arch}"
dir="${CRONVIEW_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$dir"

# curl's own progress bar when a human is watching; silent in CI/logs.
progress="-s"
if [ -t 2 ]; then progress="-#"; fi

base="https://github.com/${REPO}/releases/latest/download"
tmp="${dir}/.cronview.download"

echo "downloading ${asset} (latest release)…"
curl -fSL "$progress" "${base}/${asset}" -o "$tmp"

# Verify against the release's published checksums when available.
if sums=$(curl -fsSL "${base}/SHA256SUMS" 2>/dev/null); then
  expected=$(printf '%s\n' "$sums" | awk -v a="$asset" '$2 == a {print $1}')
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$tmp" | awk '{print $1}')
  else
    actual=$(shasum -a 256 "$tmp" | awk '{print $1}')
  fi
  if [ -z "$expected" ]; then
    echo "note: ${asset} not in SHA256SUMS — skipping checksum verification"
  elif [ "$expected" != "$actual" ]; then
    rm -f "$tmp"
    echo "cronview: checksum mismatch for ${asset}" >&2
    echo "  expected ${expected}" >&2
    echo "  got      ${actual}" >&2
    exit 1
  else
    echo "✓ checksum verified"
  fi
else
  echo "note: this release has no SHA256SUMS — skipping checksum verification"
fi

mv "$tmp" "${dir}/cronview"
chmod +x "${dir}/cronview"

echo "✓ installed ${dir}/cronview"
case ":$PATH:" in
  *":${dir}:"*) ;;
  *) echo "note: ${dir} is not on your PATH — add it, e.g.: export PATH=\"${dir}:\$PATH\"" ;;
esac
