import { appendFile, mkdir, writeFile } from 'node:fs/promises';
const { SOURCE_RUN_ID: id, GITHUB_REPOSITORY: repository, CONTROL_DIR: directory, GITHUB_OUTPUT: output, GH_TOKEN: token } = process.env;
if (!/^\d+$/.test(id ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !directory || !output || !token) throw new Error('Missing diagnostic producer identity');
const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${id}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Producer metadata status ${response.status}`);
const run = await response.json();
if (run.repository.full_name !== repository || run.path !== '.github/workflows/midscene-ai-e2e.yml' || run.status !== 'completed' || !/^[a-f0-9]{40}$/.test(run.head_sha) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Producer must be a completed same-repository Midscene run');
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/producer.json`, JSON.stringify({ id: run.id, head: run.head_sha, attempt: run.run_attempt, url: run.html_url, conclusion: run.conclusion }, null, 2));
await appendFile(output, `head=${run.head_sha}\nattempt=${run.run_attempt}\n`);
console.log(`Diagnostic producer ${run.id}, head ${run.head_sha}, attempt ${run.run_attempt}`);
