import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { encodeFrame, FrameDecoder, probeDevtool } from './devtool-probe.mjs';

test('PeerTalk framing preserves byte lengths, Unicode, fragmentation and coalescing', () => {
  const first = { event: 'Register', data: { info: '测试' } };
  const second = { event: 'Customized', data: { type: 'SessionList', data: [] } };
  const frame = encodeFrame(first);
  assert.equal(frame.readUInt32BE(12), frame.length - 16);
  assert.equal(frame.readUInt32BE(16), frame.length - 20);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(frame.subarray(0, 19)), []);
  assert.deepEqual(decoder.push(Buffer.concat([frame.subarray(19), encodeFrame(second)])), [first, second]);
  assert.equal(decoder.buffer.length, 0);
});

test('invalid lengths, types, JSON and UTF-8 fail closed', () => {
  for (const offset of [4, 12, 16]) {
    const frame = encodeFrame({ event: 'Register' });
    frame.writeUInt32BE(0xffffffff, offset);
    assert.throws(() => new FrameDecoder().push(frame));
  }
  const json = encodeFrame({ a: 1 });
  json[20] = 0x21;
  assert.throws(() => new FrameDecoder().push(json));
  const utf8 = encodeFrame({ a: 1 });
  utf8[20] = 0xff;
  assert.throws(() => new FrameDecoder().push(utf8));
});

test('native DebugRouter total-frame length is accepted without accepting arbitrary lengths', () => {
  // Independent server-direction fixture, matching UsbClient::WrapHeader in
  // lynx-family/debug-router at fc4ca8c3b4cd99718b6be551711d1dcf064487d1.
  // The Python 0.0.15 receiver also documents this +20 convention.
  const message = { event: 'Register', data: { id: 152, info: {} } };
  const body = Buffer.from(JSON.stringify(message));
  const frame = Buffer.alloc(20 + body.length);
  [1, 101, 0, frame.length, body.length].forEach((value, i) => frame.writeUInt32BE(value, i * 4));
  body.copy(frame, 20);
  assert.notEqual(frame.readUInt32BE(12), body.length + 4);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(frame.subarray(0, 19)), []);
  assert.deepEqual(decoder.push(Buffer.concat([frame.subarray(19), encodeFrame(message)])), [message, message]);
  assert.equal(decoder.buffer.length, 0);
  for (const overhead of [0, 1, 5, 16, 19, 21]) {
    const malformed = Buffer.from(frame);
    malformed.writeUInt32BE(body.length + overhead, 12);
    assert.throws(() => new FrameDecoder().push(malformed), /Invalid DevTool frame/);
  }
});

async function mockServer(t, handle) {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const decoder = new FrameDecoder();
    socket.on('data', chunk => {
      for (const message of decoder.push(chunk)) handle(socket, message);
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

test('real TCP handshake uses the negotiated sender/runtime identities and fragmented session frames', async t => {
  const observed = [];
  const port = await mockServer(t, (socket, message) => {
    observed.push(message);
    if (message.event === 'Initialize') socket.write(encodeFrame({ event: 'Initialize', data: 42 }));
    if (message.event === 'Register') socket.write(encodeFrame({ event: 'Register', data: { id: 99, info: {} } }));
    if (message.data?.type === 'ListSession') {
      const frame = encodeFrame({ event: 'Customized', data: { type: 'SessionList', data: [{ session_id: 7 }] } });
      socket.write(frame.subarray(0, 11));
      socket.write(frame.subarray(11));
    }
    if (message.data?.type === 'CDP') {
      const command = JSON.parse(message.data.data.message);
      socket.write(encodeFrame({ event: 'Customized', data: {
        type: 'CDP', data: { session_id: 7, message: JSON.stringify({
          id: command.id, result: { root: { nodeId: 0, nodeName: '#document',
            children: [{ nodeId: 1, nodeName: 'view' }] } },
        }) },
      } }));
    }
  });
  const result = await probeDevtool({ port });
  assert.deepEqual(result.sessions, [{ session_id: 7 }]);
  assert.deepEqual(observed[1], { event: 'Register', data: { id: 42, type: 'Driver' } });
  assert.deepEqual(observed[2].data, { type: 'ListSession', sender: 42, data: { client_id: 99 } });
  assert.deepEqual(JSON.parse(observed[3].data.data.message), {
    id: 2, method: 'DOM.getDocument', params: {},
  });
  assert.equal(result.root.children[0].nodeName, 'view');
});

for (const sessions of [[], [{ session_id: '7' }], null]) {
  test(`invalid session discovery is rejected: ${JSON.stringify(sessions)}`, async t => {
    const port = await mockServer(t, (socket, message) => {
      if (message.event === 'Initialize') socket.write(encodeFrame({ event: 'Register', data: { id: 152, info: {} } }));
      if (message.data?.type === 'ListSession') socket.write(encodeFrame({ event: 'Customized', data: { type: 'SessionList', data: sessions } }));
    });
    await assert.rejects(probeDevtool({ port }), /no valid registered Lynx sessions/);
  });
}

test('timeouts and early connection closure reject and release the socket', async t => {
  const silent = await mockServer(t, () => {});
  await assert.rejects(probeDevtool({ port: silent, timeoutMs: 20 }), /timed out/);
  const closed = await mockServer(t, socket => socket.end());
  await assert.rejects(probeDevtool({ port: closed }), /closed before/);
});

test('invalid registration and unsolicited sessions cannot pass the probe', async t => {
  const invalid = await mockServer(t, socket => socket.write(encodeFrame({
    event: 'Register', data: { id: '152', info: {} },
  })));
  await assert.rejects(probeDevtool({ port: invalid }), /Invalid DevTool runtime registration/);
  const unsolicited = await mockServer(t, socket => socket.write(encodeFrame({
    event: 'Customized', data: { type: 'SessionList', data: [{ session_id: 7 }] },
  })));
  await assert.rejects(probeDevtool({ port: unsolicited }), /no valid registered Lynx sessions/);
});

test('invalid connection settings reject before opening a socket', async () => {
  for (const options of [{ port: 0 }, { port: 65536 }, { port: 1.5 }, { timeoutMs: 0 }]) {
    await assert.rejects(probeDevtool(options), /Invalid DevTool/);
  }
});

test('session discovery cannot hide a CDP error or an empty Lynx document', async t => {
  for (const result of [{ error: { code: -32601, message: 'Not supported' } },
    { result: { root: { nodeId: 0, nodeName: '#document', children: [] } } }]) {
    const port = await mockServer(t, (socket, message) => {
      if (message.event === 'Initialize') socket.write(encodeFrame({ event: 'Register', data: { id: 152, info: {} } }));
      if (message.data?.type === 'ListSession') socket.write(encodeFrame({ event: 'Customized', data: { type: 'SessionList', data: [{ session_id: 7 }] } }));
      if (message.data?.type === 'CDP') {
        const { id } = JSON.parse(message.data.data.message);
        socket.write(encodeFrame({ event: 'Customized', data: {
          type: 'CDP', data: { session_id: 7, message: JSON.stringify({ id, ...result }) },
        } }));
      }
    });
    await assert.rejects(probeDevtool({ port }), /DOM.getDocument failed|no LynxView/);
  }
});
