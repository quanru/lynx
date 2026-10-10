import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { originalVideoBoundary } from './video-boundary-source.mjs';
import { expectVideoValue, parseVideoCount } from '../video-expectation.ts';

const document = text => ({ nodeId: 0, nodeName: '#document', children: [
  { nodeId: 1, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'log'], children: [
    { nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', text] },
  ] },
] });

test('VideoBoundary collects every unchanged original action, helper assertion and platform error in order', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const project = await loadTestProject(root + 'midscene.config.ts');
  for (const definition of project.projects) {
    const platform = definition.name.startsWith('ios') ? 'ios' : 'android';
    const doc = collectWorkflowDocument({ projectId: definition.projectId, projectName: definition.name,
      sourcePath: 'cases/native/video-boundary.yaml', absolutePath: root + 'cases/native/video-boundary.yaml' }, {
      resolveNode: definition.nodes.get.bind(definition.nodes), variables: definition.variables, env: process.env,
    });
    const source = originalVideoBoundary(platform);
    const actual = doc.cases[0].definition.steps;
    assert.equal(actual.length, source.steps.length);
    for (let index = 0; index < actual.length; index++) {
      const expected = source.steps[index];
      const key = Object.keys(expected)[0];
      assert.equal(actual[index].node, key);
      if (key === 'launch') assert.equal(actual[index].input.uri, definition.variables.videoUri);
      else assert.deepEqual(actual[index].input, expected[key]);
    }
    assert.equal(source.events.filter(([kind]) => kind === 'click').length, 36);
    assert.equal(source.events.filter(([kind]) => kind === 'wait').length, 3);
    assert.ok(source.events.some(([kind, input]) => kind === 'assert' && input.immediate && input.occurrences?.count === 1));
  }
});

test('video count parser matches original Python regex/int semantics, including escaping, first match and Unicode digits', () => {
  const utils = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/video_utils.py', import.meta.url), 'utf8');
  const samples = [['playing=1;error=2', 'error'], ['xerror=9;error=3;error=5', 'error'],
    ['error=١٢', 'error'], ['a.b=１２', 'a.b'], ['error=9999999999999999999999999', 'error'],
    ['error=-1', 'error'], ['error= 1', 'error'], ['x=0\nerror=1', 'error'], ['error=1tail', 'error'], ['error=𝟡𝟠', 'error']];
  const expected = JSON.parse(execFileSync('python3', ['-c', `import ast,json,re,sys
data=json.load(sys.stdin)
fn=next(n for n in ast.parse(data['source']).body if isinstance(n,ast.FunctionDef) and n.name=='parse_count')
ns={'re':re}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'original-count','exec'),ns)
out=[]
for text,key in data['samples']:
    try: out.append(str(ns['parse_count'](text,key)))
    except AssertionError: out.append(None)
print(json.dumps(out))`], { input: JSON.stringify({ source: utils, samples }), encoding: 'utf8' }));
  samples.forEach(([text, key], index) => {
    if (expected[index] === null) assert.throws(() => parseVideoCount(text, key), /Missing/);
    else assert.equal(String(parseVideoCount(text, key)), expected[index]);
  });
});

test('occurrence assertions are immediate and non-overlapping; malformed count/error data cannot pass', async () => {
  for (const [text, input, pass] of [
    ['pause_fail;pause_fail', { occurrences: { text: 'pause_fail', count: 1 }, immediate: true }, false],
    ['aaa', { occurrences: { text: 'aa', count: 1 }, immediate: true }, true],
    ['😀', { occurrences: { text: '', count: 2 }, immediate: true }, true],
    ['error=1', { countAtLeast: { key: 'error', value: 1 }, immediate: true }, true],
    ['error=0', { countAtLeast: { key: 'error', value: 1 }, immediate: true }, false],
    ['none', { errorDetails: true, immediate: true }, false],
    ['error', { errorDetails: true, immediate: true }, false],
    ['1:bad', { errorDetails: true, immediate: true }, true],
  ]) {
    let reads = 0;
    const run = () => expectVideoValue(async () => { reads++; return document(text); }, async () => assert.fail(), { tag: 'log', ...input });
    if (pass) await run(); else await assert.rejects(run(), /Original video assertion failed/);
    assert.equal(reads, 1);
  }
});
