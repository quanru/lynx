import { findTaggedNode, findNativeTextAttribute, MissingNativeTagError, readNativeAttribute, readNativeText } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';

export interface NativeExpectInput {
  tag?: string;
  matchingText?: string;
  index?: number;
  text?: string;
  attribute?: string;
  equals?: string;
  exists?: true;
  // Python wait_for_equal defaults to ten seconds. Explicit zero preserves
  // InputInsertText.assert_text's immediate, non-retrying assertions.
  timeoutMs?: number;
}

export async function expectNativeValue(
  readDocument: () => Promise<NativeNode>,
  input: NativeExpectInput,
): Promise<void> {
  const { tag, matchingText, index = 0, text, attribute, equals, exists, timeoutMs = 10_000 } = input;
  if ((tag === undefined) === (matchingText === undefined)
    || (tag !== undefined && (typeof tag !== 'string' || !tag))
    || (matchingText !== undefined && (typeof matchingText !== 'string' || !matchingText || exists !== true))
    || !Number.isInteger(index) || index < 0
    || [text !== undefined, attribute !== undefined, exists !== undefined].filter(Boolean).length !== 1
    || (text !== undefined && typeof text !== 'string')
    || (attribute !== undefined && (typeof attribute !== 'string' || !attribute || typeof equals !== 'string'))
    || (attribute === undefined && equals !== undefined)
    || (exists !== undefined && exists !== true)
    || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error('native.expect requires one exact text, attribute or existence assertion and a nonnegative timeout.');
  }
  const deadline = Date.now() + timeoutMs;
  let actual: string | null | undefined;
  for (;;) {
    // Refresh the source DOM as the Python helper refreshes its LynxElement.
    // Transport/CDP/malformed-DOM errors must fail, not turn into polling passes.
    const root = await readDocument();
    let target: NativeNode | undefined;
    try {
      target = tag !== undefined ? findTaggedNode(root, tag, index) : findNativeTextAttribute(root, matchingText!, index);
    } catch (error) {
      if (!(error instanceof MissingNativeTagError)) throw error;
    }
    if (target) {
      const withinDeadline = timeoutMs === 0 || Date.now() <= deadline;
      if (exists && withinDeadline) return;
      actual = attribute !== undefined ? readNativeAttribute(target, attribute) : readNativeText(target);
      if (!exists && actual === (text ?? equals) && withinDeadline) return;
    } else {
      actual = undefined;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`native.expect ${JSON.stringify(tag ?? matchingText)}[${index}] ${attribute ?? 'text'} failed; expected ${
        exists ? 'an existing node' : JSON.stringify(text ?? equals)
      }, got ${JSON.stringify(actual)}`);
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(200, remaining)));
  }
}
