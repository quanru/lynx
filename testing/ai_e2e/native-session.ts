import { decodeDocumentRoot, findTaggedNode, findNativeTextAttribute, MissingNativeTagError } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';
import { captureNativeFrame } from './scripts/native-screencast.mjs';

export interface NativeClient {
  refreshSessions(): Promise<Array<{ session_id: number }>>;
  request(sessionId: number, method: string, params?: Record<string, unknown>): Promise<unknown>;
  waitForNotification?(sessionId: number, method: string, timeoutMs: number): {
    promise: Promise<Record<string, unknown>>;
    cancel(): void;
  };
}

export class NativeFixtureBindingError extends Error {
  readonly matches: number;
  constructor(matches: number) {
    super(`Native fixture binding requires one matching session; found ${matches}.`);
    this.matches = matches;
  }
}

function matchesFixture(root: NativeNode, tags: string[], texts: string[]): boolean {
  for (const tag of tags) {
    try {
      findTaggedNode(root, tag);
    } catch (error) {
      if (error instanceof MissingNativeTagError) return false;
      throw error;
    }
  }
  for (const text of texts) {
    try {
      findNativeTextAttribute(root, text);
    } catch (error) {
      if (error instanceof MissingNativeTagError) return false;
      throw error;
    }
  }
  return true;
}

// Session IDs do not identify the displayed fixture: the homepage, a parent
// page and a child page may coexist. Match source fixture markers instead of
// silently selecting the largest ID or treating native frame geometry as identity.
// This is binding infrastructure, not an additional business assertion.
export async function bindFixtureSession(client: NativeClient, tags: string[], texts: string[] = []) {
  if (!Array.isArray(tags) || !Array.isArray(texts) || (!tags.length && !texts.length)
    || tags.some(tag => typeof tag !== 'string' || !tag)
    || texts.some(text => typeof text !== 'string' || !text)
    || new Set(tags).size !== tags.length || new Set(texts).size !== texts.length) {
    throw new Error('Native fixture binding requires distinct nonempty test tags or original text markers.');
  }
  const sessions = await client.refreshSessions();
  if (!Array.isArray(sessions)
    || sessions.some(session => !Number.isInteger(session?.session_id))) {
    throw new Error('Invalid native fixture session list.');
  }
  const candidates: number[] = [];
  for (const sessionId of new Set(sessions.map(session => session.session_id))) {
    if (sessionId < 0) continue; // Global routing slots are not LynxViews.
    const root = decodeDocumentRoot(await client.request(sessionId, 'DOM.getDocument'));
    if (matchesFixture(root, tags, texts)) candidates.push(sessionId);
  }
  if (candidates.length !== 1) {
    throw new NativeFixtureBindingError(candidates.length);
  }
  const sessionId = candidates[0];
  async function readDocument(): Promise<NativeNode> {
    const root = decodeDocumentRoot(await client.request(sessionId, 'DOM.getDocument'));
    if (!matchesFixture(root, tags, texts)) {
      throw new Error('Bound native fixture is no longer present; refusing to rebind to another session.');
    }
    return root;
  }
  return {
    sessionId,
    request(method: string, params: Record<string, unknown> = {}) {
      return client.request(sessionId, method, params);
    },
    readDocument,
    async captureFrame() {
      if (!client.waitForNotification) throw new Error('Native transport cannot capture screencast frames.');
      await readDocument();
      const frame = await captureNativeFrame(client, sessionId);
      await readDocument(); // A navigation during capture must not borrow the next fixture's image.
      return frame;
    },
  };
}
