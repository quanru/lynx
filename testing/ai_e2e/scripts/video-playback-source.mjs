import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export function originalVideoPlayback(name) {
  assert.ok(['VideoBasic', 'VideoAttributes'].includes(name));
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/' + name + '.py', import.meta.url), 'utf8');
  const utils = readFileSync(new URL('../../integration_test/test_script/case_sets/xelement/video_utils.py', import.meta.url), 'utf8');
  const events = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./extract-video-playback.py', import.meta.url))], { input: JSON.stringify({ source, utils }), encoding: 'utf8' }));
  const ast = ts.createSourceFile('video.tsx', readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels = new Map();
  function visit(node) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'lynx-test-tag' && ts.isStringLiteral(attribute.initializer));
      const text = node.children.find(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(ast) === 'text');
      if (tag && text) labels.set(tag.initializer.text, text.children.filter(ts.isJsxText).map(child => child.text.trim()).join(''));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let section = 0, sample = 0;
  const operations = events.map(([kind, value]) => {
    if (kind === 'section') { section++; return { section, type: 'section', title: value }; }
    const op = { section, type: kind };
    if (kind === 'click') {
      const label = labels.get(value); assert.ok(label, 'Missing original button ' + value);
      return { ...op, type: 'tap', tag: value, label };
    }
    if (kind === 'core' || kind === 'video') return { ...op, input: value };
    if (kind === 'sleep') return { ...op, ms: value };
    if (kind === 'capture') return { ...op, title: value };
    if (kind === 'predicate') {
      const { condition, message, ...input } = value;
      const predicates = {
        'float(text) > 0': { floatGreaterThan: 0 },
        'float(text) >= 0.85': { floatAtLeast: 0.85 },
        '2 <= video_utils.parse_current_time(text) < 6': { currentTimeRange: { min: 2, max: 6, minInclusive: true } },
        '0 < video_utils.parse_current_time(text) < 5': { currentTimeRange: { min: 0, max: 5, minInclusive: false } },
      };
      assert.ok(predicates[condition], 'Unhandled original predicate ' + condition);
      return { ...op, type: 'video', input: { ...input, ...predicates[condition] } };
    }
    if (kind === 'sample') {
      const variable = ['slow_time', 'fast_time', 'fast_count'][sample++];
      assert.equal(value, variable === 'fast_count' ? 'event-counts' : 'time-text');
      return { ...op, variable, tag: value };
    }
    assert.equal(kind, 'guard');
    assert.ok(['fast_time < 3.0 or fast_time <= slow_time + 1.5', 'fast_count < 30'].includes(value), 'Unhandled original sampling guard');
    return { ...op, condition: value };
  });
  assert.equal(section, name === 'VideoBasic' ? 9 : 6);
  assert.equal(sample, name === 'VideoBasic' ? 0 : 3);
  const phases = name === 'VideoBasic'
    ? { 'basic-playback': operations.filter(op => op.section >= 2 && op.section <= 7), 'basic-loop': operations.filter(op => op.section === 9) }
    : { 'attributes-playback': operations.filter(op => op.section >= 2) };
  const steps = [{ recordToReport: 'Start isolated Explorer for ' + name }, { wait: { duration: 5000, unit: 'ms' } }, { launch: '${videoUri}' }, { wait: { duration: 2000, unit: 'ms' } }];
  const emitted = new Set();
  for (const op of operations) {
    const phase = Object.keys(phases).find(key => phases[key].includes(op));
    if (phase) {
      if (!emitted.has(phase)) { steps.push({ 'native.videoPhase': { phase } }); emitted.add(phase); }
      continue;
    }
    if (op.type === 'section') continue;
    if (op.type === 'tap') steps.push({ aiAct: { prompt: 'Scroll inside the actual light-gray video demo panel if needed and click the single visible button labeled exactly ' + JSON.stringify(op.label) + ' once. Do not click another button or perform another action.', options: { deepLocate: '${videoDeepLocate}', cacheable: false } } });
    else if (op.type === 'video') steps.push({ 'native.video': op.input });
    else if (op.type === 'core') {
      const { message, ...input } = op.input;
      steps.push({ 'native.videoPhase': { phase: name === 'VideoBasic' ? 'basic-ready' : 'invalid' } });
      assert.equal(input.tag, 'status-text'); assert.equal(input.text, 'ready'); assert.equal(input.timeoutMs, 10000);
    } else if (op.type === 'sleep') steps.push({ wait: { duration: op.ms, unit: 'ms' } });
    else { assert.equal(op.type, 'capture'); steps.push({ recordToReport: 'Original ' + name + ' diagnostic screenshot: ' + op.title }); }
  }
  if (name === 'VideoBasic') phases['basic-ready'] = operations.filter(op => op.type === 'core' && op.section === 1);
  return { events, operations, phases, document: { afterEach: [{ recordToReport: name + ' final evidence, including failures' }], cases: [{ name: 'xelement/' + name, steps }] } };
}
