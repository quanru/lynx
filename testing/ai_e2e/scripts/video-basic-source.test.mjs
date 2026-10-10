import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseVideoCurrentTime } from '../video-expectation.ts';

const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/VideoBasic.py', import.meta.url), 'utf8');
const utils = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/video_utils.py', import.meta.url), 'utf8');
function replay() {
  return JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./extract-video-basic.py', import.meta.url))], { input: JSON.stringify({ source, utils }), encoding: 'utf8' }));
}

test('VideoBasic complete source replay retains every ordered action, sleep, screenshot and both helper families', () => {
  const events = replay();
  assert.equal(events.filter(([kind]) => kind === 'section').length, 9);
  assert.deepEqual(events.filter(([kind]) => kind === 'click').map(([, tag]) => tag), [
    'btn-clear-signals', 'btn-clear-signals', 'btn-play', 'btn-pause', 'btn-clear-signals',
    'btn-clear-signals', 'btn-seek', 'btn-play', 'btn-stop', 'btn-clear-signals', 'btn-play',
    'btn-clear-signals', 'btn-seek-near-end', 'btn-clear-signals', 'btn-play', 'btn-stop',
    'btn-clear-signals', 'btn-loop-on', 'btn-play', 'btn-seek-near-end',
  ]);
  assert.deepEqual(events.filter(([kind]) => kind === 'wait').map(([, ms]) => ms), [1200, 2000, 3000, 1200, 2000, 1200, 1200, 2000, 2000, 1200, 2000, 1000]);
  assert.deepEqual(events.filter(([kind]) => kind === 'screenshot').map(([, label]) => label), ['ready', 'stopped', 'loop']);
  const core = events.filter(([kind]) => kind === 'core-wait').map(([, input]) => input.timeoutMs);
  assert.deepEqual(core, [10000, 10000, 10000, 10000, 10000, 10000, 8000, 5000, 10000, 15000]);
  const fixture = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
  for (const [, tag] of events.filter(([kind]) => kind === 'click')) assert.ok(fixture.includes('lynx-test-tag="' + tag + '"'));
});

test('VideoBasic predicate replay preserves inclusive seek and exclusive restart/loop bounds', () => {
  const predicates = replay().filter(([kind]) => kind === 'video-predicate').map(([, input]) => input);
  assert.equal(predicates.length, 5);
  assert.equal(predicates[0].tag, 'firstframe-duration');
  assert.deepEqual(predicates[0].samples, [['0', false], ['0.1', true], ['1', true]]);
  for (const [index, input] of predicates.slice(1).entries()) {
    assert.equal(input.timeoutMs, 5000);
    for (const [text, expected] of input.samples) {
      const value = parseVideoCurrentTime(text);
      assert.equal(index === 0 ? value >= 2 && value < 6 : value > 0 && value < 5, expected);
    }
  }
});
