import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appInventory, assertSameApp, iosProducerIdentity, requireOnlySimulator } from './ios-timing.mjs';

const udid = 'A1234567-1234-1234-1234-123456789ABC';
const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-26-2';
const device = { udid, state: 'Booted', name: 'iPhone 17', isAvailable: true };

test('requires exactly the selected baseline simulator, never a newer fallback', () => {
  assert.equal(requireOnlySimulator({ devices: { [runtime]: [device] } }, udid).udid, udid);
  assert.throws(() => requireOnlySimulator({ devices: { [runtime]: [{ ...device, name: 'iPhone 18' }] } }, udid));
  assert.throws(() => requireOnlySimulator({ devices: { wrongRuntime: [device] } }, udid));
  assert.throws(() => requireOnlySimulator({ devices: { [runtime]: [device, { ...device, udid: 'other' }] } }, udid));
  assert.throws(() => requireOnlySimulator({ devices: { [runtime]: [{ ...device, state: 'Shutdown' }] } }, udid));
  assert.throws(() => requireOnlySimulator({ devices: { [runtime]: [{ ...device, isAvailable: false }] } }, udid));
});

const run = { id: 123, repository: { full_name: 'quanru/lynx' }, path: '.github/workflows/midscene-ai-e2e.yml',
  status: 'in_progress', head_sha: 'a'.repeat(40), run_attempt: 2, html_url: 'https://github.com/quanru/lynx/actions/runs/123' };
const job = { name: 'Build current-source Explorer · ios', id: 456, status: 'completed', conclusion: 'success' };

test('binds exact successful iOS producer attempt even while later model jobs run', async () => {
  const requests = [];
  const identity = await iosProducerIdentity('123', 'quanru/lynx', async endpoint => {
    requests.push(endpoint);
    return endpoint.endsWith('?per_page=100') ? { total_count: 1, jobs: [job] } : run;
  });
  assert.equal(identity.attempt, 2);
  assert.equal(identity.iosBuildJob, 456);
  assert.equal(requests[1], 'actions/runs/123/attempts/2/jobs?per_page=100');
});

test('rejects cross repository, incomplete jobs and wrong platform builds', async () => {
  await assert.rejects(iosProducerIdentity('123', 'lynx-family/lynx', async () => run));
  for (const response of [
    { total_count: 2, jobs: [job] },
    { total_count: 1, jobs: [{ ...job, conclusion: 'failure' }] },
    { total_count: 1, jobs: [{ ...job, status: 'in_progress' }] },
    { total_count: 1, jobs: [{ ...job, name: 'Build current-source Explorer · android' }] },
    { total_count: 2, jobs: [job, job] },
  ]) await assert.rejects(iosProducerIdentity('123', 'quanru/lynx', async endpoint =>
    endpoint.endsWith('?per_page=100') ? response : run));
});

test('rejects wrong workflow, producer identity and unknown run attempt', async () => {
  for (const changed of [{ ...run, id: 124 }, { ...run, run_attempt: 0 },
    { ...run, path: '.github/workflows/ci.yml' }, { ...run, head_sha: 'unknown' },
    { ...run, repository: { full_name: 'other/repo' } }]) {
    await assert.rejects(iosProducerIdentity('123', 'quanru/lynx', async () => changed));
  }
});

test('compares every installed bundle file and symlink to immutable source payload', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'ios-timing-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Info.plist'), 'plist bytes');
  await writeFile(path.join(root, 'LynxExplorer'), 'binary bytes');
  await mkdir(path.join(root, 'Frameworks'));
  await writeFile(path.join(root, 'Frameworks', 'asset'), 'asset bytes');
  await symlink('Frameworks/asset', path.join(root, 'alias'));
  const expected = await appInventory(root);
  assertSameApp(expected, await appInventory(root));
  assert.equal(expected.find(item => item.path === 'alias').target, 'Frameworks/asset');
  await writeFile(path.join(root, 'Frameworks', 'asset'), 'changed bytes');
  assert.throws(() => assertSameApp(expected, []));
  assert.throws(() => assertSameApp(expected, expected.slice(1)));
  assert.throws(() => assertSameApp(expected, expected.map(file => ({ ...file, sha256: 'changed' }))));
  assert.throws(() => assertSameApp(expected, JSON.parse(JSON.stringify(expected).replace('Frameworks/asset', 'other-target'))));
  assert.notDeepEqual(expected, await appInventory(root));
});

test('rejects incomplete source application instead of blessing empty inventories', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'ios-timing-empty-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(appInventory(root), /Incomplete/);
});
