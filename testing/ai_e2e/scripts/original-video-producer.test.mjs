import assert from 'node:assert/strict';
import test from 'node:test';
import { producerIdentity } from '../../e2e_diagnostics/producer.mjs';

const run = { id: 123, repository: { full_name: 'example/lynx' },
  path: '.github/workflows/midscene-ai-e2e.yml', status: 'in_progress',
  head_sha: 'a'.repeat(40), run_attempt: 2, html_url: 'https://github.com/example/lynx/actions/runs/123', conclusion: null };
const build = { id: 456, name: 'Build current-source Explorer · android', status: 'completed', conclusion: 'success' };
const inventory = { total_count: 1, jobs: [build] };
const read = (metadata = run, jobs = inventory) => async path => {
  if (path === 'actions/runs/123') return metadata;
  assert.equal(path, 'actions/runs/123/attempts/2/jobs?per_page=100');
  return jobs;
};

test('original control can consume a successful pinned Android build while model-backed jobs continue', async () => {
  const identity = await producerIdentity('123', 'example/lynx', read());
  assert.deepEqual(identity, { id: 123, head: 'a'.repeat(40), attempt: 2, url: run.html_url, conclusion: null, androidBuildJob: 456 });
});

test('completed and waiting producer runs still require the same successful build', async () => {
  for (const status of ['completed', 'waiting']) {
    assert.equal((await producerIdentity('123', 'example/lynx', read({ ...run, status }))).androidBuildJob, 456);
  }
});

test('foreign, wrong-workflow and malformed producer identities fail before any job lookup', async () => {
  for (const override of [{ id: 124 }, { repository: { full_name: 'other/lynx' } }, { path: '.github/workflows/other.yml' }, { head_sha: 'bad' }, { run_attempt: 0 }, { status: 'queued' }]) {
    let calls = 0;
    await assert.rejects(producerIdentity('123', 'example/lynx', async () => { calls++; return { ...run, ...override }; }), /identified same-repository/);
    assert.equal(calls, 1);
  }
});

test('missing, unfinished, failed, duplicated and truncated build evidence is rejected', async () => {
  for (const jobs of [[], [{ ...build, status: 'in_progress', conclusion: null }], [{ ...build, conclusion: 'failure' }], [build, build]]) {
    await assert.rejects(producerIdentity('123', 'example/lynx', read(run, { total_count: jobs.length, jobs })), /Android source build/);
  }
  await assert.rejects(producerIdentity('123', 'example/lynx', read(run, { total_count: 101, jobs: [build] })), /Incomplete producer job inventory/);
});
