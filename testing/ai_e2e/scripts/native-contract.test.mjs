import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { fixtureUri } from '../native-fixtures.ts';

test('native collection preserves original ordered assertions, CDP calls and user clicks', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  for (const [fixture, original, file] of [['event', 'Event', 'event'],
    ['domFocus', 'DomFocus', 'dom-focus'], ['insertText', 'InputInsertText', 'insert-text']]) {
  const source = readFileSync(new URL(`../../integration_test/test_script/case_sets/core/${original}.py`, import.meta.url), 'utf8');
  const expected = extract(source, fixture);
  for (const project of loaded.projects) {
    const document = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
      sourcePath: `cases/native/${file}.yaml`, absolutePath: root + `cases/native/${file}.yaml` }, {
      resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
    });
    const cases = document.cases.map(item => item.definition);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].name, `core/${original}`);
    const steps = cases[0].steps;
    const clicks = expected.filter(step => step.node === 'click');
    let clickIndex = 0;
    const actual = steps.filter(step => ['native.expect', 'native.cdp', 'aiAct'].includes(step.node))
      .map(step => step.node === 'aiAct' ? clicks[clickIndex++] : { node: step.node, input: step.input });
    assert.deepEqual(actual, expected, `${project.name}/${original}`);
    assert.equal(clickIndex, clicks.length);
    const platform = project.name.startsWith('android') ? 'android' : 'ios';
    assert.equal(steps[0].node, 'launch');
    assert.equal(steps[0].input.uri, fixtureUri(platform, fixture));
    assert.ok(steps.every(step => ['launch', 'aiWaitFor', 'aiAct', 'native.expect', 'native.cdp', 'recordToReport'].includes(step.node)));
  }
  }
});

function extract(source, fixture) {
  return JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./extract-native-contract.py', import.meta.url)), fixture],
    { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
}

test('original contract extraction fails closed on unsupported statements and assertions', () => {
  for (const statement of ['test.assert_true(True)', 'assert True', 'if True:\n        test.assert_true(True)']) {
    assert.throws(() => extract(`def run(test):\n    ${statement}\n`, 'event'));
  }
});

test('standard launch retains original native bundle and platform scaling parameters', () => {
  const source = readFileSync(new URL('../../integration_test/test_script/lib/test_runner/case_set.py', import.meta.url), 'utf8');
  for (const [platform, query] of [['android', 'width=1080&height=1664&density=320'],
    ['ios', 'width=720&height=1200&scale=2']]) {
    const url = new URL(fixtureUri(platform, 'event'));
    assert.equal(url.protocol, 'lynx:'); assert.equal(url.host, 'open');
    assert.equal(url.searchParams.get('url'), 'file://lynx?local://automation/event/main.lynx.bundle?' + query);
    for (const pair of query.split('&')) {
      const [key, value] = pair.split('=');
      assert.match(source, new RegExp(`config\\['${key}'\\] if '${key}' in config else ${value}`));
    }
  }
});
