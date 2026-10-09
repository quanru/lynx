import assert from 'node:assert/strict';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { fileURLToPath } from 'node:url';

test('Showcase navigation targets the visible card, not accumulated session history', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  for (const project of loaded.projects) {
    const document = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
      sourcePath: 'cases/native/explorer.yaml', absolutePath: root + 'cases/native/explorer.yaml' }, {
      resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
    });
    const cases = document.cases.map(item => item.definition).filter(item => item.tags?.includes('showcase'));
    assert.equal(cases.length, 2);
    for (const item of cases) {
      const goal = item.steps[1].input.prompt;
      assert.deepEqual(item.steps[1].input.options, { deepLocate: true, cacheable: false });
      assert.match(goal, /CENTER of the "Lynx Showcases" words/);
      assert.match(goal, /ABOVE "Sparkling Showcases"/);
      assert.match(goal, /ABOVE Session History/);
      assert.match(goal, /Finish only when category rows/);
      assert.doesNotMatch(goal, /\b\d+\s*(?:px|pixels)\b|#[\w-]+/);
      assert.equal(item.steps[2].node, 'aiWaitFor');
      assert.equal(item.steps[3].node, 'aiAssert');
    }
  }
});
