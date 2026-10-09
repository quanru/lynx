import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDevtool } from './devtool-client.mjs';
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
    return { runtime: client.runtime, sessions, root, sessionId };
  } finally {
    client.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Do not log route URLs or runtime metadata, which may contain user data.
  const result = await probeDevtool({
    host: process.env.DEVTOOL_HOST ?? '127.0.0.1',
    port: Number(process.env.DEVTOOL_PORT ?? 8901),
    timeoutMs: Number(process.env.DEVTOOL_TIMEOUT_MS ?? 5000),
  });
  console.log(`DevTool TCP handshake verified; ${result.sessions.length} Lynx session(s) discovered; DOM.getDocument verified for session ${result.sessionId}.`);
}
