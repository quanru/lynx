import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';
import { originalVideoPlayback } from './video-playback-source.mjs';
import { executeVideoPlaybackPhase, expectCoreVideoValue, videoPlaybackOperations } from '../video-playback-phase.ts';
import { parseVideoFloat } from '../video-float.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dom = (tag, text) => ({ nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'TEXT', attributes: ['lynx-test-tag', tag], children: [{ nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', text] }] }] });

test('both complete original playback cases collect on Android/iOS with every action, wait, predicate and source sample retained', async () => {
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  const allPhases = {};
  for (const name of ['VideoBasic', 'VideoAttributes']) {
    const source = originalVideoPlayback(name);
    Object.assign(allPhases, source.phases);
    const filename = name === 'VideoBasic' ? 'video-basic' : 'video-attributes';
    for (const project of loaded.projects) {
      const collected = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name, sourcePath: 'cases/native/' + filename + '.yaml', absolutePath: root + 'cases/native/' + filename + '.yaml' }, { resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env });
      const actual = collected.cases[0].definition;
      assert.equal(actual.name, 'xelement/' + name);
      assert.equal(collected.lifecycle.afterEach.length, 1);
      assert.equal(collected.lifecycle.afterEach[0].node, 'recordToReport');
      assert.equal(actual.steps.length, source.document.cases[0].steps.length);
      actual.steps.forEach((step, index) => {
        const expected = source.document.cases[0].steps[index];
        const key = Object.keys(expected)[0];
        assert.equal(step.node, key);
        if (key === 'launch') assert.equal(step.input.uri, project.variables.videoUri);
        else if (key === 'aiAct') assert.deepEqual(step.input, { ...expected.aiAct, options: { deepLocate: project.variables.videoDeepLocate, cacheable: false } });
        else if (key !== 'recordToReport') assert.deepEqual(step.input, expected[key]);
      });
    }
    const ordinaryClicks = source.document.cases[0].steps.filter(step => step.aiAct).length;
    const timedClicks = Object.values(source.phases).flat().filter(op => op.type === 'tap').length;
    assert.equal(ordinaryClicks + timedClicks, source.events.filter(([kind]) => kind === 'click').length);
    assert.equal(source.operations.length, source.events.length);
  }
  assert.deepEqual(JSON.parse(readFileSync(new URL('../video-playback-plans.json', import.meta.url))), allPhases);
  assert.equal(originalVideoPlayback('VideoBasic').operations.filter(op => op.type === 'tap').length, 20);
  assert.equal(originalVideoPlayback('VideoAttributes').operations.filter(op => op.type === 'sample').length, 3);
});

function fixture(phase, defect) {
  const operations = videoPlaybackOperations(phase);
  const trace = [], queue = [];
  let now = 0, taps = 0, location = 0;
  for (const op of operations) {
    if (op.type === 'core') queue.push({ tag: op.input.tag, text: op.input.text });
    if (op.type === 'video') {
      const input = op.input;
      const count = input.countAtLeast ?? input.countEquals ?? input.countAtMost;
      queue.push({ tag: input.tag, text: input.equal ?? input.contains ?? (count ? count.key + '=' + count.value : input.currentTimeRange ? (input.currentTimeRange.minInclusive ? input.currentTimeRange.min : 1) + '.0 / 10.0' : input.floatAtLeast !== undefined ? '0.85' : '1.0') });
    }
    if (op.type === 'sample') queue.push({ tag: op.tag, text: { slow_time: '1.0 / 10.0', fast_time: '5.0 / 10.0', fast_count: 'timeupdate=30' }[op.variable], variable: op.variable });
  }
  const agent = {
    addProgressListener: () => () => {},
    aiAct: async () => { assert.equal(taps, 0); trace.push('prepare'); },
    aiLocate: async () => { assert.equal(taps, 0); trace.push('locate'); return { center: [100 + ++location * 50, 100] }; },
    callActionInActionSpace: async (type, input) => { assert.equal(type, 'Tap'); assert.equal(input.locate.deepLocate, false); taps++; trace.push(['tap', input.locate.prompt]); },
  };
  const read = async () => {
    const item = queue.shift(); assert.ok(item, 'No extra or hidden source read');
    trace.push(['read', item.tag]);
    if (item.variable && defect?.[item.variable]) item.text = defect[item.variable];
    return dom(item.tag, item.text);
  };
  const capture = async title => trace.push(['capture', title]);
  const clock = { now: () => now, sleep: async ms => { trace.push(['sleep', ms]); now += ms; } };
  return { trace, queue, run: () => executeVideoPlaybackPhase(agent, phase, read, capture, clock) };
}

