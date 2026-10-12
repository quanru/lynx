import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../ai_e2e/node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { AndroidDevice } from '../ai_e2e/node_modules/@midscene/android/dist/es/index.mjs';

// Diagnostic only: immutable screenshots, no connected device and no real taps.
// Bounds below are manually inspected evidence, never production action targets.
const directory = dirname(fileURLToPath(import.meta.url));
// Construct schemas only: never connect, start ADB, or invoke a native handler.
// Every action's call below is replaced, including platform-specific actions.
const schemas = new AndroidDevice('diagnostic-no-device').actionSpace();
const context = 'Follow the coordinate format requested by the active action protocol. When it requests normalized 0–1000 coordinates, convert screenshot pixel positions using x / screenshot width * 1000 and y / screenshot height * 1000 before emitting locate.point. Do not label raw screenshot pixels as normalized coordinates. The center of the full screenshot is [500, 500] in that normalized format, regardless of its pixel dimensions. Check that the converted point lies inside the described target, using its left/right and upper/lower relationships.';
const cases = [
  { name: 'android-event-view', bounds: [22, 318, 1058, 400],
    act: 'Click the uppermost blue rectangular button immediately below the "View Click" heading and above the "Text Click" heading once. This first blue button has no visible text; do not choose the lower button containing "Click text to add one". Stop after that single click.' },
  { name: 'android-event-text', bounds: [48, 493, 312, 530],
    act: 'Click the text "Click text to add one" beneath the Text Click heading once. Stop after that single click.' },
  { name: 'android-stop', bounds: [877, 995, 1028, 1046],
    act: 'When scrolling, gesture within the light-gray video demo panel on the LEFT below the back arrow, not the white blank area to its right or below. Scroll if needed and click the single button labeled exactly "Stop" once. Do not click similarly named buttons or perform another action.' },
  { name: 'android-latest', bounds: [594, 1460, 744, 1509],
    act: 'When scrolling, gesture within the light-gray video demo panel on the LEFT below the back arrow, not the white blank area to its right or below. Scroll if needed and click the video mode button labeled "Latest" once. Do not click any playback button.' },
];
const results = [];
for (const target of cases.filter(target => target.name === 'android-latest')) {
  const screenshot = 'data:image/jpeg;base64,' + readFileSync(resolve(directory, 'grounding-' + target.name + '.jpeg')).toString('base64');
  for (const mode of Array.from({ length: 5 }, (_, index) => [
    `deepThink-full-frame-no-context-${index + 1}`,
    `deepThink-refined-no-context-${index + 1}`,
  ]).flat()) {
    const controller = new AbortController();
    const stop = new Error('Diagnostic stopped after first simulated tap');
    const deadline = setTimeout(() => controller.abort(new Error('Diagnostic deadline')), 180_000);
    let point, failure, actionName;
    const agent = new Agent({
      interfaceType: 'android', describe: () => 'Read-only CI screenshot replay; no live device',
      screenshotBase64: async () => screenshot, size: async () => ({ width: 411, height: 914 }),
      actionSpace: () => schemas.map(action => ({ ...action, call: async param => {
        // Parsed action parameters use logical coordinates; all input is inert.
        actionName = action.name;
        point = param?.locate?.center?.map(value => value * (1080 / 411));
        controller.abort(stop);
        throw stop;
      } })), url: async () => 'static-ci-screenshot://' + target.name, destroy: async () => {},
    }, { generateReport: true, autoPrintReportMsg: false, reportFileName: target.name + '-' + mode, aiContexts: mode.includes('-no-context-') ? {} : { aiAct: context } });
    try {
      await agent.aiAct(target.act, { deepLocate: mode.includes('-refined-'), cacheable: false, effort: 'deepThink', abortSignal: controller.signal });
    } catch (error) {
      if (!(actionName && controller.signal.reason === stop)) failure = error?.name ?? 'Error';
    } finally {
      clearTimeout(deadline);
      await agent.destroy();
    }
    const [left, top, right, bottom] = target.bounds;
    const insideMarkedTarget = !!point && point[0] >= left && point[0] <= right && point[1] >= top && point[1] <= bottom;
    const result = { target: target.name, mode, actionName, point, insideMarkedTarget, failure };
    results.push(result);
    console.log(JSON.stringify(result));
    mkdirSync('grounding-control', { recursive: true });
    writeFileSync('grounding-control/results.json', JSON.stringify(results, null, 2));
  }
}
