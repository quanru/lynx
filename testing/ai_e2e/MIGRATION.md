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
| core/Event | Exact event counts and final inline style | Passed both platforms, first attempts, run 37948887444 |
| core/Image | Cropped LynxView pixel baseline | Implemented locally; unchanged baseline and original second crop; Android/iOS validation pending |
| core/ListBase | Pixel baseline; original case is disabled | Disabled, not passed |
| core/LayoutLinear | Pixel baseline | Implemented locally; unchanged baseline and original second crop; Android/iOS validation pending |
| core/TextEvent | Cropped pixel baseline and exact text-attribute existence | Android passed first attempt in run 38016020854; iOS pixel comparison fails at the unchanged threshold; not accepted cross-platform |
| core/DomFocus | Actual `DOM.focus` CDP calls, exact focus/blur targets | Original contract passed on Android and iOS, first attempts, run 37937713083 |
| core/InputInsertText | Actual `Input.insertText`, unfocused no-op, exact values/counts/target | Original contract passed on Android and iOS, first attempts, run 37937713083 |
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

### Hosted TextEvent evidence

Run 38016020854 at `2afb2f2` passed both source builds and Android 7/7.
iOS passed 6/7; TextEvent failed twice with exactly the same 720 × 159 crop
and mismatch fraction `0.01277078965758211`, exceeding the original `0.01`.
All 1,462 above-threshold pixels are in the colored sub-text region; there are
none in the remaining text region. A solid border sample is BGR `[0, 0, 254]`
in the capture versus `[31, 52, 234]` in the baseline. The JPEG declares sRGB;
the checked-in baseline has no ICC profile. A device/color-gamut difference
is a hypothesis, not yet a controlled-device result. No baseline, color
transform, mask or tolerance is changed to force acceptance.

`scripts/native_capture_reference_test.py` replays this downloaded JPEG and
geometry through the unchanged public driver's screenshot and geometry AST,
then the repository's unchanged crop and comparator AST. Its crop is
byte-for-byte equal to the migrated array, and the original comparator fails
with exactly the same mismatch fraction. This establishes that the observed
failure is not introduced by the new crop/comparator or an AI action; it does
not prove when or why the baseline's rendering environment differed.

```bash
python testing/ai_e2e/scripts/native_capture_reference_test.py \
  /path/to/lynx_e2e_appium-0.0.15-py3-none-any.whl \
  /path/to/downloaded/native-pixels/ios/CASE_RUN_ID
```

The wheel remains an optional read-only diagnostic reference, never a CI
runtime dependency. The failed pixel contract remains a failing gate.
The next local Summary renderer change accepts an immediate first afterEach
capture when the final failed assertion has no prior screenshot. It keeps the
HTML link on the failed step, prefers preceding captures and rejects images
after intervening actions or from older attempts. Both repository copies and
regression tests are identical; 98 Node 22 checks pass locally. This is report
evidence handling, not a pixel-baseline or assertion change.

The next Sparkling foundation is a read-only WDA visibility reader, attached to
an explicit case-owned session. It preserves displayed-view scoping, ordered
anchors, native text sources and duplicate input types from the original helper.
Four HTTP/source-parity checks include malformed visibility and a stalled JSON
body deadline. It is not wired into device cases yet and adds no case count;
visible-native/DevTool geometry binding and route phase ownership remain required.

### Preserved algorithm

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
Eight Python checks cover the unchanged original comparator/crop AST against
the same arrays, including threshold boundaries, 120 randomized comparisons
and 50 fractional crop/cubic-resize comparisons across Android and iOS scales.
`crop_native_view` additionally preserves the public driver's full-frame crop:
physical rectangles are normalized by the original platform ratio, multiplied
back in the original operation order, and sliced with Python ties-even rounding.
The local public `lynx_e2e_appium` 0.0.15 wheel's unchanged normalization and
screenshot AST produced identical arrays for 200 Android/iOS crops. Invalid or
out-of-frame geometry fails without clamping or resizing. No Appium dependency
is added to the new runner. This is algorithm conformance only; hosted geometry
integration and baseline device execution remain pending.
The next workflow runs all model-free checks
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
The diagnostic probe runs after successful or failed case execution (not skipped
or cancelled execution), so an interaction failure does not discard independent
transport/frame evidence. A passing probe never overrides failed case status.

