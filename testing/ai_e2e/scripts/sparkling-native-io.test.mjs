import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { makeWebDriverRequest } from '@midscene/webdriver';
import { readOwnedRouteAlert, expectOwnedRouteAlert, deliverOwnedExternalRoute } from '../sparkling-native-io.ts';
import { sparklingRoutes } from '../sparkling-contracts.ts';

const absent = () => Object.assign(new Error('Controlled absent alert'), { name: 'WebDriverRequestError', status: 404, response: { value: { error: 'no such alert' } } });

test('route alert reads match pinned WDA structured absence through the real SDK error type', async t => {
  let mode = 'present';
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/session/owned-case/alert/text');
    response.setHeader('Content-Type', 'application/json');
    if (mode === 'present') return response.end(JSON.stringify({ value: 'Unable to Open (missing_target)' }));
    response.statusCode = mode === 'absent' ? 404 : 500;
    response.end(JSON.stringify({ value: { error: mode === 'absent' ? 'no such alert' : 'unknown error' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = (method, endpoint) => makeWebDriverRequest('http://127.0.0.1:' + server.address().port, method, '/session/owned-case' + endpoint);
  assert.equal(await readOwnedRouteAlert(request), 'Unable to Open (missing_target)');
  mode = 'absent';
  assert.equal(await readOwnedRouteAlert(request), null);
  mode = 'failure';
  await assert.rejects(readOwnedRouteAlert(request));
});

test('only genuine no-alert evidence passes dismissal; malformed, wrong-code and late errors fail', async () => {
  await expectOwnedRouteAlert(async () => 'missing_target', false);
  await expectOwnedRouteAlert(async () => null, true);
  await assert.rejects(expectOwnedRouteAlert(async () => 'route_failed', false), /missing_target/);
  await assert.rejects(readOwnedRouteAlert(async () => ({ value: null })), /Invalid/);
  for (const error of [new Error('no such alert'), { ...absent(), status: 500 }, { ...absent(), response: { value: { error: 'unknown error' } } }]) {
    await assert.rejects(readOwnedRouteAlert(async () => { throw error; }));
  }
  await assert.rejects(readOwnedRouteAlert(() => new Promise(() => {}), 10), /timed out/);
  await assert.rejects(readOwnedRouteAlert(async () => {
    const end = Date.now() + 20;
    while (Date.now() < end) {} // A rejected reply beats the starved timer but is already late.
    throw absent();
  }, 10), /timed out/);
  await assert.rejects(expectOwnedRouteAlert(async () => null, false, 10), /timed out/);
  await assert.rejects(expectOwnedRouteAlert(async () => 'missing_target', true, 10), /timed out/);
});

test('external delivery retains original registered URL and explicit bundle without Safari or a restart', async () => {
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/helpers.py', import.meta.url), 'utf8');
  for (const route of ['hybrid://lynxview_page?nav_role=parent', sparklingRoutes.canonicalParentUrl]) {
    const calls = [];
    await deliverOwnedExternalRoute(async (...args) => { calls.push(args); return { value: null }; }, route);
    const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
from types import SimpleNamespace
from urllib.parse import quote
tree=ast.parse(sys.stdin.read())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='open_external_url')
namespace={'quote':quote,'EXPLORER_BUNDLE_ID':'com.lynx.LynxExplorer'}
exec(compile(ast.Module(body=[function],type_ignores=[]),'original-external-route','exec'),namespace)
calls=[]
test=SimpleNamespace(app=SimpleNamespace(_appium_driver=SimpleNamespace(execute_script=lambda command,data:calls.append([command,data]))))
namespace['open_external_url'](test,sys.argv[1])
print(json.dumps(calls))`, route], { input: source, encoding: 'utf8' }));
    assert.deepEqual(reference, [['mobile: deepLink', calls[0][2]]]);
    assert.deepEqual(calls[0].slice(0, 2), ['POST', '/url']);
    assert.equal(calls.length, 1);
  }
  let reads = 0;
  await assert.rejects(deliverOwnedExternalRoute(async () => { reads++; }, 'https://unrelated.invalid'), /Invalid/);
  assert.equal(reads, 0);
  await assert.rejects(deliverOwnedExternalRoute(async () => ({ value: { error: 'failure' } }), sparklingRoutes.canonicalParentUrl), /Invalid/);
});
