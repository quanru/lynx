import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function producerIdentity(id, repository, readApi) {
  if (!/^\d+$/.test(id ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid diagnostic producer identity');
  const run = await readApi(`actions/runs/${id}`);
  if (run.id !== Number(id) || run.repository?.full_name !== repository || run.path !== '.github/workflows/midscene-ai-e2e.yml' || !['in_progress', 'waiting', 'completed'].includes(run.status) || !/^[a-f0-9]{40}$/.test(run.head_sha) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Producer must be an identified same-repository Midscene run');
  // The immutable APK belongs to the completed Android build, not to later
  // model-backed device/report jobs. Pin this attempt and require build success
  // before the consumer's existing manifest, checksum and installed-APK checks.
  const jobs = await readApi(`actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error('Incomplete producer job inventory');
  const builds = jobs.jobs.filter(job => job.name === 'Build current-source Explorer · android');
  if (builds.length !== 1 || builds[0].status !== 'completed' || builds[0].conclusion !== 'success') throw new Error('Producer Android source build must have completed successfully');
  return { id: run.id, head: run.head_sha, attempt: run.run_attempt, url: run.html_url, conclusion: run.conclusion, androidBuildJob: builds[0].id };
}

async function main() {
  const { SOURCE_RUN_ID: id, GITHUB_REPOSITORY: repository, CONTROL_DIR: directory, GITHUB_OUTPUT: output, GH_TOKEN: token } = process.env;
  if (!directory || !output || !token) throw new Error('Missing diagnostic output or authentication');
  const identity = await producerIdentity(id, repository, async path => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Producer metadata status ${response.status}`);
    return response.json();
  });
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/producer.json`, JSON.stringify(identity, null, 2));
  await appendFile(output, `head=${identity.head}\nattempt=${identity.attempt}\n`);
  console.log(`Diagnostic producer ${identity.id}, head ${identity.head}, attempt ${identity.attempt}, completed Android build ${identity.androidBuildJob}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
