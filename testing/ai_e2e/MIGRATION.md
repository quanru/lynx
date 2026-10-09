# Native integration migration scope

The scope includes all 18 Python case modules under
`testing/integration_test/test_script/case_sets/`: seven core, seven Sparkling,
and four XElement video cases. Helper/runner modules are not cases. Sparkling
currently runs on iOS only. Disabled cases remain disabled unless their
original failure is fixed and validated separately.

The three shared Explorer YAML cases are navigation/visual smoke coverage,
not 18 equivalent migrations. In particular, the Image smoke does not replace
the original pixel baseline.

| Original module | Verification that must survive migration | Status |
| --- | --- | --- |
| core/Event | Exact event counts and final inline style | Pending |
| core/Image | Cropped LynxView pixel baseline | Pending; additive Image navigation smoke exists |
| core/ListBase | Pixel baseline; original case is disabled | Disabled, not passed |
| core/LayoutLinear | Pixel baseline | Pending |
| core/TextEvent | Cropped pixel baselines and element existence | Pending |
| core/DomFocus | Actual `DOM.focus` CDP calls, exact focus/blur targets | Pending; normal UI taps are not equivalent |
| core/InputInsertText | Actual `Input.insertText`, unfocused no-op, exact values/counts/target | Pending; normal typing is not equivalent |
| sparkling/CanonicalSparkling | Canonical routing and exact Sparkling capabilities | Pending, iOS |
| sparkling/HotExternalURL | Hot external route and container/session ownership | Pending, iOS |
| sparkling/MalformedCanonicalNoFallback | Exact malformed-canonical rejection without legacy fallback | Pending, iOS |
| sparkling/MappedLegacyToSparkling | Mapped route mode and Sparkling capabilities | Pending, iOS |
| sparkling/RawOpenLegacy | Raw legacy routing and mode | Pending, iOS |
| sparkling/RawOpenSparkling | Raw Sparkling routing and capabilities | Pending, iOS |
| sparkling/RouterOpenClose | Unique container IDs, parent/child session binding, close and restored parent | Pending, iOS |
| xelement/VideoBasic | Original playback callbacks, payloads and ordering | Pending |
| xelement/VideoBoundary | Original boundary/error callback contracts | Pending |
| xelement/VideoModes | Original mode-specific callback/state contracts | Pending |
| xelement/VideoAttributes | Original attribute, timing and event contracts | Pending |

## Prerequisites and acceptance

- Build Explorer at the workflow revision with integration fixtures and
  Sparkling. `build.json` records the commit, platform, capabilities and binary
  checksum; consumers verify it before installation. No model credentials are
  provided to source-build jobs.
- Confirm source builds and the three smoke cases on both platforms before
  attributing native migration failures to a model.
- Keep the original fixture pages and verification targets. Use `aiAct` for
  ordinary user interactions, but retain protocol-specific actions where the
  protocol itself is being tested. Preserve exact CDP/API/pixel/callback checks
  through deterministic adapters rather than visual approximations.
- Implement and validate adapters for the contracts above before counting their
  cases as migrated. Video needs deterministic media/network setup; a visible
  first frame does not prove callback timing, counts, errors, or ordering.
- Run batches and inspect actual reports/screenshots. Build success, collection
  success, disabled cases, and infrastructure failures are not case passes.

The existing Appium suite remains unchanged and available until equivalent
assertions are executed successfully. Harmony device execution remains a
separate signing/device-runner prerequisite, not a passing native target.
