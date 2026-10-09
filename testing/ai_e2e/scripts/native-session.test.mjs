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
