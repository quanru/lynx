import assert from 'node:assert/strict';
import test from 'node:test';
import { VideoPhasePreparation } from '../video-phase-preparation.ts';
import { videoPlaybackOperations, executeVideoPlaybackPhase } from '../video-playback-phase.ts';
import { originalVideoPlayback } from './video-playback-source.mjs';

test('split phases retain the entire original ordered trace and only prepare at inactive source boundaries', () => {
  for (const name of ['VideoBasic', 'VideoAttributes']) {
    const source = originalVideoPlayback(name);
    const fragments = Object.entries(source.phases).filter(([phase]) => phase !== 'basic-ready');
    const flattened = fragments.flatMap(([, ops]) => ops);
    assert.deepEqual(flattened, source.operations.filter(op => flattened.includes(op)));
    for (let index = 0; index < fragments.length - 1; index++) {
      const ops = fragments[index][1];
      const lastState = ops.findLast(op => op.type === 'core' || op.type === 'video' && op.input.tag === 'status-text' && op.input.equal);
      assert.ok(['paused', 'stopped'].includes(lastState.input.text ?? lastState.input.equal));
    }
    for (const [phase, ops] of fragments) {
      const preparation = source.document.cases[0].steps.filter(step => step['native.videoPhase']?.phase === phase);
      const labels = [...new Set(ops.filter(op => op.type === 'tap').map(op => op.label))];
      assert.deepEqual(preparation.map(step => step['native.videoPhase'].prepare), ['visibility', ...labels.map((_, index) => index), undefined]);
    }
  }
});

function fixture() {
  const preparation = new VideoPhasePreparation();
  let requests = 0, taps = 0;
  const agent = {
    addProgressListener: () => () => {}, aiAct: async () => requests++,
    aiLocate: async () => ({ center: [100 + ++requests * 10, 100] }),
    callActionInActionSpace: async () => taps++,
  };
  return { preparation, agent, counts: () => ({ requests, taps }) };
}

test('one-shot prepared points are case-owned, require all locations in order, and make no playback model calls', async () => {
  const f = fixture();
  const phase = 'basic-loop';
  await assert.rejects(f.preparation.prepare('a', phase, 0, f.agent), /order/);
  await f.preparation.prepare('a', phase, 'visibility', f.agent);
  await assert.rejects(f.preparation.prepare('a', phase, 'visibility', f.agent), /not been consumed/);
  await assert.rejects(f.preparation.prepare('a', phase, 1, f.agent), /order/);
  assert.throws(() => f.preparation.consume('a', phase), /Incomplete/);
  assert.equal(f.preparation.consume('b', phase), undefined);
  await f.preparation.prepare('a', phase, 0, f.agent);
  await f.preparation.prepare('a', phase, 1, f.agent);
  assert.throws(() => f.preparation.consume('a', 'basic-play-pause'), /mismatched/);
  const points = f.preparation.consume('a', phase);
  assert.equal(points.size, 2);
  assert.equal(f.preparation.consume('a', phase), undefined);
  const before = f.counts().requests;
  // Fail at the first original read: exactly one physical tap, zero models.
  await assert.rejects(executeVideoPlaybackPhase(f.agent, phase, async () => { throw new Error('original read'); }, async () => {}, undefined, undefined, points), /original read/);
  assert.deepEqual(f.counts(), { requests: before, taps: 1 });
});

test('released or cancelled late location results cannot revive prepared points or start playback', async () => {
  for (const mode of ['release', 'abort']) {
    const f = fixture(), controller = new AbortController();
    await f.preparation.prepare('a', 'basic-loop', 'visibility', f.agent, controller.signal);
    f.agent.aiLocate = async () => {
      if (mode === 'release') f.preparation.release('a');
      else controller.abort(new Error('cancelled'));
      return { center: [100, 100] };
    };
    await assert.rejects(f.preparation.prepare('a', 'basic-loop', 0, f.agent, controller.signal), /released|cancelled/);
    assert.equal(f.preparation.consume('a', 'basic-loop'), undefined);
    assert.equal(f.counts().taps, 0);
  }
});

test('invalid and duplicate grounding fail closed before physical actions', async () => {
  const f = fixture();
  await assert.rejects(f.preparation.prepare('a', 'basic-ready', 'visibility', f.agent), /Readiness/);
  await f.preparation.prepare('a', 'basic-loop', 'visibility', f.agent);
  f.agent.aiLocate = async () => ({ center: [100, 100] });
  await f.preparation.prepare('a', 'basic-loop', 0, f.agent);
  await assert.rejects(f.preparation.prepare('a', 'basic-loop', 1, f.agent), /same point/);
  assert.equal(f.preparation.consume('a', 'basic-loop'), undefined);
  assert.equal(f.counts().taps, 0);
});
