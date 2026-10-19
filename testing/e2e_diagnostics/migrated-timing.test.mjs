import assert from 'node:assert/strict';
import test from 'node:test';
import { migratedTiming } from './migrated-timing.mjs';

function fixture() {
  return { runId: 'run', status: 'success', projects: [{ name: 'android-explorer', documents: [{ sourcePath: 'case.yaml', cases: [{
    name: 'core/Event', status: 'success', attempts: [{
      attemptIndex: 0, status: 'success', durationMs: 1000,
      startedAt: '2026-10-19T00:00:00.000Z', endedAt: '2026-10-19T00:00:01.000Z',
      beforeEach: [{ node: 'launch', durationMs: 100 }],
      steps: [{ node: 'aiAct', durationMs: 700 }], afterEach: [{ node: 'cleanup', durationMs: 100 }],
    }],
  }] }] }] };
}

test('retains full attempt and component durations without double counting or declaring comparability', () => {
  const result = migratedTiming(fixture(), 'android-explorer');
  assert.equal(result.cases[0].totalAttemptMs, 1000);
  assert.equal(result.cases[0].attempts[0].stepTotals.aiAct.durationMs, 700);
  assert.match(result.comparability, /^unverified/);
});

test('keeps failed attempts and not-run cases, separates additive smoke', () => {
  const input = fixture();
  const cases = input.projects[0].documents[0].cases;
  cases[0].attempts[0].status = 'failed';
  cases[0].attempts.push({ ...cases[0].attempts[0], attemptIndex: 1, status: 'success' });
  cases.push({ name: 'Open Showcase from home', status: 'not-run', attempts: [] });
  const result = migratedTiming(input, 'android-explorer');
  assert.equal(result.cases[0].totalAttemptMs, 2000);
  assert.equal(result.cases[0].attempts[0].status, 'failed');
  assert.equal(result.cases[1].firstAttemptMs, null);
  assert.equal(result.cases[1].category, 'additive-smoke');
});

test('rejects ambiguous identity, unsupported cases, clock discrepancies and invalid durations', () => {
  for (const mutate of [
    x => x.projects.push(x.projects[0]),
    x => x.projects[0].documents.push(x.projects[0].documents[0]),
    x => { x.projects[0].documents[0].cases[0].name = 'unclassified'; },
    x => { x.projects[0].documents[0].cases[0].attempts[0].durationMs = 999; },
    x => { x.projects[0].documents[0].cases[0].attempts[0].steps[0].durationMs = -1; },
    x => { x.projects[0].documents[0].cases[0].attempts[0].attemptIndex = 2; },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => migratedTiming(input, 'android-explorer'));
  }
});
