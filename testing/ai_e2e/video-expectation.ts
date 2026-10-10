import { findTaggedNode, readNativeText } from './native-dom.ts';
import type { NativeNode } from './native-dom.ts';
import { parseVideoFloat } from './video-float.ts';

export type VideoExpectation = {
  tag: string;
  immediate?: true;
  timeoutMs?: number;
} & ({ equal: string } | { contains: string } | { notContains: string } | { order: string[] }
  | { countAtLeast: { key: string; value: number } }
  | { countEquals: { key: string; value: number } }
  | { countAtMost: { key: string; value: number } }
  | { currentTimeRange: { min: number; max: number; minInclusive: boolean } }
  | { occurrences: { text: string; count: number } }
  | { floatGreaterThan: number } | { floatAtLeast: number } | { errorDetails: true });

export function parseVideoCount(text: string, key: string): bigint {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|;)${escaped}=([\\p{Decimal_Number}]+)`, 'u').exec(text);
  if (!match) throw new Error(`Missing ${key} in event counts: ${text}`);
  // Python re \d/int accept Unicode decimal digits. Contiguous Nd blocks can
  // contain multiple adjacent alphabets, each resetting after ten digits.
  let digits = '';
  for (const character of match[1]) {
    const point = character.codePointAt(0)!;
    let start = point;
    while (start > 0 && /\p{Decimal_Number}/u.test(String.fromCodePoint(start - 1))) start--;
    digits += (point - start) % 10;
  }
  return BigInt(digits);
}

// Match video_utils.parse_current_time's anchored ASCII regex exactly: no
// trimming, exponent syntax or broadened whitespace before the slash.
export function parseVideoCurrentTime(text: string): number {
  const match = /^([0-9]+(?:\.[0-9]+)?) \//.exec(text);
  if (!match) throw new Error(`Unexpected time text: ${text}`);
  return Number(match[1]);
}

// Preserve video_utils.py independently of core's different polling contract.
// In particular, video wait_until captures evidence and performs ONE final read
// after its deadline. Immediate assertions never poll an incorrect value green.
export async function expectVideoValue(
  readDocument: () => Promise<NativeNode>,
  captureDiagnostic: () => Promise<void>,
  input: VideoExpectation,
  clock = { now: Date.now, sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) },
) {
  const keys = ['equal', 'contains', 'notContains', 'order', 'countAtLeast', 'countEquals', 'countAtMost', 'currentTimeRange', 'occurrences', 'errorDetails', 'floatGreaterThan', 'floatAtLeast'].filter(key => Object.hasOwn(input, key));
  const counter = 'countAtLeast' in input ? input.countAtLeast
    : 'countEquals' in input ? input.countEquals : 'countAtMost' in input ? input.countAtMost : undefined;
  const timeoutMs = input.timeoutMs ?? 20_000;
  if (typeof input.tag !== 'string' || !input.tag || keys.length !== 1
    || !Number.isFinite(timeoutMs) || timeoutMs < 0
    || (input.immediate !== undefined && input.immediate !== true)
    || (['countAtLeast', 'countEquals', 'countAtMost'].includes(keys[0]) ? !counter || typeof counter.key !== 'string'
      || !Number.isSafeInteger(counter.value) || counter.value < 0
      : 'currentTimeRange' in input ? !input.currentTimeRange
        || !Number.isFinite(input.currentTimeRange.min) || !Number.isFinite(input.currentTimeRange.max)
        || input.currentTimeRange.min < 0 || input.currentTimeRange.max <= input.currentTimeRange.min
        || typeof input.currentTimeRange.minInclusive !== 'boolean'
      : 'occurrences' in input ? !input.occurrences || typeof input.occurrences.text !== 'string'
      || !Number.isSafeInteger(input.occurrences.count) || input.occurrences.count < 0
      : 'floatGreaterThan' in input ? !Number.isFinite(input.floatGreaterThan)
      : 'floatAtLeast' in input ? !Number.isFinite(input.floatAtLeast)
      : 'errorDetails' in input ? input.errorDetails !== true
      : 'order' in input ? !Array.isArray(input.order) || input.order.some(value => typeof value !== 'string')
      : typeof (input as unknown as Record<string, unknown>)[keys[0]] !== 'string')
    || (('notContains' in input || 'order' in input || 'occurrences' in input || 'countEquals' in input || 'countAtMost' in input) && input.immediate !== true)) {
    throw new Error('Invalid original video assertion.');
  }
  const matches = (text: string) => {
    if ('equal' in input) return text === input.equal;
    if ('floatGreaterThan' in input) return parseVideoFloat(text) > input.floatGreaterThan;
    if ('floatAtLeast' in input) return parseVideoFloat(text) >= input.floatAtLeast;
    if ('contains' in input) return text.includes(input.contains);
    if ('notContains' in input) return !text.includes(input.notContains);
    if ('countAtLeast' in input) return parseVideoCount(text, input.countAtLeast.key) >= BigInt(input.countAtLeast.value);
    if ('countEquals' in input) return parseVideoCount(text, input.countEquals.key) === BigInt(input.countEquals.value);
    if ('countAtMost' in input) return parseVideoCount(text, input.countAtMost.key) <= BigInt(input.countAtMost.value);
    if ('currentTimeRange' in input) {
      const actual = parseVideoCurrentTime(text);
      return (input.currentTimeRange.minInclusive ? actual >= input.currentTimeRange.min : actual > input.currentTimeRange.min)
        && actual < input.currentTimeRange.max;
    }
    if ('occurrences' in input) {
      const count = input.occurrences.text === '' ? [...text].length + 1 : text.split(input.occurrences.text).length - 1;
      return count === input.occurrences.count;
    }
    if ('errorDetails' in input) return text !== 'none' && text.includes(':');
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
