import assert from 'node:assert/strict';
import test from 'node:test';
import { runNativeCommand } from '../native-command.ts';

test('native API commands retain exact node identity, empty text, spaces and punctuation', async () => {
  const calls = [];
  const session = {
    readDocument: async () => ({ nodeId: 1, nodeName: 'x-input', attributes: ['lynx-test-tag', 'input-a'] }),
    request: async (...args) => { calls.push(args); },
  };
  await runNativeCommand(session, { method: 'DOM.focus', tag: 'input-a' });
  for (const text of ['', 'first', 'value 123!?', 'ignored before focus']) {
    await runNativeCommand(session, { method: 'Input.insertText', text });
  }
  assert.deepEqual(calls, [['DOM.focus', { nodeId: 1 }],
    ...['', 'first', 'value 123!?', 'ignored before focus'].map(text => ['Input.insertText', { text }])]);
});

test('native command errors propagate without retries or replacement UI actions', async () => {
  let calls = 0;
  const session = { readDocument: async () => { throw new Error('DOM failed'); },
    request: async () => { calls++; throw new Error('CDP failed'); } };
  await assert.rejects(runNativeCommand(session, { method: 'DOM.focus', tag: 'input-a' }), /DOM failed/);
  assert.equal(calls, 0);
  await assert.rejects(runNativeCommand(session, { method: 'Input.insertText', text: 'once' }), /CDP failed/);
  assert.equal(calls, 1);
  for (const input of [{ method: 'DOM.focus', tag: '' }, { method: 'DOM.focus', tag: 'a', index: -1 },
    { method: 'Input.insertText', text: 123 }, { method: 'Input.click' }]) {
    await assert.rejects(runNativeCommand(session, input));
  }
  assert.equal(calls, 1);
});
