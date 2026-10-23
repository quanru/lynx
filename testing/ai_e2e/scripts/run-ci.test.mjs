import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { supervise } from './run-ci.mjs';
import { testRunDump } from './render-ci-summary.mjs';

function fixture() {
  const child = new EventEmitter(), signals = new EventEmitter(), active = new Map(), sent = [];
  let id = 0;
  child.kill = signal => { sent.push(signal); return true; };
  const timers = { setTimeout: (fn, delay) => { active.set(++id, { fn, delay }); return id; }, clearTimeout: id => active.delete(id) };
  return { child, signals, active, sent, run: () => supervise(child, { timeoutMs: 100, graceMs: 20, signals, timers, log: () => {} }) };
}

test('normal and failed CLI exits preserve status and release timers and signal listeners', async () => {
  for (const code of [0, 1, 2, null]) {
    const f = fixture(), result = f.run();
    f.child.emit('close', code);
    assert.equal(await result, code ?? 1);
    assert.equal(f.active.size, 0);
    assert.equal(f.signals.listenerCount('SIGINT') + f.signals.listenerCount('SIGTERM'), 0);
    assert.deepEqual(f.sent, []);
  }
});

test('bounded deadline interrupts the direct CLI and gives it time to flush a failed report', async () => {
  const f = fixture(), result = f.run();
  f.active.get(1).fn();
  assert.deepEqual(f.sent, ['SIGINT']);
  assert.equal(f.active.get(2).delay, 20);
  f.child.emit('close', 0);
  assert.equal(await result, 1);
  assert.equal(f.active.size, 0);
});

test('external cancellation forwards once and a stuck child has a bounded escalation', async () => {
  const f = fixture(), result = f.run();
  f.signals.emit('SIGTERM'); f.signals.emit('SIGINT'); f.active.get(1).fn();
  assert.deepEqual(f.sent, ['SIGTERM']);
  f.active.get(2).fn();
  assert.deepEqual(f.sent, ['SIGTERM', 'SIGKILL']);
  f.child.emit('close', null);
  assert.equal(await result, 1);
});

test('spawn errors cannot pass and release supervision resources', async () => {
  const f = fixture(), result = f.run();
  f.child.emit('error', new Error('cannot spawn CLI'));
  await assert.rejects(result, /cannot spawn/);
  assert.equal(f.active.size, 0);
  assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('CI leaves headroom for finalization without modifying assertion windows, retries or device concurrency', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  for (const platform of ['android', 'ios']) {
    const job = workflow.split('  ' + platform + '-ai-e2e:')[1].split(/\n {2}(?=\S)/)[0];
    assert.match(job, /timeout-minutes: 120/);
    assert.match(workflow, new RegExp('node scripts/run-ci.mjs --project ' + platform + '-explorer'));
  }
  assert.match(readFileSync(new URL('../node_modules/@midscene/test/dist/es/cli/index.mjs', import.meta.url), 'utf8'), /process\.on\('SIGINT', sigint\)/);
});

test('actual pinned Midscene CLI writes a failed report and not-run case after direct SIGINT, without models or devices', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lynx-ci-signal-proof-'));
  const reports = join(directory, 'reports');
  const githubSummary = join(directory, 'github-summary.md');
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../node_modules/@midscene/test/bin/midscene-test', import.meta.url)),
    '--config', fileURLToPath(new URL('./fixtures/ci-interruption.config.mjs', import.meta.url)),
    '--result-dir', join(directory, 'results'),
  ], { cwd: fileURLToPath(new URL('./fixtures/', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env,
    CI_SIGNAL_REPORT_DIR: reports,
    // This deliberately failing fixture must never append to the real job's
    // Summary. Exercise the SDK's GitHub output only inside its own sandbox.
    GITHUB_ACTIONS: 'true',
    GITHUB_STEP_SUMMARY: githubSummary,
  } });
  const signals = new EventEmitter();
  const result = supervise(child, { timeoutMs: 20_000, graceMs: 4_000, signals, log: () => {} });
  let output = '', interrupted = false;
  child.stdout.on('data', data => {
    output += data.toString();
    if (!interrupted && output.includes('CI_SIGNAL_READY')) { interrupted = true; signals.emit('SIGINT'); }
  });
  child.stderr.on('data', data => { output += data.toString(); });
  assert.equal(await result, 1, output);
  assert.equal(interrupted, true, output);
  const files = await readdir(reports);
  const html = files.find(file => file.endsWith('.html'));
  assert.ok(html, 'Interrupted runner must produce its total report.');
  const dump = testRunDump(await readFile(join(reports, html), 'utf8'));
  assert.equal(dump.kind, 'test-runner');
  const cases = dump.projects.flatMap(project => project.cases ?? project.documents?.flatMap(document => document.cases) ?? []);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map(item => item.status), ['failed', 'not-run']);
  assert.match(await readFile(githubSummary, 'utf8'), /\| 0 \| 1 \| 1 \| 0 \|/);
});
