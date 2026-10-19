import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { videoActionPhaseChecks, videoActionPhaseTargets } from '../video-action-phase.ts';
import { videoBoundarySeekPrompts } from '../video-boundary-prompts.ts';

const seekRow = ['Seek 0s', 'Seek 2s', 'Near End', 'Seek Bad', 'Seek Missing', 'Seek Null', 'Seek Text', 'Seek NaN', 'Seek Inf', 'Seek Huge'];

export function originalVideoBoundary(platform, variableBridge = false) {
  assert.ok(['android', 'ios'].includes(platform));
  const deepLocate = variableBridge ? '${videoDeepLocate}' : true;
  const seekPrompts = videoBoundarySeekPrompts();
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/VideoBoundary.py', import.meta.url), 'utf8');
  const events = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./extract-video-boundary.py', import.meta.url))], {
    input: JSON.stringify({ source, platform }), encoding: 'utf8',
  }));
  const fixture = ts.createSourceFile('video.tsx', readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels = new Map();
  function visit(node) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute)
        && attribute.name.getText(fixture) === 'lynx-test-tag' && attribute.initializer && ts.isStringLiteral(attribute.initializer));
      if (tag) {
        const text = node.children.find(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(fixture) === 'text');
        if (text) labels.set(tag.initializer.text, text.children.filter(ts.isJsxText).map(child => child.text.trim()).join(''));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(fixture);
  const steps = [
    { recordToReport: { title: 'Start isolated Explorer for VideoBoundary' } },
    { wait: { duration: 5000, unit: 'ms' } },
    { launch: '${videoUri}' },
    { wait: { duration: 2000, unit: 'ms' } },
    ...events.map(([kind, value], eventIndex) => {
      if (kind === 'assert') {
        if (variableBridge && value.contains === (platform === 'ios' ? "method 'unknownVideoMethod' not found" : '"code":3')) {
          value.contains = '${videoBridgeError}';
        }
        return { 'native.video': value };
      }
      if (kind === 'wait') return { wait: { duration: value, unit: 'ms' } };
      if (kind === 'screenshot') return { recordToReport: { title: 'Original VideoBoundary diagnostic screenshot: ' + value } };
      assert.equal(kind, 'click');
      const label = labels.get(value);
      assert.ok(label, 'Missing original visible label for ' + value);
      // This is still the original Clear click immediately after the canceled
      // pause assertions. Only its visual description changes, not the event.
      const afterCanceledPause = events[eventIndex - 1]?.[0] === 'assert'
        && events[eventIndex - 1][1].notContains === 'pause_ok';
      if (label === 'Clear' && afterCanceledPause) return { aiAct: {
        prompt: 'Tap once at the CENTER of the BLUE "Clear" button body at the LEFT END of the first playback-button row. This row contains Clear, Play, Play Null, Pause, Stop and sits immediately ABOVE the Seek 0s / Seek 2s row. Do not tap blank space above the blue button, the numeric status values, or any other button. Stop after that single tap.',
        options: { effort: variableBridge ? '${videoActionEffort}' : platform === 'ios' ? 'balance' : 'deepThink', deepLocate, cacheable: false },
      } };
      const seekIndex = seekRow.indexOf(label);
      if (seekIndex >= 0 || label === 'Seek Empty') {
        assert.ok(label === 'Seek Empty' || seekIndex >= 3, 'Review any new source action in the crowded seek row');
        const variable = 'videoBoundary' + label.replaceAll(' ', '');
        assert.ok(seekPrompts[variable], 'Missing reviewed seek description');
        return { aiAct: {
          prompt: variableBridge ? '${' + variable + '}' : seekPrompts[variable],
          options: { effort: variableBridge ? '${videoActionEffort}' : platform === 'ios' ? 'balance' : 'deepThink', deepLocate, cacheable: false },
        } };
      }
      return { aiAct: {
        prompt: `When scrolling, gesture within the light-gray video demo panel on the LEFT below the back arrow, not the white blank area to its right or below. Scroll if needed and click the single button labeled exactly ${JSON.stringify(label)} once. Do not click similarly named buttons or perform another action.`,
        // Ordinary Clear actions can plan and locate together. Keep the
        // previously ambiguous post-cancellation Clear on its reviewed path.
        options: label === 'Clear'
          ? { effort: 'balance', deepLocate: false, cacheable: false }
          : { effort: variableBridge ? '${videoActionEffort}' : platform === 'ios' ? 'balance' : 'deepThink', deepLocate, cacheable: false },
      } };
    }),
  ];
  const phases = [
    { phase: 'replace-playing-source', first: 'btn-play', second: 'btn-src-secondary' },
    { phase: 'stop-play-null', first: 'btn-play-null-params', second: 'btn-stop' },
  ];
  for (const phase of [...phases].reverse()) {
    const checks = videoActionPhaseChecks(phase.phase);
    const matches = events.flatMap(([kind, value], index) => kind === 'click' && value === phase.first
      && events[index + 1]?.[0] === 'assert' && events[index + 1][1].equal === 'playing' ? [index] : []);
    assert.equal(matches.length, 1, 'Original playing phase must be unique');
    const index = matches[0];
    assert.deepEqual(events.slice(index + 1, index + checks.length + 1), checks.map(input => ['assert', input]));
    assert.deepEqual(events[index + checks.length + 1], ['click', phase.second]);
    const first = labels.get(phase.first);
    const second = labels.get(phase.second);
    assert.ok(first && second);
    assert.deepEqual(videoActionPhaseTargets(phase.phase), [first, second]);
    steps.splice(index + 4, checks.length + 2,
      { 'native.videoPhase': { phase: phase.phase } },
      ...checks.map(input => ({ 'native.video': input })));
  }
  return { events, labels, steps, phases };
}
