import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export function originalVideoBoundary(platform, variableBridge = false) {
  assert.ok(['android', 'ios'].includes(platform));
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
    ...events.map(([kind, value]) => {
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
      return { aiAct: {
        prompt: `Scroll if needed and click the single button labeled exactly ${JSON.stringify(label)} once. Do not click similarly named buttons or perform another action.`,
        options: { deepLocate: true, cacheable: false },
      } };
    }),
  ];
  return { events, labels, steps };
}
