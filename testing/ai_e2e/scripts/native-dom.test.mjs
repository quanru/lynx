import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { decodeDocumentRoot, findTaggedNode, findNativeTextAttribute, nativeAttributes, readNativeText, readNativeAttribute } from '../native-dom.ts';

const raw = (id, text) => ({ nodeId: id, nodeName: 'RAW-TEXT', attributes: ['text', text] });
const root = { nodeId: 1, nodeName: '#document', children: [
  { nodeId: 2, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'count'], children: [raw(3, ' 1 ')] },
  { nodeId: 4, nodeName: 'X-INPUT', attributes: ['lynx-test-tag', 'input', 'value', 'value 123!?'] },
  { nodeId: 5, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'button2', 'style', 'text-align:right;width:100%;height:max-content;background-color:#ff0000;'],
    children: [raw(6, 'Test inline-text:'), { nodeId: 7, nodeName: 'INLINE-TEXT', children: [raw(8, 'Click Me')] }] },
] };

test('get_by_text matches original text attributes, not aggregated rendered descendants', () => {
  const text = 'Test text bindlayout event....';
  const doc = { nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE', children: [
    { nodeId: 2, nodeName: 'TEXT', children: [{ nodeId: 3, nodeName: 'RAW-TEXT', attributes: ['text', text] }] },
    { nodeId: 4, nodeName: 'RAW-TEXT', attributes: ['text', text] },
  ] }] };
  assert.equal(findNativeTextAttribute(doc, text).nodeId, 4); // Breadth-first, not pre-order.
  assert.equal(findNativeTextAttribute(doc, text, 1).nodeId, 3);
  assert.throws(() => findNativeTextAttribute(doc, text + ' '), /not found/);
  assert.throws(() => findNativeTextAttribute(doc, 'Test text'), /not found/);
  assert.equal(findNativeTextAttribute(doc, 'bindlayout').nodeId, 4);
  assert.throws(() => findNativeTextAttribute(doc, ''), /Invalid/);
});

test('plain and zlib-compressed CDP documents retain the same original DOM values', () => {
  const encoded = deflateSync(JSON.stringify(root)).toString('base64');
  for (const result of [{ root }, { compress: true, root: encoded }]) {
    const document = decodeDocumentRoot(result);
    assert.deepEqual(document, root);
    assert.equal(readNativeText(findTaggedNode(document, 'count')), ' 1 ');
    assert.equal(readNativeText(findTaggedNode(document, 'input')), 'value 123!?');
    const target = findTaggedNode(document, 'button2');
    assert.equal(readNativeText(target), 'Test inline-text:Click Me');
    assert.equal(readNativeAttribute(target, 'style'),
      'text-align:right;width:100%;height:max-content;background-color:#ff0000;');
  }
});

test('native text reading preserves empty values, raw descendants and the original element-type boundary', () => {
  assert.equal(readNativeText(raw(1, '')), '');
  assert.equal(readNativeText({ nodeId: 1, nodeName: 'x-input', attributes: ['value', ''] }), '');
  assert.equal(readNativeText({ nodeId: 1, nodeName: 'x-text', children: [raw(2, 'a'), raw(3, ' b ')] }), 'a b ');
  assert.equal(readNativeText({ nodeId: 1, nodeName: 'view', children: [raw(2, 'not view text')] }), '');
  assert.equal(readNativeAttribute(raw(1, 'x'), 'missing'), null);
});

test('test-tag selection keeps pre-order and explicit indices without inventing uniqueness assertions', () => {
  const document = { nodeId: 0, nodeName: '#document', children: [
    { nodeId: 1, nodeName: 'view', attributes: ['lynx-test-tag', 'same'], children: [
      { nodeId: 2, nodeName: 'view', attributes: ['lynx-test-tag', 'same'] },
    ] },
    { nodeId: 3, nodeName: 'view', attributes: ['lynx-test-tag', 'same'] },
  ] };
  assert.equal(findTaggedNode(document, 'same').nodeId, 1);
  assert.equal(findTaggedNode(document, 'same', 1).nodeId, 2);
  assert.equal(findTaggedNode(document, 'same', 2).nodeId, 3);
  assert.throws(() => findTaggedNode(document, 'same', 3), /not found/);
  for (const index of [-1, 0.5]) assert.throws(() => findTaggedNode(document, 'same', index), /Invalid/);
});

test('malformed identities, attributes, compression and missing targets fail instead of becoming empty passes', () => {
  for (const result of [null, {}, { root: {} }, { compress: true, root: {} }, { compress: true, root: 'bad' }]) {
    assert.throws(() => decodeDocumentRoot(result));
  }
  for (const attributes of [['unpaired'], ['text', 1], 'not pairs', null]) {
    assert.throws(() => nativeAttributes({ nodeId: 1, nodeName: 'TEXT', attributes }), /attribute pairs/);
  }
  assert.throws(() => findTaggedNode(root, 'missing'), /not found/);
  assert.throws(() => findTaggedNode({ nodeId: 1, nodeName: 'view', children: {} }, 'missing'), /children/);
  assert.throws(() => findTaggedNode({ nodeId: 1, nodeName: 'view', children: null }, 'missing'), /children/);
});
