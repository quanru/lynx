import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createVisibleNativeSessions } from '../native-visible-sessions.ts';
import { createOwnedDeviceVisibilityReader, NativeVisibilityStaleElementError } from '../native-wda.ts';

const rect = { x: 0, y: 0, width: 240, height: 400 };
const quad = [0, 0, 240, 0, 240, 400, 0, 400];
function document(role) {
  return { root: { nodeId: 0, nodeName: '#document', children: [{ nodeId: 1, nodeName: 'PAGE', children: [
    { nodeId: 2, nodeName: 'text', attributes: ['lynx-test-tag', 'nav-role'], children: [{ nodeId: 3, nodeName: 'raw-text', attributes: ['text', role] }] },
  ] }] } };
}

test('the original two-second polling window allows an already-started valid observation to complete', async t => {
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/helpers.py', import.meta.url), 'utf8');
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
tree=ast.parse(sys.stdin.read())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='wait_for_visible_view')
class Clock:
    now=0.0
    def time(self): return self.now
    def sleep(self,duration): self.now+=duration
clock=Clock()
calls=[]
def resolve_once(test,tag,expected):
    calls.append(tag)
    clock.now+=2.508
    return {'sessionId':7}, 'parent'
namespace={'time':clock,'_request_session_refresh':lambda test:None,'_resolve_visible_view_once':resolve_once}
exec(compile(ast.Module(body=[function],type_ignores=[]),'original-visible-window','exec'),namespace)
result=namespace['wait_for_visible_view'](None,'nav-role','parent',timeout=2)
print(json.dumps({'result':result,'elapsedMs':round(clock.now*1000),'attempts':len(calls)}))`], { input: source, encoding: 'utf8' }));
  assert.deepEqual(reference, { result: { sessionId: 7 }, elapsedMs: 2508, attempts: 1 });
  let now = 1000, attempts = 0;
  t.mock.method(Date, 'now', () => now);
  const element = id => ({ 'element-6066-11e4-a52e-4f735466cecf': id });
  const reader = createOwnedDeviceVisibilityReader(async (_method, endpoint, data) => {
    if (endpoint === '/elements') {
      attempts++;
      now += reference.elapsedMs;
      return { value: [element('parent')] };
    }
    if (endpoint.endsWith('/displayed')) return { value: true };
    if (endpoint.endsWith('/elements')) return { value: data.value === ".//*[@name='nav-role']" ? [element('role')] : [] };
    if (endpoint.endsWith('/text') || endpoint.endsWith('/attribute/value')) return { value: 'parent' };
    if (endpoint.endsWith('/attribute/label')) return { value: '' };
    if (endpoint.endsWith('/attribute/name')) return { value: 'nav-role' };
    if (endpoint.endsWith('/rect')) return { value: rect };
    assert.fail(endpoint);
  });
  const sessions = createVisibleNativeSessions(async () => ({ close() {}, refreshSessions: async () => [{ session_id: 7 }],
    request: async (_id, method) => method === 'DOM.getDocument' ? document('parent') : { model: { padding: quad } },
  }), async () => ({ contexts: async (tag, budget) => {
    assert.equal(budget, 15000, 'An in-flight observation uses the enclosing source assertion budget');
    return reader.contexts(tag, budget);
  } }));
  try {
    const bound = await sessions.observe('case', 'nav-role', 'parent', 2000, 16000);
    assert.equal(bound.sessionId, reference.result.sessionId);
    assert.equal(attempts, reference.attempts);
  } finally { sessions.releaseAll(); }
});

test('an expired polling window cannot start another observation even with assertion budget remaining', async t => {
  let now = 1000, attempts = 0;
  t.mock.method(Date, 'now', () => now);
  const sessions = createVisibleNativeSessions(async () => ({ close() {}, refreshSessions: async () => [] }),
    async () => ({ contexts: async () => { attempts++; now += 2508; return []; } }));
  try {
    await assert.rejects(sessions.observe('case', 'nav-role', 'parent', 2000, 16000), /found 0/);
    assert.equal(attempts, 1);
  } finally { sessions.releaseAll(); }
});

test('a source polling window never extends the enclosing assertion deadline', async t => {
  let now = 1000, attempts = 0, sessionReads = 0;
  t.mock.method(Date, 'now', () => now);
  const sessions = createVisibleNativeSessions(async () => ({ close() {}, refreshSessions: async () => { sessionReads++; return []; } }),
    async () => ({ contexts: async () => { attempts++; now = 16001; return []; } }));
  try {
    await assert.rejects(sessions.observe('case', 'nav-role', 'parent', 2000, 16000), /timed out/);
    assert.equal(attempts, 1);
    assert.equal(sessionReads, 0);
  } finally { sessions.releaseAll(); }
});

test('a stale root query restarts native discovery and binds only the freshly observed CDP identity', async t => {
  t.mock.method(console, 'warn', () => {});
  const element = id => ({ 'element-6066-11e4-a52e-4f735466cecf': id });
  const failure = Object.assign(new Error('Root result disappeared while WDA serialized it'), {
    name: 'WebDriverRequestError', status: 404, response: { value: { error: 'stale element reference' } },
  });
  let queries = 0, connections = 0, refreshes = 0;
  const reads = [];
  const reader = createOwnedDeviceVisibilityReader(async (method, endpoint, data) => {
    reads.push([method, endpoint]);
    if (endpoint === '/elements') {
      assert.equal(method, 'POST');
      if (++queries === 1) throw failure;
      return { value: [element('new-parent')] };
    }
    if (endpoint.endsWith('/displayed')) return { value: true };
    if (endpoint.endsWith('/elements')) return { value: data.value === ".//*[@name='nav-role']" ? [element('parent-role')] : [] };
    if (endpoint.endsWith('/text') || endpoint.endsWith('/attribute/value')) return { value: 'parent' };
    if (endpoint.endsWith('/attribute/label')) return { value: '' };
    if (endpoint.endsWith('/attribute/name')) return { value: 'nav-role' };
    if (endpoint.endsWith('/rect')) return { value: rect };
    assert.fail(endpoint);
  });
  const sessions = createVisibleNativeSessions(async () => {
    connections++;
    return { close() {}, refreshSessions: async () => {
      refreshes++;
      assert.equal(queries, 2, 'An incomplete native observation cannot select a CDP session');
      return [{ session_id: 1 }, { session_id: 7 }];
    }, request: async (id, method) => method === 'DOM.getDocument' ? document(id === 7 ? 'parent' : 'child') : { model: { padding: quad } } };
  }, async () => reader);
  try {
    const bound = await sessions.observe('case', 'nav-role', 'parent', 1000);
    assert.equal(queries, 2);
    assert.equal(connections, 1);
    assert.equal(refreshes, 1);
    assert.equal(bound.sessionId, 7);
    assert.equal(bound.viewId, 'new-parent');
    assert.ok(reads.every(([, endpoint]) => endpoint === '/elements' || endpoint.startsWith('/element/new-parent/') || endpoint.startsWith('/element/parent-role/')));
  } finally { sessions.releaseAll(); }
});

test('routing retries a stale native observation inside its original deadline and proves the new identity', async () => {
  let observations = 0, connections = 0;
  const sessions = createVisibleNativeSessions(async () => {
    connections++;
    return { close() {}, refreshSessions: async () => [{ session_id: 7 }],
      request: async (_id, method) => method === 'DOM.getDocument' ? document('parent') : { model: { padding: quad } } };
  }, async () => ({ contexts: async () => {
    if (++observations === 1) throw new NativeVisibilityStaleElementError(new Error('Gone during navigation'));
    return [{ viewId: 'new-parent', viewRect: rect, anchor: { tag: 'nav-role', rect, texts: ['parent'] } }];
  } }));
  const bound = await sessions.observe('case', 'nav-role', 'parent', 1000);
  assert.equal(observations, 2);
  assert.equal(connections, 1);
  assert.equal(bound.sessionId, 7);
  assert.equal(bound.viewId, 'new-parent');
  sessions.releaseAll();
});

test('persistent stale observations time out rather than passing or opening another session', async () => {
  let connections = 0;
  const sessions = createVisibleNativeSessions(async () => { connections++; return { close() {} }; },
    async () => ({ contexts: async () => { throw new NativeVisibilityStaleElementError(new Error('Gone')); } }));
  await assert.rejects(sessions.observe('case', 'nav-role', 'parent', 20), /timed out|disappeared/);
  assert.equal(connections, 1);
  sessions.releaseAll();
});

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
