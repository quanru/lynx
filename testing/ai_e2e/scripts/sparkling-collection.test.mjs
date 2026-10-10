import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { discoverTestFiles, loadTestProject } from '@midscene/test/config';
import { mappedProperties, sparklingRoutes } from '../sparkling-contracts.ts';

test('real SDK collects thirteen Android and twenty iOS cases with Sparkling excluded from Android', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  for (const project of loaded.projects) {
    const names = [];
    for (const absolutePath of discoverTestFiles(root, project.files)) {
      const doc = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
        sourcePath: relative(root, absolutePath), absolutePath }, {
        resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
      });
      names.push(...doc.cases.map(c => c.definition.name));
    }
    const ios = project.name === 'ios-explorer';
    assert.equal(names.length, ios ? 20 : 13);
    assert.equal(new Set(names).size, names.length);
    assert.equal(names.filter(name => name.startsWith('sparkling/')).length, ios ? 7 : 0);
  }
});

test('four Sparkling YAML flows retain unchanged original homepage routing and complete acceptance statements', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects.find(p => p.name === 'ios-explorer');
  const doc = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
    sourcePath: 'cases/ios-sparkling/homepage-routes.yaml', absolutePath: root + 'cases/ios-sparkling/homepage-routes.yaml' }, {
    resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
  });
  const helpers = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/helpers.py', import.meta.url), 'utf8');
  for (const item of doc.cases.map(c => c.definition)) {
    const name = item.name.slice('sparkling/'.length);
    const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/' + name + '.py', import.meta.url), 'utf8');
    const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
from types import SimpleNamespace
data=json.load(sys.stdin)
constants=[n for n in ast.parse(data['helpers']).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('RAW_PARENT_URL','CANONICAL_PARENT_URL','MAPPED_LEGACY_URL') for t in n.targets)]
events=[]
def open_home(_,url,button,runtime=None):
    events.append(['open',url,button,runtime])
    return object()
