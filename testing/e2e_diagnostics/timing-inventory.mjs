import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const smoke = [
  'Explorer home shows URL entry and showcase',
  'Open Showcase from home',
  'Browse into Showcase Image examples',
];
const sorted = values => [...values].sort();
const unique = values => { assert.equal(new Set(values).size, values.length, 'Duplicate evidence identity'); return values; };

export function timingInventory(expected, originals, migrated, sourceSha) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(expected.sha, sourceSha);
  assert.equal(expected.projectName, migrated.projectName);
  const platform = expected.projectName.replace('-explorer', '');
  assert.ok(['android', 'ios'].includes(platform));
  const names = unique(expected.cases.map(item => item.name));
  const originalNames = names.filter(name => !smoke.includes(name));
  assert.equal(names.length, platform === 'android' ? 13 : 20);
  assert.equal(expected.expectedCount, names.length);
  assert.deepEqual(sorted(names.filter(name => smoke.includes(name))), sorted(smoke));
  assert.deepEqual(sorted(unique(migrated.cases.map(item => item.caseName))), sorted(names));
  const suites = platform === 'android' ? ['core', 'xelement'] : ['core', 'sparkling', 'xelement'];
  assert.deepEqual(sorted(unique(originals.map(item => item.suite))), suites);
  const actualNames = [];
  const byName = new Map();
  for (const original of originals) {
    assert.equal(original.schemaVersion, 1);
    assert.equal(original.platform, platform);
    assert.equal(original.sourceSha, sourceSha);
    assert.deepEqual(original.observerErrors, []);
    assert.equal(original.clock, 'monotonic_ns');
    assert.ok(['success', 'failure', 'interrupted'].includes(original.processOutcome));
    actualNames.push(...original.collectedCases);
    for (const attempt of original.attempts) {
      assert.ok(original.collectedCases.includes(attempt.caseName));
      assert.ok(['success', 'failure', 'interrupted'].includes(attempt.status));
      assert.ok(Number.isFinite(attempt.durationMs) && attempt.durationMs >= 0);
      const attempts = byName.get(attempt.caseName) ?? [];
      assert.equal(attempt.attempt, attempts.length + 1);
      attempts.push(attempt);
      byName.set(attempt.caseName, attempts);
    }
  }
  assert.deepEqual(sorted(unique(actualNames)), sorted(originalNames));
  const rows = migrated.cases.map(item => {
    const attempts = byName.get(item.caseName) ?? [];
    const additive = smoke.includes(item.caseName);
    return {
      caseName: item.caseName, category: additive ? 'additive-smoke' : 'original-source',
      original: additive ? null : {
        attempts, firstAttemptMs: attempts[0]?.durationMs ?? null,
        totalAttemptMs: attempts.length ? attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) : null,
        status: attempts.at(-1)?.status ?? 'not-run',
      },
      migrated: item,
    };
  });
  const completeSuccessfulExecution = migrated.status === 'success' && originals.every(item => item.processOutcome === 'success') &&
    rows.every(row => row.migrated.attempts.length > 0 && row.migrated.attempts.at(-1).status === 'success' &&
      row.migrated.status === 'success' &&
      (row.category === 'additive-smoke' || row.original.status === 'success'));
  return {
    schemaVersion: 1, platform, sourceSha,
    status: completeSuccessfulExecution ? 'execution-complete' : 'execution-incomplete',
    acceptance: 'Timing inventory only. Installed artifact, runner/device identity, input fidelity and repeated paired samples still require review. No accepted performance ratio is emitted.',
    rows,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [expectedFile, migratedFile, sourceSha, output, ...originalFiles] = process.argv.slice(2);
  if (!output || originalFiles.length < 2) throw new Error('Usage: timing-inventory.mjs EXPECTED MIGRATED SOURCE_SHA OUTPUT ORIGINAL...');
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  const result = timingInventory(await json(expectedFile), await Promise.all(originalFiles.map(json)), await json(migratedFile), sourceSha);
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  if (result.status !== 'execution-complete') process.exitCode = 1;
}
