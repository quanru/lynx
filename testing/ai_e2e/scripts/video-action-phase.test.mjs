import assert from 'node:assert/strict';
import test from 'node:test';
import { executeVideoActionPhase, videoActionPhaseChecks, videoActionPhaseTargets } from '../video-action-phase.ts';

const playing = { tag: 'status-text', equal: 'playing', timeoutMs: 20000 };

test('runner cancellation reaches preparation and late planning/location results cannot start physical playback', async () => {
  for (const stage of ['prepare', 'locate']) {
    const controller = new AbortController();
    const reason = new Error('Original node deadline');
    let removed = 0, locations = 0, taps = 0;
    const agent = {
      getUIContext: async () => ({ shrunkShotToLogicalRatio: 1, shotSize: { width: 1206, height: 2622 } }),
      addProgressListener: () => () => removed++,
      aiAct: async (_prompt, options) => {
        assert.equal(options.abortSignal, controller.signal);
        if (stage === 'prepare') controller.abort(reason);
      },
      aiLocate: async () => { locations++; controller.abort(reason); return { center: [100, 100] }; },
      interface: { inputPrimitives: { pointer: { tap: async () => taps++ } } },
    };
    await assert.rejects(executeVideoActionPhase(agent, 'replace-playing-source', async () => assert.fail(), async () => assert.fail(), controller.signal), error => error === reason);
    assert.equal(removed, 1);
    assert.equal(locations, stage === 'prepare' ? 0 : 1);
    assert.equal(taps, 0);
  }
});

test('cancellation during a source assertion cannot capture or issue the second tap', async () => {
  const f = fixture();
  const controller = new AbortController();
  const reason = new Error('Original node deadline');
  await assert.rejects(executeVideoActionPhase(f.agent, 'replace-playing-source', async () => controller.abort(reason), async () => assert.fail(), controller.signal), error => error === reason);
  assert.equal(f.trace.filter(item => item[0] === 'tap').length, 1);
});

test('actual SDK Tap schema and task execution deliver prelocated points to the device primitive without model access', async () => {
  const { TaskBuilder } = await import(new URL('../node_modules/@midscene/core/dist/es/agent/task-builder.mjs', import.meta.url));
  const { defineActionTap } = await import('@midscene/core/device');
  const taps = [];
  const action = defineActionTap(async (...args) => taps.push(args));
  const builder = new TaskBuilder({ interfaceInstance: {}, actionSpace: [action], service: {
    locate: async () => assert.fail('Prelocated physical action must not request a model'),
  } });
  const { tasks } = await builder.build([{ type: 'Tap', param: { locate: {
    prompt: 'Src B', locatedPixelResult: { center: [200, 100] }, deepLocate: false, cacheable: false,
  } }, thought: '' }]);
  assert.deepEqual(tasks.map(task => task.subType), ['Locate', 'Tap']);
  for (const task of tasks) {
    await task.executor({ task: { timing: {} }, uiContext: { shrunkShotToLogicalRatio: 1, deprecatedDpr: 3 } });
  }
  assert.equal(taps.length, 1);
  assert.deepEqual(taps[0], [{ x: 200, y: 100 }]);
});

test('ordinary video deep location refines a planning point before its single SDK Tap and applies iOS scale once', async () => {
  const { TaskBuilder } = await import('../node_modules/@midscene/core/dist/es/agent/task-builder.mjs');
  const { defineActionTap } = await import('@midscene/core/device');
  for (const deepLocate of [false, true]) {
    let calls = 0;
    const taps = [];
    const builder = new TaskBuilder({ interfaceInstance: {}, actionSpace: [defineActionTap(point => taps.push(point))], service: {
      locate: async input => {
        assert.equal(input.deepLocate, true);
        calls++;
        return { element: { center: [374, 1625] } };
      },
    } });
    const { tasks } = await builder.build([{ type: 'Tap', param: { locate: {
      prompt: 'Play', locatedPixelResult: { center: [374, 1678] }, deepLocate, cacheable: false,
    } }, thought: '' }]);
    for (const task of tasks) await task.executor({ task: { timing: {} }, uiContext: { shrunkShotToLogicalRatio: 3, deprecatedDpr: 3 } });
    assert.equal(calls, deepLocate ? 1 : 0);
    assert.deepEqual(taps, [{ x: Math.round(374 / 3), y: Math.round((deepLocate ? 1625 : 1678) / 3) }]);
  }
});

