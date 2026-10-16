import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIOSToolchain } from './ios-baseline.mjs';

export async function verifyBuild(directory, platform, sha) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'build.json'), 'utf8'));
  const file = platform === 'android' ? 'LynxExplorer.apk' : platform === 'ios' ? 'LynxExplorer.app.tar.gz' : null;
  if (!file || !sha || manifest.sha !== sha || manifest.platform !== platform
    || manifest.mode !== 'source' || manifest.file !== file
    || manifest.sparkling !== true || manifest.integrationPages !== true) {
    throw new Error('Explorer build does not match the requested revision, platform, or capabilities.');
  }
  if (platform === 'ios') validateIOSToolchain(manifest.iosToolchain);
  const hash = createHash('sha256').update(await readFile(resolve(directory, file))).digest('hex');
  if (hash !== manifest.sha256) throw new Error('Explorer artifact checksum mismatch.');
  return manifest;
}

export async function stageLatestBuild(source, destination, platform, sha) {
  const prefix = `midscene-explorer-source-${platform}-`;
  const candidates = (await readdir(source)).filter(name => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
    .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
  // download-artifact v8 extracts a single pattern match directly into path,
  // even with merge-multiple:false; multiple matches retain named directories.
  const directory = candidates.length ? resolve(source, candidates.at(-1)) : resolve(source);
  // Never fall back to an older build when the newest one has invalid provenance.
  const manifest = await verifyBuild(directory, platform, sha);
  await mkdir(destination, { recursive: true });
  for (const file of ['build.json', manifest.file]) await copyFile(resolve(directory, file), resolve(destination, file));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = process.argv[4]
    ? await stageLatestBuild(process.argv[2], process.argv[4], process.argv[3], process.env.GITHUB_SHA)
    : await verifyBuild(process.argv[2], process.argv[3], process.env.GITHUB_SHA);
  console.log(`Verified ${manifest.platform} Explorer built from ${manifest.sha}`);
}
