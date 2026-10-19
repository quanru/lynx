import { readFileSync } from 'node:fs';
import type { NativeNode } from './native-dom.ts';
import { findTaggedNode, readNativeText } from './native-dom.ts';
import type { VideoTimedAgent } from './video-action-phase.ts';
import { prepareVideoButtons, tapPreparedVideoButton } from './video-button-preparation.ts';
import { expectVideoValue, parseVideoCount, parseVideoCurrentTime } from './video-expectation.ts';
import type { VideoExpectation, VideoObservation } from './video-expectation.ts';

export interface VideoPlaybackEvidence {
  video: VideoObservation[];
  core: { expected: string; actual: string; tag: string; observedAt: number }[];
  samples: { variable: string; raw: string; value: string | number; observedAt: number }[];
  guards: { failureCondition: string; passed: boolean }[];
}

type Operation = { section: number } & (
  { type: 'tap'; tag: string; label: string } |
  { type: 'core'; input: { tag: string; text: string; timeoutMs: number; message: string } } |
  { type: 'video'; input: VideoExpectation } |
  { type: 'sleep'; ms: number } |
  { type: 'capture'; title: string } | { type: 'section'; title: string } |
  { type: 'sample'; variable: 'slow_time' | 'fast_time' | 'fast_count'; tag: string } |
  { type: 'guard'; condition: string }
);
export type VideoPlaybackPhase = 'basic-ready' | 'basic-play-pause' | 'basic-seek-stop' | 'basic-restart-ended' | 'basic-loop' |
  'attributes-fit' | 'attributes-speed' | 'attributes-interval' | 'attributes-invalid' | 'attributes-tiny';
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
    const actual = readNativeText(findTaggedNode(root, input.tag));
    if (actual === input.text) return { expected: input.text, actual, tag: input.tag, observedAt: now() };
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
  signal?: AbortSignal,
  prepared?: ReadonlyMap<string, number[]>,
  evidence?: VideoPlaybackEvidence,
) {
  const operations = videoPlaybackOperations(phase);
  signal?.throwIfAborted();
  const points = prepared ?? await prepareVideoButtons(agent, operations.filter(op => op.type === 'tap').map(op => op.label), signal);
  const samples = new Map<string, number | bigint>();
  for (const op of operations) {
    signal?.throwIfAborted();
    if (op.type === 'section') continue;
    if (op.type === 'tap') await tapPreparedVideoButton(agent, op.label, points, signal);
    else if (op.type === 'sleep') await clock.sleep(op.ms);
    else if (op.type === 'capture') await capture(op.title);
    else if (op.type === 'core') {
      const observation = await expectCoreVideoValue(readDocument, () => capture('core_wait_failure'), op.input, clock.now);
      evidence?.core.push(observation);
    }
    else if (op.type === 'video') await expectVideoValue(readDocument, () => capture('wait_failure'), op.input, clock, evidence?.video);
    else if (op.type === 'sample') {
      const text = readNativeText(findTaggedNode(await readDocument(), op.tag));
      const value = op.variable === 'fast_count' ? parseVideoCount(text, 'timeupdate') : parseVideoCurrentTime(text);
      if (samples.has(op.variable)) throw new Error('Original video sample was read more than once.');
      samples.set(op.variable, value);
      evidence?.samples.push({ variable: op.variable, raw: text, value: typeof value === 'bigint' ? value.toString() : value, observedAt: clock.now() });
    } else if (op.condition === 'fast_time < 3.0 or fast_time <= slow_time + 1.5') {
      const slow = samples.get('slow_time'), fast = samples.get('fast_time');
      if (typeof slow !== 'number' || typeof fast !== 'number') throw new Error('Missing original playback speed samples.');
      evidence?.guards.push({ failureCondition: op.condition, passed: !(fast < 3 || fast <= slow + 1.5) });
      if (fast < 3 || fast <= slow + 1.5) throw new Error('speed=2.0 should advance faster than speed=0.5; slow=' + slow + ' fast=' + fast);
    } else if (op.condition === 'fast_count < 30') {
      const count = samples.get('fast_count');
      if (typeof count !== 'bigint') throw new Error('Missing original timeupdate count sample.');
      evidence?.guards.push({ failureCondition: op.condition, passed: count >= 30n });
      if (count < 30n) throw new Error('tiny positive timeupdate interval should not be clamped; count=' + count);
    } else throw new Error('Unknown original video sampling guard.');
  }
  signal?.throwIfAborted();
}
