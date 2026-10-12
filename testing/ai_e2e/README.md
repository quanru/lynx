# AI E2E for Lynx Explorer (Midscene)

Current implementation collects Android 13 / iOS 20 cases and passes 202
model-free checks on Node 22, plus typechecking and
workflow validation. Complete VideoBasic and VideoAttributes cases preserve
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
cp .env.example .env       # Add model credentials; do not commit this file.
set -a && source .env && set +a

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

HTML reports are written to `midscene_run/report/`. CI uploads the native
reports as platform-specific artifacts and as a combined bundle. The final
report job publishes the HTML reports and per-case node screenshots to GitHub
Pages. Android and iOS write only result counts and artifact access to Summary,
without duplicate case tables or empty screenshot columns.
After deployment succeeds, the publishing job adds a Summary with
platform totals, durations, failure details, and linked screenshots. Each
screenshot and case name opens the exact step in its platform report. The
publishing summary's HTML link opens Midscene Test's merged report index for
both platforms. Published reports use
`runs/<run-id>-<attempt>/` paths and are retained on the
`midscene-pages-archive` branch so later Pages deployments do not replace old
Summary targets. Pages publication is allowed for same-repository pull
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
