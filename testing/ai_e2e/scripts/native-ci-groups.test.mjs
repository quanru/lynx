import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTestProject, discoverTestFiles } from '@midscene/test/config';
import { collectExpectedCases } from './expected-cases.mjs';
import { nativeCiGroups, nativeCiFiles, nativeCiGroup, requireNativeProjectGroup } from './native-ci-groups.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };

test('five disjoint device groups preserve all original files and all 33 platform case identities', async () => {
  const loaded = await loadTestProject(`${root}/midscene.config.ts`);
  const counts = [10, 3, 1, 3, 16];
  assert.equal(loaded.test.maxConcurrentProjects, 1);
  assert.equal(loaded.test.maxConcurrentFiles, 1);
  for (const project of loaded.projects) {
    const full = await collectExpectedCases(project.name, env);
    const grouped = [];
    const files = [];
    for (const group of nativeCiGroups.filter(group => `${group.platform}-explorer` === project.name)) {
      const selectedEnv = { ...env, NATIVE_CI_GROUP: group.id };
      const collection = await collectExpectedCases(project.name, selectedEnv);
      assert.equal(collection.expectedCount, counts[nativeCiGroups.indexOf(group)]);
      assert.equal(collection.groupId, group.id);
      assert.equal(collection.label, group.label);
      grouped.push(...collection.cases);
      files.push(...discoverTestFiles(root, nativeCiFiles(project.name, project.files, selectedEnv)));
    }
    assert.equal(new Set(files).size, files.length, 'No source file can execute in two device groups');
    assert.deepEqual(files.sort(), discoverTestFiles(root, project.files).sort());
    const identities = items => items.map(item => JSON.stringify(item)).sort();
    assert.deepEqual(identities(grouped), identities(full.cases));
    assert.equal(new Set(grouped.map(item => item.caseId)).size, full.expectedCount);
  }
});

test('the real SDK applies group selection at config load, while every device remains serial', () => {
  for (const group of nativeCiGroups) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { loadTestProject, discoverTestFiles } from '@midscene/test/config';
      const loaded = await loadTestProject('./midscene.config.ts');
      const project = loaded.projects.find(item => item.name === ${JSON.stringify(`${group.platform}-explorer`)});
      console.log(JSON.stringify({ files: discoverTestFiles(process.cwd(), project.files),
        projectLimit: loaded.test.maxConcurrentProjects, fileLimit: project.maxConcurrentFiles,
        deadline: loaded.test.testTimeout, retry: project.retry }));
    `], { cwd: root, env: { ...process.env, NATIVE_CI_GROUP: group.id }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout.trim());
    assert.deepEqual(value.files.sort(), group.files.map(file => `${root}${file}`).sort());
    assert.equal(value.projectLimit, 1);
    assert.equal(value.fileLimit, 1);
    assert.equal(value.deadline, 180_000);
    assert.equal(value.retry, 1);
  }
});

test('local runs remain complete and invalid or cross-platform CI groups fail before device startup', () => {
  const original = { include: ['cases/native/**/*.yaml'] };
  assert.equal(nativeCiFiles('android-explorer', original, {}), original);
  assert.equal(nativeCiGroup({}), undefined);
  assert.throws(() => nativeCiGroup({ NATIVE_CI_GROUP: 'typo' }), /Unknown/);
  assert.throws(() => requireNativeProjectGroup('ios-explorer', { NATIVE_CI_GROUP: 'android-video' }), /does not belong/);
  const result = spawnSync(process.execPath, ['scripts/run-ci.mjs', '--project', 'ios-explorer'], {
    cwd: root, env: { ...process.env, NATIVE_CI_GROUP: 'android-video' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not belong/);
  assert.doesNotMatch(result.stdout, /RUN|WDA|Launching/);
});
