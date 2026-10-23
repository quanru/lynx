import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { nativeCiGroups } from './native-ci-groups.mjs';
import { collectExpectedCases, executionIdentity, selectedArtifactAttempt } from './expected-cases.mjs';
import { loadExpectedCaseEvidence } from './render-ci-summary.mjs';

async function directories(directory) {
  try { return (await readdir(directory, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function groupEnv(group, env, attempt = env.GITHUB_RUN_ATTEMPT) {
  return { ...env, GITHUB_RUN_ATTEMPT: attempt, NATIVE_CI_GROUP: group.id };
}

function platformResult(group, env) {
  const result = env[`${group.platform.toUpperCase()}_RESULT`];
  if (!['success', 'failure', 'cancelled', 'skipped'].includes(result)) throw new Error('Missing native platform job result');
  return result;
}

function executionTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    ? Date.parse(value) : NaN;
}

export function nativeJobResultResolver(env = process.env, request = fetch, { wait = sleep, log = console.warn } = {}) {
  const attempts = new Map();
  async function getJson(url) {
    const response = await request(url, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Cannot verify native job provenance: HTTP ${response.status}`);
    return response.json();
  }
  async function snapshot(attempt) {
    if (!attempts.has(attempt)) attempts.set(attempt, (async () => {
      const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${attempt}`;
      const run = await getJson(url);
      const startedAt = executionTimestamp(run.run_started_at);
      if (String(run.id) !== env.GITHUB_RUN_ID || String(run.run_attempt) !== attempt || !Number.isFinite(startedAt)) {
        throw new Error('Malformed native workflow attempt provenance');
      }
      const jobs = [];
      for (let page = 1; ; page++) {
        const data = await getJson(`${url}/jobs?per_page=100&page=${page}`);
        if (!Array.isArray(data.jobs) || !Number.isSafeInteger(data.total_count)) throw new Error('Malformed native job provenance');
        jobs.push(...data.jobs);
        if (jobs.length >= data.total_count) return { jobs, startedAt };
        if (!data.jobs.length) throw new Error('Incomplete native job provenance');
      }
    })());
    return attempts.get(attempt);
  }
  return async (group, attempt, optional = false) => {
    if (!env.GH_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw new Error('Native job provenance requires Actions read access');
    // Dependency completion and the jobs API can become visible at different
    // times. Never cache an incomplete snapshot for the rest of publication.
    const delays = [2_000, 5_000, 10_000, 20_000];
    let matches, startedAt;
    for (let poll = 0; ; poll++) {
      const data = await snapshot(attempt);
      startedAt = data.startedAt;
      matches = data.jobs.filter(job => job.name === `Midscene AI E2E · ${group.label}`);
      const awaitingConclusion = matches.length === 1 && matches[0].status === 'completed' && matches[0].conclusion == null;
      const pending = matches.length === 0 || awaitingConclusion || (matches.length === 1
        && ['queued', 'waiting', 'pending', 'in_progress', 'requested'].includes(matches[0].status));
      if (!pending) break;
      attempts.delete(attempt);
      const state = matches.length === 0 ? 'missing' : awaitingConclusion ? 'awaiting-conclusion' : matches[0].status;
      if (poll === delays.length) {
        // Even an optional newer-attempt lookup must fail closed here. An
        // absent API row is not evidence that an older artifact is reusable.
        throw new Error(`Native job provenance remained ${state} after ${poll + 1} snapshots: ${group.id}, attempt ${attempt}`);
      }
      log(`Waiting for native job provenance: ${group.id}, attempt ${attempt}, ${state}; refresh ${poll + 1}/${delays.length}.`);
      await wait(delays[poll]);
    }
    const job = matches[0];
    if (matches.length !== 1 || job.status !== 'completed' || String(job.run_id) !== env.GITHUB_RUN_ID
      || String(job.run_attempt) !== attempt || !Number.isSafeInteger(job.id) || job.id <= 0
      || !['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'startup_failure', 'stale'].includes(job.conclusion)) {
      throw new Error(`Native group has no unique completed job in its producing attempt: ${group.id}, attempt ${attempt}, matches ${matches.length}, status ${job?.status}, conclusion ${job?.conclusion}, run ${job?.run_id}, job attempt ${job?.run_attempt}`);
    }
    const jobStartedAt = executionTimestamp(job.started_at), jobCompletedAt = executionTimestamp(job.completed_at);
    if (!Number.isFinite(jobStartedAt) || !Number.isFinite(jobCompletedAt) || jobCompletedAt < jobStartedAt) {
      throw new Error(`Invalid native job execution timestamps: ${group.id}`);
    }
    // Partial reruns clone unchanged jobs into the new attempt with NEW IDs and
    // run_attempt values, but retain their original execution timestamps. Only
    // jobs executed during this attempt can require a new producer artifact.
    if (jobStartedAt < startedAt) {
      if (optional && jobCompletedAt < startedAt) return undefined;
      throw new Error(`Native group did not execute within its selected attempt: ${group.id}`);
    }
    return { jobId: String(job.id), outcome: ['success', 'cancelled', 'skipped'].includes(job.conclusion) ? job.conclusion : 'failure' };
  };
}

async function validateGroup(directory, group, attempt, env) {
  const selectedEnv = groupEnv(group, env, attempt);
  const identity = executionIdentity(`${group.platform}-explorer`, selectedEnv);
  // Stage this marker even if installation fails before SDK case collection.
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'group.json'), 'utf8')), identity,
    'Native group artifact identity differs from its selected workflow producer');
  await loadExpectedCaseEvidence(directory, { ...identity, currentAttempt: env.GITHUB_RUN_ATTEMPT });
  let inventory;
  try { inventory = JSON.parse(await readFile(path.join(directory, 'expected-cases.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  assert.equal(inventory.groupId, group.id, 'Native inventory group mismatch');
  const expected = await collectExpectedCases(identity.projectName, selectedEnv);
  const cases = value => [...value.cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
  assert.deepEqual(cases(inventory), cases(expected), 'Native group must contain every assigned source case exactly once');
}

/** Keep independent attempt ownership: a failed lane never falls back to an older green lane. */
export async function selectNativeGroupReports(source, target, env = process.env, jobResult = nativeJobResultResolver(env)) {
  await mkdir(target, { recursive: true });
  for (const group of nativeCiGroups) {
    const parent = path.join(source, group.id);
    const attempts = (await directories(parent)).filter(name => /^attempt-[1-9][0-9]*$/.test(name))
      .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
    const latest = attempts.at(-1);
    if (!latest) {
      if (platformResult(group, env) === 'success') throw new Error(`Successful native job has no artifact: ${group.id}`);
      // The shared renderer shows a missing group explicitly, without invented
      // screenshots or successes. Other groups retain their available evidence.
      continue;
    }
    const directory = path.join(parent, latest);
    const attempt = await selectedArtifactAttempt(directory, env.GITHUB_RUN_ATTEMPT);
    await validateGroup(directory, group, attempt, env);
    // Artifact absence is not proof that a lane was not rerun. Check every
    // newer attempt before reusing its older artifact, including failed setup.
    for (let newer = BigInt(env.GITHUB_RUN_ATTEMPT); newer > BigInt(attempt); newer--) {
      if (await jobResult(group, String(newer), true)) {
        throw new Error(`Newer native job has no artifact; refusing an older report: ${group.id}, attempt ${newer}`);
      }
    }
    const outcome = await jobResult(group, attempt);
    const destination = path.join(target, `midscene-ai-e2e-${group.id}`);
    await cp(directory, destination, { recursive: true, force: false, errorOnExist: true });
    await writeFile(path.join(destination, 'selected-attempt.txt'), `${attempt}\n`);
    await writeFile(path.join(destination, 'job-result.json'), JSON.stringify({
      ...executionIdentity(`${group.platform}-explorer`, groupEnv(group, env, attempt)),
      ...outcome,
    }));
  }
}

/** The shared renderer remains byte-identical to Web; it already accepts N entries. */
export async function nativeSummaryArguments(directory, env = process.env) {
  const present = new Set(await directories(directory));
  const args = [];
  for (const group of nativeCiGroups) {
    const name = `midscene-ai-e2e-${group.id}`;
    const root = path.join(directory, name);
    let attempt = env.GITHUB_RUN_ATTEMPT;
    let result = platformResult(group, env);
    if (present.has(name)) {
      attempt = await selectedArtifactAttempt(root, env.GITHUB_RUN_ATTEMPT, true);
      await validateGroup(root, group, attempt, env);
      const { jobId, outcome, ...identity } = JSON.parse(await readFile(path.join(root, 'job-result.json'), 'utf8'));
      assert.deepEqual(identity, executionIdentity(`${group.platform}-explorer`, groupEnv(group, env, attempt)), 'Native job result provenance mismatch');
      if (!/^[1-9][0-9]*$/.test(jobId) || !['success', 'failure', 'cancelled', 'skipped'].includes(outcome)) throw new Error('Invalid native job result');
      result = outcome;
    }
    args.push('--entry', `${group.label}=${root}`, '--result', `${group.label}=${result}`,
      '--artifact', `${group.label}=midscene-ai-e2e-report-${env.GITHUB_RUN_ATTEMPT}`,
      '--artifact-attempt', `${group.label}=${attempt}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, source, ...args] = process.argv.slice(2);
  if (mode === 'select' && source && args.length === 1) {
    await selectNativeGroupReports(source, args[0]);
  } else if (mode === 'summary' && source) {
    const renderer = fileURLToPath(new URL('./render-ci-summary.mjs', import.meta.url));
    const child = spawn(process.execPath, [renderer, ...await nativeSummaryArguments(source), ...args], { stdio: 'inherit' });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => resolve(code ?? 1));
    });
  } else throw new Error('Usage: native-ci-reports.mjs select INPUT OUTPUT | summary INPUT RENDERER_OPTIONS');
}
