# Native integration migration scope

## Current checkpoint (2026-10-13)

Baseline `3c3c192` [run 38293483556](https://github.com/quanru/lynx/actions/runs/38293483556)
passes both current-source builds and its 201 model-free checks. Android
finishes 12/13 and iOS 19/20, with no unrun cases. All other cases, including
VideoAttributes, VideoBasic and VideoModes, pass their complete first attempts.
VideoBoundary fails on both platforms, so this is not full-device acceptance.
iOS times out twice in Seek Bad before its original callback assertions.
On Android, a clipped Seek Null label causes
repeated scrolling in attempt one; attempt two taps Near End instead of
Seek Bad, and the original seek_fail assertion rejects actual seek_ok.

The follow-up keeps all 36 original clicks and every ordered callback,
error message, wait and timeout. Seven crowded seek controls use per-platform
prompt variables: source-owned order on Android and visible local anchors for
iOS Bad, Null, Text and NaN. Only Seek Null switches to full-frame
location; other boundary controls retain independent refinement. With actual
failed images, [inert control 38300403813](https://github.com/quanru/lynx/actions/runs/38300403813)
hits Seek Bad in 2/2 refined trials (full-frame: 1/2) and Seek Null in 2/2
full-frame trials (refined: 1/2). Its complete action schemas never connect a
device or send input. All 202 model-free checks and typechecking pass; this
prompt/option correction requires a separate hosted acceptance run.

Expanded inert control [38304552723](https://github.com/quanru/lynx/actions/runs/38304552723)
hits 14/14 Android regions but rejects the original shared iOS descriptions
(7/16). Full-frame comparison also hits 7/16. Visible local anchors in
[38306040423](https://github.com/quanru/lynx/actions/runs/38306040423) recover
Bad (8/8) and Null (4/4). Right-side anchors in
[38306686449](https://github.com/quanru/lynx/actions/runs/38306686449) refine
Text correctly in 3/4 trials and NaN in 4/4 across two failed images. The miss
remains a miss; this best-measured candidate requires its own full device run.

## Previous full-device checkpoint

The latest completed full-device run is
[38284421384](https://github.com/quanru/lynx/actions/runs/38284421384), head
`ff4d15c`: Android 9/13, iOS 16/20, no unrun cases. Both current-source builds
and 199 model-free checks pass. All seven Sparkling cases and the complete
second iOS VideoBasic attempt pass. Android's three video RPM-limit failures
are distinct from VideoModes' physical taps below its button. iOS Event,
VideoAttributes, VideoBoundary and VideoModes still fail original contracts.

The current follow-up preserves every original assertion, operation and
timing window. It refines small video controls on both platforms and only the
iOS Event inline-text action; full-frame homepage navigation is unchanged.
The crowded ordinary Seek 2s action stays aiAct/full-frame, with its second
position and neighbors made explicit, avoiding futile scrolling for clipped
text. Timed seek preparation retains its previously validated full-frame path.
Static control [38292801372](https://github.com/quanru/lynx/actions/runs/38292801372)
uses actual failed ff4d15c images and complete inert action schemas; these
controls do not substitute for a new full device run. Provider jobs are
serialized with bounded 30-second retry backoff, inside the original step
deadline. All 201 local model-free checks, typechecking and actionlint pass.
The completed control recovers all twelve repeated failed-target trials with
independent refinement (full-frame: zero of twelve). The explicit Seek 2s
candidate hits the second control twice on each path; it retains full-frame
context because earlier crowded-seek refinement selected the wrong neighbor.
This remains static evidence, not full-device acceptance of the follow-up.

## Historical investigation checkpoints

Run [38212166291](https://github.com/quanru/lynx/actions/runs/38212166291)
at `a48b56f` completed Android 11/13 and iOS 16/20. Contract checks, both
current-source builds, report assembly and Pages publication succeeded; device
acceptance remains incomplete. HotExternalURL and Event now pass. The failed
iOS modules were MalformedCanonicalNoFallback, VideoAttributes, VideoBasic
and VideoBoundary. Android failed
VideoAttributes and VideoBoundary.

The migration-layer visibility fix retries only structured WDA HTTP 404
`no such element` / `stale element reference` errors from element reads during
an explicit visibility observation. It repeats the complete native/CDP
identity proof within the original deadline, without restarting the device,
switching retained handles, or accepting ambiguous sessions. Search failures,
invalid sessions, malformed replies and transport failures still fail closed.

Video preparation now distinguishes intrinsic label truncation from an
off-screen button body. The unchanged fixture's second seek-row button is
Seek 2s, between Seek 0s and Near End; scrolling cannot unclip its fixed-width
text. Preparation remains scroll-only and all model work remains before the
original playback fragment. The latest iOS evidence still requires investigation
of incorrect video grounding and the malformed-route visibility timeout.

Android VideoAttributes' two failed attempts show no model calls during the
fit fragment, but SDK Tap tasks take approximately 1.2–1.9 seconds each,
with additional 0.3–0.8 second Locate tasks. The original Pause occurs after
the ten-second clip ends. Explicit report writes take only milliseconds;
deferring them is not an evidence-backed timing fix. Original media,
assertions and timing windows are not changed.

The approved follow-up uses only public `device.inputPrimitives.pointer.tap`
inside closed playback fragments. `aiLocate` receives a specific public
`getUIContext()` snapshot; its point is converted using that snapshot's
`shrunkShotToLogicalRatio`, not a hard-coded DPR. Geometry/bounds and cancellation
are checked before physical input. Original screenshots remain in source order;
ordinary actions remain `aiAct`. All 199 model-free checks pass on Node 22.

The hosted immutable-screenshot control
[38272407575](https://github.com/quanru/lynx/actions/runs/38272407575)
reproduces `Seek 2s` deep refinement selecting the fourth seek-row button.
Full-frame `aiLocate` retains its neighbors and selects the second button.
The two crowded timed seek targets now use full-frame visual location; other
targets keep deep refinement. No target coordinates are stored in the cases.
One static sample is not a device-run reliability claim. Ordinary `aiAct`
balanced planning is a separate path: turning off only its deep refinement
would reuse the planner's point, not perform a new independent location.

The follow-up screenshot control
[38273920808](https://github.com/quanru/lynx/actions/runs/38273920808)
keeps the same SDK/model/images and removes the extra coordinate-conversion
`aiAct` context. Balanced planning then hits all three marked targets, versus
one of three with that context; fast/deep-think still each miss a target.
Head `907fe44` removed only the extra context and kept default balanced
planning and SDK coordinate handling. These small static controls do not
establish reliability. Run `38270018228` stopped before video cases after a
wrong URL-input tap led to repeated navigation, a 180-second timeout and
subsequent WDA connection/resource-drain failures. Its video fixes remain
device-unverified; timeout, retry and original acceptance limits are unchanged.
The repeated full iOS action-space control
[38276353714](https://github.com/quanru/lynx/actions/runs/38276353714)
still misses URL input/Open twice each with default planning, despite hitting
Seek 2s twice. The Tap-only improvement does not generalize to real action
schemas; removing context alone is not a complete grounding fix.

The next control uses the complete iOS action schemas, `effort: deepThink`
and `deepLocate: false`, without extra context. SDK 1.13.1 then plans without
inline coordinates and independently locates on the complete screenshot.
In [38279235964](https://github.com/quanru/lynx/actions/runs/38279235964), URL
input, Seek 2s and Open are each correctly located twice. Src Bad first requests
Scroll in both trials; the static control cannot determine its later outcome.
Ordinary native YAML actions and pre-playback visibility preparation now use
this configuration, preserving all prompts and original contracts. A real SDK
test with a local inert model endpoint verifies the independent two-request
path and uncropped image. No stored coordinates or atomic action nodes are
introduced. This is not a complete device pass. The preceding control
38278584243 hit model transport timeouts, not grounding failures; the successful
control uses the same IPv4 Node options as the device workflow.

The initial Android follow-up retained independent deep-think planning but enabled
refinement for ordinary video actions only. In static control
[38286576224](https://github.com/quanru/lynx/actions/runs/38286576224), five
alternating full-frame Latest trials land just below its marked button body,
while all five independently refined trials hit it. The complete Android
action space, original image and original prompt remain identical. iOS and
non-video actions initially remained full-frame; the earlier iOS refinement
control missed Open. The completed ff4d15c run subsequently supplied the
small-control iOS evidence used by the current follow-up above.
No source assertions, fixtures, timing, media or saved target points change.

That run's Android result is 9/13, with no unrun cases. Three video cases
exhaust their provider retries on HTTP 429 endpoint RPM limits. VideoModes
instead records two physical Play Pause Stop taps below the actual button;
the unchanged callback/state assertions correctly reject them. Model quotas
and visual grounding are separate failures, not evidence for weakening either
original contract. The local follow-up serializes credentialed device jobs,
keeps source builds parallel and uses two provider retries with 30-second
backoff. A public-SDK inert-server test verifies that the existing step abort
interrupts this backoff, prevents another request and performs no device input.
Other repositories can still share the endpoint; CI serialization does not
guarantee an account-wide quota reservation.

The independent unchanged Appium control in
[38190434034](https://github.com/quanru/lynx/actions/runs/38190434034)
also fails VideoBoundary's Seek Empty assertion with `seek_ok:success=true`.
The approved Android implementation fix waits for the player's READY/ENDED
acknowledgement rather than treating `seekTo` or its synchronous discontinuity
as completion. Completion retains the original request identity; source changes
and destruction cancel it once, and stale acknowledgements cannot finish a new
request. Direct mode retains immediate acknowledgement. Explorer Robolectric
regressions are wired into the hosted Android source build. The first build
at `f72d439` produced the APK but stopped before publication because its new
test instantiated an abstract LynxContext. The corrected test explicitly
implements that context and initializes its detached owner; all five tests
pass in [38274270887](https://github.com/quanru/lynx/actions/runs/38274270887),
with downloaded XML confirming zero failures. XML/HTML results are retained
even on failed builds. The unchanged original Appium VideoBoundary passes in
[38279593401](https://github.com/quanru/lynx/actions/runs/38279593401), consuming
the `907fe44` source APK from build run 38275815434. The control enters the
actual case body, records `Caseset passed!`, verifies unchanged test checksums
and proves the installed APK payload identity. Producer checks require the
exact successful Android build job in the pinned attempt, even while unrelated
model-backed jobs are still running. This is original-case acceptance only;
the migrated Midscene suite must pass separately.

The 13/20 totals count modules, including three additive smoke cases per
platform. They are not a repository-wide native test inventory or counts of
individual assertions. Other platform unit/instrumentation suites are outside
this Appium UI integration migration and must not be described as migrated.

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
| sparkling/CanonicalSparkling | Canonical routing and exact Sparkling capabilities | Passed iOS, run 38039839927 |
| sparkling/HotExternalURL | Hot external route and container/session ownership | Passed iOS, run 38039839927 |
| sparkling/MalformedCanonicalNoFallback | Exact malformed-canonical rejection without legacy fallback | Implemented; visibility check failed iOS, run 38039839927 |
| sparkling/MappedLegacyToSparkling | Mapped route mode and Sparkling capabilities | Implemented; visibility check failed iOS, run 38039839927 |
| sparkling/RawOpenLegacy | Raw legacy routing and mode | Passed iOS, run 38039839927 |
| sparkling/RawOpenSparkling | Raw Sparkling routing and capabilities | Passed iOS, run 38039839927 |
| sparkling/RouterOpenClose | Unique container IDs, parent/child session binding, close and restored parent | Passed iOS, run 38039839927 |
| xelement/VideoBasic | Original playback callbacks, payloads and ordering | Complete YAML/source contracts implemented; Android/iOS device validation pending |
| xelement/VideoBoundary | Original boundary/error callback contracts | Implemented locally; Android/iOS device validation pending |
| xelement/VideoModes | Original mode-specific callback/state contracts | Implemented locally; Android/iOS device validation pending |
| xelement/VideoAttributes | Original attribute, timing and event contracts | Complete YAML/source contracts implemented; Android/iOS device validation pending |

## Prerequisites and acceptance

The approved iOS-video viewport correction uses the existing Explorer fallback
to actual view bounds instead of its fixed 720x1200 physical-pixel override.
Explorer divides those original dimensions by UIScreen scale (3x on the baseline
iPhone), then subtracts status/navigation height, leaving a clipped video panel.
The scale=2 URL parameter does not override this UIScreen calculation. Only
iOS video launch geometry changes: Android video and all pixel/API fixtures
retain their original parameters. No product implementation, page, baseline,
assertion, timing window or original operation is changed. Remote screenshots
must establish that controls are visible; this is not inferred from URI tests.
The complete local correction passes 181 model-free checks and typechecking.

Run 38056035286 at `7446d29` completed with both Android/iOS device jobs
cancelled at their 60-minute job limits. Its remote contract gate and both
source builds passed; report assembly/publication jobs also succeeded. This
does not establish device acceptance. Android's complete playback phases hit
the 180-second step limit. iOS could not reveal video buttons by scrolling.
The next correction passes 174 model-free checks and typechecking. It forwards the runner's
step cancellation signal into video preparation aiAct and checks cancellation
after every uncancellable location result, before/after SDK taps and between
original playback operations. Late custom-node work cannot start subsequent
taps after its original deadline. The pinned SDK has no public aiLocate
cancellation option; this guard does not claim to abort an in-flight model
request or an already-started physical action. No timeout is extended.

Visibility preparation and each individual visual location are now separate
model-only runner steps, using the existing `native.videoPhase` node rather
than adding a general-purpose action DSL. Case/attempt-owned points must be
complete and consumed in order, once, before playback. Release/cancellation
invalidates late results. Complete playback is split at the original inactive
boundaries, including the next section's existing pause/stop assertion where
needed. No extra tap, wait, read or sample is added, and speed comparisons keep
their single-read samples in one fragment. Original operation replay verifies
the ordered trace and the source-owned assertion deadlines independently of
model preparation. Product implementations, example pages, launch viewport,
media, original pixel baselines and retry policy remain unchanged.

Hosted head `3b592b6` completed run 38137942374 with Android 11/13 and iOS
15/20 passed. Its remote model-free contract gate, current-source builds,
reporting and Pages passed; the current-run HTML report returned HTTP 200.
Device acceptance remains incomplete. The preceding `f3973b6`
run 38136008306 passed its contracts and builds but was superseded before device
acceptance. The report-finalization correction `4ca5303` was initially held
locally, then included in the current head with the approved viewport change.
It launches the pinned
CLI directly, forwards interruption and retains a bounded grace period before
the job deadline. An actual synthetic CLI run, without models/devices, verifies
a failed total HTML report with both interrupted and not-run case identities.
The 120-minute job budget / 105-minute CLI budget only permit complete execution
and report finalization; original assertion windows, 180-second step deadlines,
retry policy and device concurrency are not extended or changed.

The next migration-layer correction passes 184 model-free checks and
typechecking. Actual iOS screenshots show Play [374,1678] below its blue
button (vertical extent 1586..1663), and Mute [719,2105] below its button
(2024..2101). SDK coordinates use the expected 3x screenshot-to-logical mapping;
the model points themselves miss. A VideoModes Clear point [123,1290] also
misses the first button row, so earlier queue callbacks cannot be assumed
cleared. Standard deep location now refines video targets before tapping;
timed fragments retain all model work before playback and deepLocate=false
for their final physical taps. Source-bound preparation ownership and
cancellation guards remain. Homepage Open also uses deep location and names
the smaller lower red button rather than the wider upper runtime selector.

Android VideoAttributes reached Pause about 10.9 seconds after Play, after the
ten-second clip ended. The public agent option waitAfterAction=0 removes only
the SDK's additional 300ms post-action wait; the original Python waits, sample
windows, screenshot checkpoints and media duration remain unchanged. A pinned
SDK regression verifies the removed delay and unchanged single-tap/scale path.
Remote acceptance is still required. VideoBoundary's Android Seek Empty
continues to return seek_ok instead of the original expected seek_fail; this
does not prove a product defect without a same-environment original-case run.

Earlier completed run 38039839927 (`658bc76`) passed Android 10/11 and iOS
14/18; builds and report publication passed. Android's first VideoBoundary
attempt passed its prelocated playing/source-switch fragment, then failed the
Seek Empty `seek_fail` expectation with `seek_ok:success=true`. The actual
SDK screenshot/point is on Seek Empty; this is not evidence of a wrong-button
tap or a proven product defect. Its second attempt failed a CDP document read.
iOS failed both video cases during visibility/scroll preparation, before the
timed physical taps. The initial frame contains only video/status; its repeated
scrolls do not reveal the buttons. Two Sparkling visibility cases also failed.
Previous passes do not override these current-head failures.

The next implementation adds complete VideoBasic and VideoAttributes YAML
cases on both platforms: Android 13 and iOS 20 collected cases, including the
three smoke cases. All 17 originally enabled modules now have implementations;
this does not mean that all device cases have passed. ListBase remains disabled.
Complete unchanged Python callback replay gates every action, wait, original
screenshot checkpoint, attribute predicate and one-read speed/count sample.
VideoBasic retains its 20 ordered button actions and inclusive seek versus
exclusive restart/loop bounds. VideoAttributes retains its original negative
speed guard, 2.5-second samples, interval thresholds and tiny-interval count.

As previously approved for strict playback timing, model work and visual
prelocation occur before each closed playback fragment. Standard SDK physical
taps then execute the original actions without intervening model calls.
Ordinary volume, mute and loop setup still uses aiAct. Neither selectors nor
fixture action hooks are used for these interactions. No timing window, media
duration, retry policy or original acceptance is widened. Core wait_for_equal
retains its 10-second, no-sleep/no-final-read contract; video waits retain their
separate polling and diagnostic/final-read semantics. Source screenshots use
case-owned native captures at the original checkpoints. The implementation
passes 165 model-free checks; actual playback and iOS visibility acceptance
remain dependent on the next hosted Android/iOS run.

The older checkpoints below retain their then-current status.

The next timing implementation retains the two strict VideoBoundary fragments
as source-bound native.videoPhase nodes, as approved. Visibility preparation
uses standard aiAct before playback; its public progress stream rejects any
non-scroll action. Both buttons are visually located before the first tap.
The standard SDK Tap path then receives those points with deepLocate disabled,
without DOM selectors, fixture action hooks or model calls between taps.
All original assertions run after the first tap, with source-time screenshots
and a fresh playing read immediately before the second. Failed assertions or
device actions stop the fragment; there are no hidden retries or media changes.
Complete Python replay still verifies all 36 original clicks and every assertion
in order. Pinned SDK task/schema tests verify direct points reach the physical
primitive without model access. Device recovery awaits the next hosted head.

Run 38034582646 completed with Android 10/11 and iOS 16/18. All seven
Sparkling routes passed on iOS (RawOpenLegacy and MalformedCanonicalNoFallback
needed their original retry). CanonicalSparkling passed first attempt.
VideoBoundary and VideoModes timed out in iOS AI actions, while Android
VideoBoundary failed the exact playing assertion and VideoModes passed.
Source builds, report assembly and publication succeeded; this is not a fully
accepted native head. VideoBasic/VideoAttributes remain incomplete.

The next local correction passes 152 model-free checks and typechecking.
Run 38028650562's iOS VideoBoundary grounding cropped a 400-by-400 area at
(163,1374), entirely below the visible gray panel. Its repeated scroll gestures
therefore targeted blank space. VideoModes similarly scrolled outside the
panel. CanonicalSparkling's Open tap hit the upper runtime selector instead;
the screenshot remained on the homepage after keyboard dismissal. These are
action-grounding failures, not evidence of weakened business assertions or
missing video buttons.

iOS video aiAct now uses the SDK's full-frame locator instead of a crop around
the incorrect planning hint. Android retains its existing deepLocate setting;
only the iOS homepage Open action also uses full-frame grounding. The same
source instructions, button counts and all exact assertions remain. A pinned
SDK regression reproduces the old crop and verifies that full-frame search
does not inherit it, without calling a model/device. This proves the search
window correction only; actual corrected iOS actions await the next hosted
head. Current run 38034582646 still validates the preceding phase-only head.

Current pushed head `3c3a435` is being validated in run 38034582646: Android
11 / iOS 18, with 148 passing model-free checks. Previous run 38028650562
passed Android 10/11 and iOS 15/18 after WDA started successfully on rerun.
RawOpenSparkling, RouterOpenClose, MappedLegacyToSparkling,
MalformedCanonicalNoFallback and HotExternalURL passed first attempts;
RawOpenLegacy passed its second attempt. CanonicalSparkling, VideoBoundary
and VideoModes still failed on iOS. These outcomes supersede the historical
pending descriptions below, but do not validate the new action-phase head.

Run 38034582646 has now finished Android with 10/11 passing. VideoModes
passed its first attempt; VideoBoundary failed both attempts. In its second
attempt, the actual SDK dump records the first Tap ending at 1791619349550
and the second Tap starting at 1791619381290: a 31,740 ms gap. The intervening
Plan and Locate tasks take 22,508 ms and 8,473 ms respectively. The original
playing assertion succeeds at the first action, but the fresh read before the
second action sees `ended`. A combined aiAct instruction still plans one Tap
per cycle; it is not equivalent to the original playback-time source switch.
The first attempt also missed the visible Play button and remained `ready`.
These are distinct grounding and execution-latency failures, not proof of a
product playback defect. Do not remove the fresh-state assertion, lengthen
the media, loop playback or use a cached playing value to pass this case.
The exact timed fragments need a separately validated execution strategy;
VideoBasic and VideoAttributes remain incomplete for the same timing reason.

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
