import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyBuild(directory, platform, sha) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'build.json'), 'utf8'));
  const file = platform === 'android' ? 'LynxExplorer.apk' : platform === 'ios' ? 'LynxExplorer.app.tar.gz' : null;
  if (!file || !sha || manifest.sha !== sha || manifest.platform !== platform
    || manifest.mode !== 'source' || manifest.file !== file
    || manifest.sparkling !== true || manifest.integrationPages !== true) {
    throw new Error('Explorer build does not match the requested revision, platform, or capabilities.');
  }
  const hash = createHash('sha256').update(await readFile(resolve(directory, file))).digest('hex');
  if (hash !== manifest.sha256) throw new Error('Explorer artifact checksum mismatch.');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await verifyBuild(process.argv[2], process.argv[3], process.env.GITHUB_SHA);
  console.log(`Verified ${manifest.platform} Explorer built from ${manifest.sha}`);
}
