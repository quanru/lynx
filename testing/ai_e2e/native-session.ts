import { decodeDocumentRoot, findTaggedNode, MissingNativeTagError } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';

export interface NativeClient {
  refreshSessions(): Promise<Array<{ session_id: number }>>;
  request(sessionId: number, method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export class NativeFixtureBindingError extends Error {
  readonly matches: number;
  constructor(matches: number) {
    super(`Native fixture binding requires one matching session; found ${matches}.`);
    this.matches = matches;
  }
}

function matchesFixture(root: NativeNode, tags: string[]): boolean {
  for (const tag of tags) {
    try {
      findTaggedNode(root, tag);
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
export async function bindFixtureSession(client: NativeClient, tags: string[]) {
  if (!Array.isArray(tags) || !tags.length
    || tags.some(tag => typeof tag !== 'string' || !tag)
    || new Set(tags).size !== tags.length) {
    throw new Error('Native fixture binding requires distinct nonempty test tags.');
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
    if (matchesFixture(root, tags)) candidates.push(sessionId);
  }
  if (candidates.length !== 1) {
    throw new NativeFixtureBindingError(candidates.length);
  }
  const sessionId = candidates[0];
  return {
    sessionId,
    request(method: string, params: Record<string, unknown> = {}) {
      return client.request(sessionId, method, params);
    },
    async readDocument(): Promise<NativeNode> {
      const root = decodeDocumentRoot(await client.request(sessionId, 'DOM.getDocument'));
      if (!matchesFixture(root, tags)) {
        throw new Error('Bound native fixture is no longer present; refusing to rebind to another session.');
      }
      return root;
    },
  };
}
