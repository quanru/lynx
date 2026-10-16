import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stagePagesHistory } from './stage-pages-history.mjs';

const archiveUrl = 'https://github.com/quanru/lynx/tree/midscene-pages-archive';
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pages-history-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'archive');
  await mkdir(path.join(source, 'runs'), { recursive: true });
  await writeFile(path.join(source, 'index.html'), 'Current partial report');
  await writeFile(path.join(source, '.nojekyll'), '');
  const add = async (name, complete = false, bytes = 1000) => {
    const directory = path.join(source, 'runs', name);
    await mkdir(directory);
    await writeFile(path.join(directory, 'evidence.bin'), Buffer.alloc(bytes, 1));
    if (complete) for (const file of ['android/report/index.html', 'ios/report/index.html', 'native-report/index.html']) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), 'report');
    }
  };
  return { source, destination: path.join(root, 'deployment'), currentRun: '100-2', archiveUrl, add };
}

test('copies whole runs by numeric identity and preserves current partial index and all archived bytes', async t => {
  const options = await fixture(t);
  await options.add('100-2');
  await options.add('99-10', true);
  await options.add('99-9', true);
  await options.add('90-1');
  const result = await stagePagesHistory(options);
  assert.deepEqual(result.runs.map(run => run.name), ['100-2', '99-10', '99-9', '90-1']);
  assert.ok(result.runs.every(run => run.kept));
  assert.equal(await readFile(path.join(options.destination, 'index.html'), 'utf8'), 'Current partial report');
  assert.equal(await readFile(path.join(options.source, 'runs/99-10/evidence.bin'), 'hex'), await readFile(path.join(options.destination, 'runs/99-10/evidence.bin'), 'hex'));
  assert.deepEqual((await readdir(options.source)).sort(), ['.nojekyll', 'index.html', 'runs']);
});

test('prefers newest complete prior report within budget without dropping or truncating current partial run', async t => {
  const options = await fixture(t);
  await options.add('100-2', false, 10000);
  await options.add('99-1', false, 20000);
  await options.add('98-1', true, 10000);
  await options.add('97-1', true, 10000);
  const result = await stagePagesHistory({ ...options, budget: 60000 });
  assert.deepEqual(result.runs.filter(run => run.kept).map(run => run.name), ['100-2', '98-1']);
  assert.ok(result.estimatedTarBytes <= 60000);
  assert.equal(result.omittedBytes, 30018);
  assert.deepEqual((await readdir(path.join(options.source, 'runs'))).sort(), ['100-2', '97-1', '98-1', '99-1']);
  const manifest = JSON.parse(await readFile(path.join(options.destination, 'history-manifest.json')));
  assert.equal(manifest.archiveUrl, archiveUrl);
  assert.ok(manifest.runs.every(run => run.recoveryUrl.endsWith(`/runs/${run.name}`)));
});

test('oversized current run fails before creating deployment and leaves archive untouched', async t => {
  const options = await fixture(t);
  await options.add('100-2', false, 50000);
  await assert.rejects(stagePagesHistory({ ...options, budget: 20000 }), /Current run/);
  await assert.rejects(readFile(path.join(options.destination, 'index.html')), /ENOENT/);
  assert.equal((await readFile(path.join(options.source, 'runs/100-2/evidence.bin'))).length, 50000);
});

test('unsafe archive content and existing deployment fail closed without deletion', async t => {
  for (const mode of ['symlink', 'unknown-root', 'invalid-run', 'existing-destination']) {
    const options = await fixture(t);
    await options.add('100-2');
    if (mode === 'symlink') await symlink('/etc/passwd', path.join(options.source, 'runs/100-2/link'));
    if (mode === 'unknown-root') await writeFile(path.join(options.source, 'website.html'), 'do not delete');
    if (mode === 'invalid-run') await options.add('latest');
    if (mode === 'existing-destination') await mkdir(options.destination);
    await assert.rejects(stagePagesHistory(options), /Symlink|Unknown archive root|Invalid run|must not already exist/);
  }
});

test('deployment staging follows full archive persistence and upload uses only bounded fresh directory', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('name: Persist report archive') < workflow.indexOf('name: Stage bounded online report history'));
  assert.match(workflow, /stage-pages-history\.mjs[\s\S]*pages-deployment/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/pages-deployment/);
  assert.match(workflow, /cp -R "\$RUNNER_TEMP\/pages-site"\/\. "\$archive"\//);
});
