import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../ai_e2e/node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { defineActionTap } from '../ai_e2e/node_modules/@midscene/core/dist/es/device/index.mjs';

// Diagnostic only: immutable screenshots, no connected device and no real taps.
// Bounds below are manually inspected evidence, never production action targets.
const directory = dirname(fileURLToPath(import.meta.url));
const context = 'Follow the coordinate format requested by the active action protocol. When it requests normalized 0–1000 coordinates, convert screenshot pixel positions using x / screenshot width * 1000 and y / screenshot height * 1000 before emitting locate.point. Do not label raw screenshot pixels as normalized coordinates. The center of the full screenshot is [500, 500] in that normalized format, regardless of its pixel dimensions. Check that the converted point lies inside the described target, using its left/right and upper/lower relationships.';
const cases = [
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
  for (const mode of ['locate-full', 'act-balance-no-context', 'act-fast-no-context', 'act-deepThink-no-context']) {
    const controller = new AbortController();
    const stop = new Error('Diagnostic stopped after first simulated tap');
    const deadline = setTimeout(() => controller.abort(new Error('Diagnostic deadline')), 180_000);
    let point, failure;
    const agent = new Agent({
      interfaceType: 'ios', describe: () => 'Read-only CI screenshot replay; no live device',
      screenshotBase64: async () => screenshot, size: async () => ({ width: 402, height: 874 }),
      actionSpace: () => [defineActionTap(async ({ x, y }) => {
        // The SDK supplies logical device coordinates after applying its ratio.
        point = [x * 3, y * 3];
        controller.abort(stop);
      })], url: async () => 'static-ci-screenshot://' + target.name, destroy: async () => {},
    }, { generateReport: true, autoPrintReportMsg: false, reportFileName: target.name + '-' + mode, aiContexts: mode.endsWith('-no-context') ? {} : { aiAct: context } });
    try {
      if (mode.startsWith('locate-')) point = (await agent.aiLocate(target.locate, { deepLocate: mode === 'locate-deep', cacheable: false })).center;
      else await agent.aiAct(target.act, { deepLocate: true, cacheable: false, effort: mode.includes('deepThink') ? 'deepThink' : mode.includes('fast') ? 'fast' : 'balance', abortSignal: controller.signal });
    } catch (error) {
      if (!(point && controller.signal.reason === stop)) failure = error?.name ?? 'Error';
    } finally {
      clearTimeout(deadline);
      await agent.destroy();
    }
    const [left, top, right, bottom] = target.bounds;
    const insideMarkedTarget = !!point && point[0] >= left && point[0] <= right && point[1] >= top && point[1] <= bottom;
    const result = { target: target.name, mode, point, insideMarkedTarget, failure };
    results.push(result);
    console.log(JSON.stringify(result));
    mkdirSync('grounding-control', { recursive: true });
    writeFileSync('grounding-control/results.json', JSON.stringify(results, null, 2));
  }
}
