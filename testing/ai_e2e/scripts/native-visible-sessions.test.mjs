import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisibleNativeSessions } from '../native-visible-sessions.ts';

const rect = { x: 0, y: 0, width: 240, height: 400 };
const quad = [0, 0, 240, 0, 240, 400, 0, 400];
function document(role) {
  return { root: { nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE', children: [
    { nodeId: 2, nodeName: 'text', attributes: ['lynx-test-tag', 'nav-role'], children: [{ nodeId: 3, nodeName: 'raw-text', attributes: ['text', role] }] },
  ] }] } };
}

test('explicit route observations share only the case socket; retained handles never rebind on push', async () => {
  let role = 'parent', connections = 0, closes = 0;
  const requests = [];
  const sessions = createVisibleNativeSessions(async () => {
    connections++;
    return { close() { closes++; }, refreshSessions: async () => [{ session_id: 1 }, { session_id: 2 }],
      request: async (id, method) => { requests.push([id, method]); return method === 'DOM.getDocument' ? document(id === 1 ? 'parent' : 'child') : { model: { padding: quad } }; } };
  }, async () => ({ contexts: async () => [{ viewId: role, viewRect: rect, anchor: { tag: 'nav-role', rect, texts: [role] } }] }));
  const parent = await sessions.observe('case', 'nav-role', 'parent');
  role = 'child';
  const child = await sessions.observe('case', 'nav-role', 'child');
  assert.equal(parent.sessionId, 1);
  assert.equal(child.sessionId, 2);
  await parent.readDocument();
  assert.deepEqual(requests.at(-1), [1, 'DOM.getDocument']);
  assert.equal(connections, 1);
  sessions.release('case');
  sessions.release('case');
  assert.equal(closes, 1);
  await assert.rejects(parent.readDocument(), /released/);
  await assert.rejects(child.request('DOM.getDocument'), /released/);
  await assert.rejects(sessions.observe('case', 'nav-role'), /released/);
  assert.equal(connections, 1, 'Released case IDs cannot open another socket');
});

test('visible session teardown owns a connection arriving after release and prevents native reads', async () => {
  let connect, closes = 0, reads = 0;
  const sessions = createVisibleNativeSessions(() => new Promise(resolve => { connect = resolve; }), async () => { reads++; return {}; });
  const pending = sessions.observe('case', 'nav-role');
  await new Promise(resolve => setImmediate(resolve));
  sessions.releaseAll();
  connect({ close() { closes++; } });
  await assert.rejects(pending, /released/);
  assert.equal(closes, 1);
  assert.equal(reads, 0);
  await assert.rejects(sessions.observe('new-case', 'nav-role'), /released/);
});

test('visible session errors fail without polling into a pass or leaking ownership', async () => {
  let closes = 0, observations = 0;
  const sessions = createVisibleNativeSessions(async () => ({ close() { closes++; }, refreshSessions: async () => { throw new Error('transport failed'); } }), async () => ({ contexts: async () => { observations++; return []; } }));
  await assert.rejects(sessions.observe('case', 'nav-role'), /transport failed/);
  assert.equal(observations, 1);
  sessions.releaseAll();
  assert.equal(closes, 1);
});
