import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../ai_e2e/node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { IOSDevice } from '../ai_e2e/node_modules/@midscene/ios/dist/es/index.mjs';

// Immutable CI screenshots only. Image bounds score diagnostics, never input.
const directory = dirname(fileURLToPath(import.meta.url));
const cases = [
  { name: 'failed-interval', image: '0876c1b9-65bb-482d-b717-4b9c8bbd6efa.jpeg' },
  { name: 'passed-retry-interval', image: '24d5c561-ace6-4c10-bbac-d7c3f0848838.jpeg' },
];
const baseline = 'The single visible button labeled exactly "Seek 0s" in the video demo panel. Labels in crowded blue rows can be truncated. Locate the center INSIDE the actual blue button body, not its text baseline, status text or blank space. For Seek 2s, use the second control in the seek row directly below Clear/Play/Play Null/Pause/Stop, between Seek 0s and Near End.';
const candidate = 'The single visible button labeled exactly "Seek 0s" in the video demo panel. Labels in crowded blue rows can be truncated. Locate the center INSIDE the actual blue button body, not its text baseline, status text or blank space. Seek 0s is the FIRST, leftmost blue control in the seek row directly below Clear/Play/Play Null/Pause/Stop. It is below Clear and immediately LEFT of Seek 2s; Near End is the THIRD control, not the target. Identify the first button body even when its text shows only "See".';
const schemas = new IOSDevice({ wdaPort: 1 }).actionSpace();
const results = [];
for (const target of cases) {
  const screenshot = 'data:image/jpeg;base64,' + readFileSync(resolve(directory, target.image)).toString('base64');
  for (const trial of [1, 2, 3, 4]) for (const [mode, prompt] of [['baseline', baseline], ['first-button-anchor', candidate]]) {
    const agent = new Agent({
      interfaceType: 'ios', describe: () => 'Immutable screenshot control; no live device',
      screenshotBase64: async () => screenshot, size: async () => ({ width: 402, height: 874 }),
      actionSpace: () => schemas.map(action => ({ ...action, call: async () => { throw new Error('Physical input is prohibited'); } })),
      url: async () => 'static-ci-screenshot://' + target.name, destroy: async () => {},
    }, { generateReport: true, autoPrintReportMsg: false, reportFileName: `${target.name}-${mode}-${trial}`, waitAfterAction: 0 });
    let point, failure, geometry;
    try {
      const uiContext = await agent.getUIContext();
      geometry = { size: uiContext.shotSize, ratio: uiContext.shrunkShotToLogicalRatio };
      if (geometry.size.width !== 1206 || geometry.size.height !== 2622 || geometry.ratio !== 3) throw new Error('Source screenshot geometry changed');
      const result = await agent.aiLocate(prompt, { deepLocate: false, cacheable: false, uiContext });
      point = result.center;
    } catch (error) { failure = error?.name ?? 'Error'; }
    finally { await agent.destroy(); }
    // Both immutable images show the first seek button in this inspected region.
    const insideMarkedTarget = !!point && point[0] >= 0 && point[0] < 113 && point[1] >= 1690 && point[1] <= 1811;
    const result = { target: target.name, mode, trial, point, geometry, insideMarkedTarget, failure };
    results.push(result);
    console.log(JSON.stringify(result));
    mkdirSync('grounding-control', { recursive: true });
    writeFileSync('grounding-control/results.json', JSON.stringify(results, null, 2));
  }
}
