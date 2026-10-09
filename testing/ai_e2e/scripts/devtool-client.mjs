import net from 'node:net';
import { encodeFrame, FrameDecoder } from './devtool-wire.mjs';

function deferred(timeoutMs, onTimeout) {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const timer = setTimeout(onTimeout, timeoutMs);
  return {
    promise,
    resolve(value) { clearTimeout(timer); resolve(value); },
    reject(error) { clearTimeout(timer); reject(error); },
  };
}

class DevtoolClient {
  decoder = new FrameDecoder();
  senderId = 152;
  runtime;
  sessions = [];
  requests = new Map();
  nextId = 1;
  closed = false;
  sessionPending;

  constructor({ host, port, timeoutMs }) {
    this.timeoutMs = timeoutMs;
    this.socket = net.createConnection({ host, port });
    this.ready = deferred(timeoutMs, () =>
      this.close(new Error('DevTool handshake/session probe timed out.')));
    this.socket.on('error', error => this.close(error));
    this.socket.on('close', () =>
      this.close(new Error('DevTool closed before session discovery or CDP completion.')));
    this.socket.on('connect', () => this.send({ event: 'Initialize', data: this.senderId }));
    this.socket.on('data', chunk => {
      try {
        for (const message of this.decoder.push(chunk)) {
          if (this.closed) return;
          this.receive(message);
        }
      } catch (error) {
        this.close(error);
      }
    });
  }

  send(message) {
    if (this.closed) throw new Error('DevTool client is closed.');
    this.socket.write(encodeFrame(message));
  }

  receive(message) {
    if (message?.event === 'Initialize') {
      if (this.runtime || !Number.isInteger(message.data)) {
        throw new Error('Invalid DevTool sender identity.');
      }
      this.senderId = message.data;
      this.send({ event: 'Register', data: { id: this.senderId, type: 'Driver' } });
    } else if (message?.event === 'Register') {
      if (this.runtime || !Number.isInteger(message.data?.id) || !message.data?.info) {
        throw new Error('Invalid DevTool runtime registration.');
      }
      this.runtime = message.data;
      this.ready.resolve(this);
    } else if (message?.event === 'Customized' && message.data?.type === 'SessionList') {
      const sessions = message.data.data;
      if (!this.runtime || !Array.isArray(sessions)
        || sessions.some(session => !Number.isInteger(session?.session_id))) {
        throw new Error('DevTool returned no valid registered Lynx sessions.');
      }
      this.sessions = sessions;
      this.sessionPending?.resolve(sessions);
      this.sessionPending = undefined;
    } else if (message?.event === 'Customized' && message.data?.type === 'CDP') {
      const envelope = message.data.data;
      if (typeof envelope?.message !== 'string') throw new Error('Invalid DevTool CDP envelope.');
      const response = JSON.parse(envelope.message);
      if (!response || typeof response !== 'object') throw new Error('Invalid DevTool CDP response.');
      const pending = this.requests.get(response.id);
      if (!pending) return; // Notifications and late responses are not new requests.
      if (envelope.session_id !== pending.sessionId) {
        throw new Error('DevTool CDP response belongs to a different Lynx session.');
      }
      this.requests.delete(response.id);
      if (Object.hasOwn(response, 'error')) {
        pending.reject(new Error(pending.method + ' failed: ' + JSON.stringify(response.error)));
      } else {
        pending.resolve(Object.hasOwn(response, 'result') ? response.result : {});
      }
    }
  }

  refreshSessions() {
    if (this.closed) return Promise.reject(new Error('DevTool client is closed.'));
    if (this.sessionPending) return this.sessionPending.promise;
    // ListSession has no request ID. Close on timeout so a late response cannot
    // be mistaken for a later refresh on the same connection.
    const pending = deferred(this.timeoutMs, () =>
      this.close(new Error('DevTool session discovery timed out.')));
    this.sessionPending = pending;
    try {
      this.send({ event: 'Customized', data: {
        type: 'ListSession', sender: this.senderId,
        data: { client_id: this.runtime.id },
      } });
    } catch (error) {
      this.close(error);
    }
    return pending.promise;
  }

  request(sessionId, method, params = {}) {
    if (this.closed) return Promise.reject(new Error('DevTool client is closed.'));
    if (!Number.isInteger(sessionId) || sessionId < 0 || typeof method !== 'string'
      || !method.trim() || !params || typeof params !== 'object' || Array.isArray(params)) {
      return Promise.reject(new Error('Invalid DevTool CDP request.'));
    }
    const id = ++this.nextId;
    const pending = deferred(this.timeoutMs, () => {
      this.requests.delete(id);
      pending.reject(new Error(method + ' timed out without a matching CDP response.'));
    });
    Object.assign(pending, { sessionId, method });
    this.requests.set(id, pending);
    try {
      this.send({ event: 'Customized', data: {
        type: 'CDP', sender: this.senderId,
        data: { client_id: this.runtime.id, session_id: sessionId,
          message: JSON.stringify({ id, method, params }) },
      } });
    } catch (error) {
      this.requests.delete(id);
      pending.reject(error);
    }
    return pending.promise;
  }

  close(error = new Error('DevTool client closed.')) {
    if (this.closed) return;
    this.closed = true;
    this.ready.reject(error);
    this.sessionPending?.reject(error);
    this.sessionPending = undefined;
    for (const pending of this.requests.values()) pending.reject(error);
    this.requests.clear();
    this.socket.destroy();
  }
}

export async function connectDevtool({ host = '127.0.0.1', port = 8901, timeoutMs = 5000 } = {}) {
  if (typeof host !== 'string' || !host || !Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid DevTool port or timeout.');
  }
  const client = new DevtoolClient({ host, port, timeoutMs });
  await client.ready.promise;
  return client;
}
