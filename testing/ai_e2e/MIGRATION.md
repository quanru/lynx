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
| core/Image | Cropped LynxView pixel baseline | Both platforms passed first attempts in run 38024427888; unchanged PNGs/thresholds |
| core/ListBase | Pixel baseline; original case is disabled | Disabled, not passed |
| core/LayoutLinear | Pixel baseline | Both platforms passed first attempts in run 38024427888; unchanged PNGs/thresholds |
| core/TextEvent | Cropped pixel baseline and exact text-attribute existence | Both platforms passed first attempts in run 38024427888; unchanged PNGs/thresholds |
| core/DomFocus | Actual `DOM.focus` CDP calls, exact focus/blur targets | Original contract passed on Android and iOS, first attempts, run 37937713083 |
| core/InputInsertText | Actual `Input.insertText`, unfocused no-op, exact values/counts/target | Original contract passed on Android and iOS, first attempts, run 37937713083 |
| sparkling/CanonicalSparkling | Canonical routing and exact Sparkling capabilities | Implemented locally; iOS device validation pending |
| sparkling/HotExternalURL | Hot external route and container/session ownership | Implemented locally; iOS device validation pending |
| sparkling/MalformedCanonicalNoFallback | Exact malformed-canonical rejection without legacy fallback | Implemented locally; iOS device validation pending |
| sparkling/MappedLegacyToSparkling | Mapped route mode and Sparkling capabilities | Implemented locally; iOS device validation pending |
| sparkling/RawOpenLegacy | Raw legacy routing and mode | Implemented locally; iOS device validation pending |
| sparkling/RawOpenSparkling | Raw Sparkling routing and capabilities | Implemented locally; iOS device validation pending |
| sparkling/RouterOpenClose | Unique container IDs, parent/child session binding, close and restored parent | Implemented locally; iOS device validation pending |
| xelement/VideoBasic | Original playback callbacks, payloads and ordering | Pending |
| xelement/VideoBoundary | Original boundary/error callback contracts | Implemented locally; Android/iOS device validation pending |
| xelement/VideoModes | Original mode-specific callback/state contracts | Implemented locally; Android/iOS device validation pending |
| xelement/VideoAttributes | Original attribute, timing and event contracts | Pending |

## Prerequisites and acceptance

Current pushed head `3c3a435` is being validated in run 38034582646: Android
11 / iOS 18, with 148 passing model-free checks. Previous run 38028650562
passed Android 10/11 and iOS 15/18 after WDA started successfully on rerun.
RawOpenSparkling, RouterOpenClose, MappedLegacyToSparkling,
MalformedCanonicalNoFallback and HotExternalURL passed first attempts;
RawOpenLegacy passed its second attempt. CanonicalSparkling, VideoBoundary
and VideoModes still failed on iOS. These outcomes supersede the historical
pending descriptions below, but do not validate the new action-phase head.

The next local foundation adds source-equivalent immediate counter equality
and upper-bound checks plus the original current-time parser and range
predicates. Parsing is compared against the unchanged Python helper; all four
VideoBasic time predicates are replayed directly from the original source.
Equality/upper-bound failures cannot poll later values green; seek's lower
bound stays inclusive, restart's bounds exclusive. No extra node is added.
These helpers are not complete VideoBasic/VideoAttributes migrations and add
no device cases. Click-relative sleeps, core versus video-helper wait behavior
and sampling still need integration before either case is counted or accepted.

The newest local correction retains Android 11 / iOS 18 and passes 148
model-free checks plus typechecking. Run 38028650562 Android passed 10/11;
VideoBoundary failed both attempts because its first physical Play tap finished
at 06:20:26, the recorded frame shows playing at 0.4/10 seconds, but subsequent
AI planning returned only at 06:20:38. The original playing check therefore
started after playback ended. iOS attempt 1 failed WDA startup before any case
executed; its same-head job is being rerun, not counted as a case rejection.

