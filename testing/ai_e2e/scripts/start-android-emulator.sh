#!/usr/bin/env bash
# 在 Linux CI（GitHub hosted ubuntu，具备 /dev/kvm）上准备并启动一台 headless
# Android 模拟器。Lynx Explorer Release APK 含 x86_64 ABI，可直接安装。
#
# 环境变量（均有默认值）：
#   ANDROID_API=30                 系统镜像 API level
#   ANDROID_ABI=x86_64             ABI（hosted x86_64 runner 配 KVM）
#   ANDROID_VARIANT=google_apis    镜像变体（不要用 google_apis_playstore）
#   AVD_NAME=lynx_midscene
#   SDK_INSTALL_TIMEOUT=900        SDK / 系统镜像安装总超时（秒）
#   BOOT_TIMEOUT=300               模拟器启动到 boot_completed 超时（秒）
#   ANDROID_HOME / ANDROID_SDK_ROOT 由 runner 预置
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

# 接受 license 并安装平台工具 / 模拟器 / 系统镜像（runner 通常已预装前两项）。
# 全程包 timeout：sdkmanager 偶发卡在网络握手，不能让 step 无限挂住。
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

# headless 后台启动。
export QT_QPA_PLATFORM=offscreen
nohup "$SDK_ROOT/emulator/emulator" \
  -avd "$AVD_NAME" \
  -no-window -no-snapshot -no-snapshot-save -no-audio -no-boot-anim \
  -gpu swiftshader_indirect \
  -netdelay none -netspeed full \
  > emulator.log 2>&1 &
EMULATOR_PID=$!
echo "emulator pid=$EMULATOR_PID"

wait_pid_deadline=$(( $(date +%s) + BOOT_TIMEOUT ))

# 替代裸 `adb wait-for-device`（它在 emulator 进程早退时会永久死等）：
# 轮询设备状态，同时确认 emulator 进程仍存活。
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

# 等 sys.boot_completed（同样带进程存活检测）。
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
