import { findTaggedNode, readNativeText } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';

export type VideoExpectation = {
  tag: string;
  immediate?: true;
  timeoutMs?: number;
} & ({ equal: string } | { contains: string } | { notContains: string } | { order: string[] });

// Preserve video_utils.py independently of core's different polling contract.
// In particular, video wait_until captures evidence and performs ONE final read
// after its deadline. Immediate assertions never poll an incorrect value green.
export async function expectVideoValue(
  readDocument: () => Promise<NativeNode>,
  captureDiagnostic: () => Promise<void>,
  input: VideoExpectation,
  clock = { now: Date.now, sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) },
) {
  const keys = ['equal', 'contains', 'notContains', 'order'].filter(key => Object.hasOwn(input, key));
  const timeoutMs = input.timeoutMs ?? 20_000;
  if (typeof input.tag !== 'string' || !input.tag || keys.length !== 1
    || !Number.isFinite(timeoutMs) || timeoutMs < 0
    || (input.immediate !== undefined && input.immediate !== true)
    || ('order' in input ? !Array.isArray(input.order) || input.order.some(value => typeof value !== 'string')
      : typeof (input as unknown as Record<string, unknown>)[keys[0]] !== 'string')
    || (('notContains' in input || 'order' in input) && input.immediate !== true)) {
    throw new Error('Invalid original video assertion.');
  }
  const matches = (text: string) => {
    if ('equal' in input) return text === input.equal;
    if ('contains' in input) return text.includes(input.contains);
    if ('notContains' in input) return !text.includes(input.notContains);
    let cursor = -1;
    for (const entry of input.order) {
      // Python text.find(entry, cursor + 1), NOT cursor + entry.length.
      cursor = text.indexOf(entry, cursor + 1);
      if (cursor < 0) return false;
    }
    return true;
  };
  const read = async () => readNativeText(findTaggedNode(await readDocument(), input.tag));
  const deadline = clock.now() + timeoutMs;
  if (!input.immediate) {
    while (clock.now() < deadline) {
      const actual = await read();
      if (matches(actual)) return;
      await clock.sleep(200);
    }
    await captureDiagnostic();
  }
  const actual = await read();
  if (!matches(actual)) throw new Error(`Original video assertion failed for ${input.tag}: ${JSON.stringify(input)}; actual ${JSON.stringify(actual)}`);
}
