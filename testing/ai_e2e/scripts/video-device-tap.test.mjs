import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { locateVideoButton, tapPreparedVideoButton } from '../video-button-preparation.ts';

test('Seek 0s grounding matches its complete label without a neighboring target or clipped-text guess', async () => {
  const source = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /<text>Seek 0s<\/text>[\s\S]*?<text>Seek 2s<\/text>[\s\S]*?<text>Near End<\/text>/);
  let prompt;
  const agent = {
    getUIContext: async () => ({ shrunkShotToLogicalRatio: 3, shotSize: { width: 1206, height: 2622 } }),
    aiLocate: async (value, options) => { prompt = value; assert.equal(options.deepLocate, true); return { center: [54, 1783] }; },
  };
  assert.deepEqual(await locateVideoButton(agent, 'Seek 0s'), [18, 594]);
  assert.match(prompt, /labeled exactly "Seek 0s"/);
  assert.match(prompt, /Match its complete label/);
  assert.doesNotMatch(prompt, /Seek 2s|Near End|FIRST|clipped|truncated/);
});

test('readable seek labels use the same independent refinement as other controls', async () => {
  const modes = [];
  const agent = {
    getUIContext: async () => ({ shrunkShotToLogicalRatio: 3, shotSize: { width: 1206, height: 2622 } }),
    aiLocate: async (_prompt, options) => { modes.push(options.deepLocate); return { center: [180, 1750] }; },
  };
  for (const label of ['Seek 0s', 'Seek 2s', 'Play', 'Pause', 'Src B']) await locateVideoButton(agent, label);
  assert.deepEqual(modes, [true, true, true, true, true]);
});

test('visual grounding uses its exact screenshot context and converts to logical coordinates once', async () => {
  for (const ratio of [1, 3, 1.5]) {
    const uiContext = { shrunkShotToLogicalRatio: ratio, deprecatedDpr: 3, shotSize: { width: 1206, height: 2622 } };
    const trace = [];
    const agent = {
      getUIContext: async () => { trace.push('capture'); return uiContext; },
      aiLocate: async (_prompt, options) => { assert.equal(options.uiContext, uiContext); trace.push('model'); return { center: [374, 1625] }; },
      callActionInActionSpace: async () => assert.fail('Timed taps must not run automatic SDK capture tasks'),
      interface: { inputPrimitives: { pointer: { tap: async point => trace.push(point) } } },
    };
    const center = await locateVideoButton(agent, 'Play');
    await tapPreparedVideoButton(agent, 'Play', new Map([['Play', center]]));
    assert.deepEqual(trace, ['capture', 'model', { x: Math.round(374 / ratio), y: Math.round(1625 / ratio) }]);
  }
});

test('invalid screenshot geometry and out-of-frame locations fail before physical input', async () => {
  for (const [ratio, width, height, center] of [
    [0, 100, 200, [1, 2]], [NaN, 100, 200, [1, 2]], [1, 0, 200, [1, 2]],
    [1, 100, Infinity, [1, 2]], [1, 100, 200, [100, 2]], [1, 100, 200, [1, 200]],
  ]) {
    const agent = {
      getUIContext: async () => ({ shrunkShotToLogicalRatio: ratio, shotSize: { width, height } }),
      aiLocate: async () => ({ center }),
    };
    await assert.rejects(locateVideoButton(agent, 'Play'), /Invalid/);
  }
});

test('cancellation during context capture prevents model work and expired prepared points cannot tap', async () => {
  const controller = new AbortController();
  const reason = new Error('case deadline');
  const agent = {
    getUIContext: async () => { controller.abort(reason); return {}; },
    aiLocate: async () => assert.fail('Late context must not start location'),
    interface: { inputPrimitives: { pointer: { tap: async () => assert.fail('Expired case must not tap') } } },
  };
  await assert.rejects(locateVideoButton(agent, 'Play', controller.signal), error => error === reason);
  await assert.rejects(tapPreparedVideoButton(agent, 'Play', new Map([['Play', [1, 2]]]), controller.signal), error => error === reason);
});
