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
      // PeerTalk clients write payload size (+4); native DebugRouter
      // UsbClient::WrapHeader writes total frame size (+20). The JSON length
      // at offset 16 remains authoritative in both directions. Do not require
      // the client's convention when decoding native server responses.
      if (type !== 101 || length > MAX_MESSAGE_BYTES
        || (outerLength !== length + 4 && outerLength !== length + 20)) {
        throw new Error(`Invalid DevTool frame type or length: type=${type}, outer=${outerLength}, json=${length}.`);
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
