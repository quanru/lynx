import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeJobsFinished } from './wait-native-producer.mjs';

const jobs = ['Android', 'iOS'].map(platform => ({ name: `Midscene AI E2E · ${platform} (Explorer)`, status: 'completed' }));
test('only terminal complete device inventory permits sampling, irrespective of test outcome', () => {
  assert.equal(nativeJobsFinished({ total_count: 2, jobs }), true);
  assert.equal(nativeJobsFinished({ total_count: 1, jobs: jobs.slice(0, 1) }), false);
  assert.equal(nativeJobsFinished({ total_count: 2, jobs: [jobs[0], { ...jobs[1], status: 'in_progress' }] }), false);
  assert.throws(() => nativeJobsFinished({ total_count: 3, jobs }));
  assert.throws(() => nativeJobsFinished({ total_count: 3, jobs: [...jobs, jobs[0]] }));
});
