# Paired iOS timing diagnostic

Workflow: `.github/workflows/midscene-ios-timing-comparison.yml`. The paired
device/model job runs only on manual dispatch in `quanru/lynx`. Pushes to the
isolated `midscene/timing-comparison` branch register the workflow and run only
model-free contracts. They do not start a simulator or invoke a model.

Inputs select a producer run (default `39193594158`), a single sample label, and
`original-first` or `migrated-first`. Run multiple independent samples in both
orders; one pair is not a stable performance estimate. The comparison does not
replace native migration acceptance or publish historical timing ratios.

## Shared inputs and preserved differences

Both sides use the exact successful producer-attempt iOS artifact and its actual
`build.json` source revision, including GitHub PR merge revisions. The producer
workflow/job identity, ancestry, build checksum, baseline toolchain, and bundle
contents are checked. Both execute on one hosted `macos-15` job and the same
selected iPhone 17 / iOS 26.2 simulator using Xcode 26.3. No other booted
simulator is accepted. The original framework's own resource manager must also
discover exactly that UDID before every original suite.

Both sides start by uninstalling/reinstalling only `com.lynx.LynxExplorer` from
the same verified app directory, providing a clean application data container.
Every bundle file and symlink is compared against the source payload before
and after each side. Neither case implementation, fixtures, waits, baselines,
assertions, nor retries are edited. Source files must remain unchanged.

The original suites execute 17 enabled source cases (`core`, `xelement`,
`sparkling`) with the original shared-driver lifecycle. The migrated suite
executes its 20 cases, including 3 additive smoke cases that have no original
equivalent. Per-case agent lifecycle and AI overhead remain real migration
costs. `finalize-timing.mjs` records the separate timer boundaries and checks the
complete inventory; it does not approve speed ratios merely because execution
passes.

## WDA ownership

The existing source `start-wda.sh` builds WDA v16.9.3 at
`54fc1a254632911fdc48e2b6fbcca2481d27d223` with the original simulator baseline.
Appium 2.11.2 and XCUITest driver 7.24.18 receive the externally owned server via
server default capability `appium:webDriverAgentUrl=http://127.0.0.1:8100`, with
`appium:useNewWDA=false`. The original source `app_spec` is not edited. The
original device resource supplies its own UDID; the default does not override
it, hence the independent original-resource selection checks.

The inspected pinned `appium-xcuitest-driver@7.24.18/lib/driver.js` treats this
capability as not requiring an Xcode build and does not clean up unrelated WDA
processes. Its pinned `appium-webdriveragent@8.9.1/lib/webdriveragent.js` uses
the supplied server in `launch()` without building/installing bundled WDA and
explicitly leaves externally owned XCTest running in `quit()`. The wrapper's
npm version is distinct from the actual WDA server revision. Isolated npm
overrides pin this wrapper to 8.9.1 and `appium-ios-simulator` to 6.2.6; resolved
versions are checked before tests. No default/latest WDA fallback is allowed.

This externally managed WDA setup controls deployment differences for the
paired experiment. It is not a claim that historical upstream Appium startup
cost equals this setup cost. Emulator/WDA/Appium/model compatibility setup is
outside per-case timings and stays visible as separate CI steps. Protocol
compatibility still requires successful remote execution, not static proof.

## Evidence and failures

The artifact contains producer/build/source identities, source and installed app
inventory hashes, runner hardware/image metadata, exact simulator/toolchain
identity, original case and body timings, original/migrated process durations,
reports/screenshots, and Appium/WDA logs. Source app binaries are not duplicated
in this diagnostic artifact; the original producer artifact remains referenced.
Credentials are supplied only through model-step environment variables, never
written to configuration, timing records, or arguments.

Failed first sides do not suppress the second side. Both sides' failures remain
failures; evidence is uploaded before final failure gates. Setup failure,
missing case timing, wrong app/device identity, interrupted cases, or incomplete
inventory invalidate the comparison. Do not turn such samples into zero-time
passes. Original observation details are in `ORIGINAL-TIMING.md`.

Model-free checks:

```sh
node --test testing/e2e_diagnostics/ios-timing.test.mjs
python3 -m unittest discover -s testing/e2e_diagnostics -p original_timing_test.py
actionlint .github/workflows/midscene-ios-timing-comparison.yml
```
