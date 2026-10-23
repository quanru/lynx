import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { nativeCiGroups } from './native-ci-groups.mjs';
import { collectExpectedCases, executionIdentity, executionStatus } from './expected-cases.mjs';
import { nativeJobResultResolver, nativeSummaryArguments, selectNativeGroupReports } from './native-ci-reports.mjs';
import { testRunDump } from './render-ci-summary.mjs';

const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
  ANDROID_RESULT: 'success', IOS_RESULT: 'success' };
const json = (file, value) => writeFile(file, JSON.stringify(value));
async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'lynx-native-groups-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

// Synthetic report fixtures exercise publication only, not device acceptance.
async function stage(source, group, attempt = '1', outcome = 'success', withReport = true) {
  const identityEnv = { ...env, GITHUB_RUN_ATTEMPT: attempt, NATIVE_CI_GROUP: group.id };
  const projectName = `${group.platform}-explorer`;
  const inventory = await collectExpectedCases(projectName, identityEnv);
  const directory = path.join(source, group.id, `attempt-${attempt}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'attempt.txt'), attempt);
  await json(path.join(directory, 'group.json'), executionIdentity(projectName, identityEnv));
  await json(path.join(directory, 'expected-cases.json'), inventory);
  await json(path.join(directory, 'execution-status.json'), executionStatus(projectName, outcome, identityEnv));
  if (!withReport) return directory;
  const cases = inventory.cases.map((item, index) => {
    const failed = outcome === 'failure' && index === 0;
    return { ...item, status: failed ? 'failed' : 'success', attempts: [{ attemptId: `attempt-${index}`,
      durationMs: 10, beforeEach: [], afterEach: [], steps: [{ id: `step-${index}`, node: 'recordToReport',
        status: failed ? 'failed' : 'success', agentDetails: [{ reportId: 'report-1', executionId: 'execution-1' }] }] }] };
  });
  const failed = outcome === 'failure' ? 1 : 0;
  const dump = { schemaVersion: 1, kind: 'test-runner', runId: group.id, status: failed ? 'failed' : 'success',
    startedAt: '2026-10-23T00:00:00.000Z', endedAt: '2026-10-23T00:00:01.000Z', durationMs: 1000,
    summary: { total: cases.length, passed: cases.length - failed, failed, notRun: 0, filtered: 0,
      collectionErrors: 0, documentFailures: 0, projectFailures: 0 },
    metrics: { modelCallCount: 0, modelTimeMs: 0, promptTokens: 0, cachedInputTokens: 0,
      completionTokens: 0, totalTokens: 0, collection: { status: 'unknown', reasons: ['Synthetic test fixture'] } },
    projects: [{ projectId: group.platform, name: projectName, collectionErrors: [], documents: [{
      documentId: 'document-1', beforeAll: [], afterAll: [], cases,
    }] }] };
  const report = path.join(directory, 'report');
  await mkdir(report);
  await writeFile(path.join(report, 'frame.png'), Buffer.from([1, 2, 3]));
  await writeFile(path.join(report, 'index.html'), `<html><body>
    <script type="midscene_test_run_dump">${JSON.stringify(dump)}</script>
    <script type="midscene_web_dump" data-report-id="report-1">${JSON.stringify({ executions: [{ id: 'execution-1',
    tasks: [{ recorder: [{ type: 'screenshot', screenshot: { storage: 'file', path: 'frame.png', mimeType: 'image/png' } }] }] }] })}</script>
    </body></html>`);
  return directory;
}

async function allGroups(source) {
  for (const group of nativeCiGroups) await stage(source, group);
}

function fixtureJobResult(source) {
  return async (group, attempt, optional) => {
    let execution;
    try { execution = JSON.parse(await readFile(path.join(source, group.id, `attempt-${attempt}`, 'execution-status.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' && optional) return undefined; throw error; }
    return { jobId: String(100 + nativeCiGroups.indexOf(group)), outcome: execution.outcome === 'skipped' ? 'failure' : execution.outcome };
  };
}

test('five grouped reports publish all 33 linked screenshots and preserve failed-attempt selection', async t => {
  const root = await temporary(t), source = path.join(root, 'source'), selected = path.join(root, 'selected');
  await allGroups(source);
  const rerun = nativeCiGroups[1];
  await stage(source, rerun, '2', 'failure');
  const failedEnv = { ...env, ANDROID_RESULT: 'failure' };
  await selectNativeGroupReports(source, selected, failedEnv, fixtureJobResult(source));
  const args = await nativeSummaryArguments(selected, failedEnv);
  for (const group of nativeCiGroups) {
    const attempt = await readFile(path.join(selected, `midscene-ai-e2e-${group.id}`, 'selected-attempt.txt'), 'utf8');
    assert.equal(attempt.trim(), group === rerun ? '2' : '1');
    assert.ok(args.includes(`${group.label}=midscene-ai-e2e-report-2`));
  }
  const site = path.join(root, 'site'), summary = path.join(root, 'summary.md');
  execFileSync(process.execPath, [fileURLToPath(new URL('./native-ci-reports.mjs', import.meta.url)), 'summary', selected,
    '--title', 'Native parallel fixture', '--run-url', 'https://github.com/example/repo/actions/runs/123',
    '--pages-url', 'https://example.test', '--site-dir', site, '--site-prefix', 'runs/123-2', '--output', summary,
  ], { env: { ...process.env, ...failedEnv }, stdio: 'pipe' });
  const markdown = await readFile(summary, 'utf8');
  assert.match(markdown, /1 need attention · 32 passed/);
  assert.equal((markdown.match(/<img /g) ?? []).length, 33);
  assert.equal((markdown.match(/\[Open report\]/g) ?? []).length, 33);
  const failure = markdown.indexOf('xelement/VideoAttributes');
  assert.ok(failure >= 0 && failure < markdown.indexOf('<details>'));
  const index = await readFile(path.join(site, 'index.html'), 'utf8');
  const mergedPath = /url=([^"<>]+)/.exec(index)[1];
  const merged = testRunDump(await readFile(path.join(site, mergedPath), 'utf8'));
  assert.equal(merged.summary.total, 33);
  assert.equal(merged.summary.failed, 1);
  const ids = merged.projects.flatMap(project => project.documents.flatMap(document => document.cases.map(item => item.caseId)));
  assert.equal(new Set(ids).size, 33, 'Merged projects with the same platform name must retain unique case links');
});

test('a newer failed job without an artifact cannot reuse an older successful report', async t => {
  const root = await temporary(t), source = path.join(root, 'source');
  await allGroups(source);
  const prior = fixtureJobResult(source);
  const latest = async (group, attempt, optional) => group.id === nativeCiGroups[0].id && attempt === '2'
    ? { jobId: '999', outcome: 'failure' } : prior(group, attempt, optional);
  await assert.rejects(selectNativeGroupReports(source, path.join(root, 'selected'), { ...env, ANDROID_RESULT: 'failure' }, latest),
    /Newer native job has no artifact; refusing an older report/);
});

test('setup failure retains the latest group inventory rather than resurrecting its old green report', async t => {
  const root = await temporary(t), source = path.join(root, 'source'), selected = path.join(root, 'selected');
  await allGroups(source);
  const group = nativeCiGroups[4];
  await stage(source, group, '2', 'skipped', false);
  const failedEnv = { ...env, IOS_RESULT: 'failure' };
  await selectNativeGroupReports(source, selected, failedEnv, fixtureJobResult(source));
  const output = path.join(root, 'summary.md');
  execFileSync(process.execPath, [fileURLToPath(new URL('./native-ci-reports.mjs', import.meta.url)), 'summary', selected,
    '--title', 'Failed setup fixture', '--run-url', 'https://github.com/example/repo/actions/runs/123',
    '--links-published', 'false', '--site-dir', path.join(root, 'site'), '--site-prefix', 'runs/123-2', '--output', output,
  ], { env: { ...process.env, ...failedEnv }, stdio: 'pipe' });
  const markdown = await readFile(output, 'utf8');
  assert.match(markdown, /16 need attention · 17 passed/);
  assert.match(markdown, /Device setup or prerequisites/);
  assert.doesNotMatch(markdown, /<img/);
  assert.equal((markdown.match(/^\| (?:Android|iOS) ·/gm) ?? []).length, 33);
  await assert.rejects(readFile(path.join(selected, `midscene-ai-e2e-${group.id}`, 'report/index.html')), /ENOENT/);
});

test('job provenance uses the exact matrix job and attempt, not the failed aggregate platform', async () => {
  const requests = [];
  const jobs = nativeCiGroups.map((group, index) => ({ id: index + 100, run_id: 123, run_attempt: 2,
    name: `Midscene AI E2E · ${group.label}`, status: 'completed', conclusion: index === 1 ? 'failure' : 'success',
    started_at: '2026-10-23T02:01:00Z', completed_at: '2026-10-23T02:10:00Z' }));
  const resolver = nativeJobResultResolver({ ...env, GITHUB_REPOSITORY: 'example/repo', GH_TOKEN: 'test-token' }, async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { ok: true, json: async () => url.includes('/jobs?') ? { jobs, total_count: jobs.length }
      : { id: 123, run_attempt: 2, run_started_at: '2026-10-23T02:00:00Z' } };
  });
  assert.deepEqual(await resolver(nativeCiGroups[0], '2'), { jobId: '100', outcome: 'success' });
  assert.deepEqual(await resolver(nativeCiGroups[1], '2'), { jobId: '101', outcome: 'failure' });
  assert.equal(requests.length, 2);
  assert.match(requests[0], /\/runs\/123\/attempts\/2$/);
  assert.match(requests[1], /\/runs\/123\/attempts\/2\/jobs\?/);
  await assert.rejects(resolver(nativeCiGroups[0], '1'), /Malformed native workflow attempt/);
});

function partialRerunApi() {
  return async url => {
    const attempt = Number(/\/attempts\/(\d+)/.exec(url)[1]);
    const jobs = nativeCiGroups.map((group, index) => {
      const actualAttempt = attempt === 2 && index === 1 ? 2 : 1;
      return { id: attempt * 100 + index, run_id: 123, run_attempt: attempt,
        name: `Midscene AI E2E · ${group.label}`, status: 'completed',
        conclusion: index === 2 || (index === 1 && actualAttempt === 1) ? 'failure' : 'success',
        started_at: `2026-10-23T0${actualAttempt}:01:00Z`, completed_at: `2026-10-23T0${actualAttempt}:10:00Z` };
    });
    return { ok: true, json: async () => url.includes('/jobs?') ? { jobs, total_count: jobs.length }
      : { id: 123, run_attempt: attempt, run_started_at: `2026-10-23T0${attempt}:00:00Z` } };
  };
}

test('partial reruns retain original artifacts despite copied jobs receiving new attempt numbers and IDs', async t => {
  const root = await temporary(t), source = path.join(root, 'source'), selected = path.join(root, 'selected');
  for (const [index, group] of nativeCiGroups.entries()) {
    await stage(source, group, '1', index === 1 ? 'skipped' : index === 2 ? 'failure' : 'success', index !== 1);
  }
  await stage(source, nativeCiGroups[1], '2');
  const failedEnv = { ...env, IOS_RESULT: 'failure', GITHUB_REPOSITORY: 'example/repo', GH_TOKEN: 'test-token' };
  const resolver = nativeJobResultResolver(failedEnv, partialRerunApi());
  await selectNativeGroupReports(source, selected, failedEnv, resolver);
  for (const [index, group] of nativeCiGroups.entries()) {
    const result = JSON.parse(await readFile(path.join(selected, `midscene-ai-e2e-${group.id}`, 'job-result.json'), 'utf8'));
    assert.equal(result.attempt, index === 1 ? '2' : '1');
    assert.equal(result.jobId, String((index === 1 ? 200 : 100) + index));
    assert.equal(result.outcome, index === 2 ? 'failure' : 'success');
  }
  assert.equal(await resolver(nativeCiGroups[0], '2', true), undefined);
  await assert.rejects(resolver(nativeCiGroups[0], '2'), /did not execute within/);
  const args = await nativeSummaryArguments(selected, failedEnv);
  assert.ok(args.includes('iOS · Boundary=failure'));
  assert.ok(args.includes('Android · Video=success'));
  const output = path.join(root, 'summary.md');
  execFileSync(process.execPath, [fileURLToPath(new URL('./native-ci-reports.mjs', import.meta.url)), 'summary', selected,
    '--title', 'Partial rerun fixture', '--run-url', 'https://github.com/example/repo/actions/runs/123',
    '--pages-url', 'https://example.test', '--site-dir', path.join(root, 'site'), '--site-prefix', 'runs/123-2', '--output', output,
  ], { env: { ...process.env, ...failedEnv }, stdio: 'pipe' });
  const markdown = await readFile(output, 'utf8');
  assert.match(markdown, /1 need attention · 32 passed/);
  assert.equal((markdown.match(/<img /g) ?? []).length, 33);
  assert.equal((markdown.match(/\[Open report\]/g) ?? []).length, 33);
  assert.ok(markdown.indexOf('xelement/VideoBoundary') < markdown.indexOf('<details>'));
});

test('partial reruns still reject a real newer execution whose artifact is missing', async t => {
  const root = await temporary(t), source = path.join(root, 'source');
  await allGroups(source);
  const apiEnv = { ...env, GITHUB_REPOSITORY: 'example/repo', GH_TOKEN: 'test-token' };
  await assert.rejects(selectNativeGroupReports(source, path.join(root, 'selected'), apiEnv,
    nativeJobResultResolver(apiEnv, partialRerunApi())), /Newer native job has no artifact.*android-video/);
});

test('invalid, reversed or attempt-overlapping job timestamps cannot be mistaken for retained results', async () => {
  for (const patch of [
    { started_at: undefined },
    { started_at: 123 },
    { completed_at: '2026-10-23' },
    { completed_at: 'invalid' },
    { started_at: '2026-10-23T02:10:00Z', completed_at: '2026-10-23T02:01:00Z' },
    { started_at: '2026-10-23T01:01:00Z', completed_at: '2026-10-23T02:01:00Z' },
  ]) {
    const request = partialRerunApi();
    const resolver = nativeJobResultResolver({ ...env, GITHUB_REPOSITORY: 'example/repo', GH_TOKEN: 'test-token' }, async url => {
      const response = await request(url), data = await response.json();
      if (data.jobs) Object.assign(data.jobs[0], patch);
      return { ok: true, json: async () => data };
    });
    await assert.rejects(resolver(nativeCiGroups[0], '2', true), /timestamps|did not execute within/);
  }
});

test('missing artifacts cannot turn successful jobs green; failed groups remain explicitly absent', async t => {
  const root = await temporary(t), source = path.join(root, 'source');
  await assert.rejects(selectNativeGroupReports(source, path.join(root, 'bad'), env), /no artifact/);
  const failedEnv = { ...env, ANDROID_RESULT: 'failure', IOS_RESULT: 'cancelled' };
  const target = path.join(root, 'missing');
  await selectNativeGroupReports(source, target, failedEnv);
  const args = await nativeSummaryArguments(target, failedEnv);
  assert.equal(args.filter(value => value === '--entry').length, 5);
  assert.equal(args.filter(value => value.endsWith('=failure')).length, 2);
  assert.equal(args.filter(value => value.endsWith('=cancelled')).length, 3);
});

test('cross-group, stale-commit, changed inventory and future-attempt artifacts fail closed', async t => {
  const root = await temporary(t), group = nativeCiGroups[0];
  for (const damage of ['group', 'sha', 'cases', 'future']) {
    const source = path.join(root, damage);
    const directory = await stage(source, group, damage === 'future' ? '3' : '1');
    if (damage === 'group' || damage === 'sha') {
      const marker = JSON.parse(await readFile(path.join(directory, 'group.json'), 'utf8'));
      if (damage === 'group') marker.groupId = 'ios-video';
      else marker.sha = 'b'.repeat(40);
      await json(path.join(directory, 'group.json'), marker);
    } else if (damage === 'cases') {
      const inventory = JSON.parse(await readFile(path.join(directory, 'expected-cases.json'), 'utf8'));
      inventory.cases[0].name = 'Unrelated case';
      await json(path.join(directory, 'expected-cases.json'), inventory);
    }
    await assert.rejects(selectNativeGroupReports(source, path.join(root, `selected-${damage}`), env),
      /identity differs|every assigned|does not match/);
  }
});