test('public SDK waitAfterAction zero removes only the extra post-tap delay, not an original source wait', async t => {
  const { TaskBuilder } = await import('../node_modules/@midscene/core/dist/es/agent/task-builder.mjs');
  const { defineActionTap } = await import('@midscene/core/device');
  const delays = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    delays.push(delay);
    queueMicrotask(() => callback(...args));
    return {};
  });
  for (const waitAfterAction of [undefined, 0]) {
    delays.length = 0;
    let taps = 0;
    const builder = new TaskBuilder({ interfaceInstance: {}, waitAfterAction, actionSpace: [defineActionTap(() => taps++)], service: {
      locate: async () => assert.fail('A prelocated physical tap cannot invoke a model'),
    } });
    const { tasks } = await builder.build([{ type: 'Tap', param: { locate: {
      prompt: 'Play', locatedPixelResult: { center: [374, 1625] }, deepLocate: false, cacheable: false,
    } }, thought: '' }]);
    for (const task of tasks) await task.executor({ task: { timing: {} }, uiContext: { shrunkShotToLogicalRatio: 3, deprecatedDpr: 3 } });
    assert.equal(taps, 1);
    assert.deepEqual(delays, waitAfterAction === 0 ? [200] : [200, 300]);
  }
});

test('pinned SDK honors prelocated screenshot points without a second model call; deepLocate would call it again', async () => {
  const { TaskBuilder } = await import(new URL('../node_modules/@midscene/core/dist/es/agent/task-builder.mjs', import.meta.url));
  for (const deepLocate of [false, true]) {
    let modelCalls = 0;
    const builder = new TaskBuilder({ interfaceInstance: {}, actionSpace: [], service: {
      locate: async () => { modelCalls++; return { element: { center: [200, 100] } }; },
    } });
    const locate = builder.createLocateTask({ thought: '' }, {
      prompt: 'Src B', locatedPixelResult: { center: [200, 100] }, deepLocate, cacheable: false,
    }, { tasks: [], cacheable: false });
    const result = await locate.executor({ task: { timing: {} }, uiContext: { shrunkShotToLogicalRatio: 1, deprecatedDpr: 3 } });
    assert.deepEqual(result.output.element.center, [200, 100]);
    assert.equal(modelCalls, deepLocate ? 1 : 0);
    if (!deepLocate) assert.equal(result.hitBy.from, 'Plan');
  }
});
function fixture() {
  const trace = [];
  let state = 'ready';
  let taps = 0;
  let listener;
  const agent = {
    getUIContext: async () => ({ shrunkShotToLogicalRatio: 1, shotSize: { width: 1206, height: 2622 } }),
    addProgressListener: value => { listener = value; return () => { listener = undefined; }; },
    aiAct: async prompt => { trace.push(['prepare', prompt]); listener?.({ scope: 'aiAct', phase: 'action_running', data: { action: { name: 'Scroll' } } }); },
    aiLocate: async (prompt, options) => {
      trace.push(['locate', prompt, options]);
      assert.equal(taps, 0, 'No model call may follow playback start');
      return { center: prompt.includes('"Src B"') || prompt.includes('"Stop"') ? [200, 100] : [100, 100] };
    },
    interface: { inputPrimitives: { pointer: { tap: async point => {
      trace.push(['tap', point]);
      state = ++taps === 1 ? 'playing' : 'ready';
    } } } },
  };
  const source = async input => { trace.push(['assert', input]); assert.equal(state, 'playing', 'Original playing state must genuinely pass'); };
  const capture = async () => { trace.push(['capture', state]); };
  return { agent, trace, source, capture, emit: name => listener?.({ scope: 'aiAct', phase: 'action_running', data: { action: { name } } }), setState: value => { state = value; },
    run: () => executeVideoActionPhase(agent, 'replace-playing-source', source, capture) };
}

