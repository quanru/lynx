import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { expectVideoValue, parseVideoCurrentTime } from '../video-expectation.ts';
import { fixtureUri } from '../native-fixtures.ts';

const document = text => ({ nodeId: 0, nodeName: '#document', children: [
  { nodeId: 1, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'log'], children: [
    { nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', text] },
  ] },
] });

test('video current-time parsing agrees with the unchanged Python helper, including malformed text', () => {
  const samples = ['0 / 10', '0.1 / 10', '2 / 10', '5.999 / 10', '6 / 10', '1 /anything',
    ' 1 / 10', '1/ 10', '1  / 10', '1. / 10', '.1 / 10', '-1 / 10', '1e2 / 10',
    '١ / 10', '1\t/ 10', '1\n/ 10', '9'.repeat(400) + ' / 10'];
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/video_utils.py', import.meta.url), 'utf8');
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,re,sys,math
data=json.load(sys.stdin)
tree=ast.parse(data['source'])
fn=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='parse_current_time')
scope={'re':re}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'unchanged-video-time-parser','exec'),scope)
out=[]
for text in data['samples']:
    try:
        value=scope['parse_current_time'](text)
        out.append('infinity' if math.isinf(value) else value)
    except AssertionError: out.append('invalid')
print(json.dumps(out))`], { input: JSON.stringify({ source, samples }), encoding: 'utf8' }));
  assert.deepEqual(samples.map(text => {
    try { const value = parseVideoCurrentTime(text); return Number.isFinite(value) ? value : 'infinity'; }
    catch { return 'invalid'; }
  }), reference);
});

test('original immediate video counter equality and upper bounds cannot poll a failed sample green', async () => {
  for (const input of [{ countEquals: { key: 'timeupdate', value: 0 } }, { countAtMost: { key: 'timeupdate', value: 5 } }]) {
    let reads = 0;
    await assert.rejects(expectVideoValue(async () => document(reads++ ? 'timeupdate=0' : 'timeupdate=6'),
      async () => assert.fail('Immediate source counters never capture or poll'), { tag: 'log', ...input, immediate: true }), /Original video assertion failed/);
    assert.equal(reads, 1);
    await assert.rejects(expectVideoValue(async () => assert.fail(), async () => assert.fail(), { tag: 'log', ...input }), /Invalid original video assertion/);
  }
  await expectVideoValue(async () => document('timeupdate=٠'), async () => assert.fail(),
    { tag: 'log', countEquals: { key: 'timeupdate', value: 0 }, immediate: true });
  await expectVideoValue(async () => document('timeupdate=5'), async () => assert.fail(),
    { tag: 'log', countAtMost: { key: 'timeupdate', value: 5 }, immediate: true });
});

test('original VideoBasic time predicates keep inclusive seek bounds and exclusive restart bounds', async () => {
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/VideoBasic.py', import.meta.url), 'utf8');
  const samples = ['0 / 10', '0.001 / 10', '1.999 / 10', '2 / 10', '4.999 / 10', '5 / 10', '5.999 / 10', '6 / 10'];
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,re,sys
from types import SimpleNamespace
data=json.load(sys.stdin)
tree=ast.parse(data['source'])
predicates=[node for node in ast.walk(tree) if isinstance(node,ast.Lambda) and 'parse_current_time' in ast.unparse(node)]
def parse(text): return float(re.match(r'([0-9]+(?:\\.[0-9]+)?) /',text).group(1))
out=[]
for node in sorted(predicates,key=lambda n:n.lineno):
    fn=eval(compile(ast.Expression(body=node),'unchanged-video-basic-predicate','eval'),{'video_utils':SimpleNamespace(parse_current_time=parse)})
    out.append([fn(text) for text in data['samples']])
print(json.dumps(out))`], { input: JSON.stringify({ source, samples }), encoding: 'utf8' }));
  const ranges = [{ min: 2, max: 6, minInclusive: true }, ...Array.from({ length: 3 }, () => ({ min: 0, max: 5, minInclusive: false }))];
  assert.equal(reference.length, ranges.length);
  for (const [index, currentTimeRange] of ranges.entries()) {
    for (const [sampleIndex, text] of samples.entries()) {
      const promise = expectVideoValue(async () => document(text), async () => assert.fail(), { tag: 'log', currentTimeRange, immediate: true });
      if (reference[index][sampleIndex]) await promise;
      else await assert.rejects(promise, /Original video assertion failed/);
    }
  }
  for (const currentTimeRange of [{ min: 0, max: 5 }, { min: -1, max: 5, minInclusive: false }, { min: 5, max: 5, minInclusive: true }]) {
    await assert.rejects(expectVideoValue(async () => assert.fail(), async () => assert.fail(), { tag: 'log', currentTimeRange }), /Invalid original video assertion/);
  }
});

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
