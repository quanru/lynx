#!/usr/bin/env bash
# Build and keep WebDriverAgent running on macOS for a direct @midscene/ios connection.
# Simulator builds need no signing. Match Lynx CI with WDA v16.9.3 (commit 54fc1a2)
# and `-configuration Release`.
#
# Outputs for later steps:
#   SIMULATOR_UDID   Selected iPhone simulator UDID
#   WDA_PORT=8100    Port used by the WDA process
#
# In non-interactive local runs WDA remains in the background after this script
# exits. CI cleans it up with the step's process group.
set -euo pipefail

WDA_VERSION="${WDA_VERSION:-v16.9.3}"
WDA_COMMIT="${WDA_COMMIT:-54fc1a254632911fdc48e2b6fbcca2481d27d223}"
WDA_PORT="${WDA_PORT:-8100}"
WORKDIR="${WDA_WORKDIR:-$PWD/.wda-build}"

mkdir -p "$WORKDIR"
cd "$WORKDIR"

# 1) Read the current Xcode simulator SDK version from the runner image.
SDK_VERSION="$(xcodebuild -showsdks \
  | grep -Eo -m 1 'iphonesimulator([0-9]{1,}\.)+[0-9]{1,}' \
  | sed 's/^iphonesimulator//')"
echo "iphonesimulator SDK: $SDK_VERSION"

# 2) Select the newest-named available iPhone simulator for that SDK.
SIMULATOR_UDID="$(xcrun simctl list devices "iOS ${SDK_VERSION}" \
  | grep -Eo 'iPhone [0-9]+ \(([0-9A-F-]{36})\)' \
  | sort -uV | tail -1 | grep -Eo '[0-9A-F-]{36}')"
if [ -z "${SIMULATOR_UDID:-}" ]; then
  echo "::error:: no available iPhone simulator for iOS ${SDK_VERSION}" >&2
  exit 1
fi
echo "using simulator UDID: $SIMULATOR_UDID"

# 3) Fetch and verify WDA.
if [ ! -d WebDriverAgent/.git ]; then
  git clone --depth 1 --branch "$WDA_VERSION" https://github.com/appium/WebDriverAgent.git
fi
ACTUAL_COMMIT="$(git -C WebDriverAgent rev-parse HEAD)"
if [ "$ACTUAL_COMMIT" != "$WDA_COMMIT" ]; then
  echo "::error:: WDA commit mismatch: expected $WDA_COMMIT, got $ACTUAL_COMMIT" >&2
  exit 1
fi

# 4) Build for testing in Release mode. test-without-building cannot find the
# Debug artifact path in this setup.
xcodebuild build-for-testing \
  -project ./WebDriverAgent/WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -configuration Release \
  -sdk "iphonesimulator${SDK_VERSION}" \
  -derivedDataPath ./WebDriverAgent/DerivedData \
  -destination "platform=iOS Simulator,id=${SIMULATOR_UDID}" \
  SYMROOT="$PWD/Build/Products"

# 5) Boot the simulator and install WDA Runner.
xcrun simctl boot "$SIMULATOR_UDID" || true
xcrun simctl bootstatus "$SIMULATOR_UDID" -b
xcrun simctl install "$SIMULATOR_UDID" \
  "$PWD/Build/Products/Release-iphonesimulator/WebDriverAgentRunner-Runner.app"

# 6) Keep WDA running in the background with test-without-building.
xcodebuild test-without-building \
  -project ./WebDriverAgent/WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -configuration Release \
  -sdk "iphonesimulator${SDK_VERSION}" \
  -destination "platform=iOS Simulator,id=${SIMULATOR_UDID}" \
  -derivedDataPath ./WebDriverAgent/DerivedData \
  SYMROOT="$PWD/Build/Products" \
  > wda.log 2>&1 &
WDA_PID=$!
echo "WDA pid=$WDA_PID"

# 7) Wait up to three minutes for WDA /status.
DEADLINE=$(( $(date +%s) + 180 ))
until curl -fsS "http://localhost:${WDA_PORT}/status" >/dev/null 2>&1; do
  if ! kill -0 "$WDA_PID" 2>/dev/null; then
    echo "::error:: WDA process exited before becoming ready" >&2
    tail -100 wda.log >&2 || true
    exit 1
  fi
  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "::error:: timed out waiting for WDA on port ${WDA_PORT}" >&2
    tail -100 wda.log >&2 || true
    exit 1
  fi
  echo "waiting for WDA..."
  sleep 5
done
echo "WDA ready at http://localhost:${WDA_PORT}"

# Export values for later steps in the same GitHub Actions job.
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "SIMULATOR_UDID=$SIMULATOR_UDID"
    echo "WDA_PORT=$WDA_PORT"
  } >> "$GITHUB_ENV"
fi