namespace={'open_from_homepage':open_home,'assert_tag_text':lambda _,tag,value:events.append(['exact',tag,value]),
'assert_sparkling_capabilities':lambda _:events.append(['sparkling']),
'assert_legacy_capabilities':lambda *args:events.append(['legacy']),
'assert_nonempty_tag':lambda _,tag,forbidden:events.append(['nonempty',tag,sorted(forbidden)])}
run=next(n for n in ast.parse(data['case']).body if isinstance(n,ast.FunctionDef) and n.name=='run')
exec(compile(ast.Module(body=constants+[run],type_ignores=[]),'unchanged-sparkling-case','exec'),namespace)
namespace['run'](SimpleNamespace(start_step=lambda *args:None))
print(json.dumps(events))`], { input: JSON.stringify({ helpers, case: source }), encoding: 'utf8' }));
    const [open, ...assertions] = reference;
    assert.equal(open[0], 'open');
    assert.equal(open[2], 'open-bundle-url');
    assert.ok(Object.values(sparklingRoutes).includes(open[1]));
    const steps = item.steps;
    assert.deepEqual(steps.slice(0, 3).map(s => s.node), ['recordToReport', 'wait', 'native.sparkling']);
    assert.deepEqual(steps[1].input, { duration: 10000, unit: 'ms' });
    assert.deepEqual(steps[2].input, { contract: 'home' });
    assert.ok(!steps.some(s => ['launch', 'native.cdp', 'aiTap', 'aiInput', 'aiScroll'].includes(s.node)));
    const actions = steps.filter(s => s.node === 'aiAct');
    assert.equal(actions.length, open[3] ? 3 : 2);
    assert.ok(actions.at(-2).input.prompt.includes(open[1]), 'Exact unchanged route URL');
    assert.match(actions.at(-1).input.prompt, /Open button directly to the right/);
    assert.match(actions.at(-1).input.prompt, /BELOW its heading and ABOVE the Fullscreen/);
    assert.match(actions.at(-1).input.prompt, /Do not tap the separate Sparkling Go runtime selector/);
    for (const action of actions) assert.deepEqual(action.input.options, { deepLocate: action !== actions.at(-1), cacheable: false });
    const contracts = steps.filter(s => s.node === 'native.sparkling').map(s => s.input);
    assert.deepEqual(contracts.slice(0, open[3] ? 3 : 2), open[3]
      ? [{ contract: 'home' }, { contract: 'runtime', runtime: open[3] }, { contract: 'parent' }]
      : [{ contract: 'home' }, { contract: 'parent' }]);
    const translated = contracts.slice(open[3] ? 3 : 2).flatMap(input => {
      if (input.contract === 'role') return [['exact', 'nav-role', 'parent']];
      if (input.contract === 'mapped') return [...Object.entries(mappedProperties).map(([tag, value]) => ['exact', tag, value]), ['nonempty', 'nav-is-notch-screen', ['absent']]];
      assert.ok(['sparkling', 'legacy'].includes(input.contract));
      return [[input.contract]];
    });
    assert.deepEqual(translated, assertions);
  }
  const runner = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/runner.py', import.meta.url), 'utf8');
  assert.match(runner, /runner\.set_open_card\(False\)/);
  assert.match(runner, /time\.sleep\(3\)/);
  const common = readFileSync(new URL('../../integration_test/test_script/lib/test_runner/test_runner.py', import.meta.url), 'utf8');
  assert.match(common, /time\.sleep\(5\)/);
  assert.match(common, /time\.sleep\(2\)/);
});

test('router YAML retains the original push/pop and dynamic container identity assertions in order', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects.find(p => p.name === 'ios-explorer');
  const doc = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
    sourcePath: 'cases/ios-sparkling/router.yaml', absolutePath: root + 'cases/ios-sparkling/router.yaml' }, {
    resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
  });
  assert.equal(doc.cases.length, 1);
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/RouterOpenClose.py', import.meta.url), 'utf8');
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
from types import SimpleNamespace
tree=ast.parse(sys.stdin.read())
run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run')
events=[]
ids=iter(['parent-id','child-id'])
def nonempty(_,tag,forbidden):
    events.append(['nonempty',tag,sorted(forbidden)])
    return next(ids)
def visible(_,tag,expected):
    events.append(['visible',tag,expected])
    return expected
def open_home(_,url,button):
    events.append(['open',url,button])
    return 'parent'
namespace={'CANONICAL_PARENT_URL':'canonical','open_from_homepage':open_home,
'assert_sparkling_capabilities':lambda _:events.append(['sparkling']),
'assert_nonempty_tag':nonempty,'wait_for_visible_view':visible,
'click_visible_tag':lambda view,tag:events.append(['click',view,tag]),
'assert_tag_text':lambda _,tag,value:events.append(['exact',tag,value])}
exec(compile(ast.Module(body=[run],type_ignores=[]),'unchanged-router-case','exec'),namespace)
namespace['run'](SimpleNamespace(start_step=lambda *args:None))
assert any(isinstance(n,ast.If) and any(isinstance(child,ast.Raise) for child in n.body) for n in run.body)
print(json.dumps(events))`], { input: source, encoding: 'utf8' }));
  const steps = doc.cases[0].definition.steps;
  assert.deepEqual(steps.filter(s => s.node === 'native.sparkling').map(s => s.input.contract), [
    'home', 'parent', 'sparkling', 'rememberParent', 'child', 'sparkling', 'childIdentity', 'restoredParent',
  ]);
  assert.deepEqual(reference, [
    ['open', 'canonical', 'open-bundle-url'], ['sparkling'], ['nonempty', 'nav-container-id', ['absent']],
    ['click', 'parent', 'nav-open-child'], ['visible', 'nav-role', 'child'], ['sparkling'],
    ['nonempty', 'nav-container-id', ['absent', 'parent-id']], ['click', 'child', 'nav-close-child'],
    ['visible', 'nav-role', 'parent'], ['exact', 'nav-return-success', 'returned:ok'], ['exact', 'nav-container-id', 'parent-id'],
  ]);
  const actions = steps.filter(s => s.node === 'aiAct');
  assert.equal(actions.length, 4);
  assert.ok(actions[0].input.prompt.includes(sparklingRoutes.canonicalParentUrl));
  assert.match(actions[1].input.prompt, /Open button directly to the right/);
  assert.match(actions[2].input.prompt, /Open child with router.open/);
  assert.match(actions[3].input.prompt, /Close child with router.close/);
  assert.match(actions[3].input.prompt, /exactly once/);
  assert.match(actions[3].input.prompt, /parent page.*expected successful result/);
  assert.match(actions[3].input.prompt, /Do not tap anything on the returned parent page/);
  for (const action of actions) assert.deepEqual(action.input.options, { deepLocate: true, cacheable: false });
  assert.deepEqual(steps[1].input, { duration: 10000, unit: 'ms' });
});

