import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../integration_test/demo_pages/video/index.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../integration_test/demo_pages/video/index.css', import.meta.url), 'utf8');
const fixture = ts.createSourceFile('video.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(fixture);
const attribute = (node, name) => node.openingElement.attributes.properties
  .find(item => ts.isJsxAttribute(item) && item.name.getText(fixture) === name)?.initializer;
const label = node => node.children.filter(ts.isJsxElement)
  .flatMap(child => child.children.filter(ts.isJsxText).map(text => text.text.trim())).join('');
const rows = [
  ['Seek 0s', 'Seek 2s', 'Near End', 'Seek Bad', 'Seek Missing'],
  ['Seek Null', 'Seek Text', 'Seek NaN', 'Seek Inf', 'Seek Huge'],
];

test('only the seek controls occupy two bounded rows of five complete labels', () => {
  const seekRows = elements.filter(node => attribute(node, 'className')?.text === 'controls seek-controls');
  assert.equal(seekRows.length, 2);
  assert.deepEqual(seekRows.map(row => row.children.filter(ts.isJsxElement).map(label)), rows);
  const rule = css.match(/\.seek-controls \.button\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, 'Seek-only style must override the shared fixed minimum width');
  assert.match(rule, /flex:\s*1\s*;/);
  assert.match(rule, /min-width:\s*0\s*;/);
  assert.match(rule, /padding:\s*6px 2px\s*;/);
  assert.match(rule, /margin:\s*0 2px\s*;/);
  assert.match(css, /\.seek-controls \.button text\s*\{\s*text-align:\s*center;\s*\}/);
  // The player and unrelated control styling must not shrink to make room.
  assert.match(css, /\.video\s*\{\s*width: 100%;\s*height: 180px;\s*background-color: #000000;\s*margin-bottom: 8px;\s*\}/);
  assert.match(css, /\.button\s*\{[^}]*min-width:\s*76px;/);
});

test('layout-only seek changes retain every original test tag, handler and input parameter', () => {
  const expected = [
    ['btn-seek-start', "()=>invokeMethod('seek',{position:0})"],
    ['btn-seek', "()=>invokeMethod('seek',{position:2})"],
    ['btn-seek-near-end', "()=>invokeMethod('seek',{position:9.5})"],
    ['btn-seek-out-of-range', "()=>invokeMethod('seek',{position:99})"],
    ['btn-seek-missing-position', "()=>invokeMethod('seek')"],
    ['btn-seek-null-params', "()=>invokeMethod('seek',null)"],
    ['btn-seek-string-position', "()=>invokeMethod('seek',{position:'bad'})"],
    ['btn-seek-nan-position', "()=>invokeMethod('seek',{position:Number.NaN})"],
    ['btn-seek-infinite-position', "()=>invokeMethod('seek',{position:Number.POSITIVE_INFINITY})"],
    ['btn-seek-huge-position', "()=>invokeMethod('seek',{position:Number.MAX_VALUE})"],
  ];
  expected.forEach(([tag, handler], index) => {
    const matches = elements.filter(node => attribute(node, 'lynx-test-tag')?.text === tag);
    assert.equal(matches.length, 1, tag);
    assert.equal(label(matches[0]), rows.flat()[index]);
    assert.equal(attribute(matches[0], 'bindtap')?.expression?.getText(fixture).replace(/\s+/g, ''), handler, tag);
  });
});
