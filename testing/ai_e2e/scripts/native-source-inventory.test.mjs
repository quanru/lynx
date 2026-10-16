import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { discoverTestFiles, loadTestProject } from '@midscene/test/config';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = fileURLToPath(new URL('../../integration_test/test_script/case_sets/', import.meta.url));
const disabled = ['core/ListBase'];
const smoke = [
  'Explorer home shows URL entry and showcase',
  'Open Showcase from home',
  'Browse into Showcase Image examples',
];

// Parse source declarations without importing Appium or executing test modules.
// Unknown configuration syntax fails closed instead of silently omitting a case.
const inventoryScript = String.raw`
import ast, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
result = []
for suite in ('core', 'sparkling', 'xelement'):
    for path in sorted((root / suite).glob('*.py')):
        if path.name.startswith('__') or path.name == 'runner.py':
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        assignments = [node for node in tree.body if isinstance(node, ast.Assign)
                       and any(isinstance(target, ast.Name) and target.id == 'config'
                               for target in node.targets)]
        if not assignments:
            # These are the only source-owned helper modules, not test cases.
            assert path.name in ('helpers.py', 'video_utils.py'), str(path)
            continue
        assert len(assignments) == 1, str(path)
        value = assignments[0].value
        if isinstance(value, ast.Call):
            assert ast.dump(value) == ast.dump(ast.parse('dict(HOMEPAGE_CONFIG)', mode='eval').body), str(path)
            imports = [node for node in tree.body if isinstance(node, ast.ImportFrom)
                       and node.level == 1 and node.module == 'helpers'
                       and any(alias.name == 'HOMEPAGE_CONFIG' and alias.asname is None for alias in node.names)]
            assert len(imports) == 1, str(path)
            helper = ast.parse((path.parent / 'helpers.py').read_text())
            values = [node.value for node in helper.body if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == 'HOMEPAGE_CONFIG'
                              for target in node.targets)]
            assert len(values) == 1, str(path)
            value = values[0]
        config = ast.literal_eval(value)
        assert isinstance(config, dict), str(path)
        enabled = config.get('enable', True)
        platforms = config.get('platform', ['android', 'ios'])
        if isinstance(platforms, str):
            platforms = [platforms]
        assert isinstance(enabled, bool), str(path)
        assert isinstance(platforms, list) and platforms and all(p in ('android', 'ios') for p in platforms), str(path)
        # A later config mutation must be reviewed rather than ignored by this parser.
        for node in tree.body:
            if node is assignments[0] or isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            assert not any(isinstance(child, ast.Name) and child.id == 'config' for child in ast.walk(node)), str(path)
        result.append({'name': suite + '/' + path.stem, 'enabled': enabled, 'platforms': platforms})
print(json.dumps(result))
`;

function assertInventory(sources, names, platform) {
  assert.equal(new Set(sources.map(source => source.name)).size, sources.length, 'Duplicate source module');
  assert.deepEqual(sources.filter(source => !source.enabled).map(source => source.name).sort(), disabled,
    'Disabled source classification changed; investigate before enabling or excluding a case');
  assert.equal(new Set(names).size, names.length, 'Duplicate YAML case name');
  const expected = sources.filter(source => source.enabled && source.platforms.includes(platform)).map(source => source.name);
  assert.deepEqual([...names].sort(), [...expected, ...smoke].sort(),
    `${platform}: every enabled source needs one same-name YAML case; only classified smoke cases are additive`);
}

test('native source modules map exactly to collected YAML on each supported platform', async () => {
  const sources = JSON.parse(execFileSync('python3', ['-c', inventoryScript, sourceRoot], { encoding: 'utf8' }));
  assert.ok(sources.length > 0, 'Source discovery must not be empty');
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  assert.deepEqual(loaded.projects.map(project => project.name).sort(), ['android-explorer', 'ios-explorer']);
  for (const project of loaded.projects) {
    const names = [];
    for (const absolutePath of discoverTestFiles(root, project.files)) {
      const doc = collectWorkflowDocument({
        projectId: project.projectId, projectName: project.name,
        sourcePath: relative(root, absolutePath), absolutePath,
      }, { resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env });
      names.push(...doc.cases.map(item => item.definition.name));
    }
    assertInventory(sources, names, project.name === 'ios-explorer' ? 'ios' : 'android');
  }
});

test('inventory rejects unmapped additions, duplicates, disabled cases and wrong-platform coverage', () => {
  const sources = [
    { name: 'core/Example', enabled: true, platforms: ['android', 'ios'] },
    { name: 'core/ListBase', enabled: false, platforms: ['android', 'ios'] },
    { name: 'sparkling/Example', enabled: true, platforms: ['ios'] },
  ];
  const android = [...smoke, 'core/Example'];
  assert.doesNotThrow(() => assertInventory(sources, android, 'android'));
  assert.doesNotThrow(() => assertInventory(sources, [...android, 'sparkling/Example'], 'ios'));
  assert.throws(() => assertInventory([...sources, { name: 'core/NewCase', enabled: true, platforms: ['android'] }], android, 'android'));
  assert.throws(() => assertInventory(sources, [...android, 'core/Example'], 'android'), /Duplicate YAML/);
  assert.throws(() => assertInventory([...sources, sources[0]], android, 'android'), /Duplicate source/);
  assert.throws(() => assertInventory(sources, [...android, 'core/ListBase'], 'android'));
  assert.throws(() => assertInventory(sources, [...android, 'sparkling/Example'], 'android'));
  assert.throws(() => assertInventory(sources, android, 'ios'));
  assert.throws(() => assertInventory(sources.map(source => ({ ...source, enabled: true })), android, 'android'), /Disabled source classification/);
  assert.throws(() => assertInventory(sources, [...android, 'Unclassified smoke'], 'android'));
});
