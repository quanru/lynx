import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyBuild } from './verify-build.mjs';

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
