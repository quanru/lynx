import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';

async function collected(sourcePath, name) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects.find(p => p.name === 'ios-explorer');
  const document = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
    sourcePath, absolutePath: root + sourcePath }, {
    resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
  });
  return document.cases.find(c => c.definition.name === name).definition.steps;
}

test('original Lynx runtime selection targets the segmented control rather than the already-correct runtime label', async () => {
  const steps = await collected('cases/ios-sparkling/homepage-routes.yaml', 'sparkling/RawOpenLegacy');
  assert.equal(steps[3].node, 'aiAct');
  assert.deepEqual(steps[3].input.options, { effort: 'deepThink', deepLocate: true, cacheable: false });
  assert.match(steps[3].input.prompt, /LEFT HALF/);
  assert.match(steps[3].input.prompt, /below the large Lynx Explorer title/);
  assert.match(steps[3].input.prompt, /Do not tap "Bundle URL", "Open with Lynx"/);
  assert.match(steps[3].input.prompt, /Stop after that single tap/);
  assert.deepEqual(steps[4].input, { contract: 'runtime', runtime: 'lynx' });
  assert.equal(steps.filter(s => s.node === 'aiAct').length, 3);
});

test('the observed Boundary Clear miss keeps the original single action and asserts the same following stop result', async () => {
  const steps = await collected('cases/native/video-boundary.yaml', 'xelement/VideoBoundary');
  assert.equal(steps[49].node, 'aiAct');
  assert.deepEqual(steps[49].input.options, { effort: 'deepThink', deepLocate: true, cacheable: false });
  assert.match(steps[49].input.prompt, /CENTER of the BLUE "Clear" button body/);
  assert.match(steps[49].input.prompt, /Clear, Play, Play Null, Pause, Stop/);
  assert.match(steps[49].input.prompt, /Do not tap blank space above/);
  assert.match(steps[49].input.prompt, /Stop after that single tap/);
  assert.equal(steps[50].node, 'aiAct');
  assert.match(steps[50].input.prompt, /"Stop" once/);
  assert.deepEqual(steps[51].input, { tag: 'status-text', equal: 'stopped', timeoutMs: 20000 });
  assert.deepEqual(steps[52].input, { tag: 'callback-log', contains: 'stop_ok', timeoutMs: 20000 });
});
