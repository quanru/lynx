import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureWDAStartupDiagnostics } from './wda-startup-diagnostics.mjs';

const udid = '11111111-2222-3333-4444-555555555555';

test('startup diagnostics are bounded, read-only and do not collect environment or process arguments', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wda-diagnostics-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  await captureWDAStartupDiagnostics(directory, '123', udid, (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: Buffer.from('controlled output'), stderr: Buffer.alloc(0) };
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].args, ['-p', '123', '-o', 'pid,ppid,stat,etime,pcpu,comm']);
  assert.deepEqual(calls[1].args, ['simctl', 'list', 'devices', '--json']);
  assert.deepEqual(calls[2].args.slice(0, 4), ['simctl', 'spawn', udid, 'log']);
  for (const call of calls) {
    assert.deepEqual(call.options, { timeout: 10_000, maxBuffer: 256 * 1024,
      killSignal: 'SIGKILL', encoding: 'buffer', shell: false });
    assert.doesNotMatch(call.args.join(' '), /printenv|launch|boot|shutdown|erase|install|env|command|args/);
  }
  for (const call of calls.slice(2)) {
    assert.ok(call.args.includes('--last') && call.args.includes('5m'));
    assert.ok(call.args.includes('--predicate'));
  }
  const files = await readdir(directory);
  assert.equal(files.length, 9);
  const manifest = JSON.parse(await readFile(path.join(directory, 'diagnostics.json'), 'utf8'));
  assert.equal(manifest.pid, '123');
  assert.equal(manifest.udid, udid);
  assert.match(manifest.note, /xcresult bundle may be incomplete/);
  assert.equal(await readFile(path.join(directory, 'process.stdout.log'), 'utf8'), 'controlled output');
});

test('timeout and missing-tool diagnostics retain bounded output and continue to later observations', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wda-diagnostics-failure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  await captureWDAStartupDiagnostics(directory, '123', udid, () => {
    calls++;
    return { status: null, signal: 'SIGKILL', error: { code: calls === 1 ? 'ETIMEDOUT' : 'ENOENT', message: 'Must not dump environment or raw exception' },
      stdout: Buffer.alloc(300 * 1024, 65), stderr: Buffer.alloc(300 * 1024, 66) };
  });
  assert.equal(calls, 4);
  for (const file of await readdir(directory)) {
    const bytes = await readFile(path.join(directory, file));
    if (file.endsWith('.log')) assert.equal(bytes.length, 256 * 1024);
  }
  const manifest = await readFile(path.join(directory, 'diagnostics.json'), 'utf8');
  assert.match(manifest, /ETIMEDOUT/);
  assert.match(manifest, /ENOENT/);
  assert.doesNotMatch(manifest, /Must not dump/);
});

test('invalid startup identities fail before any diagnostic command executes', async () => {
  const run = () => assert.fail('No command should execute');
  for (const [pid, device] of [['-1', udid], ['123; env', udid], ['123', '../device']]) {
    await assert.rejects(captureWDAStartupDiagnostics('/unused', pid, device, run), /explicit process and simulator/);
  }
});

test('WDA startup keeps its original deadline and records diagnostics only after a readiness failure', async () => {
  const source = await readFile(new URL('./start-wda.sh', import.meta.url), 'utf8');
  assert.match(source, /DEADLINE=\$\(\( \$\(date \+%s\) \+ 180 \)\)/);
  assert.equal((source.match(/wda-startup-diagnostics\.mjs/g) ?? []).length, 2);
  assert.match(source, /WDA process exited before becoming ready[\s\S]*?wda-startup-diagnostics\.mjs[^\n]+\|\| true\n    exit 1/);
  assert.match(source, /timed out waiting for WDA[\s\S]*?wda-startup-diagnostics\.mjs[^\n]+\|\| true\n    exit 1/);
  assert.match(source, /mktemp -d "\$PWD\/wda-startup\.XXXXXX"/);
  assert.match(source, /xcodebuild test-without-building[\s\S]*?-resultBundlePath "\$WDA_DIAGNOSTICS_DIR\/startup.xcresult"/);
  assert.doesNotMatch(source.slice(source.indexOf('echo "WDA ready')), /wda-startup-diagnostics/);
});
