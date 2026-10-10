import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { connectDevtool } from './devtool-client.mjs';
import { encodeFrame, FrameDecoder } from './devtool-wire.mjs';
import { captureNativeFrame } from './native-screencast.mjs';

async function connect(t, respond, timeoutMs = 1000) {
  const sockets = new Set();
  const observed = [];
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    const decoder = new FrameDecoder();
    socket.on('data', chunk => {
      for (const message of decoder.push(chunk)) {
        if (message.event === 'Initialize') {
          socket.write(encodeFrame({ event: 'Register', data: { id: 99, info: {} } }));
        } else {
          observed.push(message);
          respond(socket, message);
        }
      }
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = await connectDevtool({ port: server.address().port, timeoutMs });
  t.after(() => client.close());
  return { client, observed };
}

function reply(socket, request, response, sessionId = request.data.data.session_id) {
  const { id } = JSON.parse(request.data.data.message);
  socket.write(encodeFrame({ event: 'Customized', data: {
    type: 'CDP', data: { session_id: sessionId, message: JSON.stringify({ id, ...response }) },
  } }));
}

test('CDP requests preserve exact method, params, runtime and session with out-of-order responses', async t => {
  const requests = [];
  const { client, observed } = await connect(t, (socket, request) => {
    requests.push(request);
    if (requests.length === 2) {
      for (const item of requests.toReversed()) {
        reply(socket, item, { result: { method: JSON.parse(item.data.data.message).method } });
      }
    }
  });
  assert.deepEqual(await Promise.all([
    client.request(7, 'DOM.getDocument', {}),
    client.request(8, 'DOM.focus', { nodeId: 24 }),
  ]), [{ method: 'DOM.getDocument' }, { method: 'DOM.focus' }]);
  assert.deepEqual(observed.map(message => ({
    type: message.data.type, sender: message.data.sender,
    client: message.data.data.client_id, session: message.data.data.session_id,
    request: JSON.parse(message.data.data.message),
  })), [
    { type: 'CDP', sender: 152, client: 99, session: 7,
      request: { id: 2, method: 'DOM.getDocument', params: {} } },
    { type: 'CDP', sender: 152, client: 99, session: 8,
      request: { id: 3, method: 'DOM.focus', params: { nodeId: 24 } } },
  ]);
  assert.equal(client.requests.size, 0);
});

test('CDP errors reject instead of passing and do not consume a sibling response', async t => {
  const { client } = await connect(t, (socket, request) => {
    const { method } = JSON.parse(request.data.data.message);
    reply(socket, request, method === 'DOM.focus'
      ? { error: { code: -32602, message: 'No such node' } }
      : { result: { value: '' } });
  });
  await assert.rejects(client.request(7, 'DOM.focus', { nodeId: 999 }), /DOM.focus failed.*No such node/);
  assert.deepEqual(await client.request(7, 'DOM.getDocument'), { value: '' });
});

test('a response from the wrong session closes the client and rejects every pending request', async t => {
  const { client } = await connect(t, (socket, request) => reply(socket, request, { result: {} }, 99));
  const results = await Promise.allSettled([
    client.request(7, 'DOM.getDocument'), client.request(8, 'DOM.getDocument'),
  ]);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /different Lynx session/);
  }
  assert.equal(client.closed, true);
  assert.equal(client.requests.size, 0);
});

test('socket closure rejects pending CDP calls without retries or retained timers', async t => {
  const { client, observed } = await connect(t, socket => socket.end());
  await assert.rejects(client.request(7, 'Input.insertText', { text: 'first' }), /closed/);
  assert.equal(observed.length, 1);
  assert.equal(client.requests.size, 0);
});

test('late timed-out response IDs cannot resolve a later request', async t => {
  let first;
  let received;
  const firstReceived = new Promise(resolve => { received = resolve; });
  const { client, observed } = await connect(t, (socket, request) => {
    if (!first) { first = request; received(); }
    else {
      reply(socket, first, { result: { value: 'stale' } });
      reply(socket, request, { result: { value: 'current' } });
    }
  });
  // Advance only the request clock, after actual socket delivery. A 30ms
  // wall-clock race also timed out the valid sibling under emulator CI load.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = assert.rejects(client.request(7, 'DOM.getDocument'), /timed out/);
  await firstReceived;
  t.mock.timers.tick(1000);
  await expired;
  assert.equal(client.requests.size, 0);
  assert.deepEqual(await client.request(7, 'DOM.getDocument'), { value: 'current' });
  assert.equal(observed.length, 2);
});

test('concurrent ListSession refreshes share one request and permit an empty pre-page list', async t => {
  const { client, observed } = await connect(t, socket => socket.write(encodeFrame({
    event: 'Customized', data: { type: 'SessionList', data: [] },
  })));
  assert.deepEqual(await Promise.all([client.refreshSessions(), client.refreshSessions()]), [[], []]);
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].data, { type: 'ListSession', sender: 152, data: { client_id: 99 } });
});

