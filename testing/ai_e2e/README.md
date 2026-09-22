# AI E2E for Lynx Explorer (Midscene)

This suite uses Midscene vision models to run the same YAML cases on Android
and iOS. It connects directly through adb or WebDriverAgent without Appium.
Local validation on September 20, 2026 passed 3/3 cases on each platform.

## Structure

```text
testing/ai_e2e/
├── midscene.config.ts        # android-explorer and ios-explorer projects
├── cases/native/explorer.yaml
├── smoke-android.ts / smoke-ios.ts   # Model-free connection checks
├── scripts/
│   ├── preflight-model.sh           # Model endpoint connectivity check
│   ├── start-android-emulator.sh    # Create and start a headless AVD on Linux CI
│   └── start-wda.sh                 # Build and keep WDA v16.9.3 running on macOS
└── package.json
```

The companion workflow is `.github/workflows/midscene-ai-e2e.yml`. It
coexists with the existing Appium jobs in `ci.yml` and does not replace them.

## Required repository configuration

| Type | Name | Description |
| --- | --- | --- |
| Secret | `MIDSCENE_MODEL_API_KEY` | API key for an OpenAI-compatible multimodal model |
| Secret | `MIDSCENE_MODEL_NAME` | Model name |
| Secret | `MIDSCENE_MODEL_BASE_URL` | Endpoint such as `https://host/v1` |
| Secret | `MIDSCENE_MODEL_FAMILY` | Model family, such as `qwen3` or `doubao-seed` |
| Secret | `MIDSCENE_MODEL_REASONING_ENABLED` | Optional reasoning toggle |
| Variable | `MIDSCENE_PAGES_BRANCH` | Optional. Set to `develop` to publish HTML reports to Pages after pushes to that branch. |

By default, the workflow downloads Lynx Explorer release `4.1.0`. Its APK
contains an x86_64 ABI and can be installed directly on the hosted x86_64
emulator. The release artifacts are already signed, so Espresso resigning is
not required. A `workflow_dispatch` run can override the release tag.

## Run locally

Node.js 22 or later is required.

```bash
cd testing/ai_e2e
npm ci
cp .env.example .env       # Add model credentials; do not commit this file.
set -a && source .env && set +a

# Android: start an emulator and install Explorer first.
adb install -r LynxExplorer-noasan-release.apk
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
aggregation job also writes an English Actions Summary table with platform
totals, individual case results, durations, failure details, and report links.

## Case-writing guidelines

- Use `aiAct` for visible user interactions. Describe the user goal instead of
  decomposing it into `aiTap`, `aiScroll`, or other atomic AI operations.
- Use `aiAssert` for visual outcomes and semantic UI state.
- Keep lifecycle and navigation setup in deterministic nodes such as
  `explorer.open`.

## Differences from the Appium suite

- Removed from this path: the Appium server, Espresso/XCUITest drivers,
  Espresso resigning, the `lynx-e2e-appium` Python framework, and white-box
  `get_by_test_tag` lookups.
- Retained: Explorer artifacts, the simulator matrix, and WebDriverAgent,
  which Midscene iOS uses directly.
- Not covered: pixel-baseline comparison and Espresso white-box access. Keep
  the existing jobs available as an opt-in complement.
