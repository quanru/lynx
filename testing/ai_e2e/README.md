# AI E2E for Lynx Explorer (Midscene)

This current-source smoke uses Midscene vision models to run
the same YAML cases on Android and iOS. It connects directly through adb or
WebDriverAgent without Appium. CI builds Explorer at the workflow revision with
integration fixtures and Sparkling enabled. Consumers verify the commit and
artifact checksum before installation. This is still a three-case smoke per
platform, not a replacement for the original integration suites.
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

After a successful navigation smoke, `scripts/devtool-probe.mjs` checks the
app's existing PeerTalk TCP transport: runtime registration and nonempty Lynx
session discovery, followed by `DOM.getDocument` for the newest registered session.
Plain and zlib-compressed DOM roots are decoded without model interpretation.
Android uses an explicitly owned ADB forward; iOS Simulator
connects directly. The socket has a bounded deadline and is always destroyed.
The probe does not navigate, focus, insert text or replace original assertions.
Its log is archived with the report, and failure is infrastructure failure even
when the smoke cases pass. Real device validation of this new probe is pending;
55 local model-free checks on Node 22 and typechecking pass. The currently running
hosted run at `9088c66` checks handshake/session discovery only; the subsequent
CDP/DOM extension is still local and not device-verified.

`native-dom.ts` and `native-expectation.ts` prepare the next exact-contract batch:
test-tag pre-order selection, untrimmed native text/input values and exact inline
attributes follow the original Python driver. Immediate checks (`timeoutMs: 0`)
do not retry; polling checks default to the original ten-second deadline.
Malformed DOM, transport failures and late matching responses cannot pass.
These helpers are not registered YAML nodes yet and do not count as migrated
Event, DOM focus or Input.insertText cases.

Only standard Midscene nodes appear in the YAML. On first agent acquisition
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

Node.js 22 or later is required.

```bash
cd testing/ai_e2e
npm ci
cp .env.example .env       # Add model credentials; do not commit this file.
set -a && source .env && set +a

# Android: start an emulator and install Explorer first.
adb install -r LynxExplorer.apk
npm run smoke:android      # Optional model-free adb connection check.
npm test -- --project android-explorer

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
- Keep per-case termination and launch in the agent provider, and use `aiWaitFor`
  for visible readiness. No custom `explorer.open` node is required.

## Differences from the Appium suite

- Removed from this path: the Appium server, Espresso/XCUITest drivers,
  Espresso resigning, the `lynx-e2e-appium` Python framework, and white-box
  `get_by_test_tag` lookups.
- Retained: Explorer artifacts, the simulator matrix, and WebDriverAgent,
  which Midscene iOS uses directly.
- Not covered: pixel-baseline comparison and Espresso white-box access. Keep
  the existing jobs available as an opt-in complement.

### Pages setup fallback

If Pages is unavailable, publication emits a warning and a Summary with the setup
path: Settings → Pages → Build and deployment → Source → GitHub Actions.
It skips deployment without failing the test jobs. Case results and downloadable
native reports remain in the test job Summaries and Actions artifacts.
