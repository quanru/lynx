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
| core/Event | Exact event counts and final inline style | YAML and source-contract checks prepared; device validation pending |
| core/Image | Cropped LynxView pixel baseline | Pending; additive Image navigation smoke exists |
| core/ListBase | Pixel baseline; original case is disabled | Disabled, not passed |
| core/LayoutLinear | Pixel baseline | Pending |
| core/TextEvent | Cropped pixel baselines and element existence | Pending |
| core/DomFocus | Actual `DOM.focus` CDP calls, exact focus/blur targets | YAML and source-contract checks prepared; device validation pending |
| core/InputInsertText | Actual `Input.insertText`, unfocused no-op, exact values/counts/target | YAML and source-contract checks prepared; device validation pending |
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

The next prerequisite is a read-only DevTool TCP probe after the navigation
smoke, using the existing PeerTalk wire protocol without Appium. It verifies
runtime registration and at least one valid Lynx session, with bounded socket
timeouts, strict frame lengths/UTF-8 and explicit cleanup. Android forwards only
the probe's own port; iOS Simulator connects locally. Probe logs are archived
with reports, and a failed probe must make infrastructure status fail even if
the navigation cases pass. This does not itself count as an equivalent case
migration. The iOS probe passed in run 37933030865; Android execution was blocked
by a model-free test clock race before the probe, not established as a device or
model failure. Run 37937713083 validates the corrected clock and three original modules.

The next local foundation adds exact CDP response correlation and read-only
`DOM.getDocument` validation. Native text, input values and style attributes
retain the Python driver's value semantics. The expectation helper distinguishes
immediate assertions from ten-second `wait_for_equal` polling and fails on
malformed DOM or transport errors. Its 56 model-free checks pass on Node 22;
this is not device execution or an equivalent migration of any module above.

Run 37928363584 passed Android 3/3 and iOS 3/3 on the first attempt, but both probes rejected
the server's frame header. DebugRouter's native `UsbClient::WrapHeader` writes
JSON length + 20, whereas the client's PeerTalk encoder writes JSON length + 4.
The receive decoder must support both documented conventions, not demand its
own outgoing format. This is covered by an independent server-frame regression
with old-rejects/new-passes evidence and malformed-length rejection checks.
Source reference: [DebugRouter writer at fc4ca8c](https://github.com/lynx-family/debug-router/blob/fc4ca8c3b4cd99718b6be551711d1dcf064487d1/debug_router/native/socket/usb_client.cc#L389).
The fix is not claimed device-verified until a subsequent hosted probe passes.

The next batch collects Event, DomFocus and InputInsertText on both platforms.
Python AST extraction checks the original ordered assertions and CDP operations
against collected YAML, including immediate no-op and sibling-value assertions.
It rejects unsupported source statements rather than silently dropping them.
Event uses `aiAct` for its three ordinary clicks. API-specific actions retain
their actual CDP methods; reports capture screenshots around deterministic
checks. Existence assertions retain the original three-second helper timeout;
`assert_text` checks remain immediate. All 76 local model-free checks and
typechecking pass. Collection and
mocked protocol tests do not establish device correctness.

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

## Pixel migration contract

Image, LayoutLinear and TextEvent have checked-in baselines under
`testing/integration_test/test_script/resources/{android,ios}/`. Their comparator
is `lib/test_runner/mixin/img_diff_mixin.py`, not Playwright pixelmatch:

- Capture the original Lynx screencast and crop the LynxView using its original
  rectangle and pixel ratio, then crop the requested view/element relative to it.
- Preserve the platform crop scales (Android 1, iOS 3), integer slicing and
  OpenCV cubic resize from `lib/{android,ios}/test.py`.
- Convert both images from BGR to grayscale with the pinned original OpenCV
  4.12.0.88 / NumPy 2.2.6 behavior. Reject unequal dimensions and missing baselines.
- A pixel differs only when absolute grayscale difference is greater than
  `int(0.1 * 255)` (25); fail only when the mismatch fraction exceeds 0.01.
  Preserve the original baseline bytes; never regenerate them to make a run pass.
- TextEvent additionally checks the original exact text target's existence with
  the original three-second timeout. Its cropped screenshot alone is incomplete.

These are prerequisites for a future adapter, not implemented pixel coverage.
A whole-device screenshot, AI visual similarity or Web screenshot matcher does
not establish the same crop, scale, interpolation or comparison contract.

The next local transport foundation adds exact-session CDP notification waiters
and `scripts/native-screencast.mjs`. It subscribes before `Page.startScreencast`
so an early frame is not lost, retains the original JPEG/quality/max-dimension
parameters, and stops the stream on success or failure. Other sessions' frames
are not accepted or buffered. Cancellation, timeout and disconnect release
waiters; capture and cleanup failures retain both causes. This foundation is
covered by real TCP mocks, not yet device capture or implemented pixel cases.

The local grayscale comparator in `scripts/native_pixels.py` preserves the
original pinned OpenCV/NumPy backend, grayscale threshold and mismatch fraction.
Six Python checks execute the unchanged original comparator/crop AST against
the same arrays, including threshold boundaries, 120 randomized comparisons
and 50 fractional crop/cubic-resize comparisons across Android and iOS scales.
This is algorithm conformance only; full-frame-to-LynxView geometry integration
and baseline device execution remain pending. The next workflow runs all model-free checks
before source builds, without model credentials, rather than discovering unit
failures after emulator/WDA startup. Original test-script changes also trigger
the workflow so source-contract drift cannot silently bypass validation.

To reproduce the comparator checks with Python 3.13 in an isolated environment:

```bash
python3.13 -m venv /tmp/lynx-pixel-check
/tmp/lynx-pixel-check/bin/python3 -m pip install -r testing/ai_e2e/scripts/requirements-pixels.txt
/tmp/lynx-pixel-check/bin/python3 testing/ai_e2e/scripts/native_pixels_test.py < testing/integration_test/test_script/lib/test_runner/mixin/img_diff_mixin.py
```

The next probe also captures one JPEG stream frame and the same session's
physical `Lynx.getRectToWindow` rectangle in the report artifact. It does not
persist route URLs or runtime metadata, substitute a whole-device screenshot,
or claim pixel baseline coverage. Strict numeric, nonempty geometry is required;
the probe stops the stream and releases its connection on failure. Real frame
dimensions and crop geometry still need inspection after hosted execution.

Local validation of this next foundation passes 84 Node 22 checks, six Python
checks, typechecking and actionlint. These are not additional migrated cases.
