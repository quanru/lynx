import assert from 'node:assert/strict';
import test from 'node:test';
import { expectVideoValue } from '../video-expectation.ts';

const document = text => ({ nodeId: 0, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'log'],
  children: [{ nodeId: 1, nodeName: 'RAW-TEXT', attributes: ['text', text] }] });

test('video evidence preserves polling reads and the timeout diagnostic/final-read order', async () => {
  for (const values of [['waiting', 'ready'], ['waiting', 'still waiting', 'ready'], ['waiting', 'still waiting', 'failed']]) {
    async function run(record) {
      let now = 0, index = 0;
      const trace = [], observations = [];
      const clock = { now: () => now, sleep: async ms => { trace.push(['sleep', ms]); now += ms; } };
      let error;
      try {
        await expectVideoValue(async () => { trace.push(['read', index]); return document(values[index++]); },
          async () => { trace.push(['capture']); }, { tag: 'log', equal: 'ready', timeoutMs: 400 }, clock,
          record ? observations : undefined);
      } catch (caught) { error = caught.message; }
      return { trace, error, observations };
    }
    const original = await run(false), recorded = await run(true);
    assert.deepEqual(recorded.trace, original.trace);
    assert.equal(recorded.error, original.error);
    assert.deepEqual(recorded.observations.map(item => item.actual), values);
    assert.deepEqual(recorded.observations.map(item => item.matched), values.map(value => value === 'ready'));
    assert.deepEqual(recorded.observations.map(item => item.observedAt), values.map((_, index) => index * 200));
  }
});

test('immediate failure records the same single sample and copies its expected predicate', async () => {
  const observations = [], input = { tag: 'log', notContains: 'pause_ok', immediate: true };
  let reads = 0;
  await assert.rejects(expectVideoValue(async () => { reads++; return document('pause_ok'); },
    async () => assert.fail('No immediate capture'), input,
    { now: () => 123, sleep: async () => assert.fail('No immediate polling') }, observations), /Original video assertion failed/);
  input.notContains = 'changed later';
  assert.equal(reads, 1);
  assert.deepEqual(observations, [{ expected: { tag: 'log', notContains: 'pause_ok', immediate: true },
    actual: 'pause_ok', observedAt: 123, matched: false }]);
});
