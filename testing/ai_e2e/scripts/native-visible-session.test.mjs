import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVisibleNativeSession } from '../native-visible-session.ts';

const rect = { x: 0, y: 98, width: 240, height: 302 };
const quad = [0, 98, 240, 98, 240, 400, 0, 400];
function fixture(role, duplicate = false) {
  const target = { nodeId: 3, nodeName: 'text', attributes: ['lynx-test-tag', 'nav-role'], children: [{ nodeId: 4, nodeName: 'raw-text', attributes: ['text', role] }] };
  return { root: { nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE', children: [target,
    { nodeId: 2, nodeName: 'text', attributes: ['lynx-test-tag', 'nav-page-marker'], children: [{ nodeId: 5, nodeName: 'raw-text', attributes: ['text', role] }] },
    ...(duplicate ? [target] : []),
  ] }] } };
}
function harness() {
  const calls = [];
  return { calls, client: {
    refreshSessions: async () => [{ session_id: 99 }, { session_id: 2 }, { session_id: 2 }, { session_id: -1 }],
    request: async (id, method, params) => {
      calls.push([id, method, params]);
      return method === 'DOM.getDocument' ? fixture(id === 2 ? 'child' : 'parent') : { model: { padding: quad } };
    },
  } };
}
const context = (role = 'child', viewId = 'displayed-child') => ({ viewId, viewRect: rect, anchor: { tag: 'nav-page-marker', rect, texts: [role] } });

test('visible binding rejects surviving larger-ID parent with identical geometry and binds the displayed child', async () => {
  const { client, calls } = harness();
  assert.deepEqual(await resolveVisibleNativeSession(client, [context()], 'nav-role', 'child'), { sessionId: 2, viewId: 'displayed-child', targetText: 'child' });
  assert.equal(calls.filter(c => c[1] === 'DOM.getDocument').length, 2);
  assert.ok(calls.filter(c => c[1] === 'DOM.getBoxModel').every(c => c[0] === 2));
});

test('visible binding preserves exact text, unique target and unique view/session pair requirements', async () => {
  const { client } = harness();
  await assert.rejects(resolveVisibleNativeSession(client, [context()], 'nav-role', ' child '), /found 0/);
  await assert.rejects(resolveVisibleNativeSession(client, [context(), context('parent', 'displayed-parent')], 'nav-role'), /found 2/);
  await assert.rejects(resolveVisibleNativeSession({ ...client, request: async () => fixture('child', true) }, [context()], 'nav-role'), /found 0/);
  await assert.rejects(resolveVisibleNativeSession(client, [{ ...context(), anchor: { ...context().anchor, rect: { ...rect, y: 500 } } }], 'nav-role'), /found 0/);
});

test('visible binding cannot accept transport/malformed DOM errors or late session refresh', async () => {
  const { client } = harness();
  await assert.rejects(resolveVisibleNativeSession({ ...client, request: async () => { throw new Error('transport failed'); } }, [context()], 'nav-role'), /transport failed/);
  await assert.rejects(resolveVisibleNativeSession({ ...client, request: async () => ({ root: {} }) }, [context()], 'nav-role'), /Invalid/);
  let reads = 0, release;
  const pending = resolveVisibleNativeSession({ refreshSessions: () => new Promise(resolve => { release = resolve; }), request: async () => { reads++; } }, [context()], 'nav-role', undefined, 10);
  await assert.rejects(pending, /timed out/);
  release([{ session_id: 2 }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
});
