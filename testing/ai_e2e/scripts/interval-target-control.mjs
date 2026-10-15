import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Agent } from '../node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { locateVideoButton } from '../video-button-preparation.ts';

const baseline = 'The single visible button labeled exactly "1s Tick" in the video demo panel. Match its complete label, including any seek suffix. Locate the center INSIDE the actual blue button body, not its text baseline, another button, status text or blank space.';
const results = [];
await mkdir('midscene_run/interval-control', { recursive: true });
for (const scene of ['failed', 'passed']) for (const variant of ['baseline', 'candidate']) for (let trial = 1; trial <= 2; trial++) {
  const bytes = await readFile(new URL(`./interval-${scene}.jpeg`, import.meta.url));
  const agent = new Agent({
    interfaceType: 'android', describe: () => 'Immutable Android screenshot; no physical input',
    screenshotBase64: async () => 'data:image/jpeg;base64,' + bytes.toString('base64'),
    size: async () => ({ width: 411, height: 914 }), actionSpace: () => [],
    url: async () => 'diagnostic://interval/' + scene, destroy: async () => {},
  }, { reportFileName: `interval-${scene}-${variant}-${trial}.html`, autoPrintReportMsg: false, waitAfterAction: 0 });
  let failure;
  try {
    if (variant === 'candidate') await locateVideoButton(agent, '1s Tick');
    else {
      const uiContext = await agent.getUIContext();
      await agent.aiLocate(baseline, { deepLocate: true, cacheable: false, uiContext });
    }
  } catch (error) { failure = error.name; }
  const tasks = agent.dump.executions.flatMap(execution => execution.tasks);
  const locates = tasks.filter(task => task.subType === 'Locate');
  const task = locates.at(-1), point = task?.output?.element?.center;
  const bounds = [550, 1429, 701, 1481]; // Grading only; never supplied to the agent.
  const matched = !failure && locates.length === 1 && point?.[0] > bounds[0] && point[0] < bounds[2] && point[1] > bounds[1] && point[1] < bounds[3];
  assert.equal(tasks.filter(task => task.type === 'Action Space').length, 0);
  const result = { scene, variant, trial, diagnosticOnly: true, imageSha256: createHash('sha256').update(bytes).digest('hex'), bounds, point, matched: Boolean(matched), failure,
    locates: locates.map(task => ({ prompt: task.param, point: task.output?.element?.center, searchArea: task.searchArea, geometry: task.uiContext?.shotSize, ratio: task.uiContext?.shrunkShotToLogicalRatio, rawResponse: task.log?.rawResponse, model: task.usage?.response_model_name, retries: task.usage?.retry_count })) };
  results.push(result);
  await agent.destroy();
  await writeFile('midscene_run/interval-control/results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ scene, variant, trial, point, matched, failure }));
}
console.log(JSON.stringify({ diagnosticOnly: true, trials: results.length, candidateHits: results.filter(result => result.variant === 'candidate' && result.matched).length, candidateTrials: 4 }));
