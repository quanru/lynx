import { decodeDocumentRoot, nativeAttributes, readNativeText } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';
import type { NativeClient } from './native-session.ts';
import type { VisibleNativeContext } from './native-wda.ts';
import { originalVisibleElementRect, visibleRectsCorrespond } from './native-visible-geometry.ts';

export class VisibleNativeBindingError extends Error {
  readonly matches: number;
  constructor(matches: number) {
    super(`Visible native binding requires one native-view/session pair; found ${matches}.`);
    this.matches = matches;
  }
}

function uniqueTag(root: NativeNode, tag: string): NativeNode | undefined {
  const stack = [root], matches: NativeNode[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (nativeAttributes(node).get('lynx-test-tag') === tag) matches.push(node);
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error('Invalid visible fixture children.');
    stack.push(...(node.children ?? []).slice().reverse());
  }
  return matches.length === 1 ? matches[0] : undefined;
}

// One observation of the original Sparkling _resolve_visible_view_once.
// Routing phases must explicitly call this again; a previous parent lease is
// never silently rebound or reused for a pushed child. No newest-session rule.
export async function resolveVisibleNativeSession(client: NativeClient, contexts: VisibleNativeContext[],
  tag: string, expectedText?: string, timeoutMs = 5000) {
  if (!Array.isArray(contexts) || typeof tag !== 'string' || !tag
    || expectedText !== undefined && typeof expectedText !== 'string'
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid visible fixture binding.');
  const deadline = Date.now() + timeoutMs;
  async function bounded<T>(read: () => Promise<T>): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Visible fixture binding timed out.');
    let timer: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Visible fixture binding timed out.')), remaining);
      })]);
      if (Date.now() >= deadline) throw new Error('Visible fixture binding timed out.');
      return result;
    } finally { clearTimeout(timer!); }
  }
  const sessions = await bounded(() => client.refreshSessions());
  if (!Array.isArray(sessions) || sessions.some(s => !Number.isInteger(s?.session_id))) {
    throw new Error('Invalid visible fixture session list.');
  }
  const matches: Array<{ sessionId: number; viewId: string; targetText: string }> = [];
  for (const context of contexts) {
    if (typeof context?.viewId !== 'string' || !context.viewId || typeof context.anchor?.tag !== 'string'
      || !context.anchor.tag || !Array.isArray(context.anchor.texts)
      || context.anchor.texts.some(text => typeof text !== 'string' || !text)) throw new Error('Invalid displayed native context.');
    for (const sessionId of new Set(sessions.map(s => s.session_id).filter(id => id >= 0))) {
      const request = (method: string, params?: Record<string, unknown>) => bounded(() => client.request(sessionId, method, params));
      const root = decodeDocumentRoot(await request('DOM.getDocument'));
      const target = uniqueTag(root, tag);
      if (!target) continue;
      const targetText = readNativeText(target);
      if (expectedText !== undefined && targetText !== expectedText) continue;
      const anchor = uniqueTag(root, context.anchor.tag);
      if (!anchor) continue;
      const anchorText = readNativeText(anchor);
      if (context.anchor.texts.length && anchorText && !context.anchor.texts.includes(anchorText)) continue;
      const body = root.children?.[0];
      if (!body) throw new Error('Missing visible native body.');
      async function padding(nodeId: number) {
        const response = await request('DOM.getBoxModel', { nodeId }) as { model?: { padding?: unknown } };
        if (!Array.isArray(response?.model?.padding)) throw new Error('Invalid visible native box model.');
        return response.model.padding as number[];
      }
      const elementPadding = await padding(anchor.nodeId), bodyPadding = await padding(body.nodeId);
      const rect = await bounded(() => originalVisibleElementRect(context.viewRect, bodyPadding, elementPadding, deadline - Date.now()));
      if (visibleRectsCorrespond(context.anchor.rect, rect)) matches.push({ sessionId, viewId: context.viewId, targetText });
    }
  }
  if (matches.length !== 1) throw new VisibleNativeBindingError(matches.length);
  return Object.freeze(matches[0]);
}