Two source-bound playing phases now group Play → Src B and Play Null → Stop
into ordinary two-click aiAct instructions. The read-only native.videoPhase
observer uses the public SDK progress API to execute unchanged playing/callback
assertions between physical taps. A fresh playing read immediately before tap
two rejects late source replacement/stop; cached success cannot hide ended
playback. Every original assertion and all 36 taps remain, with exactly two
completed taps required for each phase. No coordinates, scripted UI actions,
new tolerance or longer timing window is introduced. Source-time JPEG evidence
is attached to the assertion report in the same case/attempt. Wait failures keep
their original diagnostic-before-final-read behavior. Observers are removed
after consumption or case release, and SDK-swallowed listener errors are
persisted and rethrown by the assertion node. This deterministic observer cannot
be replaced by an AI visual judgment without losing the original timing/state
contract. The correction is local and not yet device-accepted; VideoBasic and
VideoAttributes still require source-equivalent click-relative sampling.

The latest local extension collects Android 11 / iOS 18 with 136 model-free
Node 22 checks and typechecking passing. VideoBoundary retains all original
36 button actions, three fixed sleeps, ordered assertions, exact failure/error
messages, callback occurrences and platform-specific unknown-method errors.
Each cancellation burst remains one original button action through aiAct.
Source AST replay executes the unchanged run and both assertion helpers on
each platform; original fixture labels map ordinary actions to aiAct without
direct DOM/CDP clicks. Count parsing is compared with Python regex/int, and
occurrences use immediate non-overlapping Python semantics. This addition
awaits hosted validation. Run 38024427888 passed Android 10/10 (one Event
retry), iOS 14/17 and report/Pages publication. All three iOS pixel cases
passed first attempts without changing baselines, cropping or thresholds.
RawOpenSparkling, RouterOpenClose and VideoModes failed. Actual screenshots
and recorded gestures show Open landing on the upper runtime selector and
video scrolls below the left-hand gray fixture; RouterClose did return to the
parent, then the model wrongly failed because Close was no longer visible.
Intent corrections disambiguate the lower Open card, actual scrollable panel
and expected post-close parent state. All original exact assertions and button
counts remain; no selector/coordinate action or timeout relaxation is added.
The corrections are not claimed device-verified until a new hosted run passes.

Run 38021364503 at `32efbfc` passed Android 9/9 on first attempts, iOS 6/9,
both builds and report/Pages publication. All six iOS pixel-attempt artifacts
contain independent WDA view `(0,98,240,302)`, exactly matching CDP physical
`(0,294,720,906)` at scale 3. Unchanged original driver/helper AST replay using
the WDA rectangle produces identical pixels and the same dimension/color
rejections. This excludes a migrated root-view crop offset as their cause.

