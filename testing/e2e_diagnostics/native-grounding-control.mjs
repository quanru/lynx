import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../ai_e2e/node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { AndroidDevice } from '../ai_e2e/node_modules/@midscene/android/dist/es/index.mjs';
import { IOSDevice } from '../ai_e2e/node_modules/@midscene/ios/dist/es/index.mjs';

// Fork-only, immutable CI screenshots; never connect a device or send input.
// Marked image regions are diagnostic scoring only, never production targets.
const directory = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(resolve(directory, '3c3-grounding-cases.json')));
const schemas = {
  android: new AndroidDevice('diagnostic-no-device').actionSpace(),
  ios: new IOSDevice({ wdaPort: 1 }).actionSpace(),
};
const results = [];
for (const target of cases) {
  const screenshot = 'data:image/jpeg;base64,' + readFileSync(resolve(directory, target.image)).toString('base64');
  for (const trial of [1, 2]) for (const deepLocate of [false, true]) {
    const mode = deepLocate ? 'independent-refinement' : 'independent-full-frame';
    const controller = new AbortController();
    const stop = new Error('Stopped after first inert action');
    const timer = setTimeout(() => controller.abort(new Error('Original step deadline')), 180_000);
    let actionName, point, failure;
    const agent = new Agent({
      interfaceType: target.platform, describe: () => 'Immutable screenshot control; no live device',
      screenshotBase64: async () => screenshot, size: async () => target.size,
      actionSpace: () => schemas[target.platform].map(action => ({ ...action, call: async param => {
        actionName = action.name;
        const center = param?.locate?.center;
        if (center) point = [center[0] * target.physical.width / target.size.width,
          center[1] * target.physical.height / target.size.height];
        controller.abort(stop);
        throw stop;
      } })), url: async () => 'static-ci-screenshot://' + target.name, destroy: async () => {},
    }, { generateReport: true, autoPrintReportMsg: false, reportFileName: `${target.name}-${mode}-${trial}`, waitAfterAction: 0 });
    try {
      await agent.aiAct(target.prompt, { effort: 'deepThink', deepLocate, cacheable: false, abortSignal: controller.signal });
    } catch (error) {
      if (!(actionName && controller.signal.reason === stop)) failure = error?.name ?? 'Error';
    } finally { clearTimeout(timer); await agent.destroy(); }
    const [left, top, right, bottom] = target.bounds;
    const insideMarkedTarget = actionName === 'Tap' && !!point && point[0] >= left && point[0] <= right && point[1] >= top && point[1] <= bottom;
    const result = { target: target.name, mode, trial, actionName, point, insideMarkedTarget, failure };
    results.push(result);
    console.log(JSON.stringify(result));
    mkdirSync('grounding-control', { recursive: true });
    writeFileSync('grounding-control/results.json', JSON.stringify(results, null, 2));
  }
}
