import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSessions } from '../native-sessions.ts';

function connection() {
  return {
    closed: 0,
    refreshSessions: async () => [{ session_id: 7 }],
    request: async () => ({ root: { nodeId: 0, nodeName: 'view', attributes: ['lynx-test-tag', 'count'] } }),
    close() { this.closed++; },
  };
}

test('native connections are reused only within one case and released independently', async () => {
  const clients = [];
  const registry = createNativeSessions(async () => {
    const client = connection(); clients.push(client); return client;
  });
  const [first, same] = await Promise.all([registry.get('one', ['count']), registry.get('one', ['count'])]);
  assert.equal(first, same);
  await registry.get('two', ['count']);
  assert.equal(clients.length, 2);
  await assert.rejects(registry.get('one', ['other']), /cannot switch fixture/);
  registry.release('one'); registry.release('one');
  assert.deepEqual(clients.map(client => client.closed), [1, 0]);
  registry.releaseAll();
  assert.deepEqual(clients.map(client => client.closed), [1, 1]);
});

test('release during handshake closes the eventual connection and rejects the pending case', async () => {
  let resolve;
  const client = connection();
  const registry = createNativeSessions(() => new Promise(yes => { resolve = yes; }));
  const pending = registry.get('one', ['count']);
  await Promise.resolve();
  registry.release('one');
  resolve(client);
  await assert.rejects(pending, /released during connection/);
  assert.equal(client.closed, 1);
  registry.releaseAll();
  assert.equal(client.closed, 1);
});

test('binding failure closes its connection and remains failed until case release', async () => {
  let connects = 0;
  const client = connection();
  const registry = createNativeSessions(async () => { connects++; return client; }, { bindingTimeoutMs: 0 });
  await assert.rejects(registry.get('one', ['missing']), /found 0/);
  await assert.rejects(registry.get('one', ['missing']), /found 0/);
  assert.equal(connects, 1);
  assert.equal(client.closed, 1);
  registry.release('one');
  assert.equal(client.closed, 1);
});

test('synchronous connection errors and release before deferred creation retain cleanup ownership', async () => {
  let connects = 0;
  const registry = createNativeSessions(() => { connects++; throw new Error('connection failed'); });
  await assert.rejects(registry.get('failed', ['count']), /connection failed/);
  const pending = registry.get('released', ['count']);
  registry.release('released');
  await assert.rejects(pending, /released before connection/);
  registry.releaseAll();
  assert.equal(connects, 1);
});

test('only an absent fixture is retried during mounting, without reconnecting', async () => {
  const client = connection();
  let discoveries = 0;
  let connects = 0;
  client.refreshSessions = async () => ++discoveries === 1 ? [] : [{ session_id: 7 }];
  const registry = createNativeSessions(async () => { connects++; return client; }, { bindingTimeoutMs: 500 });
  await registry.get('one', ['count']);
  assert.equal(discoveries, 2);
  assert.equal(connects, 1);
  registry.releaseAll();
  assert.equal(client.closed, 1);
});

test('ambiguous fixture identity and transport errors fail immediately without readiness retries', async () => {
  for (const ambiguous of [true, false]) {
    const client = connection();
    let discoveries = 0;
    client.refreshSessions = async () => {
      discoveries++;
      if (!ambiguous) throw new Error('transport failed');
      return [{ session_id: 7 }, { session_id: 8 }];
    };
    const registry = createNativeSessions(async () => client);
    await assert.rejects(registry.get('one', ['count']), ambiguous ? /found 2/ : /transport failed/);
    assert.equal(discoveries, 1);
    assert.equal(client.closed, 1);
    registry.releaseAll();
  }
});

test('teardown during fixture readiness closes exactly once and stops discovery', async () => {
  const client = connection();
  let mounted;
  const discovered = new Promise(resolve => { mounted = resolve; });
  let discoveries = 0;
  client.refreshSessions = async () => { discoveries++; mounted(); return []; };
  const registry = createNativeSessions(async () => client);
  const pending = registry.get('one', ['count']);
  await discovered;
  registry.releaseAll();
  await assert.rejects(pending);
  assert.equal(discoveries, 1);
  assert.equal(client.closed, 1);
});

test('a fixture response racing teardown cannot return a closed session', async () => {
  const client = connection();
  let resolve;
  let requested;
  const started = new Promise(yes => { requested = yes; });
  client.request = () => { requested(); return new Promise(yes => { resolve = yes; }); };
  const registry = createNativeSessions(async () => client);
  const pending = registry.get('one', ['count']);
  await started;
  registry.release('one');
  resolve({ root: { nodeId: 0, nodeName: 'view', attributes: ['lynx-test-tag', 'count'] } });
  await assert.rejects(pending, /released during fixture binding/);
  assert.equal(client.closed, 1);
});
