#!/usr/bin/env bash
# Execute one side of a same-runner pair; never changes source test behavior.
set -euo pipefail
: "${CONTROL_DIR:?}" "${SOURCE_DIR:?}" "${HARNESS_DIR:?}" "${PAIR_ORDER:?}" "${SAMPLE_ID:?}"
case "$PAIR_ORDER" in original-first|migrated-first) ;; *) exit 2 ;; esac
[[ "$SAMPLE_ID" =~ ^[1-9][0-9]*$ ]] || exit 2
side="${1:?original or migrated}"
case "$side" in original|migrated) ;; *) exit 2 ;; esac
destination="$CONTROL_DIR/$side"
mkdir -p "$destination"
sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)"

verify_density() {
  local file="$1" expected="$2"
  # Keep physical and override values distinct. Original post_test intentionally
  # removes the override; that cleanup is not a device-geometry regression.
  awk -v expected="$expected" '
    FNR == NR { if ($1 == "Physical" && $2 == "density:") baseline=$3; next }
    $1 == "Physical" && $2 == "density:" { physical=$3 }
    $1 == "Override" && $2 == "density:" { override=$3 }
    END {
      if (!baseline || physical != baseline) exit 1;
      if (expected == "reset") exit (override != "");
      exit ((override ? override : physical) != "320");
    }
  ' "$CONTROL_DIR/device-density.txt" "$file"
}

verify_device() {
  local phase="$1" installed
  adb get-serialno > "$destination/$phase-serial.txt"
  adb shell getprop ro.build.fingerprint > "$destination/$phase-fingerprint.txt"
  adb shell wm size > "$destination/$phase-size.txt"
  adb shell wm density > "$destination/$phase-density.txt"
  for property in serial fingerprint size; do
    cmp "$CONTROL_DIR/device-$property.txt" "$destination/$phase-$property.txt"
  done
  if [ "$side" = original ] && [ "$phase" = after ]; then
    verify_density "$destination/$phase-density.txt" reset
  else
    verify_density "$destination/$phase-density.txt" active
  fi
  installed="$(adb shell pm path com.lynx.explorer | tr -d '\r' | sed -n 's/^package://p')"
  # Split/missing APKs are not comparable to the single verified source APK.
  [[ -n "$installed" && "$installed" != *$'\n'* ]]
  adb pull "$installed" "$destination/$phase-installed.apk"
  python3 "$HARNESS_DIR/testing/e2e_diagnostics/apk-provenance.py" \
    "$CONTROL_DIR/paired.apk" "$destination/$phase-installed.apk" "$destination/$phase-apk.json"
  cmp "$CONTROL_DIR/paired.apk" "$destination/$phase-installed.apk"
}

# Reset only the application state outside timing on each side, on the same
# booted emulator. Both original and migrated retain their normal lifecycles.
adb shell wm density > "$destination/entry-density.txt"
adb shell wm density 320
adb install -r -g "$CONTROL_DIR/paired.apk"
adb shell am force-stop com.lynx.explorer
adb shell pm clear com.lynx.explorer
adb install -r -g "$CONTROL_DIR/paired.apk"
verify_device before
status=0
date -u +%FT%TZ > "$destination/command-start.txt"
if [ "$side" = original ]; then
  cd "$SOURCE_DIR/testing/integration_test/test_script"
  # Fail closed if the source lifecycle changed. The unchanged runner sets 320
  # before case execution, logs actual density and resets it in post_test.
  grep -Fq "self._test.device.shell_command('wm density 320')" lib/test_runner/test_runner.py
  grep -Fq "self._test.log_info(self._test.device.shell_command('wm density'))" lib/test_runner/test_runner.py
  grep -Fq "self._test.device.shell_command('wm density reset')" lib/test_runner/test_runner.py
  unset test_case_name
  for suite in core xelement; do
    set +e
    python3 "$HARNESS_DIR/testing/e2e_diagnostics/original-timing.py" \
      --output "$destination/$suite-timing.json" --platform android \
      --source-sha "$sha" --session-id "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT-$SAMPLE_ID-$suite" \
      --suite "$suite" -- manage.py runtest "android_test.$suite" \
      2>&1 | tee "$destination/$suite.log"
    result=${PIPESTATUS[0]}
    set -e
    printf '%s\n' "$result" > "$destination/$suite-exit.txt"
    if [ "$result" -ne 0 ]; then status=1; fi
    # This is the unchanged pre_test's device query, not an extra probe inside
    # the case timer. Missing effective-density evidence invalidates the pair.
    if ! grep -Eq '(Override|Physical) density:[[:space:]]+320([[:space:]]|$)' "$destination/$suite.log"; then
      echo "::error::Missing original $suite runtime density evidence"
      status=1
    fi
    adb shell wm density > "$destination/$suite-after-density.txt"
    if ! verify_density "$destination/$suite-after-density.txt" reset; then status=1; fi
  done
  if [ -d screenshots ]; then cp -R screenshots "$destination/"; fi
else
  cd "$SOURCE_DIR/testing/ai_e2e"
  adb forward --no-rebind tcp:18901 tcp:8901
  set +e
  node scripts/run-ci.mjs --project android-explorer 2>&1 | tee "$destination/migrated.log"
  status=${PIPESTATUS[0]}
  set -e
  adb forward --remove tcp:18901
fi
date -u +%FT%TZ > "$destination/command-end.txt"
printf '%s\n' "$status" > "$destination/exit.txt"
verify_device after
git -C "$SOURCE_DIR" diff --exit-code -- testing/integration_test/test_script testing/integration_test/demo_pages
exit "$status"