test('malformed and hot external flows retain every original route, alert and no-fallback assertion', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects.find(p => p.name === 'ios-explorer');
  const doc = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
    sourcePath: 'cases/ios-sparkling/route-errors.yaml', absolutePath: root + 'cases/ios-sparkling/route-errors.yaml' }, {
    resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
  });
  for (const item of doc.cases.map(c => c.definition)) {
    const name = item.name.slice('sparkling/'.length);
    const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/' + name + '.py', import.meta.url), 'utf8');
    const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
from types import SimpleNamespace
tree=ast.parse(sys.stdin.read())
run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run')
events=[]
def nonempty(_,tag,forbidden):
    events.append(['nonempty',tag,sorted(forbidden)])
    return 'original-id'
def visible(_,tag,expected=None): events.append(['visible',tag,expected])
def open_home(_,url,button,runtime=None):
    events.append(['open',url,button,runtime])
    return 'parent'
namespace={'RAW_PARENT_URL':'raw','MALFORMED_CANONICAL_URL':'malformed','CANONICAL_PARENT_URL':'canonical',
'open_from_homepage':open_home,'assert_sparkling_capabilities':lambda _:events.append(['sparkling']),
'assert_nonempty_tag':nonempty,'wait_for_visible_view':visible,
'click_visible_tag':lambda view,tag:events.append(['click',view,tag]),
'assert_tag_text':lambda _,tag,value:events.append(['exact',tag,value]),
'accept_route_error_alert':lambda _,code:events.append(['alert',code]),
'open_external_url':lambda _,url:events.append(['external',url])}
exec(compile(ast.Module(body=[run],type_ignores=[]),'unchanged-route-errors','exec'),namespace)
namespace['run'](SimpleNamespace(start_step=lambda *args:None))
print(json.dumps(events))`], { input: source, encoding: 'utf8' }));
    const contracts = item.steps.filter(s => s.node === 'native.sparkling').map(s => s.input);
    const actions = item.steps.filter(s => s.node === 'aiAct');
    for (const action of actions) assert.deepEqual(action.input.options, { deepLocate: true, cacheable: false });
    assert.deepEqual(item.steps[1].input, { duration: 10000, unit: 'ms' });
    assert.ok(!item.steps.some(s => ['launch', 'aiTap', 'aiInput', 'native.cdp'].includes(s.node)));
    if (name === 'HotExternalURL') {
      assert.deepEqual(reference, [
        ['visible', 'bundle-url-input', null], ['external', 'malformed'], ['alert', 'missing_target'],
        ['visible', 'bundle-url-input', null], ['external', 'canonical'], ['exact', 'nav-role', 'parent'], ['sparkling'],
      ]);
      assert.deepEqual(contracts.map(c => c.contract), ['home', 'externalMalformed', 'alert', 'alertDismissed', 'home', 'externalCanonical', 'role', 'sparkling']);
      assert.equal(actions.length, 1);
    } else {
      assert.equal(name, 'MalformedCanonicalNoFallback');
      assert.deepEqual(reference, [
        ['open', 'raw', 'open-bundle-url', 'sparkling'], ['sparkling'], ['nonempty', 'nav-container-id', ['absent']],
        ['click', 'parent', 'nav-open-malformed'], ['alert', 'missing_target'],
        ['exact', 'nav-route-result', 'malformed:missing_target'], ['visible', 'nav-role', 'parent'],
        ['sparkling'], ['exact', 'nav-container-id', 'original-id'],
      ]);
      assert.deepEqual(contracts, [
        { contract: 'home' }, { contract: 'runtime', runtime: 'sparkling' }, { contract: 'parent' },
        ...['sparkling', 'rememberParent', 'alert', 'alertDismissed', 'malformedParent', 'sparkling', 'sameParent'].map(contract => ({ contract })),
      ]);
      assert.equal(actions.length, 5);
      assert.match(actions[0].input.prompt, /Sparkling Go/);
      assert.ok(actions[1].input.prompt.includes(sparklingRoutes.rawParentUrl));
      assert.match(actions[2].input.prompt, /Open button directly to the right/);
      assert.match(actions[3].input.prompt, /button labelled "Open malformed canonical"/);
    }
    assert.match(actions.at(-1).input.prompt, /OK button.*Unable to Open \(missing_target\)/);
  }
});
