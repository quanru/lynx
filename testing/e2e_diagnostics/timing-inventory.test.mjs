import assert from 'node:assert/strict';
import test from 'node:test';
import { timingInventory } from './timing-inventory.mjs';

function fixture() {
  const sha = 'a'.repeat(40);
  const names = ['core/DomFocus', 'core/Event', 'core/InputInsertText', 'core/Image', 'core/LayoutLinear', 'core/TextEvent', 'xelement/VideoAttributes', 'xelement/VideoBasic', 'xelement/VideoBoundary', 'xelement/VideoModes'];
  const smoke = ['Explorer home shows URL entry and showcase', 'Open Showcase from home', 'Browse into Showcase Image examples'];
  const expected = { sha, projectName: 'android-explorer', expectedCount: 13, cases: [...names, ...smoke].map(name => ({ name })) };
  const originals = ['core', 'xelement'].map(suite => ({ schemaVersion: 1, platform: 'android', sourceSha: sha, clock: 'monotonic_ns', suite, observerErrors: [], processOutcome: 'success',
    collectedCases: names.filter(name => name.startsWith(suite + '/')),
    attempts: names.filter(name => name.startsWith(suite + '/')).map(caseName => ({ caseName, attempt: 1, status: 'success', durationMs: 100 })),
  }));
  const migrated = { status: 'success', projectName: 'android-explorer', cases: [...names, ...smoke].map(caseName => ({ caseName, status: 'success', attempts: [{ status: 'success', durationMs: 200 }] })) };
  return [expected, originals, migrated, sha];
}

test('matches full inventory, keeps smoke separate, does not declare timing acceptance', () => {
  const result = timingInventory(...fixture());
  assert.equal(result.status, 'execution-complete');
  assert.equal(result.rows.filter(row => row.original === null).length, 3);
  assert.match(result.acceptance, /No accepted performance ratio/);
});
test('missing or failed original attempts remain visible and incomplete despite zero process exit', () => {
  const args = fixture(); args[1][0].attempts.shift();
  let result = timingInventory(...args);
  assert.equal(result.status, 'execution-incomplete');
  assert.equal(result.rows[0].original.status, 'not-run');
  assert.equal(result.rows[0].original.totalAttemptMs, null);
  args[1][0].attempts[0].status = 'failure';
  result = timingInventory(...args);
  assert.equal(result.rows[1].original.status, 'failure');
});
test('rejects mismatched source, missing inventory, observer errors and duplicate original cases', () => {
  for (const mutate of [
    a => { a[0].sha = 'b'.repeat(40); },
    a => a[2].cases.pop(),
    a => a[1][0].observerErrors.push('RuntimeError'),
    a => a[1][0].collectedCases.push(a[1][0].collectedCases[0]),
    a => { a[1][0].attempts[0].attempt = 2; },
  ]) { const args = fixture(); mutate(args); assert.throws(() => timingInventory(...args)); }
});
