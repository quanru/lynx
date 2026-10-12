import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../ai_e2e/node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { IOSDevice } from '../ai_e2e/node_modules/@midscene/ios/dist/es/index.mjs';

// Diagnostic only: immutable screenshots, no connected device and no real taps.
// Bounds below are manually inspected evidence, never production action targets.
const directory = dirname(fileURLToPath(import.meta.url));
// Construct schemas only: never connect, start WDA, or invoke a native handler.
// Every action's call below is replaced, including platform-specific actions.
const schemas = new IOSDevice({ wdaHost: '127.0.0.1', wdaPort: 1 }).actionSpace();
const context = 'Follow the coordinate format requested by the active action protocol. When it requests normalized 0–1000 coordinates, convert screenshot pixel positions using x / screenshot width * 1000 and y / screenshot height * 1000 before emitting locate.point. Do not label raw screenshot pixels as normalized coordinates. The center of the full screenshot is [500, 500] in that normalized format, regardless of its pixel dimensions. Check that the converted point lies inside the described target, using its left/right and upper/lower relationships.';
const cases = [
  { name: 'input', bounds: [105, 610, 830, 738],
    act: 'Replace the entire contents of the input inside the Bundle URL card with the exact string "hybrid://lynxview_page?bundle=automation%2Fnav-basic%2Fmain.lynx.bundle&nav_role=parent". Stop after typing that URL; do not include quotation marks, submit the keyboard, or tap Open yet.' },
  { name: 'seek', bounds: [115, 1685, 230, 1815],
    locate: 'The single visible button labeled exactly "Seek 2s" in the video demo panel. Labels in crowded blue rows can be truncated. Locate the center INSIDE the actual blue button body, not its text baseline, status text or blank space. For Seek 2s, use the second control in the seek row directly below Clear/Play/Play Null/Pause/Stop, between Seek 0s and Near End.',
    act: 'Click the second blue button in the seek row directly below Clear/Play/Play Null/Pause/Stop, between Seek 0s and Near End. This is Seek 2s; its visible label is clipped. Click once and stop.' },
  { name: 'open', bounds: [850, 610, 1105, 745],
    locate: 'the red Open button to the right of the Bundle URL input field',
    act: 'Tap the red Open button directly to the right of the Bundle URL input once, inside the white Bundle URL card BELOW its heading and ABOVE the Fullscreen, Default, Dark, Light choices. Do not tap the separate Sparkling Go runtime selector above that card. Stop after the single tap; do not tap a second time.' },
  { name: 'source', bounds: [350, 1830, 495, 2000],
    locate: "the button labeled 'Src Bad' (shown as 'Src Ba') in the button row",
    act: 'When scrolling, gesture within the light-gray video demo panel on the LEFT below the back arrow, not the white blank area to its right or below. Scroll if needed and click the single button labeled exactly "Src Bad" once. Do not click similarly named buttons or perform another action.' },
];
const results = [];
for (const target of cases) {
  const screenshot = 'data:image/jpeg;base64,' + readFileSync(resolve(directory, 'grounding-' + target.name + '.jpeg')).toString('base64');
  for (const mode of ['balance-with-context-1', 'balance-no-context-1', 'balance-with-context-2', 'balance-no-context-2']) {
    const controller = new AbortController();
    const stop = new Error('Diagnostic stopped after first simulated tap');
    const deadline = setTimeout(() => controller.abort(new Error('Diagnostic deadline')), 180_000);
    let point, failure, actionName;
    const agent = new Agent({
      interfaceType: 'ios', describe: () => 'Read-only CI screenshot replay; no live device',
      screenshotBase64: async () => screenshot, size: async () => ({ width: 402, height: 874 }),
      actionSpace: () => schemas.map(action => ({ ...action, call: async param => {
        // Parsed action parameters use logical coordinates; all input is inert.
        actionName = action.name;
        point = param?.locate?.center?.map(value => value * 3);
        controller.abort(stop);
        throw stop;
      } })), url: async () => 'static-ci-screenshot://' + target.name, destroy: async () => {},
    }, { generateReport: true, autoPrintReportMsg: false, reportFileName: target.name + '-' + mode, aiContexts: mode.includes('-no-context-') ? {} : { aiAct: context } });
    try {
      await agent.aiAct(target.act, { deepLocate: true, cacheable: false, effort: 'balance', abortSignal: controller.signal });
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
