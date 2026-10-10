import { readFileSync } from 'node:fs';
import type { NativeNode } from './native-dom.ts';
import { findTaggedNode, readNativeText } from './native-dom.ts';
import type { VideoTimedAgent } from './video-action-phase.ts';
import { prepareVideoButtons, tapPreparedVideoButton } from './video-button-preparation.ts';
import { expectVideoValue, parseVideoCount, parseVideoCurrentTime } from './video-expectation.ts';
import type { VideoExpectation } from './video-expectation.ts';

type Operation = { section: number } & (
  { type: 'tap'; tag: string; label: string } |
  { type: 'core'; input: { tag: string; text: string; timeoutMs: number; message: string } } |
  { type: 'video'; input: VideoExpectation } |
  { type: 'sleep'; ms: number } |
  { type: 'capture'; title: string } | { type: 'section'; title: string } |
  { type: 'sample'; variable: 'slow_time' | 'fast_time' | 'fast_count'; tag: string } |
  { type: 'guard'; condition: string }
);
export type VideoPlaybackPhase = 'basic-ready' | 'basic-playback' | 'basic-loop' | 'attributes-playback';
const plans: Record<VideoPlaybackPhase, Operation[]> = JSON.parse(readFileSync(new URL('./video-playback-plans.json', import.meta.url), 'utf8'));
export function isVideoPlaybackPhase(phase: string): phase is VideoPlaybackPhase {
  return Object.hasOwn(plans, phase);
}
export function videoPlaybackOperations(phase: VideoPlaybackPhase): Operation[] {
  if (!isVideoPlaybackPhase(phase)) throw new Error('Unknown original video playback phase.');
  return structuredClone(plans[phase]);
}
const defaultClock = { now: Date.now, sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) };

// The original core helper spins until its worker completes or join(timeout)
// expires. Do not substitute video's 200ms poll/diagnostic/final-read behavior.
export async function expectCoreVideoValue(readDocument: () => Promise<NativeNode>, capture: () => Promise<void>, input: Extract<Operation, { type: 'core' }>['input'], now = Date.now) {
  const deadline = now() + input.timeoutMs;
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = Symbol('original core timeout');
    const root = await Promise.race([readDocument(), new Promise<typeof timeout>(resolve => { timer = setTimeout(() => resolve(timeout), remaining); })]).finally(() => clearTimeout(timer));
    if (root === timeout || now() >= deadline) break;
    if (readNativeText(findTaggedNode(root, input.tag)) === input.text) return;
  }
  await capture();
  throw new Error(input.message);
}

// Closed source-derived plans only: YAML cannot supply actions, timing windows,
// sampling expressions or assertions. No model calls occur during playback.
export async function executeVideoPlaybackPhase(
  agent: VideoTimedAgent,
  phase: VideoPlaybackPhase,
  readDocument: () => Promise<NativeNode>,
  capture: (title: string) => Promise<void>,
  clock = defaultClock,
) {
  const operations = videoPlaybackOperations(phase);
  const points = await prepareVideoButtons(agent, operations.filter(op => op.type === 'tap').map(op => op.label));
  const samples = new Map<string, number | bigint>();
  for (const op of operations) {
    if (op.type === 'section') continue;
    if (op.type === 'tap') await tapPreparedVideoButton(agent, op.label, points);
    else if (op.type === 'sleep') await clock.sleep(op.ms);
    else if (op.type === 'capture') await capture(op.title);
    else if (op.type === 'core') await expectCoreVideoValue(readDocument, () => capture('core_wait_failure'), op.input, clock.now);
    else if (op.type === 'video') await expectVideoValue(readDocument, () => capture('wait_failure'), op.input, clock);
    else if (op.type === 'sample') {
      const text = readNativeText(findTaggedNode(await readDocument(), op.tag));
      const value = op.variable === 'fast_count' ? parseVideoCount(text, 'timeupdate') : parseVideoCurrentTime(text);
      if (samples.has(op.variable)) throw new Error('Original video sample was read more than once.');
      samples.set(op.variable, value);
    } else if (op.condition === 'fast_time < 3.0 or fast_time <= slow_time + 1.5') {
      const slow = samples.get('slow_time'), fast = samples.get('fast_time');
      if (typeof slow !== 'number' || typeof fast !== 'number') throw new Error('Missing original playback speed samples.');
      if (fast < 3 || fast <= slow + 1.5) throw new Error('speed=2.0 should advance faster than speed=0.5; slow=' + slow + ' fast=' + fast);
    } else if (op.condition === 'fast_count < 30') {
      const count = samples.get('fast_count');
      if (typeof count !== 'bigint') throw new Error('Missing original timeupdate count sample.');
      if (count < 30n) throw new Error('tiny positive timeupdate interval should not be clamped; count=' + count);
    } else throw new Error('Unknown original video sampling guard.');
  }
}
