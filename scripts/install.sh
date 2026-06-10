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

echo "downloading ${asset} (latest release)…"
curl -fSL "$progress" "https://github.com/${REPO}/releases/latest/download/${asset}" -o "${dir}/cronview"
chmod +x "${dir}/cronview"

echo "✓ installed ${dir}/cronview"
case ":$PATH:" in
  *":${dir}:"*) ;;
  *) echo "note: ${dir} is not on your PATH — add it, e.g.: export PATH=\"${dir}:\$PATH\"" ;;
esac
