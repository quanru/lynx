import assert from 'node:assert/strict';
import test from 'node:test';
import { FatalDeviceError, WorkflowError } from '@midscene/test';
import { withAssertionEvidence } from '../assertion-evidence.ts';

test('failed assertion retains original cause and an immutable diagnostic output snapshot', async () => {
  const cause = new Error('Expected playing, got paused');
  const data = { observations: [{ actual: 'paused', matched: false }] };
  let failure;
  await assert.rejects(withAssertionEvidence('native.video', data, undefined, async () => { throw cause; }), error => {
    failure = error;
    assert.ok(error instanceof WorkflowError);
    assert.equal(error.cause, cause);
    assert.deepEqual(error.details.evidence, data);
    assert.match(error.details.evidenceStatus, /Partial/);
    return true;
  });
  data.observations[0].actual = 'later value';
  assert.equal(failure.details.evidence.observations[0].actual, 'paused');
});

test('evidence wrapping preserves successful return values, cancellation and fatal device identity', async () => {
  assert.equal(await withAssertionEvidence('native.video', {}, undefined, async () => 42), 42);
  const controller = new AbortController();
  const cancelled = new Error('cancelled');
  controller.abort(cancelled);
  for (const [error, signal] of [[cancelled, controller.signal], [new FatalDeviceError('device lost'), undefined]]) {
    await assert.rejects(withAssertionEvidence('native.video', {}, signal, async () => { throw error; }), caught => caught === error);
  }
});
