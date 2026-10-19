import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export function nativeJobsFinished(data) {
  if (!Array.isArray(data.jobs) || data.total_count !== data.jobs.length) throw new Error('Incomplete producer job inventory');
  const names = ['Midscene AI E2E · Android (Explorer)', 'Midscene AI E2E · iOS (Explorer)'];
  return names.map(name => {
    const matches = data.jobs.filter(job => job.name === name);
    if (matches.length > 1) throw new Error('Ambiguous producer device job');
    return matches.length === 1 && matches[0].status === 'completed';
  }).every(Boolean);
}

async function main() {
  const { SOURCE_RUN_ID: runId, GITHUB_REPOSITORY: repository, GH_TOKEN: token } = process.env;
  if (!/^\d+$/.test(runId ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token) throw new Error('Missing producer identity or authentication');
  const deadline = Date.now() + 40 * 60_000;
  do {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Producer observation failed: HTTP ${response.status}`);
    if (nativeJobsFinished(await response.json())) {
      console.log('Producer native device jobs are terminal; paired sampling may begin. Other external provider load remains uncontrolled.');
      return;
    }
    console.log('Waiting for the identified producer device jobs; no benchmark model requests have started.');
    await setTimeout(60_000);
  } while (Date.now() < deadline);
  throw new Error('Producer device jobs still active; refuse a competing timing sample');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
