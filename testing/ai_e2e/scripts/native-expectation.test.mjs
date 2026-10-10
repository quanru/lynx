import assert from 'node:assert/strict';
import test from 'node:test';
import { expectNativeValue } from '../native-expectation.ts';

const document = value => ({ nodeId: 0, nodeName: '#document', children: [
  { nodeId: 1, nodeName: 'x-input', attributes: ['lynx-test-tag', 'input', 'value', value,
    'style', 'text-align:right;width:100%;height:max-content;background-color:#ff0000;'] },
] });

test('original get_by_text existence uses exact attribute selection and rejects mixed selectors', async () => {
  const text = 'Test text bindlayout event....';
  const doc = { nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE', children: [
    { nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', text] },
  ] }] };
  await expectNativeValue(async () => doc, { matchingText: text, exists: true, timeoutMs: 0 });
  await assert.rejects(expectNativeValue(async () => doc, {
    matchingText: text + ' ', exists: true, timeoutMs: 0,
  }), /failed/);
  for (const input of [{ matchingText: text, text }, { tag: 'tag', matchingText: text, exists: true }]) {
    await assert.rejects(expectNativeValue(async () => { throw new Error('must not read'); }, input), /native.expect requires/);
  }
});

test('immediate native assertions never poll an incorrect or missing value into a pass', async () => {
  for (const value of ['first ', 'first1', '', null]) {
    let reads = 0;
    await assert.rejects(expectNativeValue(async () => {
      reads++;
      return value === null ? { nodeId: 0, nodeName: '#document' } : document(value);
    }, { tag: 'input', text: 'first', timeoutMs: 0 }), /native.expect.*failed/);
    assert.equal(reads, 1);
  }
});

test('wait_for_equal semantics refresh DOM while preserving exact strings and empty text', async () => {
  let reads = 0;
  await expectNativeValue(async () => document(++reads === 1 ? 'old' : 'value 123!?'),
    { tag: 'input', text: 'value 123!?', timeoutMs: 1000 });
  assert.equal(reads, 2);
  await expectNativeValue(async () => document(''), { tag: 'input', text: '', timeoutMs: 0 });
  await expectNativeValue(async () => document('first'), {
    tag: 'input', attribute: 'style',
    equals: 'text-align:right;width:100%;height:max-content;background-color:#ff0000;', timeoutMs: 0,
  });
  await assert.rejects(expectNativeValue(async () => document('first'), {
    tag: 'input', attribute: 'style', equals: '#ff0000', timeoutMs: 0,
  }), /failed/);
  await assert.rejects(expectNativeValue(async () => document('first'), {
    tag: 'input', attribute: 'missing', equals: '', timeoutMs: 0,
  }), /got null/);
});

test('existence checks retain tag/index selection and transport errors are never swallowed', async () => {
  await expectNativeValue(async () => document(''), { tag: 'input', exists: true, timeoutMs: 0 });
  await assert.rejects(expectNativeValue(async () => document(''), {
    tag: 'input', index: 1, exists: true, timeoutMs: 0,
  }), /existing node/);
  for (const read of [async () => { throw new Error('CDP disconnected'); },
    async () => ({ nodeId: 0, nodeName: '#document', children: null })]) {
    await assert.rejects(expectNativeValue(read, { tag: 'input', text: '', timeoutMs: 1000 }),
      /CDP disconnected|Invalid Lynx DOM children/);
  }
});

test('invalid native assertions reject before reading a document', async () => {
  for (const input of [{}, { tag: '' }, { text: 1 }, { text: 'x', exists: true },
    { exists: false }, { attribute: 'style' }, { attribute: '', equals: '' },
    { text: '', equals: '' }, { text: '', timeoutMs: -1 }, { text: '', index: 0.5 }]) {
    let reads = 0;
    await assert.rejects(expectNativeValue(async () => { reads++; return document(''); },
      { tag: 'input', ...input }), /native.expect requires/);
    assert.equal(reads, 0);
  }
});

test('a matching DOM response arriving after a polling deadline does not pass', async () => {
  for (const assertion of [{ text: 'first' }, { exists: true }]) {
    await assert.rejects(expectNativeValue(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return document('first');
    }, { tag: 'input', timeoutMs: 1, ...assertion }), /failed/);
  }
});
