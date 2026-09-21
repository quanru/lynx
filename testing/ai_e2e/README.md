# AI E2E for Lynx Explorer (Midscene)

Midscene 视觉模型驱动的 Lynx Explorer E2E：**一份 YAML 同时跑 Android 与 iOS**，
直连 adb / WebDriverAgent，不经过 Appium。本地验证（2026-09-20）：Android 3/3、
iOS 3/3。

## 目录

```
testing/ai_e2e/
├── midscene.config.ts        # android-explorer / ios-explorer 两个 project
├── cases/native/explorer.yaml
├── smoke-android.ts / smoke-ios.ts   # 不调模型的链路自检
├── scripts/
│   ├── preflight-model.sh           # 模型端点连通性预检
│   ├── start-android-emulator.sh    # Linux CI：建 AVD + headless 启动
│   └── start-wda.sh                 # macOS：构建并常驻 WDA v16.9.3:8100
└── package.json
```

配套 workflow：`.github/workflows/midscene-ai-e2e.yml`
（与 ci.yml 中现有 Appium job **并存**，互不影响）。

## 仓库需要配置的 secrets / variables

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| secret | `MIDSCENE_MODEL_API_KEY` | OpenAI 兼容多模态模型 Key |
| secret | `MIDSCENE_MODEL_NAME` | 模型名 |
| secret | `MIDSCENE_MODEL_BASE_URL` | 形如 `https://host/v1` |
| secret | `MIDSCENE_MODEL_FAMILY` | 模型族（如 qwen3 / doubao-seed） |
| secret | `MIDSCENE_MODEL_REASONING_ENABLED` | 可选 |
| variable | `MIDSCENE_PAGES_BRANCH` | 可选，设为 `develop` 后推送到该分支时发布 HTML 报告到 Pages |

Explorer 制品默认取 Release `4.1.0`（APK 已含 x86_64 ABI，可直接装 hosted
x86_64 模拟器；Release 包自带签名，无需 Espresso 重签）。workflow_dispatch 可改 tag。

## 本地运行

需要 Node 22+。

```bash
cd testing/ai_e2e
npm ci
cp .env.example .env       # 填入模型凭证，不要提交
set -a && source .env && set +a

# Android：先启动模拟器并安装 Explorer
adb install -r LynxExplorer-noasan-release.apk
npm run smoke:android      # 可选：不耗模型，验证 adb 链路
npm test -- --project android-explorer

# iOS：先装 .app，并让 WDA 常驻 8100（脚本动态选择最新可用 iPhone 模拟器）
bash scripts/start-wda.sh                      # 日志打印 "using simulator UDID: ..."
xcrun simctl install <UDID> /path/to/LynxExplorer.app
npm run smoke:ios
npm test -- --project ios-explorer
```

HTML 报告在 `midscene_run/report/`。

## 与原 Appium 方案的差异

- 删除：Appium server、espresso/xcuitest driver、Espresso 重签、
  `lynx-e2e-appium` Python 框架、`get_by_test_tag` 白盒定位。
- 保留：Explorer 制品、模拟器矩阵、WebDriverAgent（Midscene iOS 仍用 WDA）。
- 不覆盖的能力：像素基线比对、Espresso 白盒——建议原 job 保留为 opt-in 并存。
