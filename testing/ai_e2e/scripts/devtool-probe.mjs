import net from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lynx's existing lynx-e2e-appium 0.0.15 USBConnector uses PeerTalk framing:
// four network-order uint32 header fields, a uint32 JSON byte count, then UTF-8.
// Only the wire protocol is reused here; no Appium/Python dependency is needed.
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
export function encodeFrame(message) {
  const json = Buffer.from(JSON.stringify(message), 'utf8');
  if (json.length > MAX_MESSAGE_BYTES) throw new Error('DevTool message is too large.');
  const frame = Buffer.alloc(20 + json.length);
  [1, 101, 0, json.length + 4, json.length].forEach((value, index) =>
    frame.writeUInt32BE(value, index * 4));
  json.copy(frame, 20);
  return frame;
}

export class FrameDecoder {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 20) {
      const type = this.buffer.readUInt32BE(4);
      const outerLength = this.buffer.readUInt32BE(12);
      const length = this.buffer.readUInt32BE(16);
      if (type !== 101 || length > MAX_MESSAGE_BYTES || outerLength !== length + 4) {
        throw new Error('Invalid DevTool frame type or length.');
      }
      if (this.buffer.length < 20 + length) break;
      const json = new TextDecoder('utf-8', { fatal: true })
        .decode(this.buffer.subarray(20, 20 + length));
      messages.push(JSON.parse(json));
      this.buffer = this.buffer.subarray(20 + length);
    }
    return messages;
  }
}

export function probeDevtool({ host = '127.0.0.1', port = 8901, timeoutMs = 5000 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Invalid DevTool port or timeout.'));
  }
  return new Promise((resolveProbe, reject) => {
    const decoder = new FrameDecoder();
    const socket = net.createConnection({ host, port });
    let senderId = 152;
    let runtime;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolveProbe(result);
    };
    const timer = setTimeout(() => finish(new Error('DevTool handshake/session probe timed out.')), timeoutMs);
    const send = message => socket.write(encodeFrame(message));
    socket.on('error', error => finish(error));
    socket.on('close', () => finish(new Error('DevTool closed before session discovery.')));
    socket.on('connect', () => send({ event: 'Initialize', data: senderId }));
    socket.on('data', chunk => {
      try {
        for (const message of decoder.push(chunk)) {
          if (settled) return;
          if (message?.event === 'Initialize') {
            if (!Number.isInteger(message.data)) throw new Error('Invalid DevTool sender identity.');
            senderId = message.data;
            send({ event: 'Register', data: { id: senderId, type: 'Driver' } });
          } else if (message?.event === 'Register') {
            if (!Number.isInteger(message.data?.id) || !message.data?.info) {
              throw new Error('Invalid DevTool runtime registration.');
            }
            runtime = message.data;
            send({ event: 'Customized', data: {
              type: 'ListSession', sender: senderId,
              data: { client_id: runtime.id },
            } });
          } else if (message?.event === 'Customized' && message.data?.type === 'SessionList') {
            const sessions = message.data.data;
            if (!runtime || !Array.isArray(sessions) || sessions.length === 0
              || sessions.some(session => !Number.isInteger(session?.session_id))) {
              throw new Error('DevTool returned no valid registered Lynx sessions.');
            }
            finish(null, { runtime, sessions });
          }
        }
      } catch (error) {
        finish(error);
      }
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Do not log route URLs or runtime metadata, which may contain user data.
  const result = await probeDevtool({
    host: process.env.DEVTOOL_HOST ?? '127.0.0.1',
    port: Number(process.env.DEVTOOL_PORT ?? 8901),
    timeoutMs: Number(process.env.DEVTOOL_TIMEOUT_MS ?? 5000),
  });
  console.log(`DevTool TCP handshake verified; ${result.sessions.length} Lynx session(s) discovered.`);
}
