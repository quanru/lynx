# Original video control

This is an approved, independent diagnostic, not a migrated Midscene test.
It runs the unchanged Android VideoBoundary through the original
lynx-e2e-appium 0.0.15 / Appium 2.11.2 / Espresso 4.0.0 stack. The existing
`test_case_name` filter selects one complete source case. No callback, action,
assertion, wait, fixture, baseline or original runner is patched.

Setup retains the original tools/common-deps requirements and pins pip 25.0.1:
the unchanged legacy reporter imports `pip._internal.utils.compat.stdlib_pkgs`,
which newer pip removes. Reporter/module/filter loading is checked before
starting an emulator. This compatibility setup is not a source-case pass.

The diagnostic reuses the exact Android source artifact from a successfully
completed build job in a pinned Midscene run attempt, checks its manifest
checksum and capabilities, and checks
out the build's precise source revision. The producer head must be that revision
or its ancestor (GitHub's PR test merge). It reuses the Midscene headless emulator
script with API 30, google_apis/x86_64, pixel_6 and density 320.

Espresso requires the application and instrumentation signatures to match.
The unchanged original CI also signs its APK with Appium's debug certificate.
Consequently the diagnostic must not claim its signed APK is byte-identical to
the APK previously installed by Midscene. It retains both SHA-256 values, verifies
every non-signature ZIP entry is unchanged, then pulls and verifies the APK
actually installed after the original run. Changed payload invalidates the
comparison. Instrumentation, signing and separate hosted runner instances remain
explicit environment differences; a failure is evidence, not automatic proof
of a product defect.

Workflow: `.github/workflows/midscene-original-control.yml`. A trusted fork PR
changing this diagnostic uses repaired-source producer run 38275815434 by default.
The fork-only `midscene/original-video-control` branch can run diagnostic fixes
without cancelling a useful main-PR Midscene run. It opens no additional PR.
Manual dispatch can explicitly select another same-repository producer run with
a successful Android source build, including the historical failing baseline
38146455265. Later model-backed jobs need not finish before the control starts.
Missing, failed, ambiguous or incomplete build evidence is rejected.
Its evidence artifact and Summary are separate; no model credentials or Midscene
passing-case counts are involved. Setup failures and an unexecuted original
case cannot count as a successful control.

The unchanged original VideoBoundary passes in
[38279593401](https://github.com/quanru/lynx/actions/runs/38279593401) against
producer 38275815434's `907fe44` APK. The original case body executes, its source
checksums remain unchanged, and installed APK payload identity is verified.
This validates the approved Android seek fix against the original case, not
the separate Midscene suite.

Model-free validation:

```sh
python3 testing/e2e_diagnostics/apk_provenance_test.py
node --test testing/ai_e2e/scripts/original-video-producer.test.mjs
actionlint .github/workflows/midscene-original-control.yml
```