test('uncorrelated session refresh timeout closes the connection before another refresh', async t => {
  let received;
  const delivered = new Promise(resolve => { received = resolve; });
  const { client, observed } = await connect(t, () => { received(); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = assert.rejects(client.refreshSessions(), /session discovery timed out/);
  await delivered;
  t.mock.timers.tick(1000);
  await expired;
  await assert.rejects(client.refreshSessions(), /closed/);
  assert.equal(observed.length, 1);
});

test('invalid and unserializable CDP inputs send nothing and release their pending entries', async t => {
  const { client, observed } = await connect(t, (socket, request) => reply(socket, request, { result: {} }));
  for (const args of [[-1, 'DOM.focus'], [1.5, 'DOM.focus'], [7, ' '], [7, 'DOM.focus', null], [7, 'DOM.focus', []]]) {
    await assert.rejects(client.request(...args), /Invalid DevTool CDP/);
  }
  const cyclic = {};
  cyclic.self = cyclic;
  await assert.rejects(client.request(7, 'DOM.focus', cyclic), /circular/i);
  assert.equal(observed.length, 0);
  assert.equal(client.requests.size, 0);
  assert.deepEqual(await client.request(7, 'DOM.getDocument'), {});
});

function notify(socket, sessionId, method, params) {
  socket.write(encodeFrame({ event: 'Customized', data: { type: 'CDP', data: {
    session_id: sessionId, message: JSON.stringify({ method, params }),
  } } }));
}

test('screencast binds frame notifications to the original session, even before start response', async t => {
  const { client, observed } = await connect(t, (socket, request) => {
    const command = JSON.parse(request.data.data.message);
    if (command.method === 'Page.startScreencast') {
      notify(socket, 8, 'Page.screencastFrame', { data: 'd3Jvbmc=' });
      notify(socket, 7, 'Page.screencastFrame', { data: 'ZnJhbWU=', metadata: { deviceWidth: 1080 } });
    }
    reply(socket, request, { result: {} });
  });
  assert.deepEqual(await captureNativeFrame(client, 7), { data: 'ZnJhbWU=', metadata: { deviceWidth: 1080 } });
  assert.deepEqual(observed.map(request => JSON.parse(request.data.data.message)), [
    { id: 2, method: 'Page.enable', params: {} },
    { id: 3, method: 'Page.startScreencast', params: { format: 'jpeg', maxHeight: 9999, maxWidth: 9999, quality: 100 } },
    { id: 4, method: 'Page.stopScreencast', params: {} },
  ]);
  assert.equal(client.notifications.size, 0);
});

test('notification cancellation, expiry and client closure release waiters without stale buffering', async t => {
  const { client } = await connect(t, () => {});
  for (const args of [[-1, 'Page.screencastFrame'], [7, ''], [7, 'event', 0]]) {
    assert.throws(() => client.waitForNotification(...args), /Invalid/);
  }
  const cancelled = client.waitForNotification(7, 'Page.screencastFrame');
  assert.throws(() => client.waitForNotification(7, 'Page.screencastFrame'), /Duplicate/);
  const rejection = assert.rejects(cancelled.promise, /cancelled/);
  cancelled.cancel(); cancelled.cancel(); await rejection;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = client.waitForNotification(7, 'Page.screencastFrame', 1000);
  const timeout = assert.rejects(expired.promise, /notification timed out/);
  t.mock.timers.tick(1000); await timeout;
  const closed = client.waitForNotification(7, 'Page.screencastFrame');
  const closing = assert.rejects(closed.promise, /closed/);
  client.close(); await closing;
  assert.equal(client.notifications.size, 0);
});

test('failed screencast start cancels its frame waiter and attempts cleanup exactly once', async t => {
  const { client, observed } = await connect(t, (socket, request) => {
    const { method } = JSON.parse(request.data.data.message);
    reply(socket, request, method === 'Page.startScreencast' ? { error: { message: 'capture disabled' } } : { result: {} });
  });
  await assert.rejects(captureNativeFrame(client, 7), /capture disabled/);
  assert.equal(client.notifications.size, 0);
  assert.deepEqual(observed.map(request => JSON.parse(request.data.data.message).method),
    ['Page.enable', 'Page.startScreencast', 'Page.stopScreencast']);
});

test('malformed screencast data cannot pass and cleanup errors retain both causes', async t => {
  const { client } = await connect(t, (socket, request) => {
    const { method } = JSON.parse(request.data.data.message);
    if (method === 'Page.startScreencast') notify(socket, 7, 'Page.screencastFrame', { data: 'not-base64!' });
    reply(socket, request, method === 'Page.stopScreencast' ? { error: { message: 'stop failed' } } : { result: {} });
  });
  await assert.rejects(captureNativeFrame(client, 7), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.errors[0].message, /Invalid native screencast/);
    assert.match(error.errors[1].message, /stop failed/);
    return true;
  });
  assert.equal(client.notifications.size, 0);
});
