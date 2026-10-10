import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { attachNativeVisibilityReader, createOwnedDeviceVisibilityReader, displayAnchors, nativeXPathLiteral } from '../native-wda.ts';

const element = id => ({ 'element-6066-11e4-a52e-4f735466cecf': id });

test('public case-owned device reader exposes only native reads and stops after late SDK replies', async () => {
  const calls = [];
  const reader = createOwnedDeviceVisibilityReader(async (method, endpoint, data) => {
    calls.push([method, endpoint, data]);
    if (endpoint === '/elements') return { value: [element('input')] };
    if (endpoint.endsWith('/displayed')) return { value: true };
    if (endpoint.endsWith('/attribute/type')) return { value: 'XCUIElementTypeTextField' };
    assert.fail(endpoint);
  });
  assert.deepEqual(await reader.displayedTypes('nav-xelement-input'), ['XCUIElementTypeTextField']);
  assert.ok(calls.every(c => c[0] === 'GET' || c[0] === 'POST' && c[1] === '/elements'));
  assert.deepEqual(Object.keys(reader), ['contexts', 'displayedTypes']);
  let release, reads = 0;
  const late = createOwnedDeviceVisibilityReader(() => { reads++; return new Promise(resolve => { release = resolve; }); });
  const observation = late.contexts('nav-role', 10);
  await assert.rejects(observation, /timed out/);
  release({ value: [element('late')] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
});
async function server(t, respond) {
  const requests = [];
  const http = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    let body = '';
    for await (const chunk of request) body += chunk;
    const item = { method: request.method, path: request.url, body: body ? JSON.parse(body) : undefined };
    requests.push(item);
    try { response.end(JSON.stringify({ value: await respond(item) })); }
    catch { response.statusCode = 500; response.end(JSON.stringify({ value: { error: 'unknown error', message: 'Controlled read failure' } })); }
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.closeAllConnections(); http.close(resolve); }));
  return { requests, reader: attachNativeVisibilityReader({ host: '127.0.0.1', port: http.address().port, sessionId: 'owned-case' }) };
}

test('native WDA reads retain displayed view/anchor ownership and ordered original text sources on the exact session', async t => {
  const { reader, requests } = await server(t, ({ path, body }) => {
    assert.ok(path.startsWith('/session/owned-case/'));
    if (path === '/session/owned-case/elements') return [element('covered'), element('visible')];
    if (path.endsWith('/displayed')) return !path.includes('/old-anchor/');
    if (path.endsWith('/elements')) {
      if (body.value === ".//*[@name='nav-page-marker']") return [element(path.includes('/covered/') ? 'old-anchor' : 'anchor')];
      return [];
    }
    if (path.endsWith('/text')) return 'child';
    if (path.endsWith('/attribute/value')) return 'child';
    if (path.endsWith('/attribute/label')) return '';
    if (path.endsWith('/attribute/name')) return 'nav-page-marker';
    if (path.endsWith('/rect')) return { x: 0, y: 98, width: 240, height: 302 };
    assert.fail(path);
  });
  assert.deepEqual(await reader.contexts('nav-role'), [{ viewId: 'visible', viewRect: { x: 0, y: 98, width: 240, height: 302 }, anchor: { tag: 'nav-page-marker', rect: { x: 0, y: 98, width: 240, height: 302 }, texts: ['child', 'nav-page-marker'] } }]);
  assert.deepEqual(requests.filter(r => r.path === '/session/owned-case/element/covered/elements').map(r => r.body.value), [...displayAnchors, 'nav-role'].map(tag => './/*[@name=' + nativeXPathLiteral(tag) + ']'));
  assert.ok(requests.every(r => r.method === 'GET' || r.method === 'POST' && r.path.endsWith('/elements')));
  assert.deepEqual(Object.keys(reader), ['contexts', 'displayedTypes']);
});

test('native input evidence preserves duplicate displayed types, filters hidden elements and rejects malformed visibility', async t => {
  let malformed = false;
  const { reader } = await server(t, ({ path }) => {
    if (path.endsWith('/elements')) return [element('first'), element('second'), element('hidden')];
    if (path.endsWith('/displayed')) return malformed ? 'true' : !path.includes('/hidden/');
    if (path.endsWith('/attribute/type')) return 'XCUIElementTypeTextField';
    assert.fail(path);
  });
  assert.deepEqual(await reader.displayedTypes('nav-xelement-input'), ['XCUIElementTypeTextField', 'XCUIElementTypeTextField']);
  malformed = true;
  await assert.rejects(reader.displayedTypes('nav-xelement-input'), /Invalid native WDA visibility/);
  await assert.rejects(reader.contexts('', 100), /Invalid/);
  await assert.rejects(reader.contexts('nav-role', 0), /Invalid/);
  for (const sessionId of ['', '../other', null]) assert.throws(() => attachNativeVisibilityReader({ sessionId, host: 'localhost', port: 8100 }), /Invalid/);
});

test('WDA text/XPath anchor contract matches unchanged Python helper and read errors cannot become empty success', async t => {
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/helpers.py', import.meta.url), 'utf8');
  const tags = ['plain', "one'quote", 'one"quote', 'both\'and"quotes'];
  const reference = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
source=ast.parse(sys.stdin.read())
literal=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='_xpath_literal')
anchors=next(n for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='_DISPLAY_ANCHORS' for t in n.targets))
namespace={}
exec(compile(ast.Module(body=[literal,anchors],type_ignores=[]),'original-native-helper','exec'),namespace)
print(json.dumps({'literals':[namespace['_xpath_literal'](s) for s in json.loads(sys.argv[1])], 'anchors':namespace['_DISPLAY_ANCHORS']}))`, JSON.stringify(tags)], { input: source, encoding: 'utf8' }));
  assert.deepEqual(tags.map(nativeXPathLiteral), reference.literals);
  assert.deepEqual([...displayAnchors], reference.anchors);
  assert.match(source, /for attribute in \("value", "label", "name"\)/);
  assert.match(source, /last_types == \["XCUIElementTypeTextField"\]/);
  const { reader } = await server(t, () => { throw new Error('read failure'); });
  await assert.rejects(reader.contexts('nav-role'));
});

test('native visibility deadline also aborts a stalled JSON body after headers arrive', { timeout: 5000 }, async t => {
  const http = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"value":['); // Headers arrive, but body decoding never completes.
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.closeAllConnections(); http.close(resolve); }));
  const reader = attachNativeVisibilityReader({ host: '127.0.0.1', port: http.address().port, sessionId: 'owned-case' });
  await assert.rejects(reader.contexts('nav-role', 1000), error => error.name === 'TimeoutError');
});
