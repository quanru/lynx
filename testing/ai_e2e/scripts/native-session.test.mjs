import assert from 'node:assert/strict';
import test from 'node:test';
import { bindFixtureSession } from '../native-session.ts';

const document = tags => ({ root: { nodeId: 0, nodeName: '#document', children: tags.map((tag, i) => ({
  nodeId: i + 1, nodeName: 'view', attributes: ['lynx-test-tag', tag],
})) } });

function clientFor(documents) {
  const calls = [];
  return {
    calls,
    refreshSessions: async () => [...documents.keys()].map(session_id => ({ session_id })),
    request: async (sessionId, method, params) => {
      calls.push({ sessionId, method, params });
      const result = documents.get(sessionId);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test('native fixture binding uses original tags, not newest ID or duplicate native geometry', async () => {
  const documents = new Map([
    [-1, new Error('global slot must not receive DOM calls')],
    [9, document(['homepage'])],
    [7, document(['count', 'button0', 'button2'])],
  ]);
  const client = clientFor(documents);
  const bound = await bindFixtureSession(client, ['count', 'button0', 'button2']);
  assert.equal(bound.sessionId, 7);
  assert.deepEqual(client.calls.map(call => call.sessionId), [9, 7]);
  assert.ok(client.calls.every(call => call.method === 'DOM.getDocument' && call.params === undefined));
  await bound.readDocument();
  assert.equal(client.calls.at(-1).sessionId, 7);
  documents.set(7, document(['homepage']));
  documents.set(10, document(['count', 'button0', 'button2']));
  await assert.rejects(bound.readDocument(), /refusing to rebind/);
  assert.equal(client.calls.at(-1).sessionId, 7);
});

test('missing and ambiguous fixture sessions fail without selecting a convenient candidate', async () => {
  for (const documents of [new Map([[7, document(['homepage'])]]),
    new Map([[7, document(['count'])], [8, document(['count'])]])]) {
    await assert.rejects(bindFixtureSession(clientFor(documents), ['count']),
      /requires one matching session; found [02]/);
  }
});

test('tag-free original fixtures bind all source text markers, not a newest or partially matching page', async () => {
  const textDocument = texts => ({ root: { nodeId: 0, nodeName: '#document', children: [
    { nodeId: 1, nodeName: 'PAGE', children: texts.map((text, index) => ({
      nodeId: index + 2, nodeName: 'RAW-TEXT', attributes: ['text', text],
    })) },
  ] } });
  const texts = ['column item 1', 'column item 2', 'row item 3'];
  const documents = new Map([[7, textDocument(texts)], [99, textDocument(texts.slice(0, 1))]]);
  const bound = await bindFixtureSession(clientFor(documents), [], texts);
  assert.equal(bound.sessionId, 7);
  documents.set(7, textDocument(texts.slice(0, 2)));
  await assert.rejects(bound.readDocument(), /refusing to rebind/);
  documents.set(7, textDocument(texts));
  documents.set(99, textDocument(texts));
  await assert.rejects(bindFixtureSession(clientFor(documents), [], texts), /found 2/);
  for (const invalid of [[], [''], ['same', 'same'], [1], null]) {
    await assert.rejects(bindFixtureSession(clientFor(documents), [], invalid), /requires distinct/);
  }
});

test('fixture binding never swallows CDP, malformed document or invalid identity failures', async () => {
  for (const result of [new Error('DOM.getDocument disconnected'), { root: {} },
    { root: { nodeId: 0, nodeName: 'view', children: null } }]) {
    await assert.rejects(bindFixtureSession(clientFor(new Map([[7, result]])), ['count']),
      /disconnected|Invalid Lynx DOM/);
  }
  await assert.rejects(bindFixtureSession(clientFor(new Map([['7', document(['count'])]])), ['count']),
    /Invalid native fixture session list/);
});

test('invalid marker definitions reject before opening session discovery', async () => {
  for (const tags of [[], [''], ['count', 'count'], [1], null]) {
    await assert.rejects(bindFixtureSession({ refreshSessions() { throw new Error('must not run'); } }, tags),
      /requires distinct nonempty test tags/);
  }
});

test('bound screencast revalidates fixture before and after capture and never switches sessions', async () => {
  const documents = new Map([[7, document(['flatten-text'])], [99, document(['homepage'])]]);
  const client = clientFor(documents);
  const waits = [];
  client.waitForNotification = (sessionId, method) => {
    waits.push([sessionId, method]);
    return { promise: Promise.resolve({ data: Buffer.from('jpeg').toString('base64') }), cancel() {} };
  };
  const bound = await bindFixtureSession(client, ['flatten-text']);
  client.calls.length = 0;
  assert.equal((await bound.captureFrame()).data, Buffer.from('jpeg').toString('base64'));
  assert.deepEqual(waits, [[7, 'Page.screencastFrame']]);
  assert.ok(client.calls.every(call => call.sessionId === 7));
  assert.deepEqual(client.calls.map(call => call.method), ['DOM.getDocument', 'Page.enable',
    'Page.startScreencast', 'Page.stopScreencast', 'DOM.getDocument']);
  client.waitForNotification = () => {
    documents.set(7, document(['homepage']));
    return { promise: Promise.resolve({ data: Buffer.from('jpeg').toString('base64') }), cancel() {} };
  };
  await assert.rejects(bound.captureFrame(), /refusing to rebind/);
});
