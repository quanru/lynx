import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSparklingContracts, mappedProperties, nonemptyCapabilities } from '../sparkling-contracts.ts';

function root(values) {
  return { nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE', children: Object.entries(values).map(([tag, text], i) => ({
    nodeId: 2 + i * 2, nodeName: 'text', attributes: ['lynx-test-tag', tag], children: [{ nodeId: 3 + i * 2, nodeName: 'raw-text', attributes: ['text', text] }],
  })) }] };
}
const values = { ...mappedProperties, 'nav-container-type': 'sparkling', 'nav-container-id': 'container-123',
  'nav-lynx-sdk-version': '1.0', 'nav-sparkling-navigation': '1', 'nav-spk-pipe': 'available',
  'nav-xelement-input': '', 'nav-is-notch-screen': 'yes', 'bundle-runtime-label': 'Open with Lynx' };

test('Sparkling capability contract retains original ordered exact/nonempty/type checks', async () => {
  const observations = [], predicates = [];
  const run = createSparklingContracts(async (tag, expected, timeout) => {
    observations.push([tag, expected ?? null, timeout]);
    return { readDocument: async () => root(values) };
  }, { displayedTypes: async tag => { predicates.push(tag); return ['XCUIElementTypeTextField']; } });
  await run({ contract: 'sparkling' });
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/helpers.py', import.meta.url), 'utf8');
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
tree=ast.parse(sys.stdin.read())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='assert_sparkling_capabilities')
calls=[]
forbidden_values={}
def nonempty(_,tag,forbidden):
    calls.append([tag,None,2000])
    forbidden_values[tag]=sorted(forbidden)
namespace={'assert_tag_text':lambda _,tag,value:calls.append([tag,value,15000]),
'assert_nonempty_tag':nonempty,
'assert_xelement_input':lambda _:calls.append(['nav-xelement-input',None,15000])}
exec(compile(ast.Module(body=[function],type_ignores=[]),'original-sparkling-caps','exec'),namespace)
namespace['assert_sparkling_capabilities'](None)
print(json.dumps({'calls':calls,'forbidden':forbidden_values}))`], { input: source, encoding: 'utf8' }));
  assert.deepEqual(observations, reference.calls);
  assert.deepEqual(Object.fromEntries(Object.entries(nonemptyCapabilities).map(([tag, forbidden]) => [tag, [...forbidden].sort()])), reference.forbidden);
  assert.deepEqual(predicates, ['nav-xelement-input']);
});

test('runtime and Legacy checks reuse original handles without SessionList rediscovery', async () => {
  const observations = [], reads = [];
  const run = createSparklingContracts(async tag => {
    observations.push(tag);
    return { readDocument: async () => { reads.push(tag); return root(tag === 'bundle-url-input'
      ? { 'bundle-runtime-label': 'Open with Lynx' }
      : Object.fromEntries(['nav-container-type', 'nav-container-id', 'nav-sparkling-navigation', 'nav-spk-pipe'].map(t => [t, 'absent']))); } };
  }, {});
  await assert.rejects(run({ contract: 'runtime', runtime: 'lynx' }), /homepage binding/);
  await assert.rejects(run({ contract: 'legacy' }), /parent binding/);
  await run({ contract: 'home' });
  await run({ contract: 'runtime', runtime: 'lynx' });
  await run({ contract: 'parent' });
  await run({ contract: 'legacy' });
  assert.deepEqual(observations, ['bundle-url-input', 'nav-role']);
  assert.deepEqual(reads, ['bundle-url-input', 'nav-role', 'nav-role', 'nav-role', 'nav-role']);
});

test('mapped option assertions preserve every original value and forbid an absent notch flag', async () => {
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/MappedLegacyToSparkling.py', import.meta.url), 'utf8');
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
tree=ast.parse(sys.stdin.read())
run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run')
props=next(n.value for n in run.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='expected_props' for t in n.targets))
print(json.dumps(ast.literal_eval(props)))`], { input: source, encoding: 'utf8' }));
  assert.deepEqual(mappedProperties, reference);
  const observations = [];
  const run = createSparklingContracts(async (tag, expected) => { observations.push([tag, expected ?? null]); return { readDocument: async () => root(values) }; }, {});
  await run({ contract: 'mapped' });
  assert.deepEqual(observations, [...Object.entries(reference), ['nav-is-notch-screen', null]]);
});

test('post-binding wrong text, forbidden SDK version and duplicate native inputs cannot pass', async () => {
  const observe = async () => ({ readDocument: async () => root({ ...values, 'nav-container-type': 'wrong' }) });
  await assert.rejects(createSparklingContracts(observe, {})({ contract: 'sparkling' }), /expected.*sparkling/);
  let versionReads = 0;
  const forbidden = createSparklingContracts(async tag => {
    if (tag === 'nav-lynx-sdk-version' && ++versionReads === 2) throw new Error('Observed forbidden SDK retry');
    return { readDocument: async () => root({ ...values, 'nav-lynx-sdk-version': 'unknown' }) };
  }, {});
  await assert.rejects(forbidden({ contract: 'sparkling' }), /Observed forbidden SDK retry/);
  let typeReads = 0;
  const duplicate = createSparklingContracts(async () => ({ readDocument: async () => root(values) }), {
    displayedTypes: async () => { if (++typeReads === 2) throw new Error('Observed duplicate input retry'); return ['XCUIElementTypeTextField', 'XCUIElementTypeTextField']; },
  });
  await assert.rejects(duplicate({ contract: 'sparkling' }), /Observed duplicate input retry/);
  await assert.rejects(duplicate({ contract: 'unknown' }), /Invalid/);
});
