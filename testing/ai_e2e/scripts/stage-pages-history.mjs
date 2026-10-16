import { cp, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PAGES_BUDGET = 900_000_000;
const identity = name => {
  const match = /^([1-9][0-9]*)-([1-9][0-9]*)$/.exec(name);
  if (!match) throw new Error(`Invalid run directory: ${name}`);
  return match.slice(1).map(BigInt);
};

async function inspect(directory) {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Archive must be a real directory');
  const files = [];
  // Include a file header and a conservative long-name/PAX header plus padding.
  // Absolute names overestimate the relative paths used by upload-pages-artifact.
  const headerBytes = name => 1024 + Math.ceil(Buffer.byteLength(name) / 512) * 512;
  let tarBytes = headerBytes(directory);
  let bytes = 0;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not publishable: ${target}`);
    if (stat.isDirectory()) {
      const nested = await inspect(target);
      bytes += nested.bytes;
      tarBytes += nested.tarBytes;
      files.push(...nested.files.map(name => `${item.name}/${name}`));
    } else if (stat.isFile()) {
      bytes += stat.size;
      tarBytes += headerBytes(target) + Math.ceil(stat.size / 512) * 512;
      files.push(item.name);
    } else throw new Error(`Unsupported archive entry: ${target}`);
  }
  return { files, bytes, tarBytes };
}

/** Copy whole runs into a fresh deployment directory; never mutate the archive. */
export async function stagePagesHistory({ source, destination, currentRun, archiveUrl, budget = DEFAULT_PAGES_BUDGET }) {
  identity(currentRun);
  if (!Number.isSafeInteger(budget) || budget < 4096 || budget > DEFAULT_PAGES_BUDGET) throw new Error('Invalid Pages byte budget');
  const url = new URL(archiveUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/tree\/midscene-pages-archive\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('Invalid archive recovery URL');
  source = path.resolve(source);
  destination = path.resolve(destination);
  if (source === destination || destination.startsWith(`${source}${path.sep}`) || source.startsWith(`${destination}${path.sep}`)) throw new Error('Deployment directory must be separate from archive');
  try { await lstat(destination); throw new Error('Deployment directory must not already exist'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const root = await inspect(source); // Validate the whole archive, including omitted runs.
  const allowed = new Set(['index.html', '.nojekyll', 'runs']);
  for (const name of await readdir(source)) if (!allowed.has(name)) throw new Error(`Unknown archive root content: ${name}`);
  for (const name of ['index.html', '.nojekyll']) {
    if (!(await lstat(path.join(source, name))).isFile()) throw new Error(`Missing root file: ${name}`);
  }
  const runsDirectory = path.join(source, 'runs');
  const runs = [];
  for (const name of await readdir(runsDirectory)) {
    const numbers = identity(name);
    const inventory = await inspect(path.join(runsDirectory, name));
    const hasReport = platform => inventory.files.some(file => file.startsWith(`${platform}/report/`) && file.endsWith('.html'));
    runs.push({ name, numbers, bytes: inventory.bytes, tarBytes: inventory.tarBytes,
      complete: hasReport('android') && hasReport('ios') && inventory.files.some(file => file.startsWith('native-report/') && file.endsWith('.html')) });
  }
  if (!runs.some(run => run.name === currentRun)) throw new Error('Current run is missing from archive');
  runs.sort((a, b) => a.numbers[0] === b.numbers[0]
    ? (a.numbers[1] > b.numbers[1] ? -1 : 1) : (a.numbers[0] > b.numbers[0] ? -1 : 1));
  const rootBytes = root.bytes - runs.reduce((sum, run) => sum + run.bytes, 0);
  const rootTarBytes = root.tarBytes - runs.reduce((sum, run) => sum + run.tarBytes, 0) + 1024;
  const selected = new Set([currentRun]);
  const manifest = () => ({ schemaVersion: 1, currentRun, budget, archiveUrl,
    policy: 'Current run is mandatory. Prefer the newest complete prior run, then newer whole runs. Omitted runs remain in the full archive.',
    keptBytes: rootBytes + runs.filter(run => selected.has(run.name)).reduce((sum, run) => sum + run.bytes, 0),
    omittedBytes: runs.filter(run => !selected.has(run.name)).reduce((sum, run) => sum + run.bytes, 0),
    runs: runs.map(({ numbers, tarBytes, ...run }) => ({ ...run, kept: selected.has(run.name), recoveryUrl: `${archiveUrl}/runs/${run.name}` })) });
  const size = () => {
    const body = JSON.stringify(manifest(), null, 2) + '\n';
    const tarBytes = rootTarBytes + runs.filter(run => selected.has(run.name)).reduce((sum, run) => sum + run.tarBytes, 0)
      + 1536 + Math.ceil(Buffer.byteLength(body) / 512) * 512;
    return { body, tarBytes };
  };
  if (size().tarBytes > budget) throw new Error('Current run and root metadata exceed Pages budget; archive remains unchanged');
  const prior = runs.filter(run => run.name !== currentRun);
  const preferred = prior.find(run => run.complete);
  for (const run of [...(preferred ? [preferred] : []), ...prior.filter(run => run !== preferred)]) {
    selected.add(run.name);
    if (size().tarBytes > budget) selected.delete(run.name);
  }
  const final = size();
  await mkdir(destination);
  await mkdir(path.join(destination, 'runs'));
  for (const name of ['index.html', '.nojekyll']) await cp(path.join(source, name), path.join(destination, name));
  for (const name of selected) await cp(path.join(runsDirectory, name), path.join(destination, 'runs', name), { recursive: true });
  await writeFile(path.join(destination, 'history-manifest.json'), final.body);
  return { ...manifest(), estimatedTarBytes: final.tarBytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, destination, currentRun, archiveUrl] = process.argv.slice(2);
  const result = await stagePagesHistory({ source, destination, currentRun, archiveUrl });
  console.log(JSON.stringify(result, null, 2));
}
