import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';

const { SOURCE_RUN_ID: id, platform, CONTROL_DIR: directory, GITHUB_OUTPUT: output, GH_TOKEN: token } = process.env;
assert.equal(id, '38332110055');
assert.ok(['android', 'ios'].includes(platform));
assert.equal(process.env.GITHUB_REPOSITORY, 'quanru/lynx');
assert.ok(directory && output && token);
async function get(path) {
  const response = await fetch('https://api.github.com/repos/quanru/lynx/' + path, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true, 'Producer metadata unavailable');
  return response.json();
}
const run = await get('actions/runs/' + id);
assert.equal(run.head_sha, 'a47143b4c95a51ff3b27eb07ad0a7b320e8c4208');
assert.equal(run.path, '.github/workflows/midscene-ai-e2e.yml');
assert.equal(run.repository.full_name, 'quanru/lynx');
assert.equal(run.run_attempt, 1);
const jobs = await get('actions/runs/' + id + '/attempts/1/jobs?per_page=100');
assert.equal(jobs.total_count, jobs.jobs.length);
const builds = jobs.jobs.filter(job => job.name === 'Build current-source Explorer · ' + platform);
assert.equal(builds.length, 1);
assert.equal(builds[0].status, 'completed');
assert.equal(builds[0].conclusion, 'success');
const inventory = await get('actions/runs/' + id + '/artifacts?per_page=100');
assert.equal(inventory.total_count, inventory.artifacts.length);
const artifacts = inventory.artifacts.filter(item => item.name === 'midscene-explorer-source-' + platform + '-1');
assert.equal(artifacts.length, 1);
assert.equal(artifacts[0].expired, false);
assert.equal(artifacts[0].workflow_run.id, Number(id));
assert.equal(artifacts[0].workflow_run.head_sha, run.head_sha);
await mkdir(directory, { recursive: true });
await writeFile(directory + '/producer.json', JSON.stringify({
  run: Number(id), head: run.head_sha, platform, attempt: 1,
  buildJob: builds[0].id, artifact: artifacts[0].id,
}, null, 2));
await appendFile(output, 'head=' + run.head_sha + '\nattempt=1\n');
console.log('Verified exact current-layout producer:', platform, id, builds[0].id, artifacts[0].id);
