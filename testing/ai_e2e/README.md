# AI E2E for Lynx Explorer (Midscene)

## Play Null grounding correction: hosted acceptance pending

Run [38849324914](https://github.com/quanru/lynx/actions/runs/38849324914)
passes VideoAttributes on its first iOS attempt after the standalone Play
description change. VideoBoundary instead fails at step 119: its Play Null
location (603.5,1723.5) lies on Near End in the next row. WDA records the matching
logical tap (201,575), and the original playing assertion rejects `ready`.
The subsequent whole-case retry is interrupted by the overall execution budget.

The Play Null description now identifies its first-row Play/Pause neighbours
and excludes Near End below. It does not correct coordinates programmatically,
change the fixture, add input, or relax any assertion/time budget. Device input
acceptance remains pending. A separate source-inventory check now parses the
original module configuration and checks collected YAML on each platform,
classifying ListBase as disabled and the three Explorer smoke cases as additive.

## Standalone Play target correction: hosted acceptance pending

[Run 38758226681](https://github.com/quanru/lynx/actions/runs/38758226681)
passes Android and 19/20 iOS cases. Both VideoAttributes attempts fail after
preparing Play below its blue button body: screenshot points (344,1673.5) and
(366,1666.5) land at the lower edge/gap instead of the visible button center.
For the second attempt, WDA confirms the SDK-converted physical tap (122,556);
the original assertion correctly rejects the unchanged stopped state.

The standalone Play description now identifies the first playback row, Clear
and Play Null neighbors, and the blue body center rather than its lower edge.
Independent uncached location and coordinate conversion are unchanged; there
is no hard-coded correction, additional input, widened assertion or fixture
change. The correction remains a candidate until remote device execution and
input evidence confirm accuracy. VideoBoundary passes after retry in that run;
the earlier 180-second model timeout does not recur, but this is not a stability
claim.

## Boundary Clear planning candidate: hosted acceptance pending

In [run 38677828053](https://github.com/quanru/lynx/actions/runs/38677828053),
iOS VideoBoundary step 104 exhausted its 180-second action budget after the
Clear tap had already completed. Its SDK trace records approximately 35 seconds
in initial model planning, 97 seconds in independent model location and 1.5
seconds in the tap task; the final planning request was still running at timeout.
This identifies the blocking stage, not the provider-side cause of latency.

Only the 12 ordinary Clear actions now use `effort: balance` with
`deepLocate: false` and caching disabled. With the current default model slot,
SDK 1.15.3 can include location in planning instead of requesting it separately.
The previously ambiguous post-cancellation Clear, all Seek controls and other
actions retain their reviewed deep grounding. No assertion, original wait,
fixture, retry limit or timeout changes. Full device execution and screenshot
input review are required before accepting this candidate; model-free tests
alone cannot establish accuracy or a latency improvement.

## Interval target correction: device acceptance pending

On candidate `daecd3a`, [run 38677828053](https://github.com/quanru/lynx/actions/runs/38677828053)
finishes Android 13/13, but VideoAttributes requires a complete-case retry.
Its first interval preparation returns screenshot point (625,1541) for
`1s Tick`; the actual ADB input (625,1539) hits `Latest` in the row below.
The unchanged source assertion correctly rejects `requestedInterval=0.5`
instead of 1.0, and the observed state includes `mode=latest`. Coordinate
conversion matches the SDK result; this is incorrect visual grounding.

Only the `1s Tick` preparation description now identifies its same-row
neighbors Fill and Invalid 0s and excludes Latest below. Refinement remains
independent and uncached. No input is added, and all original source timing,
assertions, fixtures and playback plans remain unchanged. Model-free checks
do not establish target accuracy: immutable-image comparison and a complete
device case must validate this correction before acceptance.

## Two native input misses: complete hosted acceptance pending

SDK 1.15.3 run [38588125497](https://github.com/quanru/lynx/actions/runs/38588125497)
is green (Android 13/13, iOS 20/20 first attempts), but full-size screenshot and
physical WDA review finds two iOS misses. RawOpenLegacy taps the Bundle URL
heading rather than the already-selected Lynx runtime. VideoBoundary's
zero-based step 49 taps blank space just above Clear. Existing state and
callback containment assertions still allow green results; input acceptance
is withheld. SDK decoding and WDA inputs match the model's incorrect targets.

An immutable-image [remote control](https://github.com/quanru/lynx/actions/runs/38676496013)
tests both original/explicit prompts and full-frame/refined location twice on
each of the two exact locator-input images. All eight runtime trials hit their
target, so that miss is not reproduced. All four Clear full-frame trials miss
below the button; all four refined trials hit. The original refined Clear miss
is not reproduced either. Explicit prompts with refinement hit 4/4 in this
bounded comparison; it does not establish a reliability improvement or replace
complete real-device case acceptance.

Only these two action descriptions change. The Lynx selection now describes
the left segment beneath the Explorer title and excludes the Bundle URL labels,
with fresh independent refinement. The observed Clear action describes the
center of its blue body in the playback row; it retains refinement. No stored
coordinates, extra taps, product/fixture changes, or source assertion/timing
changes. All other actions retain their options. Source callback replay and
new collection regressions preserve the original following assertions.

The audit also verifies every ordinary SDK Tap against actual device logs
(57 Android, 77 iOS), all 18 ordinary Seek target regions, and each platform's
51 ordered physical taps across 12 original timed phases. All 43 prepared
targets and 11 simultaneous visibility groups per platform are checked, with
no extra timed input or model call after the first timed tap. Transport proof
alone does not establish intended-target accuracy. Complete new-head device
validation, physical-input review and report publication remain pending.

## Rome SDK alignment (pending hosted acceptance)

All Midscene packages are pinned to `1.15.3`, matching Rome's
`codex/pr-974-e2e-reference` branch at `d1b3183`. Device jobs use Node.js 24.
`npm run check:model` invokes the official `midscene-test model verify` checks
for text, image understanding and AI location, filtering credential-bearing
failure diagnostics before printing them. CI retains the independent image-only
gate and runs official verification before starting the emulator or WDA.
Model credentials are step-scoped to verification and case execution, with
repository variables preferred over same-named non-key secrets. Existing
repository-secret configuration remains supported; no new environment is required.

Case-owned device sessions, deterministic source assertions and playback timing
are unchanged. Keep the screenshot Summary, combined native HTML report,
publication guards and model-free contract checks: Rome's single Web report does
not replace these cross-platform requirements. Historical results below describe
the previous SDK and are not acceptance of this upgrade. The last accepted
native head was `a47143b`, with Android 13/13 and iOS 20/20 first-attempt passes
in [38332110055](https://github.com/quanru/lynx/actions/runs/38332110055).


Current local implementation collects Android 13 / iOS 20 cases and passes 213
model-free checks on Node 22, plus typechecking and
workflow validation.

Head `0f9b58d`, [run 38321539093](https://github.com/quanru/lynx/actions/runs/38321539093),
finishes Android 13/13 and iOS 20/20, each with one complete-case retry. All
publication jobs succeed; all 33 linked previews load and 36 image/HTML URLs
return HTTP 200. This is not complete input acceptance: the iOS VideoBoundary
trace targets Seek Huge when asked for Seek Inf, and the identical original
error assertions hide the wrong input. HotExternalURL
captures a structured root `/elements` 404 `stale element reference`, then
passes its role assertion in 3,704 ms inside the original 15-second deadline.
All seven Sparkling cases pass first attempts.

The approved fixture-only follow-up splits the ten seek controls into two rows
of five, overriding minimum width and spacing only for those buttons. The
player geometry, labels, test tags, handlers, input parameters, media and
original Python tests are unchanged. Public visual prompts now match complete
labels with independent refinement, removing clipped-text and ordinal guesses.
The page appearance changes; this is not an unchanged-fixture claim or proof
that the model can read the old clipped layout. Both native platforms require
fresh complete-case validation and actual input/screenshot audits, including
joint visibility of prepared controls before timed fragments. No model work or
scrolling is added during playback. This also retains the source polling-window
correction below and always uploads WDA logs, including successful jobs with a
failed first attempt. No additional player implementation is changed.

VideoAttributes' first interval preparation locates Seek 0s inside Near End;
the retry locates the first button and passes all 49 steps. The subsequent
paused-state timeout is not fully explained by the retained evidence because
the old workflow skipped WDA upload after the retry passed. Immutable-screenshot
control [38327440910](https://github.com/quanru/lynx/actions/runs/38327440910)
hits 8/8 marked regions with both the exact baseline and first-button anchor.
This checks the candidate on both actual images; it does not establish a
statistical reliability improvement or replace current-head device acceptance.

At head `160e97e`, [run 38307906560](https://github.com/quanru/lynx/actions/runs/38307906560)
passes Android 13/13 on first attempts and iOS 19/20. All eight platform video
cases pass their complete first attempts. Actual screenshots and action traces
confirm one correct tap for each of the fourteen crowded seek actions; all
original assertions and timing remain. HotExternalURL fails both iOS attempts
with HTTP 404 while observing the canonical destination; its preceding AI
alert action succeeds with one physical tap. MalformedCanonicalNoFallback
passes after one complete retry. Contracts, source builds, report assembly
and Pages pass. The Summary has 33 loaded linked previews, one failure first,
and 32 passes collapsed; all 36 public image/report URLs return HTTP 200.

The follow-up recognizes structured stale/missing-element failures during
WDA root-result serialization as incomplete observations, just like later
element reads. It re-observes native and CDP identities inside the original
deadline. Invalid sessions, unrelated HTTP 404s, HTTP 500s and malformed errors
still fail. No action, assertion, fixture, deadline or product source changes.
Regression tests first fail on the old handler, then pass with fresh identity
binding; all 205 model-free checks and typechecking pass. Failed reads log only
the endpoint, HTTP status and protocol error code, never request bodies or the
full SDK error. Complete new-head device acceptance remains pending.

[Focused AI-action control 38319752085](https://github.com/quanru/lynx/actions/runs/38319752085)
passes both baseline trials and one candidate trial. The other candidate trial
fails a capability observation: its root query takes 2,508 ms against the
then-migrated hard two-second binding limit. The subsequent unchanged original Appium
case also fails its homepage readiness assertion. These are separate failures,
not evidence for widening either deadline. No root stale/missing response is
captured in this comparison or the four passing native-alert trials; neither
experiment exercises the recovery branch or proves the main failure fixed.

Follow-up control [38323535786, attempt 2](https://github.com/quanru/lynx/actions/runs/38323535786)
passes all four SDK trials and the unchanged original HotExternalURL. Its
third trial captures POST /elements HTTP 404 `stale element reference` when
WDA loses the second root identity. A fresh root observation then completes
the original role assertion in 3,552 ms inside its existing 15-second limit.
This exercises the narrow root recovery on a real simulator. All 162 installed
app files match the earlier original control; source checksums are unchanged.
Artifact `11780937449` passes CRC verification. Attempt 1 only failed WDA
startup, before any case ran. The old main-run 404 had no structured payload;
this reproduces its observed native race pattern, not the missing old response.

A separate source-function differential establishes the capability timeout
divergence: the original `wait_for_visible_view(timeout=2)` accepts a valid
observation that started inside the polling window and completes after 2,508 ms;
the migrated hard deadline rejects it. The local follow-up preserves the
two-second window for starting another observation while allowing an in-flight
one to complete inside the existing 15-second capability assertion deadline.
It still proves the full native/CDP identity and all original values, never
starts another observation after the polling window, and never extends the
outer assertion deadline. Other observations keep their existing hard limits.
All 209 model-free checks, typechecking and workflow validation pass. This
follow-up is not yet on the main PR or device-accepted; run 38321539093 still
validates the separate root-query fix at `0f9b58d`.
Both source-window device trials pass, but their capability reads remain
under two seconds; they do not reproduce the controlled timing discrepancy.

Complete VideoBasic and VideoAttributes cases preserve
every original operation, wait, screenshot, predicate and speed/count sample.
Approved playback-sensitive fragments visually prelocate buttons before
playback, then use public device input primitives without intervening model calls
or automatic SDK screenshots. Each point is converted once using the exact
public UI context used for its visual location; original source captures remain;
ordinary volume/mute/loop setup remains aiAct. Original timing and acceptance
are unchanged. All 17 originally enabled native modules have implementations;
the original disabled ListBase stays disabled. This is not device acceptance.

Each playback fragment now splits visibility preparation and each visual
location into separate model-only runner steps. Grounding is case/attempt-owned,
ordered and consumed once; playback cannot use incomplete or released points.
Fragments split only at the original ready/paused/stopped boundaries. Every
original operation remains in order, and speed samples remain in one fragment.
The runner's 180-second step limit and original assertion windows are unchanged.
The unchanged original Appium control reproduced Android's early seek-success
callback. The approved minimal Android fix now waits for player acknowledgement
in serial modes and preserves source-change cancellation and direct mode.
Hosted regression checks cover request completion, cancellation, stale callbacks
and queue/latest/direct behavior. All five Robolectric tests passed in
[38274270887](https://github.com/quanru/lynx/actions/runs/38274270887), after
correcting the abstract/detached LynxContext test fixture. CI retains their
XML/HTML results even if the source build fails. The unchanged original
VideoBoundary also passes in [38279593401](https://github.com/quanru/lynx/actions/runs/38279593401)
against the `907fe44` APK from source-build run 38275815434. Its original test
files remain checksum-identical and the installed APK payload is verified.
This validates the original Android case, not the migrated Midscene suite.
Static hosted screenshot controls also reproduce deep refinement selecting the
wrong crowded seek button. Timed seek preparation now preserves the full row
for visual location, without stored target coordinates or weaker assertions.
Other button locations retain deep refinement; ordinary actions remain aiAct.
Ordinary `aiAct` uses `effort: deepThink, cacheable: false`, without extra
coordinate-conversion context. Small video controls on both platforms and the
iOS Event inline-text target enable independent deep refinement. Homepage
actions, other core actions and the crowded Seek 2s / Seek Null controls retain full-frame
location. In SDK 1.13.1,
deep-think separates planning from visual location; balanced planning with only
deepLocate disabled would instead reuse the planner's inline point. A public
SDK regression verifies the full-frame path's two separate requests and
uncropped locate image.
Baseline `3c3c192` [run 38293483556](https://github.com/quanru/lynx/actions/runs/38293483556)
finishes Android 12/13 and iOS 19/20, with no unrun cases. Every other case,
including complete VideoAttributes, VideoBasic and VideoModes, passes its first
attempt. Only VideoBoundary fails on both platforms, so this is not complete
current-head acceptance. iOS times out twice in its Seek Bad action.
Boundary's first attempt scrolls for Seek Null even though the seek row is
visible: the fixed-width label is clipped. The second attempt's Seek Bad
point lands on Near End, and the unchanged callback assertion rejects seek_ok.
The follow-up describes seven crowded controls through per-platform prompt
variables in `video-boundary-prompts.ts`. Android uses source-defined order;
iOS Bad/Null/Text/NaN use the local text that actually remains visible. It
retains refinement except for Seek Null, without changing the original 36
clicks, waits, error messages or callback checks. These are ordinary public
aiAct nodes, not custom actions or stored device coordinates.
[Control 38300403813](https://github.com/quanru/lynx/actions/runs/38300403813)
uses the actual failure images and complete inert Android schema. Seek Bad's
candidate hits 2/2 refined trials and 1/2 full-frame trials; Seek Null hits
2/2 full-frame trials and 1/2 refined trials. These small static samples are
not device acceptance. All 202 model-free checks and typechecking pass; the
follow-up requires its own hosted run.

Expanded inert control [38304552723](https://github.com/quanru/lynx/actions/runs/38304552723)
hits 14/14 Android regions but rejects the original shared iOS descriptions
(7/16). Full-frame comparison also hits 7/16. Visible local anchors in
[38306040423](https://github.com/quanru/lynx/actions/runs/38306040423) recover
Bad (8/8) and Null (4/4). The right-side anchor candidate in
[38306686449](https://github.com/quanru/lynx/actions/runs/38306686449) refines
Text correctly in 3/4 trials and NaN in 4/4 across two failed images. The miss
is retained, not treated as success. This best-measured prompt candidate still
requires a complete new device run; static controls are not acceptance.

Earlier diagnostic evidence:
[alternating control 38286576224](https://github.com/quanru/lynx/actions/runs/38286576224)
misses Latest's marked blue body in five full-frame trials and hits it in all
five independently refined trials, with identical images/prompts/full schemas.
Previous current-source run [38284421384](https://github.com/quanru/lynx/actions/runs/38284421384)
completed Android 9/13 and iOS 16/20, with no unrun cases. Android has three
provider-RPM failures and one misgrounded burst button. iOS fails Event,
VideoAttributes, VideoBoundary and VideoModes; all Sparkling routes and the
complete second VideoBasic attempt pass. The exact failures remain failures.
In [control 38292801372](https://github.com/quanru/lynx/actions/runs/38292801372),
independent refinement recovers the iOS inline-text/volume/mute/source/loop
targets missed by full-frame location on the same failed images. Earlier iOS
refinement missed homepage Open, so navigation is not switched. VideoModes
now describes Seek 2s by its second position and neighbors in the crowded row;
scrolling cannot unclip its fixed-width text. The operation remains one aiAct
click, with unchanged ordered source assertions. No target coordinates,
original waits, fixtures or product implementations change in this follow-up.
Credentialed Android/iOS jobs share one run-local CI slot; source builds still
run in parallel. Provider retries use two retries and 30-second backoff inside
the unchanged step deadline. An inert public-SDK regression verifies that step
cancellation interrupts the backoff without sending another request or input.
Other repositories sharing this endpoint still need adequate RPM capacity or
separate endpoints; this is not a cross-repository quota reservation.
Full iOS action-space control [38279235964](https://github.com/quanru/lynx/actions/runs/38279235964)
locates URL input, Seek 2s and Open correctly in two trials each. Src Bad first
requests Scroll, which a static first-action control cannot evaluate. Earlier
Tap-only controls did not generalize to full action schemas. These samples
establish a grounding-path correction, not complete device acceptance; original
assertions, action counts and timing remain unchanged.
No example page or baseline has been changed. The
approved iOS-video-only viewport exception omits fixed physical width/height
so existing Explorer uses its actual view bounds. Android video and every
pixel/API fixture retain the original launch geometry. Video source operations,
assertions and screenshots remain; remote screenshots must verify visibility.

The checkpoints below are historical and retain their then-current status.

Run 38056035286 (`7446d29`) completed with both device jobs cancelled at their
60-minute job limits. Android video phases reached the 180-second step limit;
iOS video controls were not visible after scrolling. Late work also accessed
destroyed devices. Cancellation guards and split preparation address migration
issues, but only a new hosted run can establish recovery.

The CI report correction starts the pinned
Midscene CLI directly, interrupts at 105 minutes and permits a bounded four-minute
report-finalization grace period within a 120-minute job budget. Assertions,
step deadlines, retries and device concurrency remain unchanged. An actual
model-free CLI test proves that direct SIGINT writes a failed total report and
marks a later case not-run; interrupted execution can never return success.
Both corrections are included in hosted head `3b592b6`, run 38137942374.
Its model-free gate, source builds and reporting passed; devices finished
Android 11/13 and iOS 15/20. The full current-run HTML report was published and
returned HTTP 200. This is not device acceptance. The preceding `f3973b6` run
38136008306 does not include these corrections and was superseded before
device acceptance.

Current-run screenshots and action records prove that the iOS Play and Mute
points fell into background gaps below their buttons. A VideoModes Clear point
also missed the button, leaving earlier callback entries in the log. Video
actions now use standard SDK deep location; preparation still precedes playback,
and the timed physical Tap path retains deepLocate=false with no model calls.
Homepage Open uses deep location and distinguishes the smaller lower Open
button from the wider upper selected runtime control. The public agent option
waitAfterAction=0 removes the SDK's added 300ms after each action: Android's
object-fit fragment otherwise reached its original Pause after the ten-second
clip ended. Original source sleeps, assertions, media, screenshots and tap
counts remain unchanged. These corrections pass 184 model-free checks but
require a new hosted run. Android Seek Empty still needs an unchanged original
case on the same device/environment before attributing it to product behavior.

The preceding hosted run 38039839927 (`658bc76`) passed Android 10/11 and
iOS 14/18, with successful source builds and reporting. Android VideoBoundary
failed a later callback/CDP check; iOS video preparation and two Sparkling
visibility cases failed. These failures remain unresolved until new device
evidence proves recovery. See [MIGRATION.md](./MIGRATION.md).

The checkpoints below are historical and retain their then-current status.

Latest local correction: Android 11 / iOS 18, 148 passing model-free checks
and typechecking. VideoBoundary now groups its two playback-sensitive click
pairs into standard aiAct phases with read-only progress-time assertions and
fresh playback checks before the second tap. Original 36 taps, all payload
assertions and thresholds remain; action-time JPEG evidence is reported.
This is not device acceptance. Pushed head `69d8919` run 38028650562 passed
Android 10/11; the first Play completed while the 10-second clip was playing,
but AI replanning returned after it ended. iOS attempt 1 never reached cases
because WDA startup timed out. Its same-head attempt 2 has started WDA and is
now executing cases. Do not replace original timing contracts with visual
judgments or cached-state success; see MIGRATION.md for the exact boundary.

This current-source integration uses Midscene vision models to run
the same YAML cases on Android and iOS. It connects directly through adb or
WebDriverAgent without Appium. CI builds Explorer at the workflow revision with
integration fixtures and Sparkling enabled. Consumers verify the commit and
artifact checksum before installation. Each platform now collects three additive
smoke cases and six original-contract cases, including three pixel contracts.
The local extension additionally collects all seven original Sparkling cases on
iOS and VideoModes on both platforms: Android 10 / iOS 17. Run 38024427888
passed Android 10/10 (one Event retry), but iOS passed 14/17. All three
previously failing iOS pixel cases passed first attempts with unchanged PNGs,
crop and thresholds after selecting the original toolchain/device environment.
RawOpenSparkling, RouterOpenClose and VideoModes failed; this is not full
cross-platform acceptance. Reports and Pages published successfully.
The next local extension adds VideoBoundary on both platforms: Android 11 /
iOS 18. All 136 model-free Node 22 checks and typechecking pass. VideoBoundary
retains all 36 original button actions, three fixed sleeps, count/occurrence
assertions, immediate negative checks and platform-specific bridge errors.
Combined cancellation actions remain one original button click, not a sequence
of AI-paced operations. Original Python run/helpers are replayed in full and
visible button labels are read from the unchanged fixture AST. Unicode count
parsing is checked against the original Python regex/int; duplicate callbacks
fail immediately. This addition is not yet device accepted.
Failed-run screenshot/action records show the Open action landed in the upper
runtime selector instead of the lower card button, and video scrolling landed
in white space below the small left-hand fixture. RouterClose's first attempt
actually returned to the parent, but the model then rejected the disappeared
Close button. Action intents now distinguish the lower Open card, constrain
scrolling to the actual gray panel, and describe parent return as the successful
end state after exactly one Close tap. No coordinates, selectors, additional
taps, timeout extensions or weakened assertions are introduced. Model-free
source replay checks the original assertions/action counts; hosted rerun must
establish whether these intent corrections resolve the device failures.
Native run 38021364503 passed Android 9/9 on first attempts and iOS 6/9;
reports and Pages published. Independent WDA view rectangles agree exactly with
CDP capture rectangles. Replaying unchanged original driver/helper AST using
those actual WDA rectangles produces identical pixels and original rejections.
The run log exposes an environment mismatch: hosted defaults selected Xcode
16.4 / iOS 18.5, whereas upstream baseline update `dfa91d8f` explicitly moved
to Xcode 26.3 / iPhone 17. Both build and execution now select Xcode 26.3,
require simulator SDK 26.2 and exactly one available iPhone 17; build provenance
records and verifies these actual toolchain versions. Missing tools/devices fail
instead of falling back. No baseline or threshold is changed. Whether this
alignment resolves all three pixel failures is now proven by run 38024427888.
Event, DomFocus and InputInsertText have passed on both platforms. TextEvent
passed Android in run 38016020854, but its iOS pixel baseline failed at the
unchanged 1% threshold. Image and LayoutLinear await device validation.
This is not a replacement for the
remaining original integration suites.
The current-source baseline at PR head `3cf1da2` passed both source builds and
Android 3/3 plus iOS 3/3, including report/Pages publication:
https://github.com/quanru/lynx/actions/runs/37924452915.
The next read-only DevTool transport/DOM prerequisite is not covered by that run.

## Structure

```text
testing/ai_e2e/
├── midscene.config.ts        # android-explorer and ios-explorer projects
├── cases/native/explorer.yaml
├── smoke-android.ts / smoke-ios.ts   # Model-free connection checks
├── scripts/
│   ├── preflight-model.sh           # Image-only visual capability check
│   ├── start-android-emulator.sh    # Create and start a headless AVD on Linux CI
│   └── start-wda.sh                 # Build and keep WDA v16.9.3 running on macOS
└── package.json
```

The companion workflow is `.github/workflows/midscene-ai-e2e.yml`. It
coexists with the existing Appium jobs in `ci.yml` and does not replace them.

After case execution, `scripts/devtool-probe.mjs` checks the
app's existing PeerTalk TCP transport: runtime registration and nonempty Lynx
session discovery, followed by `DOM.getDocument` for the newest registered session.
Plain and zlib-compressed DOM roots are decoded without model interpretation.
Android uses an explicitly owned ADB forward; iOS Simulator
connects directly. The socket has a bounded deadline and is always destroyed.
The probe does not navigate, focus, insert text or replace original assertions.
Its log is archived with the report, and failure is infrastructure failure even
when the smoke cases pass. Hosted run `9088c66`
passed Android 3/3 and iOS 3/3 on the first attempt, then exposed a server-direction framing
error in the probe. The native DebugRouter writer uses JSON length + 20 for its
outer length, unlike the client's JSON length + 4. The decoder now accepts both
documented conventions while rejecting other lengths. An independent server
frame reproduces rejection in the pushed decoder and passes in the fixed one.
Run 37933030865 at `6c68bfd` verified the fix on iOS, including the handshake,
three-session discovery and nonempty `DOM.getDocument`. Android and publication
stopped on a separate 30ms wall-clock unit-test race before device/probe execution.
Pushed head `4226954` replaces that race with controlled timer advancement after
real socket delivery, retaining assertions and production timeouts. Run
37937713083 passed both builds and all 76 model-free checks. Both platforms
finished 5/6: DomFocus, InputInsertText and three smoke cases passed on their
first attempts; Event failed localization in both attempts. Report assembly and
Pages publication succeeded, and correctly retain the failed status. Raw model
points and screenshots show clicks outside the intended buttons, not failed
transport or relaxed assertions. The next correction describes visible targets
and supplies active-coordinate-protocol guidance, without hardcoded coordinates.

Run 37943332119 at `04b3d75` passed both source builds and the model-free gate.
Android passed all three original modules on their first attempts, including
the Event correction. Its overall result is still 5/6 because the Showcase smoke
clicked Session History instead of the Showcases card. Both failed attempts used
normalized `[500, 700]`, producing actual `[540, 1680]` taps on recent test
bundles; screenshots confirm the intended card is above those rows. The local
smoke goal now names the visible card relationships and requires the actual
category-list destination. This correction is not device-verified yet. Android
captured a 1080x2400 screencast and physical rectangle `(0, 210, 1080, 1664)`;
the crop matches the original view dimensions, not a pixel-baseline pass. iOS
finished 3/6: DomFocus, InputInsertText and the home smoke passed; Event and both
Showcase navigation cases failed. Report assembly and Pages publication passed.
At that historical checkpoint, the standard `aiAct` option `deepLocate: true`
was enabled for Event and Showcase-entry targets, with caching disabled.
With balanced planning in SDK 1.13.1, this refines a crop around the planner's
inline point; it does not provide independent full-frame localization. Later
controls above expose the resulting wrong-crop failure and supersede that path.
It does not add atomic action nodes, selectors, coordinates or extra Event
clicks. No local model calls were made. Run 37948887444 at `3ebd94d` then passed
both source builds, Android 6/6, iOS 6/6 and Pages. All 12 cases passed first
attempt, with 12 linked screenshots and all 15 public image/report URLs HTTP 200.

The next foundation passes 85 Node checks and eight original-algorithm Python
differential checks. It captures screencast/rectangle diagnostic artifacts after
successful or failed cases and gates source builds on model-free checks.
This is not yet device-verified pixel coverage; see `MIGRATION.md`.

The next batch adds `core/TextEvent` on both platforms (seven cases each).
It retains the original three-second wait, `flatten-text` element geometry,
`text_flattern_element.png` baseline and three-second exact `get_by_text`
existence check. `native.pixels` is a deterministic original-contract assertion,
not a custom UI action. It captures the bound fixture's JPEG stream and uses the
original Python coordinate arithmetic, iOS scaling, cubic crop/resize and
grayscale mismatch thresholds. It never rewrites baselines. Failures retain
frame, geometry, actual crop and baseline under `midscene_run/native-pixels/`.
Local validation: 91 Node checks, ten original-algorithm Python checks, one real
JPEG/evidence bridge check, typechecking and actionlint pass. An offline check
against the unmodified public driver classes also matches 2,000 randomized
geometries. This batch still requires Android/iOS execution before acceptance.

The following local batch also implements original Image and LayoutLinear
pixel contracts (nine cases per platform). These tag-free source fixtures bind
their complete original text markers to one session; the examples themselves
are unchanged. Full-view checks retain the original second crop and cubic
resize, including integer truncation after the initial rounded view capture.
Both use unchanged platform baselines and are not device-verified yet.
Source runner inspection also found two pixel prerequisites: the two-second
post-open readiness window and Android system density 320. They are retained
in this batch, separately from page URL scaling. Active density is checked
after setting it; physical density 320 cannot mask a different override.
Local validation now passes 124 Node checks, ten comparator/crop/geometry checks,
three JPEG bridge checks, typechecking, actionlint and the offline 2,000-case
geometry differential. Disabled ListBase remains disabled.

`native-wda.ts` prepares the read-only visibility binding required by Sparkling.
It attaches only to an explicitly owned WDA session, scopes anchor searches to
displayed LynxViews and preserves the original anchor priority and text sources.
Duplicate displayed input types remain observable; malformed responses fail.
Requests share a bounded deadline, including response-body decoding. It exposes
no action or session-management methods. Five HTTP/source-parity tests cover
these boundaries, including the public case-owned device adapter without SDK
private fields. It is now wired into seven local Sparkling cases; none has
device acceptance yet.

`native-visible-geometry.ts` also preserves the original WDA-point coordinate
normalization and Python two-decimal rounding, separately from physical pixel
capture coordinates. All 2,000 optional unchanged-public-driver geometry
comparisons pass; 2,005 rectangle-correspondence comparisons match the original
Sparkling helper, including tolerance boundaries. These are binding prerequisites,
not device acceptance or additional cases.

Current-source run 38018791030 at `c4498d4` completed with Android 9/9
(Event retried once) and iOS 6/9. Image and LayoutLinear passed first attempt
on Android; iOS captures are 720×906 while both unchanged baselines are
720×876. TextEvent retains its previously reproduced 0.01277078965758211
mismatch. Reports and Pages published despite these failures.
The next head archives displayed WDA view frames in `geometry.json` alongside
the CDP capture rectangle through the case-owned device's public SDK read API.
This diagnostic does not select a session, crop to baseline dimensions or
change comparisons. It distinguishes native-view versus CDP rectangle drift
from a changed environment; no root cause is inferred from dimensions alone.

The next local `native-visible-session.ts` foundation correlates a displayed
native view with exactly one DevTool session using unique requested/anchor tags,
untrimmed original text and original native-point frame matching. A regression
keeps an older, larger-ID parent alive at the same frame and still binds the
displayed child; duplicate/ambiguous bindings, malformed DOM, transport errors
and late responses fail. Three checks pass. Full-view replay of both captured iOS failures through unchanged
driver/helper AST produces identical images and the same size rejection when
given the same capture rectangle; WDA-frame equivalence is not yet established.

`cases/ios-sparkling/homepage-routes.yaml` adds four original iOS-only flows:
RawOpenLegacy, RawOpenSparkling, CanonicalSparkling and MappedLegacyToSparkling.
Together with RouterOpenClose, MalformedCanonicalNoFallback and HotExternalURL,
local SDK collection is Android 9 / iOS 16. Explorer restarts once per attempt;
the real homepage is not opened a second time or bypassed with a deep link.
Standard `aiAct` selects the visible runtime, replaces the exact original URL
and taps Open. Original restart/pre-case readiness totals ten seconds (3+5+2).
`native.sparkling` retains exact route/capability checks, nonempty/forbidden
values, one displayed native XElement text field and all seven mapped options.
Homepage and legacy parent handles remain on their original session across
rerenders; subsequent routing phases explicitly re-observe the visible page.
Sockets close before devices; released attempts/project teardown cannot reopen
sessions. Original Python run functions and helper predicates are replayed for
source parity, with no device, AI or model credentials. This local batch is not
pushed while run 38021364503 remains active and is not accepted coverage.

The router flow retains distinct child IDs, `returned:ok` and restoration of
the exact remembered parent ID. Malformed routes retain `missing_target`, the
original route-result text and the original parent ID (no legacy fallback).
Alert acknowledgment is an ordinary `aiAct` tap, followed by strict native
absence evidence: only WDA's structured HTTP 404 `no such alert` is absence;
network/malformed/500/late responses cannot pass. Hot external routing uses
the original registered URL and explicit Explorer bundle through WDA `/url`.
Unlike the generic SDK URL helper, it cannot fall back to Safari or restart the
app. Original Python case functions and external-route helper are replayed for
ordered assertion/payload parity; actual device acceptance remains pending.

`native-dom.ts` and `native-expectation.ts` implement the next exact-contract batch:
test-tag pre-order selection, untrimmed native text/input values and exact inline
attributes follow the original Python driver. Immediate checks (`timeoutMs: 0`)
do not retry; polling checks default to the original ten-second deadline.
Malformed DOM, transport failures and late matching responses cannot pass.
`native.expect` retains these exact checks; `native.cdp` sends the original
`DOM.focus` and `Input.insertText` methods without retries. These methods are the
API under test, not substitutes for ordinary user actions. Ordinary Event clicks
use `aiAct`. Standard `launch` opens the original bundles with original platform
scaling parameters. Each case owns its connection and binds the fixture by its
original test tags, never by the newest session ID. Lost identity, ambiguous
sessions and protocol errors fail; teardown closes native sockets before devices.
The batch does not count as migrated until actual Android and iOS reports pass.

Smoke YAML uses only standard Midscene nodes; exact-contract YAML also uses the
two deterministic nodes above. On first agent acquisition
for each case, setup terminates and relaunches Explorer; repeated nodes reuse
that case's agent without relaunching. `aiWaitFor` handles visible readiness.
The complete native inventory and required exact contracts are tracked in
[`MIGRATION.md`](./MIGRATION.md).
The existing visual assertions are unchanged, and original Appium/pixel tests
remain separate. The lifecycle regression tests also verify cleanup after a
launch failure, without requiring devices or model credentials.

Before starting an emulator or WDA, preflight verifies an image-only OCR
challenge. A text reply or HTTP 200 does not establish screenshot-reading
capability. The historical DeepSeek 0731 path treated image data as base64 text
and could invent visual observations; use a vision-capable model and inspect
the actual response model version, not only the configured endpoint ID.

## Required repository configuration

| Type | Name | Description |
| --- | --- | --- |
| Secret | `MIDSCENE_MODEL_API_KEY` | API key for an OpenAI-compatible multimodal model |
| Secret | `MIDSCENE_MODEL_NAME` | Model name |
| Secret | `MIDSCENE_MODEL_BASE_URL` | Endpoint such as `https://host/v1` |
| Secret | `MIDSCENE_MODEL_FAMILY` | Model family, such as `qwen3` or `doubao-seed` |
| Secret | `MIDSCENE_MODEL_REASONING_ENABLED` | Optional reasoning toggle |
| Variable | `MIDSCENE_PAGES_BRANCH` | Optional override. Publication defaults to the repository default branch (`develop` upstream). |

Configure secrets in the destination repository; merging a fork PR does not copy
its secrets. Before the first run, a repository administrator must enable
Settings → Pages → Build and deployment → **GitHub Actions**. A normal
`GITHUB_TOKEN` cannot enable Pages for the first time. Allow the default branch
in the `github-pages` environment, plus same-repository PR refs if PR publication
is wanted. Repository rules must allow the workflow to update
`midscene-pages-archive`. The workflow declares `contents: write`, `pages: write`,
and `id-token: write` for publication and reports a setup warning when Pages is
not configured. No extra variable is needed to publish after merging to `develop`.
When publication is unavailable, the publication job still lists individual
cases, with failures first and passed cases in a collapsed appendix. Screenshots
are marked `Not published`; artifact links lead to the run's download list,
not to an online HTML report. This fallback does not establish Pages acceptance.

The model-free build matrix synchronizes pinned public dependencies and builds
an x86_64 Android debug APK and an iOS simulator app. Both include the original
integration pages and Sparkling. Each artifact includes `build.json` with the
workflow commit, platform, capabilities, and SHA-256 checksum. Device jobs fail
closed if provenance does not match. Source changes also trigger the workflow.
The smoke targets the current homepage's "Open" and "Lynx Showcases" entries;
release 4.1.0 used different labels.

## Run locally

Node.js 22 or later is required. Python 3 is needed only for the model-free
source-contract tests: they parse the original Python AST without importing
Appium or executing the original runner.

```bash
cd testing/ai_e2e
npm ci
# Run this block in Bash. Keep credentials in this process environment only.
set +x
read -r -p "Model base URL: " MIDSCENE_MODEL_BASE_URL
read -r -p "Model name: " MIDSCENE_MODEL_NAME
read -r -p "Model family: " MIDSCENE_MODEL_FAMILY
read -r -s -p "Model API key (hidden): " MIDSCENE_MODEL_API_KEY
printf '\n'
export MIDSCENE_MODEL_BASE_URL MIDSCENE_MODEL_NAME MIDSCENE_MODEL_FAMILY MIDSCENE_MODEL_API_KEY

# Android: start an emulator and install Explorer first.
adb install -r LynxExplorer.apk
npm run smoke:android      # Optional model-free adb connection check.
adb forward --no-rebind tcp:18901 tcp:8901 # Required for native contract cases.
npm test -- --project android-explorer
adb forward --remove tcp:18901 # Remove only the forward created above.

# iOS: install the app and keep WDA running on port 8100. The script selects
# the newest available iPhone simulator dynamically.
bash scripts/start-wda.sh  # Prints "using simulator UDID: ..."
xcrun simctl install <UDID> /path/to/LynxExplorer.app
npm run smoke:ios
npm test -- --project ios-explorer
```

Never write API keys to `.env` files, shell startup files, command arguments or
logs. A credential manager may instead inject the key directly into the process
environment. Keep shell tracing disabled; when finished, run
`unset MIDSCENE_MODEL_API_KEY` and close the credential-bearing shell.

HTML reports are written to `midscene_run/report/`. CI uploads the native
reports as platform-specific artifacts and as a combined bundle. The final
report job publishes the HTML reports and per-case node screenshots to GitHub
Pages. Android and iOS write only result counts and artifact access to Summary,
without duplicate case tables or empty screenshot columns.
After deployment succeeds, the publishing job adds a Summary with
platform totals, durations, failure details, and linked screenshots. Each
screenshot and explicit Report link opens the corresponding case report or
report step; the Case column is plain text. Setup failures use the expected-case
inventory to emit failure rows and diagnostic report links even when no test
case started. If no screenshot was captured, the row explains its absence
instead of presenting a fabricated image. The
publishing summary's HTML link opens Midscene Test's merged report index for
both platforms. Published reports use
`runs/<run-id>-<attempt>/` paths and are retained on the
`midscene-pages-archive` branch as a full archive. The online Pages deployment
is a separate, bounded copy with a 900 MB (900,000,000-byte) budget, including
conservative archive-upload overhead. It must retain the current run, then
prefers the newest complete prior run and newer whole runs that fit. If the
current run alone exceeds the budget, staging fails without changing the
archive. Old Summary URLs are therefore not guaranteed to remain online.
The deployed `history-manifest.json` records retained and omitted runs and links
to their recovery paths on the archive branch; omitted runs are not deleted
from that full archive. Pages publication is allowed for same-repository pull
requests. External-fork pull requests run a model-free type and report-contract
check, but the credentialed Android/iOS jobs remain excluded. Maintainers
should run the device jobs from a trusted same-repository branch before relying
on them for an upstream pull request; never remove the credential guard to run
untrusted fork code.

## Case-writing guidelines

- Use `aiAct` for visible user interactions. Describe the user goal instead of
  decomposing it into `aiTap`, `aiScroll`, or other atomic AI operations.
- Use `aiAssert` for visual outcomes and semantic UI state.
- Preserve original exact assertions with `native.expect`, and protocol methods
  under test with `native.cdp`. Do not replace them with visual approximations.
- Keep per-case termination and launch in the agent provider, and use `aiWaitFor`
  for visible readiness. No custom `explorer.open` node is required.

## Differences from the Appium suite

- Removed from this path: the Appium server, Espresso/XCUITest drivers,
  Espresso resigning, the `lynx-e2e-appium` Python framework, and white-box
  Python-driver execution. Deterministic CDP test-tag reads remain where original
  acceptance requires exact native values.
- Retained: Explorer artifacts, the simulator matrix, and WebDriverAgent,
  which Midscene iOS uses directly.
- TextEvent, Image and LayoutLinear pixel contracts passed both platforms with
  unchanged baselines in run 38024427888. Current video and route failures are
  tracked separately in MIGRATION.md. Espresso white-box access remains
  uncovered. Keep the
  existing jobs available as an opt-in complement.

### Pages setup fallback

If Pages is unavailable, publication emits a warning and a Summary with the setup
path: Settings → Pages → Build and deployment → Source → GitHub Actions.
It skips deployment without failing the test jobs. Case results and downloadable
native reports remain in the test job Summaries and Actions artifacts.
