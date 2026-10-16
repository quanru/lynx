import assert from 'node:assert/strict';
import test from 'node:test';
import { readVisibleViewEvidence } from '../native-view-evidence.ts';

test('native frame diagnostic keeps displayed frames only, without selecting a session or changing pixels', async () => {
  const calls = [];
  const rect = { x: 0, y: 98, width: 240, height: 302 };
  const result = await readVisibleViewEvidence(async (method, endpoint, data) => {
    calls.push([method, endpoint, data]);
    if (endpoint === '/elements') return { value: [{ ELEMENT: 'hidden' }, { ELEMENT: 'visible' }] };
    if (endpoint.endsWith('/displayed')) return { value: endpoint.includes('visible') };
    return { value: { ...rect, unrelated: 'not archived' } };
  });
  assert.deepEqual(result, [rect]);
  assert.deepEqual(calls.map(c => c[1]), ['/elements', '/element/hidden/displayed', '/element/visible/displayed', '/element/visible/rect']);
  assert.deepEqual(calls[0], ['POST', '/elements', { using: 'xpath', value: "//*[@label='lynxview']" }]);
});

test('native frame diagnostic rejects malformed reads and cannot hang on an SDK body read', async () => {
  await assert.rejects(readVisibleViewEvidence(async () => ({ value: 'wrong' })), /Invalid/);
  await assert.rejects(readVisibleViewEvidence(async () => ({ value: { error: 'failure' } })), /Invalid/);
  await assert.rejects(readVisibleViewEvidence(() => new Promise(() => {}), 10), /timed out/);
  let release, reads = 0;
  const pending = readVisibleViewEvidence(async () => {
    reads++;
    return new Promise(resolve => { release = resolve; });
  }, 10);
  await assert.rejects(pending, /timed out/);
  release({ value: [{ ELEMENT: 'late' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1, 'A late SDK response must not start additional reads after timeout');
});
