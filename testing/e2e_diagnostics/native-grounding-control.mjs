import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../ai_e2e/node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { IOSDevice } from '../ai_e2e/node_modules/@midscene/ios/dist/es/index.mjs';

// Immutable native report screenshots; all complete platform actions are inert.
// Marked regions score the diagnostic only, never drive production input.
const directory = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(resolve(directory, '0f9-seek-inf-cases.json')));
const schemas = new IOSDevice({ wdaPort: 1 }).actionSpace();
const results = [];
for (const target of cases) {
  const screenshot = 'data:image/jpeg;base64,' + readFileSync(resolve(directory, target.image)).toString('base64');
  for (const trial of [1, 2, 3, 4]) {
    const controller = new AbortController();
    const stop = new Error('Stopped after first inert action');
    const timer = setTimeout(() => controller.abort(new Error('Original step deadline')), 180_000);
    let actionName, point, failure;
    const agent = new Agent({
      interfaceType: 'ios', describe: () => 'Immutable screenshot control; no live device',
      screenshotBase64: async () => screenshot, size: async () => ({ width: 402, height: 874 }),
      actionSpace: () => schemas.map(action => ({ ...action, call: async param => {
        actionName = action.name;
        point = param?.locate?.center?.map(value => value * 3);
        controller.abort(stop);
        throw stop;
      } })), url: async () => 'static-ci-screenshot://' + target.name, destroy: async () => {},
    }, { generateReport: true, autoPrintReportMsg: false, reportFileName: `${target.name}-${trial}`, waitAfterAction: 0 });
    try {
      await agent.aiAct(target.prompt, { effort: 'deepThink', deepLocate: true, cacheable: false, abortSignal: controller.signal });
    } catch (error) {
      if (!(actionName && controller.signal.reason === stop)) failure = error?.name ?? 'Error';
    } finally { clearTimeout(timer); await agent.destroy(); }
    const insideMarkedTarget = actionName === 'Tap' && !!point && point[0] >= 920 && point[0] < 1035 && point[1] >= 1690 && point[1] <= 1811;
    const result = { target: target.name, trial, actionName, point, insideMarkedTarget, failure };
    results.push(result);
    console.log(JSON.stringify(result));
    mkdirSync('grounding-control', { recursive: true });
    writeFileSync('grounding-control/results.json', JSON.stringify(results, null, 2));
  }
}
