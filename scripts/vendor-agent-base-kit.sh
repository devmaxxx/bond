#!/bin/sh
# bond has no package.json, so its hooks import a vendored copy of
# agent-base-kit's bundled dist instead of node_modules. This rewrites that copy
# from the published tarball, checked against the registry's integrity, so the
# file is reproducible from a version number. bond-bonliva reaches it through a
# symlink, which the plugin cache resolves into a real file on install.
#
#   scripts/vendor-agent-base-kit.sh 0.1.0
set -eu

version="${1:?usage: scripts/vendor-agent-base-kit.sh <version>}"
root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/hooks/vendor/agent-base-kit.mjs"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

expected=$(npm view "agent-base-kit@$version" dist.integrity)
(cd "$tmp" && npm pack "agent-base-kit@$version" --silent >/dev/null)
tarball="$tmp/agent-base-kit-$version.tgz"
actual="sha512-$(openssl dgst -sha512 -binary "$tarball" | base64 | tr -d '\n')"
if [ "$actual" != "$expected" ]; then
  echo "integrity mismatch for agent-base-kit@$version: got $actual, registry says $expected" >&2
  exit 1
fi

mkdir "$tmp/x"
tar -xzf "$tarball" -C "$tmp/x"
{
  printf '// agent-base-kit %s, dist/index.mjs from npm (%s).\n' "$version" "$expected"
  printf '// Vendored, do not edit: refresh with scripts/vendor-agent-base-kit.sh <version>.\n'
  cat "$tmp/x/package/dist/index.mjs"
} >"$out"
echo "wrote $out"
