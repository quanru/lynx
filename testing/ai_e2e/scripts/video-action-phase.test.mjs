import assert from 'node:assert/strict';
import test from 'node:test';
import { observeVideoActionPhase } from '../video-action-phase.ts';
import { videoActionPhaseChecks } from '../video-action-phase.ts';
import { expectVideoValue } from '../video-expectation.ts';

// Exercise the actual pinned SDK bus, including awaited listener delivery and
// swallowed callback errors. Production uses only public addProgressListener.
const { AgentProgressBus } = await import(new URL('../node_modules/@midscene/core/dist/es/agent/progress/progress-bus.mjs', import.meta.url));
const playing = { tag: 'status-text', equal: 'playing', timeoutMs: 20000 };

function fixture(checks = [playing]) {
  const bus = new AgentProgressBus();
  let state = 'ready';
  const trace = [];
  const observer = observeVideoActionPhase({ addProgressListener: listener => bus.subscribe(listener) }, checks,
    async input => { trace.push(['assert', input]); assert.equal(state, 'playing', 'The original playing assertion must genuinely pass'); },
    async () => { trace.push(['fresh', state]); assert.equal(state, 'playing', 'Replacement/stop must still happen during playback'); },
    async () => { trace.push(['evidence', state]); });
  return { bus, observer, trace, getState: () => state, setState: value => { state = value; },
    emit: (phase, name = 'Tap') => bus.publish('aiAct', phase, { action: { name } }) };
}

async function firstTap(f) {
  await f.emit('start');
  await f.emit('action_running');
  f.setState('playing');
  await f.emit('action_done');
}

test('video checks execute between real taps, before later model planning or completion', async () => {
  const f = fixture();
  await firstTap(f);
  assert.deepEqual(f.trace.map(x => x[0]), ['assert', 'evidence']);
  await f.emit('action_running');
  f.setState('ready'); // Source replacement has happened after playing was verified.
  await f.emit('action_done');
  await f.emit('complete');
  assert.equal(await f.observer.consume({ timeoutMs: 20000, equal: 'playing', tag: 'status-text' }), true);
  f.observer.dispose();
  assert.equal(f.bus.listenerCount, 0);
});

test('cached playing cannot make a late source replacement pass', async () => {
  const f = fixture();
  await firstTap(f);
  f.setState('ended');
  await f.emit('action_running');
  await f.emit('action_done');
  await f.emit('complete');
  await assert.rejects(f.observer.consume(playing), /still happen during playback/);
  f.observer.dispose();
});

test('source assertion failure is retained despite the SDK swallowing progress listener errors', async () => {
  const f = fixture();
  await f.emit('start');
  await f.emit('action_running');
  f.setState('ended');
  await f.emit('action_done');
  await f.emit('complete');
  await assert.rejects(f.observer.consume(playing), /genuinely pass/);
  f.observer.dispose();
});

test('missing second tap cannot pass through an otherwise successful aiAct', async () => {
  const f = fixture();
  await firstTap(f);
  await f.emit('complete');
  await assert.rejects(f.observer.consume(playing), /exactly two/);
  f.observer.dispose();
});

test('extra taps and repeated planning instructions cannot become hidden retries', async () => {
  for (const extra of ['action_running', 'start']) {
    const f = fixture();
    await firstTap(f);
    await f.emit('action_running');
    await f.emit('action_done');
    await f.emit(extra);
    await f.emit('complete');
    await assert.rejects(f.observer.consume(playing), /extra|another aiAct/);
    f.observer.dispose();
  }
});

test('assertion identity and source order cannot be changed during consumption', async () => {
  const second = { tag: 'callback-log', contains: 'play_ok', timeoutMs: 20000 };
  const f = fixture([playing, second]);
  await firstTap(f);
  await f.emit('action_running');
  await f.emit('action_done');
  await f.emit('complete');
  assert.deepEqual(f.trace.filter(x => x[0] === 'assert').map(x => x[1]), [playing, second]);
  await assert.rejects(f.observer.consume(second), /identity or order/);
  f.observer.dispose();
});

test('scroll actions cannot count as source clicks and failed actions cannot pass', async () => {
  for (const failure of ['action_failed', 'failed']) {
    const f = fixture();
    await f.emit('start');
    await f.emit('action_running', 'Scroll');
    await f.emit('action_done', 'Scroll');
    await f.emit(failure);
    await assert.rejects(f.observer.consume(playing), /phase failed/);
    f.observer.dispose();
  }
});

test('case cleanup unsubscribes once and cannot expose disposed evidence', async () => {
  const f = fixture();
  f.observer.dispose();
  f.observer.dispose();
  assert.equal(f.bus.listenerCount, 0);
  await f.emit('start');
  assert.deepEqual(f.trace, []);
  await assert.rejects(f.observer.consume(playing), /disposed/);
});

test('old post-planning playing read fails, while original inter-action assertions pass before source replacement', async () => {
  const f = fixture();
  await firstTap(f);
  await f.emit('action_running');
  f.setState('ready');
  await f.emit('action_done');
  await f.emit('complete');
  const read = async () => ({ nodeId: 0, nodeName: '#document', children: [
    { nodeId: 1, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'status-text'], children: [
      { nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', f.getState()] },
    ] },
  ] });
  await assert.rejects(expectVideoValue(read, async () => {}, { ...playing, immediate: true }), /Original video assertion failed/);
  assert.equal(await f.observer.consume(playing), true);
  f.observer.dispose();
});

test('only source-bound phases can arm video assertions and their input copies are isolated', () => {
  assert.deepEqual(videoActionPhaseChecks('replace-playing-source'), [playing]);
  const first = videoActionPhaseChecks('stop-play-null');
  assert.equal(first.length, 3);
  first[0].equal = 'ended';
  assert.equal(videoActionPhaseChecks('stop-play-null')[0].equal, 'playing');
  assert.throws(() => videoActionPhaseChecks('unknown'), /Unknown/);
  assert.throws(() => observeVideoActionPhase({}, [], async () => {}, async () => {}, async () => {}), /original playing assertion/);
});
