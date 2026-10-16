import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function executionIdentity(projectName, env = process.env) {
  const label = { 'android-explorer': 'Android', 'ios-explorer': 'iOS' }[projectName];
  if (!label || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('Expected-case inventory requires the exact CI commit, run, attempt and native project');
  }
  return { schemaVersion: 1, label, projectName, sha: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT };
}

/** Collect public workflow definitions only; never enter project setup or agent providers. */
export async function collectExpectedCases(projectName, env = process.env) {
  const identity = executionIdentity(projectName, env);
  const { loadTestProject, discoverTestFiles } = await import('@midscene/test/config');
  const { collectWorkflowDocument } = await import('@midscene/test');
  const loaded = await loadTestProject(path.join(root, 'midscene.config.ts'));
  const project = loaded.projects.find(item => item.name === projectName);
  if (!project) throw new Error('Expected native project was not collected');
  const cases = [];
  for (const absolutePath of discoverTestFiles(root, project.files)) {
    const sourcePath = path.relative(root, absolutePath).split(path.sep).join('/');
    const document = collectWorkflowDocument({ projectId: project.projectId,
      projectName, sourcePath, absolutePath }, {
      resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env,
    });
    cases.push(...document.cases.map(item => ({ caseId: item.caseId, name: item.definition.name, sourcePath })));
  }
  if (!cases.length || new Set(cases.map(item => item.caseId)).size !== cases.length) {
    throw new Error('Expected-case collection is empty or contains duplicate IDs');
  }
  return { ...identity, expectedCount: cases.length, cases };
}

export function executionStatus(projectName, outcome, env = process.env) {
  if (!['success', 'failure', 'cancelled', 'skipped'].includes(outcome)) {
    throw new Error('Execution outcome must come from the workflow run-cases step');
  }
  return { ...executionIdentity(projectName, env), outcome };
}

/** Validate producer-owned attempt metadata against the selected artifact directory. */
export async function selectedArtifactAttempt(directory, currentAttempt, platformBundle = false) {
  const marker = (await readFile(path.join(directory, 'attempt.txt'), 'utf8')).trim();
  const inventoryFiles = await Promise.all(['expected-cases.json', 'execution-status.json'].map(async name => {
    try { await access(path.join(directory, name)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }));
  const legacy = platformBundle && inventoryFiles.every(exists => !exists);
  const selected = legacy ? marker : platformBundle
    ? (await readFile(path.join(directory, 'selected-attempt.txt'), 'utf8')).trim()
    : /^attempt-([1-9][0-9]*)$/.exec(path.basename(directory))?.[1];
  if (!/^[1-9][0-9]*$/.test(currentAttempt ?? '') || !/^[1-9][0-9]*$/.test(marker)
    || marker !== selected || BigInt(marker) > BigInt(currentAttempt)) {
    throw new Error('Selected artifact attempt does not match its directory/producer marker or current workflow attempt');
  }
  return marker;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, projectName, outcome] = process.argv.slice(2);
  if (mode === 'selected-directory' || mode === 'selected-platform') {
    console.log(await selectedArtifactAttempt(projectName, process.env.GITHUB_RUN_ATTEMPT, mode === 'selected-platform'));
  } else {
    const value = mode === 'collect' && outcome === undefined
      ? await collectExpectedCases(projectName)
      : mode === 'status' ? executionStatus(projectName, outcome)
      : (() => { throw new Error('Usage: expected-cases.mjs collect PROJECT | status PROJECT OUTCOME'); })();
    const directory = path.join(root, 'midscene_run');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, mode === 'collect' ? 'expected-cases.json' : 'execution-status.json'), JSON.stringify(value, null, 2));
  }
}