test('all visual planning precedes both public device taps and original inter-action checks', async () => {
  const f = fixture();
  const evidence = await f.run();
  assert.deepEqual(f.trace.map(item => item[0]), ['prepare', 'locate', 'locate', 'tap', 'assert', 'capture', 'assert', 'tap']);
  assert.equal(await evidence.consume(playing), true);
  assert.ok(f.trace.filter(item => item[0] === 'locate').every(item => item[2].deepLocate === true && item[2].cacheable === false && item[2].uiContext));
  assert.deepEqual(f.trace.filter(item => item[0] === 'tap').map(item => item[1]), [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
});
test('capture or device delay cannot replay stale playing into a late second tap', async () => {
  const f = fixture();
  await assert.rejects(executeVideoActionPhase(f.agent, 'replace-playing-source', f.source, async () => f.setState('ended')), /genuinely pass/);
  assert.equal(f.trace.filter(item => item[0] === 'tap').length, 1);
});
test('a failed original assertion stops before second tap rather than being swallowed', async () => {
  const f = fixture();
  await assert.rejects(executeVideoActionPhase(f.agent, 'replace-playing-source', async () => { throw new Error('source assertion failed'); }, f.capture), /source assertion failed/);
  assert.equal(f.trace.filter(item => item[0] === 'tap').length, 1);
});
test('failure to locate either button stops before playback starts', async () => {
  const f = fixture();
  let locations = 0;
  f.agent.aiLocate = async () => { if (++locations === 2) throw new Error('missing button'); return { center: [100, 100] }; };
  await assert.rejects(f.run(), /missing button/);
  assert.equal(f.trace.filter(item => item[0] === 'tap').length, 0);
});

test('visibility preparation cannot hide extra clicks and its listener is removed after success or failure', async () => {
  for (const action of ['Tap', 'Input', 'Launch', undefined]) {
    const f = fixture();
    f.agent.aiAct = async () => f.emit(action);
    await assert.rejects(f.run(), /non-scroll/);
    assert.equal(f.trace.length, 0);
    assert.equal(f.emit('Tap'), undefined);
  }
  const f = fixture();
  f.agent.aiAct = async () => { throw new Error('preparation failed'); };
  await assert.rejects(f.run(), /preparation failed/);
  assert.equal(f.emit('Tap'), undefined);
});
test('malformed and identical points cannot issue physical actions', async () => {
  for (const center of [[-1, 2], [NaN, 2], [1], [1, 2, 3], [100, 100]]) {
    const f = fixture();
    f.agent.aiLocate = async () => ({ center });
    await assert.rejects(f.run(), /Invalid visual point|same point/);
    assert.equal(f.trace.filter(item => item[0] === 'tap').length, 0);
  }
});
test('original assertion identity and order survive consumption without extra reads', async () => {
  const f = fixture();
  const evidence = await executeVideoActionPhase(f.agent, 'stop-play-null', f.source, f.capture);
  const checks = videoActionPhaseChecks('stop-play-null');
  await assert.rejects(evidence.consume(checks[1]), /identity or order/);
  for (let index = 0; index < checks.length; index++) assert.equal(await evidence.consume(checks[index]), index === checks.length - 1);
  await assert.rejects(evidence.consume(checks[0]), /identity or order/);
});
test('case cleanup permanently disposes source-time evidence', async () => {
  const f = fixture();
  const evidence = await f.run();
  evidence.dispose();
  evidence.dispose();
  await assert.rejects(evidence.consume(playing), /disposed/);
});
test('failed physical taps never produce consumable source evidence or hidden retries', async () => {
  for (const failureAt of [1, 2]) {
    const f = fixture();
    const tap = f.agent.interface.inputPrimitives.pointer.tap;
    let count = 0;
    f.agent.interface.inputPrimitives.pointer.tap = async (...args) => { if (++count === failureAt) throw new Error('physical failure'); return tap(...args); };
    await assert.rejects(f.run(), /physical failure/);
    assert.equal(count, failureAt);
  }
});
test('source check copies cannot mutate later phases or cached original assertion identity', async () => {
  const f = fixture();
  const evidence = await executeVideoActionPhase(f.agent, 'replace-playing-source', async input => { input.equal = 'ended'; }, f.capture);
  assert.equal(await evidence.consume(playing), true);
  const checks = videoActionPhaseChecks('stop-play-null');
  checks[0].equal = 'ended';
  assert.equal(videoActionPhaseChecks('stop-play-null')[0].equal, 'playing');
});
test('only the two unchanged source phases and exact fixture labels are supported', async () => {
  assert.deepEqual(videoActionPhaseTargets('replace-playing-source'), ['Play', 'Src B']);
  assert.deepEqual(videoActionPhaseTargets('stop-play-null'), ['Play Null', 'Stop']);
  assert.deepEqual(videoActionPhaseChecks('replace-playing-source'), [playing]);
  assert.throws(() => videoActionPhaseTargets('unknown'), /Unknown/);
  const f = fixture();
  await assert.rejects(executeVideoActionPhase(f.agent, 'unknown', f.source, f.capture), /Unknown/);
  assert.deepEqual(f.trace, []);
});
