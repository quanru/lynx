import { findTaggedNode } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';

export type NativeCommandInput =
  | { method: 'DOM.focus'; tag: string; index?: number }
  | { method: 'Input.insertText'; text: string };

interface Session {
  readDocument(): Promise<NativeNode>;
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
}

// These are API contracts under test, not replaceable UI interaction helpers.
// No retries: repeating Input.insertText changes event counts and payloads.
export async function runNativeCommand(session: Session, input: NativeCommandInput) {
  if (input.method === 'DOM.focus') {
    if (typeof input.tag !== 'string' || !input.tag
      || (input.index !== undefined && (!Number.isInteger(input.index) || input.index < 0))) {
      throw new Error('DOM.focus requires a native test tag and valid index.');
    }
    const target = findTaggedNode(await session.readDocument(), input.tag, input.index ?? 0);
    await session.request('DOM.focus', { nodeId: target.nodeId });
  } else if (input.method === 'Input.insertText' && typeof input.text === 'string') {
    await session.request('Input.insertText', { text: input.text });
  } else {
    throw new Error('native.cdp supports only the original DOM.focus and Input.insertText contracts.');
  }
}
