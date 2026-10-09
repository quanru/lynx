# AI E2E for Lynx Explorer (Midscene)

This current-source integration uses Midscene vision models to run
the same YAML cases on Android and iOS. It connects directly through adb or
WebDriverAgent without Appium. CI builds Explorer at the workflow revision with
integration fixtures and Sparkling enabled. Consumers verify the commit and
artifact checksum before installation. Each platform now collects three additive
smoke cases and three original-contract cases (Event, DomFocus, InputInsertText).
DomFocus and InputInsertText have passed on both devices; Event has now passed
on Android but still misses targets on iOS. This is not a replacement for the
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
The standard `aiAct` option `deepLocate: true` is now used only for Event and
Showcase-entry targets, with caching disabled. In SDK 1.13.1, this bypasses the
planning model's direct point and performs a dedicated visual locate instead.
It does not add atomic action nodes, selectors, coordinates or extra Event
clicks. No local model calls were made; this option still needs hosted validation.

The next foundation passes 85 Node checks and eight original-algorithm Python
differential checks. It captures screencast/rectangle diagnostic artifacts after
successful or failed cases and gates source builds on model-free checks.
This is not yet device-verified pixel coverage; see `MIGRATION.md`.

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
- Not covered: pixel-baseline comparison and Espresso white-box access. Keep
  the existing jobs available as an opt-in complement.

### Pages setup fallback

If Pages is unavailable, publication emits a warning and a Summary with the setup
path: Settings → Pages → Build and deployment → Source → GitHub Actions.
It skips deployment without failing the test jobs. Case results and downloadable
native reports remain in the test job Summaries and Actions artifacts.
