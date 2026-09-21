#!/usr/bin/env bash
# 在 Linux CI（GitHub hosted ubuntu，具备 /dev/kvm）上准备并启动一台 headless
# Android 模拟器。Lynx Explorer Release APK 含 x86_64 ABI，可直接安装。
#
# 环境变量（均有默认值）：
#   ANDROID_API=30                 系统镜像 API level
#   ANDROID_ABI=x86_64             ABI（hosted x86_64 runner 配 KVM）
#   ANDROID_VARIANT=google_apis    镜像变体（不要用 google_apis_playstore）
#   AVD_NAME=lynx_midscene
#   ANDROID_HOME / ANDROID_SDK_ROOT 由 runner 预置
set -euo pipefail

ANDROID_API="${ANDROID_API:-30}"
ANDROID_ABI="${ANDROID_ABI:-x86_64}"
ANDROID_VARIANT="${ANDROID_VARIANT:-google_apis}"
AVD_NAME="${AVD_NAME:-lynx_midscene}"

: "${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
SYSTEM_IMAGE="system-images;android-${ANDROID_API};${ANDROID_VARIANT};${ANDROID_ABI}"

if [ ! -e /dev/kvm ]; then
  echo "::error:: /dev/kvm not available; run on a KVM-enabled Linux runner." >&2
  exit 1
fi

# 接受 license 并安装平台工具 / 模拟器 / 系统镜像（runner 通常已预装前两项）。
yes | "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true
"$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "emulator" "$SYSTEM_IMAGE"

echo "no" | "$SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd \
  --force --name "$AVD_NAME" --package "$SYSTEM_IMAGE" --device "pixel_6"

# headless 后台启动。
export QT_QPA_PLATFORM=offscreen
nohup "$SDK_ROOT/emulator/emulator" \
  -avd "$AVD_NAME" \
  -no-window -no-snapshot -no-audio -no-boot-anim \
  -gpu swiftshader_indirect \
  > emulator.log 2>&1 &
EMULATOR_PID=$!
echo "emulator pid=$EMULATOR_PID"

ADB="$SDK_ROOT/platform-tools/adb"
"$ADB" wait-for-device

# 等 sys.boot_completed（最长 5 分钟）。
DEADLINE=$(( $(date +%s) + 300 ))
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "::error:: emulator boot timed out" >&2
    cat emulator.log >&2 || true
    exit 1
  fi
  echo "waiting for emulator boot..."
  sleep 5
done
"$ADB" shell input keyevent 82 >/dev/null 2>&1 || true
"$ADB" devices
