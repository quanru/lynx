import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { discoverTestFiles, loadTestProject } from '@midscene/test/config';
import { mappedProperties, sparklingRoutes } from '../sparkling-contracts.ts';

test('real SDK collects nine Android and thirteen iOS cases with Sparkling excluded from Android', async () => {
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
    assert.equal(names.length, ios ? 13 : 9);
    assert.equal(new Set(names).size, names.length);
    assert.equal(names.filter(name => name.startsWith('sparkling/')).length, ios ? 4 : 0);
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
    for (const action of actions) assert.deepEqual(action.input.options, { deepLocate: true, cacheable: false });
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
