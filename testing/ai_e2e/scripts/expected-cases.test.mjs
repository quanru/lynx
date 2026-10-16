import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectExpectedCases, executionIdentity, executionStatus, selectedArtifactAttempt } from './expected-cases.mjs';

const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };

test('public collection records exact native identities without running setup or a model', async () => {
  for (const [projectName, count, label] of [['android-explorer', 13, 'Android'], ['ios-explorer', 20, 'iOS']]) {
    const value = await collectExpectedCases(projectName, env);
    assert.equal(value.expectedCount, count);
    assert.equal(value.cases.length, count);
    assert.equal(value.label, label);
    assert.equal(value.sha, env.GITHUB_SHA);
    assert.equal(value.attempt, '2');
    assert.equal(new Set(value.cases.map(item => item.caseId)).size, count);
    assert.ok(value.cases.every(item => /^[a-f0-9]{64}$/.test(item.caseId) && item.sourcePath.startsWith('cases/')));
    assert.equal(value.cases.some(item => item.name === 'core/ListBase'), false);
  }
});

test('execution status requires workflow identity and distinguishes skipped from started failures', () => {
  for (const outcome of ['success', 'failure', 'skipped', 'cancelled']) {
    assert.equal(executionStatus('ios-explorer', outcome, env).outcome, outcome);
  }
  assert.throws(() => executionStatus('ios-explorer', 'unknown', env), /workflow run-cases/);
  for (const value of [{}, { ...env, GITHUB_SHA: 'wrong' }, { ...env, GITHUB_RUN_ATTEMPT: '0' }]) {
    assert.throws(() => executionIdentity('ios-explorer', value), /exact CI/);
  }
  assert.throws(() => executionIdentity('unrecognized', env), /exact CI/);
});

test('workflow collects before setup and archives explicit execution outcome in the same attempt', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  for (const platform of ['android', 'ios']) {
    const job = workflow.split(`  ${platform}-ai-e2e:\n`)[1].split(/^  [a-z].*:\n/m)[0];
    const collect = job.indexOf(`expected-cases.mjs collect ${platform}-explorer`);
    assert.ok(collect > job.indexOf('name: Install Midscene test dependencies'));
    assert.ok(collect < job.indexOf('name: Preflight model endpoint'));
    assert.match(job, /EXECUTION_OUTCOME: \$\{\{ steps.run-cases.outcome \}\}/);
    assert.ok(job.includes(`expected-cases.mjs status ${platform}-explorer "$EXECUTION_OUTCOME"`));
    assert.ok(job.indexOf(`expected-cases.mjs status ${platform}-explorer`) < job.indexOf('cp -R testing/ai_e2e/midscene_run/.'));
  }
});

test('selected artifact attempt is proven by directory and marker, not inventory self-assertion', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'selected-native-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'attempt-1');
  await mkdir(directory);
  await writeFile(path.join(directory, 'attempt.txt'), '1\n');
  assert.equal(await selectedArtifactAttempt(directory, '2'), '1');
  await writeFile(path.join(directory, 'attempt.txt'), '2\n');
  await assert.rejects(selectedArtifactAttempt(directory, '2'), /does not match/);
  await writeFile(path.join(directory, 'attempt.txt'), '1\n');
  await assert.rejects(selectedArtifactAttempt(directory, '0'), /does not match/);
  assert.equal(await selectedArtifactAttempt(directory, '2', true), '1');
  await writeFile(path.join(directory, 'expected-cases.json'), '{}');
  await assert.rejects(selectedArtifactAttempt(directory, '2', true), /ENOENT/);
  await writeFile(path.join(directory, 'selected-attempt.txt'), '1\n');
  assert.equal(await selectedArtifactAttempt(directory, '2', true), '1');
  await writeFile(path.join(directory, 'selected-attempt.txt'), '2\n');
  await assert.rejects(selectedArtifactAttempt(directory, '2', true), /does not match/);
});
