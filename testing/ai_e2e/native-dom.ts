import { inflateSync } from 'node:zlib';

export interface NativeNode {
  nodeId: number;
  nodeName: string;
  attributes?: string[];
  children?: NativeNode[];
}

function assertNode(node: unknown): asserts node is NativeNode {
  if (!node || typeof node !== 'object'
    || !Number.isInteger((node as NativeNode).nodeId)
    || typeof (node as NativeNode).nodeName !== 'string') {
    throw new Error('Invalid Lynx DOM node identity.');
  }
}

// Match LynxDebuggerDom.get_document: compressed roots are base64 zlib JSON,
// not gzip, screenshots, or a model-generated interpretation of the DOM.
export function decodeDocumentRoot(result: unknown): NativeNode {
  if (!result || typeof result !== 'object') throw new Error('Invalid Lynx DOM document.');
  const document = result as { compress?: unknown; root?: unknown };
  let root = document.root;
  if (document.compress === true) {
    if (typeof root !== 'string') throw new Error('Invalid compressed Lynx DOM root.');
    const inflated = inflateSync(Buffer.from(root, 'base64'), {
      maxOutputLength: 16 * 1024 * 1024,
    });
    root = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated));
  }
  assertNode(root);
  return root;
}

export function nativeAttributes(node: NativeNode): Map<string, string> {
  assertNode(node);
  const attributes = node.attributes === undefined ? [] : node.attributes;
  if (!Array.isArray(attributes) || attributes.length % 2
    || attributes.some(value => typeof value !== 'string')) {
    throw new Error('Invalid Lynx DOM attribute pairs.');
  }
  const result = new Map<string, string>();
  for (let index = 0; index < attributes.length; index += 2) {
    result.set(attributes[index], attributes[index + 1]);
  }
  return result;
}

function childrenOf(node: NativeNode): NativeNode[] {
  const children = node.children === undefined ? [] : node.children;
  if (!Array.isArray(children)) throw new Error('Invalid Lynx DOM children.');
  return children;
}

export class MissingNativeTagError extends Error {}

export function findTaggedNode(root: NativeNode, tag: string, index = 0): NativeNode {
  if (typeof tag !== 'string' || !tag || !Number.isInteger(index) || index < 0) {
    throw new Error('Invalid Lynx test tag or index.');
  }
  let ordinal = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (nativeAttributes(node).get('lynx-test-tag') === tag && ordinal++ === index) return node;
    // Preserve the original pre-order/default-index selection, including duplicates.
    stack.push(...childrenOf(node).slice().reverse());
  }
  throw new MissingNativeTagError(`Lynx test tag ${JSON.stringify(tag)}[${index}] was not found.`);
}

function nestedRawText(node: NativeNode): string {
  const attributes = nativeAttributes(node);
  if (node.nodeName.toLowerCase() === 'raw-text' && attributes.has('text')) {
    return attributes.get('text')!;
  }
  return childrenOf(node).map(nestedRawText).join('');
}

// Match LynxDriver.get_text, including x-input's value and concatenated raw
// descendants of text nodes. Do not trim whitespace, parse counters, include
// unrelated view text, or replace missing data with a visual guess.
export function readNativeText(node: NativeNode): string {
  const attributes = nativeAttributes(node);
  const name = node.nodeName.toLowerCase();
  if (name === 'raw-text') return attributes.get('text') ?? '';
  if (name === 'x-input') return attributes.get('value') ?? '';
  if (['text', 'inline-text', 'x-text', 'x-inline-text'].includes(name)) {
    return nestedRawText(node);
  }
  return '';
}

export function readNativeAttribute(node: NativeNode, name: string): string | null {
  return nativeAttributes(node).get(name) ?? null;
}