Android run 37937713083 passed DomFocus, InputInsertText and all three smoke
cases, but Event failed its first counter assertion in both attempts. The actual
1080x2400 screenshot has the first blue button at vertical pixels 365–452;
the second attempt's raw normalized point `[500,270]` became `[540,648]`, outside
that button. The first attempt also misidentified the other button's text.
The first button has no visible label. The next action describes its visible
heading relationships and both agents receive active-coordinate-protocol guidance,
without hardcoded coordinates, extra clicks or changed assertions. This is a
diagnosed localization failure, not yet a device-verified behavioral repair.
Both platforms finished 5/6, with DomFocus and InputInsertText passing on their
first attempts. iOS Event reached the inline style assertion on its retry, but
the raw point `[400,800]` became `[471,2045]`, far below the third blue button
(vertical pixels 986–1117 in its 1178x2556 screenshot). The counter assertions
passed on that attempt; the final style remained unchanged. The next description
also constrains the inline text to the lowest blue button, without coordinates.

Run 37943332119 at `04b3d75` passed both source builds and publication. Android
passed Event, DomFocus and InputInsertText on their first attempts but failed
the Showcase-entry smoke (5/6 overall). iOS passed DomFocus, InputInsertText and
the home smoke, with Event and Showcase navigation still failing (3/6). Native
capture artifacts exist on both platforms; Android's 1080x2400 frame and
physical `(0, 210, 1080, 1664)` rectangle crop to the original view dimensions.
These are not baseline comparisons. The next Event and Showcase-entry actions
use standard `aiAct` deepLocate with caching disabled to avoid direct planning
points; dedicated visual grounding still needs device verification. All original
Event counters, exact style, click count and API contracts remain unchanged.

Local validation of this next foundation passes 85 Node 22 checks, eight Python
checks, typechecking and actionlint. These are not additional migrated cases.

Run 37948887444 at `3ebd94d` subsequently passed both builds, Android 6/6,
iOS 6/6 and Pages. All 12 cases passed first attempt, including the three
original modules on each platform. All 15 unique public report/image URLs
returned HTTP 200; each case has a linked screenshot.

The next batch collects seven cases per platform by adding original TextEvent.
Source AST extraction now checks its ordered three-second wait, exact
`flatten-text` crop and `text_flattern_element` baseline, followed by the
three-second bindlayout text-attribute existence assertion. The bound session
is revalidated before and after JPEG capture; no newest-session fallback is
allowed. Original baselines and comparator thresholds are unchanged. Failures
preserve frame, geometry, crop and baseline in the case artifact. Python 3.13,
OpenCV 4.12.0.88 and NumPy 2.2.6 are installed in each device job.

Local checks pass: 91 Node 22 tests, ten comparator/crop/geometry tests, one
real JPEG bridge test, typechecking and actionlint. A separate offline AST
differential against the public driver wheel matches 2,000 randomized
Android/iOS geometries:

```bash
python3 testing/ai_e2e/scripts/native_capture_test.py
python3 testing/ai_e2e/scripts/native_geometry_reference_test.py /path/to/lynx_e2e_appium-0.0.15-py3-none-any.whl
```

The wheel is a read-only reference, not a runner dependency. These checks do
not establish a passing TextEvent baseline on either device; hosted validation
is still required. Disabled ListBase remains disabled.

The next local batch adds original Image and LayoutLinear, collecting nine
cases per platform. Their source examples have no test tags, so the binder
requires every original page text marker in exactly one session and revalidates
that identity around capture. No fixture modifications, newest-session fallback
or whole-device screenshot substitution is used. Source AST checks retain each
original full-LynxView baseline call. The backend also preserves the original
second crop/resize, including fractional full-view bounds.

The original TestRunner sets Android system density to 320 and waits two seconds
after opening a case before calling its module. This batch restores both pixel
prerequisites; URL density alone is not the system setting. All three pixel
cases retain that post-open wait, with TextEvent's additional three seconds.
Validation passes 93 Node checks, ten comparator/crop/geometry checks, three
JPEG bridge checks, typechecking and actionlint. The offline public-driver AST
differential still matches all 2,000 geometries. None of the three pixel modules
is device-verified yet; report actual hosted outcomes before acceptance.
