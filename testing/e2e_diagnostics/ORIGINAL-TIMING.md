# Original native case timing observer

This diagnostic observes the original source runner without editing its files,
case inputs, assertions, sleeps, retries, or return/exception behavior. It does
not establish migration acceptance or a controlled performance result alone.

The inspected `lynx-e2e-appium==0.0.15` wheel uses `BasicTestRunner` in
`lynx_e2e/_impl/manage/case_runner.py`: each test routine runs in a daemon
`threading.Thread` in the same Python process. Hooks installed before
`runpy.run_path('manage.py', run_name='__main__')` therefore observe the actual
worker. A different dependency version is rejected. No site customization or
modified source checkout is required. A killed process cannot finalize this
file; missing output is missing evidence, never zero-duration success.

## Invocation

From the verified source checkout's `testing/integration_test/test_script`:

```sh
export platform=android
unset test_case_name
python3 /path/to/harness/testing/e2e_diagnostics/original-timing.py \
  --output /absolute/unused/path/android-core-pair-1.json \
  --platform android --source-sha "$VERIFIED_SOURCE_SHA" \
  --session-id pair-1-before --suite core \
  -- manage.py runtest android_test.core
```

Run Android `core` and `xelement`, or iOS `core`, `xelement`, and `sparkling`.
Each suite/repeat needs a unique output path. The caller must verify the source
SHA, artifact provenance, simulator identity, and full expected inventory; these
identity arguments are labels, not independent proof. Cases are selected by the
unchanged original `CaseSet`; disabled or wrong-platform cases remain excluded.
Extra framework retry flags and case filters are rejected, not silently changed.

## JSON schema (version 1)

- `platform`, `sourceSha`, `sessionId`, `suite`: declared evidence identity.
- `clock`: `monotonic_ns`; durations are milliseconds, not wall-clock timestamps.
- `durationMs`: observer initialization through management completion, including
  Python imports, framework setup, cases, reporting, and teardown. This is not a
  test-body metric and does not include external Appium/emulator/build setup.
- `processOutcome`: `success`, `failure`, or `interrupted`. A successful process
  exit alone is insufficient to prove all collected cases passed.
- `collectedCases`: unique sorted `category/name` identities actually collected.
- `attempts`: ordered case invocations, each with `caseName`, one-based `attempt`,
  `status` (`success`, `failure`, `interrupted`), `interrupted`, `durationMs`, and
  `bodyCalls`. Optional `errorType` is a class name, never an exception message.
- `bodyCalls`: one-based `call`, `status`, `durationMs`, optional `errorType`.
  Multiple calls within an attempt expose original CDP/socket recovery reruns.
- `observerErrors`: diagnostic class names. Any entry invalidates timing evidence;
  observer errors do not turn an original passing or failing case into another
  result. The publishing/comparison gate must reject such evidence.

Primary attempt timing starts immediately before the original
`ResultMixin.add_test_result` call and ends after the corresponding original
`update_test_result` returns. It includes optional restart, the original
five-second pre-case wait, page opening, two-second readiness wait, case body,
plugins, and recovery. Body timing wraps the actual case instance's `run`
method, including non-custom types. It excludes surrounding page setup. Attempt
numbers are observer counters, **not** `exec_list` lengths: the original result
list appends failures but not successes. Framework-level retries constructing a
new test object retain increasing attempt numbers for the same case identity.

If the original restart fails before entering its case try block, or a daemon
worker remains active at management exit, the open attempt/body is recorded as
interrupted. No timeout or retry is added. Measurement hooks have small Python
overhead, included in primary timing; JSON is written only after finalization to
avoid per-action disk I/O. No credentials, device arguments, environment dumps,
or exception messages are collected.

## Comparison limitations and required gates

Do not divide this primary duration by a Midscene duration until its boundaries
are inspected and stated. Original core/xelement share the driver session;
Midscene owns a fresh device/agent lifecycle per case. Include that real cost in
the end-to-end metric and show lifecycle/body subtotals separately. Do not erase
it to make numbers comparable. Setup/teardown outside case timers is reported
separately. Report first attempts and all-attempt totals independently.

Require matching expected inventories, source/artifact/device identity, no
observer errors, valid terminal attempts, and unchanged source checksums. Keep
failed/interrupted samples; do not call them successful speed comparisons.
Repeat paired before/after executions on the same runner/simulator, alternate
order, retain all samples, and report the distribution. Same runner image across
different machines is weaker than a same-device paired experiment.

## Model-free tests

```sh
python3 -m unittest discover -s testing/e2e_diagnostics -p original_timing_test.py
```

Tests exercise the actual repository `ResultMixin`, original failure-only result
semantics, worker-thread hooks, non-custom bodies, internal recovery calls,
framework retry identities, interrupted workers, and preserved return/errors.
