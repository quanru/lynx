#!/usr/bin/env bash
set -euo pipefail

platform="${1:?Usage: build-explorer.sh android|ios OUTPUT_DIRECTORY}"
output="${2:?Missing output directory}"
case "$platform" in android|ios) ;; *) echo "Unsupported platform: $platform" >&2; exit 2 ;; esac
mkdir -p "$output"
output="$(cd "$output" && pwd)"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
set +u
source tools/envsetup.sh
set -u

if [ "$platform" = android ]; then
  cd explorer/android
  ./gradlew :LynxExplorer:assembleWithSparklingNoasanDebug \
    -PIntegrationTest -PabiList=x86_64 --no-daemon --max-workers=2
  apk=lynx_explorer/build/outputs/apk/withSparklingNoasan/debug/LynxExplorer-withSparkling-noasan-debug.apk
  test -f "$apk"
  cp "$apk" "$output/LynxExplorer.apk"
else
  python3 explorer/scripts/sync_sparkling_source.py \
    --manifest "$root/explorer/sparkling-source.json" \
    --source-root "$root/explorer/generated/sparkling-source"
  export PATH="$root/buildtools/sparkling/node/bin:$root/buildtools/sparkling/corepack/pnpm:$PATH"
  pnpm --dir explorer/generated/sparkling-source install --frozen-lockfile
  pnpm --dir explorer/generated/sparkling-source --filter sparkling-playground build
  cd explorer/darwin/ios/lynx_explorer
  bash bundle_install.sh --integration-test --sparkling-mode enable_sparkling
  xcodebuild -workspace LynxExplorer.xcworkspace -scheme LynxExplorer \
    -configuration Debug -sdk iphonesimulator -arch "$(uname -m)" \
    -derivedDataPath "$output/DerivedData" \
    CODE_SIGNING_ALLOWED=NO -jobs 3 build
  app="$output/DerivedData/Build/Products/Debug-iphonesimulator/LynxExplorer.app"
  test -d "$app"
  tar -czf "$output/LynxExplorer.app.tar.gz" -C "$(dirname "$app")" LynxExplorer.app
fi

cd "$root"
node - "$platform" "$output" <<'JS'
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const [platform, directory] = process.argv.slice(2);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (process.env.GITHUB_SHA && sha !== process.env.GITHUB_SHA) throw new Error('Build checkout does not match this workflow revision.');
const file = platform === 'android' ? 'LynxExplorer.apk' : 'LynxExplorer.app.tar.gz';
writeFileSync(join(directory, 'build.json'), JSON.stringify({
  sha, platform, file, mode: 'source', sparkling: true, integrationPages: true,
  sha256: createHash('sha256').update(readFileSync(join(directory, file))).digest('hex'),
}, null, 2));
JS