test('timed fragments make all model calls before playback and retain every SDK physical tap, sleep and single read', async () => {
  for (const phase of ['basic-ready', 'basic-playback', 'basic-loop', 'attributes-playback']) {
    const f = fixture(phase); await f.run();
    const original = videoPlaybackOperations(phase);
    assert.equal(f.queue.length, 0);
    assert.deepEqual(f.trace.filter(item => item[0] === 'tap').map(item => item[1]), original.filter(op => op.type === 'tap').map(op => op.label));
    assert.deepEqual(f.trace.filter(item => item[0] === 'sleep').map(item => item[1]), original.filter(op => op.type === 'sleep').map(op => op.ms));
    assert.deepEqual(f.trace.filter(item => item[0] === 'capture').map(item => item[1]), original.filter(op => op.type === 'capture').map(op => op.title));
    const firstTap = f.trace.findIndex(item => item[0] === 'tap');
    if (firstTap >= 0) assert.ok(!f.trace.slice(firstTap).some(item => item === 'locate' || item === 'prepare'));
  }
});

test('speed and tiny interval reject the exact original boundaries without retries, extra samples or widened windows', async () => {
  for (const defect of [{ fast_time: '2.9 / 10.0' }, { slow_time: '3.5 / 10.0' }, { fast_count: 'timeupdate=29' }]) {
    const f = fixture('attributes-playback', defect);
    await assert.rejects(f.run(), /advance faster|not be clamped/);
  }
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/VideoAttributes.py', import.meta.url), 'utf8');
  const utils = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/video_utils.py', import.meta.url), 'utf8');
  for (const samples of [['1.0 / 10.0', '2.9 / 10.0', 'timeupdate=30'], ['3.5 / 10.0', '5.0 / 10.0', 'timeupdate=30'], ['1.0 / 10.0', '5.0 / 10.0', 'timeupdate=29']]) {
    assert.throws(() => execFileSync('python3', [fileURLToPath(new URL('./extract-video-playback.py', import.meta.url))], { input: JSON.stringify({ source, utils, samples }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  }
});

test('original core helper does not sleep or use video final-read behavior; timeout and transport failure stop playback', async () => {
  let reads = 0, now = 0, captures = 0;
  const input = { tag: 'status-text', text: 'playing', timeoutMs: 10000, message: 'Play failed' };
  await expectCoreVideoValue(async () => { reads++; return dom(input.tag, reads === 2 ? 'playing' : 'ready'); }, async () => captures++, input);
  assert.equal(reads, 2); assert.equal(captures, 0);
  reads = 0;
  await assert.rejects(expectCoreVideoValue(async () => { reads++; now += 10000; return dom(input.tag, 'playing'); }, async () => captures++, input, () => now), /Play failed/);
  assert.equal(reads, 1); assert.equal(captures, 1);
  await assert.rejects(expectCoreVideoValue(async () => { throw new Error('CDP transport failure'); }, async () => assert.fail(), input), /CDP transport/);
});

test('new phases are closed and immutable, and malformed preparation cannot issue timed device actions', async () => {
  assert.throws(() => videoPlaybackOperations('unknown'), /Unknown/);
  const changed = videoPlaybackOperations('basic-loop'); changed[0].title = 'changed';
  assert.notEqual(videoPlaybackOperations('basic-loop')[0].title, 'changed');
  let taps = 0;
  const agent = { addProgressListener: () => () => {}, aiAct: async () => {}, aiLocate: async () => ({ center: [10, 20] }), callActionInActionSpace: async () => taps++ };
  await assert.rejects(executeVideoPlaybackPhase(agent, 'basic-loop', async () => assert.fail(), async () => assert.fail()), /same point/);
  assert.equal(taps, 0);
});

test('video float parser agrees with Python float, including malformed strings, Unicode digits and special values', () => {
  const inputs = ['0', '0.85', '-1', ' 1.0 ', '', '0x10', '1_000.0', '1__0', '١.٥', '１２.３', 'NaN', 'Infinity', '-inf', '1e-3', '1.', '.5', ...['\u0085', '\ufeff', '\u001c', '\u00a0', '\u2007', '\u202f'].map(space => space + '1.0' + space)];
  const expected = JSON.parse(execFileSync('python3', ['-c', 'import json,sys,math\nout=[]\nfor text in json.load(sys.stdin):\n try:\n  n=float(text);out.append("nan" if math.isnan(n) else "inf" if n==math.inf else "-inf" if n==-math.inf else n)\n except ValueError: out.append("invalid")\nprint(json.dumps(out))'], { input: JSON.stringify(inputs), encoding: 'utf8' }));
  inputs.forEach((input, index) => {
    if (expected[index] === 'invalid') assert.throws(() => parseVideoFloat(input));
    else {
      const actual = parseVideoFloat(input);
      assert.equal(Number.isNaN(actual) ? 'nan' : actual === Infinity ? 'inf' : actual === -Infinity ? '-inf' : actual, expected[index]);
    }
  });
});
