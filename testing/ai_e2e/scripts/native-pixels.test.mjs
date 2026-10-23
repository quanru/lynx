import assert from 'node:assert/strict';
import test from 'node:test';
import { captureNativePixels, expectNativePixels } from '../native-pixels.ts';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('native pixel geometry and image come only from the bound fixture session', async () => {
  const calls = [];
  const body = { nodeId: 9, nodeName: 'PAGE', children: [
    { nodeId: 13, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'flatten-text'] },
  ] };
  const quad = [0, 0, 360, 0, 360, 500, 0, 500];
  const payload = await captureNativePixels({
    readDocument: async () => ({ nodeId: 0, nodeName: '#document', children: [body] }),
    request: async (method, params) => {
      calls.push([method, params]);
      return method === 'Lynx.getRectToWindow'
        ? { rect: { left: 0, top: 210, width: 1080, height: 1664, privateRoute: 'not archived' } }
        : { model: { padding: quad } };
    },
    captureFrame: async () => { calls.push(['capture']); return { data: 'frame', privateMetadata: 'not archived' }; },
  }, 'flatten-text');
  assert.deepEqual(calls, [['Lynx.getRectToWindow', { nodeId: 9 }],
    ['DOM.getBoxModel', { nodeId: 9 }], ['DOM.getBoxModel', { nodeId: 13 }], ['capture']]);
  assert.deepEqual(payload, { frame: 'frame', rect: { left: 0, top: 210, width: 1080, height: 1664 },
    bodyPadding: quad, elementPadding: quad });
});

test('invalid pixel contracts fail before capture or subprocess execution', async () => {
  for (const args of [['other', 'run', 'text_flattern_element', 'flatten-text'],
    ['ios', '../outside', 'text_flattern_element', 'flatten-text'],
    ['ios', 'run', '../baseline', 'flatten-text'], ['ios', 'run', 'text_flattern_element', 'other']]) {
    await assert.rejects(expectNativePixels({}, ...args), /Invalid native pixel contract/);
  }
  for (const rect of [null, { left: 0, top: 0, width: 0, height: 1 },
    { left: 0, top: NaN, width: 1, height: 1 }]) {
    await assert.rejects(captureNativePixels({
      readDocument: async () => ({ nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE' }] }),
      request: async () => ({ rect }), captureFrame() { throw new Error('must not capture'); },
    }, 'flatten-text'), /Invalid native LynxView rectangle/);
  }
});

test('TextEvent keeps original sleep, crop, baseline and exact text existence in order', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/core/TextEvent.py', import.meta.url), 'utf8');
  assert.match(source, /time\.sleep\(3\)/);
  assert.match(source, /get_by_test_tag\('flatten-text'\)/);
  assert.match(source, /take_screenshot_check\(test, "text_flattern_element", "", flattern_text_element\.rect\)/);
  assert.match(source, /get_by_text\('Test text bindlayout event\.\.\.\.'\)/);
  assert.match(source, /test\.assert_existing\(text_bindlayout_element,/);
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  for (const project of loaded.projects) {
    const doc = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
      sourcePath: 'cases/native/text-event.yaml', absolutePath: root + 'cases/native/text-event.yaml' }, {
      resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
    });
    assert.equal(doc.cases.length, 1);
    assert.equal(doc.cases[0].definition.name, 'core/TextEvent');
    const steps = doc.cases[0].definition.steps;
    assert.deepEqual(steps.map(s => s.node), ['launch', 'wait', 'wait', 'recordToReport', 'native.pixels', 'native.expect', 'recordToReport']);
    assert.deepEqual(steps[1].input, { duration: 2000, unit: 'ms' });
    assert.deepEqual(steps[2].input, { duration: 3000, unit: 'ms' });
    assert.deepEqual(steps[4].input, { fixture: 'textEvent', baseline: 'text_flattern_element', tag: 'flatten-text' });
    assert.deepEqual(steps[5].input, { fixture: 'textEvent', matchingText: 'Test text bindlayout event....', exists: true, timeoutMs: 3000 });
    assert.match(decodeURIComponent(steps[0].input.uri), /showcase\/text\/text_event\.lynx\.bundle/);
  }
});

test('pixel setup retains original runner density and post-open readiness, not only URL scaling', () => {
  const runner = readFileSync(new URL('../../integration_test/test_script/lib/test_runner/test_runner.py', import.meta.url), 'utf8');
  assert.match(runner, /self\._test\.device\.shell_command\('wm density 320'\)/);
  assert.match(runner, /self\._test\.app\.open_card\(case\.url\)[\s\S]*?time\.sleep\(2\)[\s\S]*?case\.run/);
  const workflow = readFileSync(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  assert.match(workflow, /shell wm density 320[\s\S]*?shell wm density \|[\s\S]*?install -r -g LynxExplorer\.apk/);
});
