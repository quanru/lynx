import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { expectVideoValue } from '../video-expectation.ts';
import { fixtureUri } from '../native-fixtures.ts';

const document = text => ({ nodeId: 0, nodeName: '#document', children: [
  { nodeId: 1, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'log'], children: [
    { nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', text] },
  ] },
] });

test('video immediate order and negative checks reject bad values without retrying', async () => {
  for (const [input, value] of [
    [{ order: ['play_ok', 'pause_ok', 'stop_ok'] }, 'play_ok;stop_ok;pause_ok'],
    [{ notContains: 'pause_ok' }, 'play_ok;pause_ok;stop_ok'],
    [{ equal: 'stopped' }, 'stopped '],
  ]) {
    let reads = 0;
    await assert.rejects(expectVideoValue(async () => { reads++; return document(value); },
      async () => assert.fail('Immediate checks must not capture or poll'),
      { tag: 'log', ...input, immediate: true }), /Original video assertion failed/);
    assert.equal(reads, 1);
  }
  // Match Python's overlapping starts, not non-overlapping regex matching.
  await expectVideoValue(async () => document('aaa'), async () => assert.fail(),
    { tag: 'log', order: ['aa', 'aa'], immediate: true });
});

test('video polling preserves original diagnostic then one final fresh read', async () => {
  let now = 0;
  const events = [];
  const clock = { now: () => now, sleep: async ms => { events.push(['sleep', ms]); now += ms; } };
  const read = async () => { events.push(['read']); return document(events.length > 2 ? 'ready' : 'loading'); };
  await expectVideoValue(read, async () => { events.push(['capture']); },
    { tag: 'log', equal: 'ready', timeoutMs: 1 }, clock);
  assert.deepEqual(events, [['read'], ['sleep', 200], ['capture'], ['read']]);
  await assert.rejects(expectVideoValue(async () => document('loading'), async () => {},
    { tag: 'log', equal: 'ready', timeoutMs: 0 }, clock), /Original video assertion failed/);
});

test('video polling never swallows transport errors or missing required tags', async () => {
  for (const read of [async () => { throw new Error('CDP disconnected'); },
    async () => ({ nodeId: 0, nodeName: '#document' })]) {
    await assert.rejects(expectVideoValue(read, async () => assert.fail(),
      { tag: 'log', contains: 'stop_ok' }), /CDP disconnected|Lynx test tag/);
  }
  for (const input of [{ tag: '' }, { tag: 'log', order: ['a'] },
    { tag: 'log', notContains: 'x' }, { tag: 'log', equal: 'x', contains: 'x' },
    { tag: 'log', equal: 1 }, { tag: 'log', equal: 'x', timeoutMs: -1 }]) {
    await assert.rejects(expectVideoValue(async () => assert.fail(), async () => assert.fail(), input),
      /Invalid original video assertion/);
  }
});

test('VideoModes real SDK YAML preserves every original action and acceptance statement in order', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/VideoModes.py', import.meta.url), 'utf8');
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
from types import SimpleNamespace
tree=ast.parse(sys.stdin.read())
events=[]
class Video:
    def get_lynxview(self,test): return 'view'
    def click(self,view,tag): events.append(['click',tag])
    def wait_for_text(self,test,view,tag,value,timeout=20): events.append(['assert',{'tag':tag,'equal':value,'timeoutMs':timeout*1000}])
    def wait_for_contains(self,test,view,tag,value,timeout=20): events.append(['assert',{'tag':tag,'contains':value,'timeoutMs':timeout*1000}])
    def assert_text_order(self,view,tag,values): events.append(['assert',{'tag':tag,'order':values,'immediate':True}])
    def assert_text_not_contains(self,view,tag,value): events.append(['assert',{'tag':tag,'notContains':value,'immediate':True}])
    def capture_screenshot(self,test,view,suffix): events.append(['screenshot',suffix])
run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run')
namespace={'video_utils':Video()}
exec(compile(ast.Module(body=[run],type_ignores=[]),'unchanged-video-modes','exec'),namespace)
namespace['run'](SimpleNamespace(start_step=lambda *args:None))
print(json.dumps(events))`], { input: source, encoding: 'utf8' }));
  const tags = ['btn-mode-queue', 'btn-burst-play-pause-stop', 'btn-clear-signals',
    'btn-mode-latest', 'btn-burst-play-pause-stop', 'btn-clear-signals', 'btn-mode-direct',
    'btn-burst-play-stop', 'btn-clear-signals', 'btn-seek', 'btn-stop'];
  const labels = ['Queue', 'Play Pause Stop', 'Clear', 'Latest', 'Play Pause Stop', 'Clear',
    'Direct', 'Play Stop', 'Clear', 'Seek 2s', 'Stop'];
  for (const project of loaded.projects) {
    const doc = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
      sourcePath: 'cases/native/video-modes.yaml', absolutePath: root + 'cases/native/video-modes.yaml' }, {
      resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
    });
    assert.equal(doc.cases.length, 1);
    const steps = doc.cases[0].definition.steps;
    assert.deepEqual(steps.slice(0, 4).map(s => s.node), ['recordToReport', 'wait', 'launch', 'wait']);
    assert.deepEqual(steps[1].input, { duration: 5000, unit: 'ms' });
    assert.deepEqual(steps[3].input, { duration: 2000, unit: 'ms' });
    const platform = project.name.startsWith('ios') ? 'ios' : 'android';
    assert.equal(project.variables.videoUri, fixtureUri(platform, 'video'));
    assert.match(decodeURIComponent(project.variables.videoUri), /automation\/video\/main\.lynx\.bundle\?width=/);
    let index = 0;
    const translated = steps.slice(4).map(step => {
      if (step.node === 'native.video') return ['assert', { ...(!step.input.immediate ? { timeoutMs: 20000 } : {}), ...step.input }];
      if (step.node === 'recordToReport') return ['screenshot', 'mode_direct'];
      assert.equal(step.node, 'aiAct');
      assert.ok(step.input.prompt.includes('"' + labels[index] + '"'));
      assert.deepEqual(step.input.options, { deepLocate: true, cacheable: false });
      return ['click', tags[index++]];
    });
    assert.equal(index, 11);
    assert.deepEqual(translated, reference);
  }
  const runner = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/runner.py', import.meta.url), 'utf8');
  const caseSet = readFileSync(new URL('../../integration_test/test_script/lib/test_runner/case_set.py', import.meta.url), 'utf8');
  assert.match(runner, /CaseSet\(case_set_path=os\.path\.dirname\(__file__\)\)/);
  assert.match(caseSet, /def __init__\(self, case_set_path=None, enable_scale=True\)/);
});
