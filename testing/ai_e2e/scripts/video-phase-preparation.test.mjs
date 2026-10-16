import assert from 'node:assert/strict';
import test from 'node:test';
import { VideoPhasePreparation } from '../video-phase-preparation.ts';
import { videoPlaybackOperations, executeVideoPlaybackPhase } from '../video-playback-phase.ts';
import { originalVideoPlayback } from './video-playback-source.mjs';
import { readFileSync } from 'node:fs';
import { makeVideoButtonsVisible, locateVideoButton } from '../video-button-preparation.ts';

test('video preparation requires complete visible labels together before the timed fragment', async () => {
  const source = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /<text>Seek 0s<\/text>[\s\S]*?<text>Seek 2s<\/text>[\s\S]*?<text>Near End<\/text>/);
  const calls = [];
  const uiContext = { shrunkShotToLogicalRatio: 1, shotSize: { width: 1206, height: 2622 } };
  const agent = { addProgressListener: () => () => {},
    getUIContext: async () => uiContext,
    aiAct: async (prompt, options) => calls.push(['act', prompt, options]),
    aiLocate: async (prompt, options) => { calls.push(['locate', prompt, options]); return { center: [100, 100] }; } };
  await makeVideoButtonsVisible(agent, ['Clear', 'Seek 2s', 'Play', 'Stop']);
  await locateVideoButton(agent, 'Seek 2s');
  assert.match(calls[0][1], /Match their complete visible labels, including seek suffixes/);
  assert.match(calls[0][1], /finish without scrolling/);
  assert.match(calls[0][1], /Do not tap any button, change playback/);
  assert.doesNotMatch(calls[0][1], /clipped|truncated|SECOND/);
  assert.match(calls[1][1], /center INSIDE the actual blue button body/);
  assert.deepEqual(calls.map(call => call[2]), [{ effort: 'deepThink', deepLocate: false, cacheable: false }, { deepLocate: true, cacheable: false, uiContext }]);
});

test('interval grounding distinguishes the source button from the mode selector without adding input', async () => {
  const source = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /<text>Fill<\/text>[\s\S]*?<text>1s Tick<\/text>[\s\S]*?<text>Invalid 0s<\/text>[\s\S]*?<text>Fast Tick<\/text>[\s\S]*?<text>Latest<\/text>/);
  const uiContext = { shrunkShotToLogicalRatio: 2, shotSize: { width: 1080, height: 2400 } };
  const calls = [];
  const agent = {
    getUIContext: async () => uiContext,
    aiLocate: async (prompt, options) => { calls.push({ prompt, options }); return { center: [400, 600] }; },
  };
  assert.deepEqual(await locateVideoButton(agent, '1s Tick'), [200, 300]);
  await locateVideoButton(agent, 'Latest');
  assert.equal(calls.length, 2);
  assert.match(calls[0].prompt, /SAME ROW as Fill, Invalid 0s and Fast Tick, BETWEEN Fill and Invalid 0s/);
  assert.match(calls[0].prompt, /Do not select "Latest" in the row below/);
  assert.doesNotMatch(calls[1].prompt, /SAME ROW|Do not select/);
  for (const call of calls) assert.deepEqual(call.options, { deepLocate: true, cacheable: false, uiContext });
});

test('standalone Play grounding targets the blue body rather than its lower edge without moving the returned point', async () => {
  const source = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /<text>Clear<\/text>[\s\S]*?<text>Play<\/text>[\s\S]*?<text>Play Null<\/text>[\s\S]*?<text>Pause<\/text>[\s\S]*?<text>Stop<\/text>/);
  const uiContext = { shrunkShotToLogicalRatio: 3, shotSize: { width: 1206, height: 2622 } };
  const calls = [];
  const agent = {
    getUIContext: async () => uiContext,
    aiLocate: async (prompt, options) => { calls.push({ prompt, options }); return { center: [366, 1666.5] }; },
  };
  assert.deepEqual(await locateVideoButton(agent, 'Play'), [122, 556]);
  await locateVideoButton(agent, 'Play Null');
  assert.match(calls[0].prompt, /BETWEEN "Clear" and "Play Null"/);
  assert.match(calls[0].prompt, /NOT the lower edge or the white gap above the Seek row/);
  assert.doesNotMatch(calls[1].prompt, /standalone "Play"|white gap/);
  for (const call of calls) assert.deepEqual(call.options, { deepLocate: true, cacheable: false, uiContext });
});

test('Play Null grounding excludes the observed Near End row confusion without substituting input', async () => {
  const source = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /<text>Play<\/text>[\s\S]*?<text>Play Null<\/text>[\s\S]*?<text>Pause<\/text>[\s\S]*?<text>Stop<\/text>[\s\S]*?<text>Near End<\/text>/);
  const uiContext = { shrunkShotToLogicalRatio: 3, shotSize: { width: 1206, height: 2622 } };
  const calls = [];
  const agent = {
    getUIContext: async () => uiContext,
    aiLocate: async (prompt, options) => { calls.push({ prompt, options }); return { center: [603.5, 1723.5] }; },
  };
  assert.deepEqual(await locateVideoButton(agent, 'Play Null'), [201, 575]);
  await locateVideoButton(agent, 'Near End');
  assert.match(calls[0].prompt, /BETWEEN "Play" and "Pause"/);
  assert.match(calls[0].prompt, /Do not select "Near End" directly below/);
  assert.doesNotMatch(calls[1].prompt, /FIRST playback row/);
  for (const call of calls) assert.deepEqual(call.options, { deepLocate: true, cacheable: false, uiContext });
});

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
    getUIContext: async () => ({ shrunkShotToLogicalRatio: 1, shotSize: { width: 1206, height: 2622 } }),
    addProgressListener: () => () => {}, aiAct: async () => requests++,
    aiLocate: async () => ({ center: [100 + ++requests * 10, 100] }),
    interface: { inputPrimitives: { pointer: { tap: async () => taps++ } } },
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
