# Original video control

This is an approved, independent diagnostic, not a migrated Midscene test.
It runs the unchanged Android VideoBoundary through the original
lynx-e2e-appium 0.0.15 / Appium 2.11.2 / Espresso 4.0.0 stack. The existing
`test_case_name` filter selects one complete source case. No callback, action,
assertion, wait, fixture, baseline or original runner is patched.

The diagnostic reuses the exact Android source artifact from a completed
Midscene producer run, checks its manifest checksum and capabilities, and checks
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
changing this diagnostic reproduces producer run 38146455265 by default. Manual
dispatch can explicitly select another completed same-repository producer run.
Its evidence artifact and Summary are separate; no model credentials or Midscene
passing-case counts are involved. Setup failures and an unexecuted original
case cannot count as a successful control.

Model-free validation:

```sh
python3 testing/e2e_diagnostics/apk_provenance_test.py
actionlint .github/workflows/midscene-original-control.yml
```
