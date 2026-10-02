#!/usr/bin/env bash
# Prepare and start a headless Android emulator on KVM-enabled Linux CI.
# The Lynx Explorer release APK includes an x86_64 ABI and installs directly.
#
# Environment variables (all have defaults):
#   ANDROID_API=30                 System image API level
#   ANDROID_ABI=x86_64             ABI for a hosted x86_64 runner with KVM
#   ANDROID_VARIANT=google_apis    Image variant; do not use google_apis_playstore
#   AVD_NAME=lynx_midscene
#   SDK_INSTALL_TIMEOUT=900        SDK and system-image installation timeout in seconds
#   BOOT_TIMEOUT=300               Timeout for boot_completed in seconds
#   ANDROID_HOME / ANDROID_SDK_ROOT are provided by the runner
set -euo pipefail

ANDROID_API="${ANDROID_API:-30}"
ANDROID_ABI="${ANDROID_ABI:-x86_64}"
ANDROID_VARIANT="${ANDROID_VARIANT:-google_apis}"
AVD_NAME="${AVD_NAME:-lynx_midscene}"
SDK_INSTALL_TIMEOUT="${SDK_INSTALL_TIMEOUT:-900}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-300}"

: "${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
SYSTEM_IMAGE="system-images;android-${ANDROID_API};${ANDROID_VARIANT};${ANDROID_ABI}"
ADB="$SDK_ROOT/platform-tools/adb"
SDKM="$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"

fail() { echo "::error:: $*" >&2; exit 1; }

if [ ! -e /dev/kvm ]; then
  fail "/dev/kvm not available; run on a KVM-enabled Linux runner."
fi

# On GitHub-hosted ubuntu images /dev/kvm exists but is owned by root:kvm
# with the runner user NOT in the kvm group -> "x86_64 emulation currently
# requires hardware acceleration". The runner has passwordless sudo; loosen
# the device node (the VM itself is already trusted multi-tenant hardware).
if [ ! -r /dev/kvm ] || [ ! -w /dev/kvm ]; then
  echo "/dev/kvm not accessible by $(id -un); relaxing permissions"
  if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
    sudo chmod 666 /dev/kvm
  else
    fail "/dev/kvm exists but is not accessible and passwordless sudo is unavailable"
  fi
fi
[ -r /dev/kvm ] && [ -w /dev/kvm ] || fail "/dev/kvm still not accessible after chmod"
echo "/dev/kvm accessible: $(ls -l /dev/kvm)"

# Accept licenses and install the platform tools, emulator, and system image.
# The runner usually includes the first two. Bound sdkmanager because network
# handshakes can otherwise stall the step indefinitely.
yes | timeout 120 "$SDKM" --licenses >/dev/null || true
timeout "$SDK_INSTALL_TIMEOUT" "$SDKM" \
  "platform-tools" "emulator" "$SYSTEM_IMAGE" \
  || fail "sdkmanager install timed out or failed after ${SDK_INSTALL_TIMEOUT}s"

# Pin one AVD location for both avdmanager (write) and emulator (read);
# otherwise they can disagree on where $HOME/.android/avd lives.
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
mkdir -p "$ANDROID_AVD_HOME"
echo "ANDROID_AVD_HOME=$ANDROID_AVD_HOME"

if ! printf 'no\n' | timeout 120 "$SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd \
  --force --name "$AVD_NAME" --package "$SYSTEM_IMAGE" --device "pixel_6"; then
  echo "::error:: avdmanager create avd failed" >&2
  exit 1
fi

# avdmanager has, on some cmdline-tools versions, exited 0 without actually
# creating the AVD; verify the emulator can see it before launching.
if ! "$SDK_ROOT/emulator/emulator" -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; then
  echo "::error:: AVD '$AVD_NAME' is not visible to the emulator after creation" >&2
  echo "ANDROID_AVD_HOME=$ANDROID_AVD_HOME" >&2
  ls -la "$ANDROID_AVD_HOME" >&2 || true
  echo "emulator -list-avds:" >&2
  "$SDK_ROOT/emulator/emulator" -list-avds >&2 || true
  exit 1
fi
echo "AVD '$AVD_NAME' ready; available AVDs:"
"$SDK_ROOT/emulator/emulator" -list-avds

# Start the emulator headlessly in the background.
export QT_QPA_PLATFORM=offscreen
nohup "$SDK_ROOT/emulator/emulator" \
  -avd "$AVD_NAME" \
  -no-window -no-snapshot -no-snapshot-save -no-audio -no-boot-anim \
  -no-metrics \
  -gpu swiftshader_indirect \
  -netdelay none -netspeed full \
  > emulator.log 2>&1 &
EMULATOR_PID=$!
echo "emulator pid=$EMULATOR_PID"

wait_pid_deadline=$(( $(date +%s) + BOOT_TIMEOUT ))

# Poll device state while verifying that the emulator process is still alive.
# A bare `adb wait-for-device` hangs forever when the emulator exits early.
while true; do
  state="$("$ADB" get-state 2>/dev/null | tr -d '\r' || true)"
  [ "$state" = "device" ] && break
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo "::error:: emulator process exited before device came online" >&2
    cat emulator.log >&2 || true
    exit 1
  fi
  if [ "$(date +%s)" -gt "$wait_pid_deadline" ]; then
    echo "::error:: emulator device never reached 'device' state within ${BOOT_TIMEOUT}s" >&2
    cat emulator.log >&2 || true
    exit 1
  fi
  echo "waiting for emulator (adb state: '${state:-none}')..."
  sleep 5
done

# Wait for sys.boot_completed while continuing to check process liveness.
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    fail "emulator process exited during boot"
  fi
  if [ "$(date +%s)" -gt "$wait_pid_deadline" ]; then
    echo "::error:: emulator boot timed out after ${BOOT_TIMEOUT}s" >&2
    cat emulator.log >&2 || true
    exit 1
  fi
  echo "waiting for emulator boot..."
  sleep 5
done
echo "emulator boot completed"
"$ADB" shell input keyevent 82 >/dev/null 2>&1 || true
"$ADB" devices