Actual run logs show Xcode 16.4 / iOS simulator 18.5. Upstream baseline update
[`dfa91d8f`](https://github.com/lynx-family/lynx/commit/dfa91d8f815e626a8977ab0a595cb53d4f784b78)
updated all three iOS PNGs while explicitly moving to Xcode 26.3 / iPhone 17.
The hosted macOS 15 image provides Xcode 26.3 / simulator SDK 26.2, but leaves
16.4 as its default. The migration previously selected that default and the
newest ordinary iPhone under its SDK, silently changing the baseline environment.
Both source build and device execution now explicitly select the baseline
toolchain and original iPhone 17. Simulator JSON selection rejects missing,
ambiguous, unavailable, wrong-runtime and newer-device alternatives. Actual
toolchain metadata is recorded and checked with the source SHA/checksum.
All 133 model-free checks, typechecking and actionlint passed at that head.
Environment alignment now has real old-fails/new-passes evidence in run
38024427888 without changing any PNG, crop, comparator or threshold.

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
regression tests are identical; 124 Node 22 checks pass locally. This is report
evidence handling, not a pixel-baseline or assertion change.

The next Sparkling foundation is a read-only WDA visibility reader, attached to
an explicit case-owned session. It preserves displayed-view scoping, ordered
anchors, native text sources and duplicate input types from the original helper.
Five HTTP/source-parity checks include malformed visibility, a stalled JSON
body deadline and the public case-owned device reader. Local routing phases
now share only their case socket, not a globally selected newest session. The geometry foundation
preserves native-point normalization, original operation order and Python
two-decimal rounding. It matches 2,000 unchanged-public-driver geometries and
2,005 original Sparkling rectangle-correspondence results. No physical-pixel
coordinates, enlarged tolerances or JavaScript rounding approximation are used.

Run 38018791030 at `c4498d4` completed: Android 9/9 (Event retried once),
iOS 6/9 (all six first attempt), reports and Pages published. Both full-view
pixel cases fail twice on iOS because actual dimensions are 720×906 versus
unchanged 720×876 baselines. TextEvent still fails twice at its known mismatch
fraction. The next head retains visible WDA frames alongside CDP geometry as
diagnostic evidence only, with no pixel/crop/baseline/tolerance change. Two
checks cover malformed data, timeout and no follow-up reads after late replies.

The next local visible-session resolver implements unique native-view/session
pairing with exact requested/anchor tags and text, native-point geometry and
bounded observations. Three regressions cover a surviving larger-ID parent,
ambiguous/duplicate/malformed evidence and late responses. Optional full-view replay of Image/LayoutLinear captures
through unchanged driver/helper AST gives identical pixels and size rejection
for the same supplied rectangle; whether that rectangle matches the original
native WDA wrapper still awaits current-run diagnostics.

Four local Sparkling implementations bring collection to Android 9 / iOS 13,
with all 116 Node 22 checks, typechecking and workflow lint passing. They retain
the real restarted homepage, original 3+5+2 second readiness, exact URLs and
Open route action, with ordinary runtime/typing/tap actions through `aiAct`.
Python original run functions are replayed to check every acceptance statement.
Capability checks retain the original forbidden values, exact native input type
and cardinality, and all seven mapped properties. Bound homepage and legacy
parent reads do not rediscover SessionList after rerender. Explicit later phases
re-observe native visibility and text/frame identity; teardown closes sockets
before devices and prevents late operations reopening a released attempt.
This batch is not pushed while useful native CI is active and has no device
acceptance. Three further local implementations complete all seven Sparkling
source modules, collecting Android 9 / iOS 16 with 124 Node 22 checks passing.
Router push/pop retains different parent/child IDs, the return callback and
the exact original parent ID. Malformed rejection retains the error code,
route-result text and unchanged parent container, without legacy fallback.
Hot external delivery retains the registered URL and explicit Explorer bundle
using WDA's actual URL API, with no SDK Safari fallback/restart. Alert taps use
`aiAct`; dismissal additionally requires genuine structured WDA no-alert
evidence, never an arbitrary exception or late response. Original case/helper
AST replay covers ordered assertions and route payloads. No device acceptance
is inferred. VideoBasic, VideoBoundary and VideoAttributes remain pending.

VideoModes now uses `aiAct` for its eleven ordinary button clicks, including
one click per original burst button. Its exact callback/signal ordering,
Latest-mode absence of `pause_ok`, exact stopped states, and original 15/20-second
waits remain deterministic. Original Python run replay checks the complete
ordered sequence of actions and assertions against both SDK-collected YAMLs.
The original XElement runner uses CaseSet's default `enable_scale=True`; the
platform URLs retain that scaling. Video polling preserves `video_utils`'s
diagnostic capture followed by one final read after timeout, unlike core's
different polling contract. Diagnostic source JPEGs are archived uncropped;
they are not pixel comparisons, and standard report nodes provide linked
screenshots on success and failure. All 128 Node 22 checks, typechecking and
workflow lint pass; Android 10 / iOS 17 collect. No device/AI acceptance is inferred.
Playback speed and tick-frequency sampling windows in the other video cases
must not absorb AI action latency or gain relaxed assertions.

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
