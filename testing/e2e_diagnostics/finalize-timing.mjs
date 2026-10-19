import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { testRunDump } from '../ai_e2e/scripts/render-ci-summary.mjs';
import { migratedTiming } from './migrated-timing.mjs';
import { timingInventory } from './timing-inventory.mjs';

const [controlArg, sourceArg, platform, ...extra] = process.argv.slice(2);
if (!controlArg || !sourceArg || extra.length || !['android', 'ios'].includes(platform)) {
  throw new Error('Usage: finalize-timing.mjs CONTROL_DIR SOURCE_CHECKOUT android|ios');
}
const control = resolve(controlArg);
const source = resolve(sourceArg);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const project = `${platform}-explorer`;
const suiteNames = platform === 'android' ? ['core', 'xelement'] : ['core', 'xelement', 'sparkling'];
const reportRoot = join(source, 'testing/ai_e2e/midscene_run/report');
const dumps = [];
for (const file of await readdir(reportRoot, { recursive: true })) {
  if (!/^midscene-e2e-[^/]+\/index\.html$/.test(file)) continue;
  const dump = testRunDump(await readFile(join(reportRoot, file), 'utf8'));
  if (dump?.projects?.some(item => item.name === project)) dumps.push(dump);
}
if (dumps.length !== 1) throw new Error('Missing or ambiguous migrated report for this isolated sample');
const migrated = migratedTiming(dumps[0], project);
await writeFile(join(control, 'migrated-timing.json'), `${JSON.stringify(migrated, null, 2)}\n`, { flag: 'wx' });
const expected = await json(join(source, 'testing/ai_e2e/midscene_run/expected-cases.json'));
const sourceSha = (await readFile(join(control, 'source-sha.txt'), 'utf8')).trim();
const originals = await Promise.all(suiteNames.map(suite => json(join(control, 'original', `${suite}-timing.json`))));
const result = timingInventory(expected, originals, migrated, sourceSha);
await writeFile(join(control, 'timing-inventory.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(`Timing inventory: ${result.rows.length} cases; ${result.status}. Paired performance acceptance remains separate.`);
if (result.status !== 'execution-complete') process.exitCode = 1;
