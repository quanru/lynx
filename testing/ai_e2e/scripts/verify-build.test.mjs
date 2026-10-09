import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyBuild, stageLatestBuild } from './verify-build.mjs';

test('source artifacts require matching revision, capabilities, and bytes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'explorer-provenance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('built artifact');
  const manifest = { sha: 'current', platform: 'android', file: 'LynxExplorer.apk', mode: 'source', sparkling: true, integrationPages: true, sha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(join(directory, manifest.file), bytes);
  const save = value => writeFile(join(directory, 'build.json'), JSON.stringify(value));
  await save(manifest);
  assert.deepEqual(await verifyBuild(directory, 'android', 'current'), manifest);
  await assert.rejects(verifyBuild(directory, 'android', 'old'));
  await assert.rejects(verifyBuild(directory, 'ios', 'current'));
  await assert.rejects(verifyBuild(directory, 'android', undefined));
  for (const changed of [{ mode: 'release' }, { sparkling: false }, { integrationPages: false }, { file: '../elsewhere.apk' }]) {
    await save({ ...manifest, ...changed });
    await assert.rejects(verifyBuild(directory, 'android', 'current'));
  }
  await save(manifest);
  await writeFile(join(directory, manifest.file), 'changed bytes');
  await assert.rejects(verifyBuild(directory, 'android', 'current'), /checksum/);
});

test('device-only reruns reuse the newest valid build from the same workflow revision', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'explorer-build-attempts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, 'staged');
  const bytes = Buffer.from('source app');
  const manifest = {sha: 'current', platform: 'android', file: 'LynxExplorer.apk', mode: 'source', sparkling: true, integrationPages: true, sha256: createHash('sha256').update(bytes).digest('hex')};
  for (const attempt of [2, 10]) {
    const path = join(directory, `midscene-explorer-source-android-${attempt}`);
    await mkdir(path);
    await writeFile(join(path, 'build.json'), JSON.stringify({...manifest, attempt}));
    await writeFile(join(path, manifest.file), bytes);
  }
  const actual = await stageLatestBuild(directory, destination, 'android', 'current');
  assert.equal(actual.attempt, 10);
  assert.deepEqual(await readFile(join(destination, manifest.file)), bytes);
  await writeFile(join(directory, 'midscene-explorer-source-android-10', manifest.file), 'corrupted');
  await assert.rejects(stageLatestBuild(directory, destination, 'android', 'current'), /checksum/);
  await assert.rejects(stageLatestBuild(directory, destination, 'ios', 'current'), /No source build/);
});
