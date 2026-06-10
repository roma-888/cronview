#!/usr/bin/env bash
# Regenerate the Homebrew formula for a release tag and push it to the tap.
# Run after a release's binaries are up:  scripts/update-tap.sh v0.6.0
set -euo pipefail

REPO="roma-888/cronview"
TAP="roma-888/homebrew-tap"

tag="${1:?usage: update-tap.sh <tag, e.g. v0.6.0>}"
version="${tag#v}"

sha() {
  gh api "repos/${REPO}/releases/tags/${tag}" \
    --jq ".assets[] | select(.name == \"$1\") | .digest" | sed 's/^sha256://'
}

darwin_arm=$(sha cronview-darwin-arm64)
darwin_x64=$(sha cronview-darwin-x64)
linux_arm=$(sha cronview-linux-arm64)
linux_x64=$(sha cronview-linux-x64)
for v in "$darwin_arm" "$darwin_x64" "$linux_arm" "$linux_x64"; do
  [ -n "$v" ] || { echo "update-tap: missing asset digest for ${tag} — are all binaries uploaded?" >&2; exit 1; }
done

base="https://github.com/${REPO}/releases/download/${tag}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
gh repo clone "$TAP" "$work/tap" -- -q

cat > "$work/tap/Formula/cronview.rb" <<EOF
class Cronview < Formula
  desc "Terminal calendar viewer for your cron jobs"
  homepage "https://github.com/${REPO}"
  version "${version}"
  license "MIT"

  on_macos do
    on_arm do
      url "${base}/cronview-darwin-arm64"
      sha256 "${darwin_arm}"
    end
    on_intel do
      url "${base}/cronview-darwin-x64"
      sha256 "${darwin_x64}"
    end
  end

  on_linux do
    on_arm do
      url "${base}/cronview-linux-arm64"
      sha256 "${linux_arm}"
    end
    on_intel do
      url "${base}/cronview-linux-x64"
      sha256 "${linux_x64}"
    end
  end

  def install
    bin.install Dir["cronview-*"].first => "cronview"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cronview --version")
  end
end
EOF

cd "$work/tap"
if git diff --quiet; then
  echo "update-tap: formula already at ${version}, nothing to do"
  exit 0
fi
git commit -aqm "cronview ${version}"
git push -q
echo "✓ tap updated: brew install ${TAP%%/homebrew-*}/tap/cronview → ${version}"
