import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { connectDevtool } from './devtool-client.mjs';
import { captureNativeFrame } from './native-screencast.mjs';
import { decodeDocumentRoot } from '../native-dom.ts';
export { encodeFrame, FrameDecoder } from './devtool-wire.mjs';

export async function probeDevtool(options) {
  const client = await connectDevtool(options);
  try {
    const sessions = (await client.refreshSessions()).filter(session => session.session_id >= 0);
    if (!sessions.length) throw new Error('DevTool returned no valid registered Lynx sessions.');
    // Match the original driver's newest-session discovery for this read-only
    // prerequisite. Business contracts will bind their fixture by its tags.
    const sessionId = Math.max(...sessions.map(session => session.session_id));
    const root = decodeDocumentRoot(await client.request(sessionId, 'DOM.getDocument'));
    if (!Array.isArray(root.children) || !root.children.length) {
      throw new Error('DevTool returned no LynxView in the DOM document.');
    }
    let capture;
    if (options.captureFrame) {
      const nodeId = root.children[0].nodeId;
      if (!Number.isInteger(nodeId) || nodeId < 0) throw new Error('Invalid LynxView root node ID.');
      const result = await client.request(sessionId, 'Lynx.getRectToWindow', { nodeId });
      const rect = result.rect ?? result;
      if (!rect || !['left', 'top', 'width', 'height'].every(key =>
        typeof rect[key] === 'number' && Number.isFinite(rect[key]))
        || rect.left < 0 || rect.top < 0 || rect.width <= 0 || rect.height <= 0) {
        throw new Error('Invalid LynxView window rectangle.');
      }
      const frame = await captureNativeFrame(client, sessionId);
      capture = {
        image: Buffer.from(frame.data, 'base64'),
        // Do not persist route URLs, runtime metadata or arbitrary frame fields.
        rect: Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, rect[key]])),
      };
    }
    return { runtime: client.runtime, sessions, root, sessionId, capture };
  } finally {
    client.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Do not log route URLs or runtime metadata, which may contain user data.
  const captureDir = process.env.DEVTOOL_CAPTURE_DIR;
  const result = await probeDevtool({
    host: process.env.DEVTOOL_HOST ?? '127.0.0.1',
    port: Number(process.env.DEVTOOL_PORT ?? 8901),
    timeoutMs: Number(process.env.DEVTOOL_TIMEOUT_MS ?? 5000),
    captureFrame: Boolean(captureDir),
  });
  if (captureDir) {
    await mkdir(captureDir, { recursive: true });
    await writeFile(resolve(captureDir, 'frame.jpeg'), result.capture.image, { flag: 'wx' });
    await writeFile(resolve(captureDir, 'geometry.json'), JSON.stringify({
      sessionId: result.sessionId, rect: result.capture.rect,
    }) + '\n', { flag: 'wx' });
    console.log('Native screencast and physical LynxView rectangle captured; pixel baseline comparison is not implemented.');
  }
  console.log(`DevTool TCP handshake verified; ${result.sessions.length} Lynx session(s) discovered; DOM.getDocument verified for session ${result.sessionId}.`);
}
