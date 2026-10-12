import { isDeepStrictEqual } from 'node:util';
import type { AgentProgressListener, UIContext } from '@midscene/core';
import type { VideoExpectation } from './video-expectation.ts';
import { prepareVideoButtons, tapPreparedVideoButton } from './video-button-preparation.ts';

export type VideoActionPhase = 'replace-playing-source' | 'stop-play-null';
export interface VideoTimedAgent {
  aiAct(prompt: string, options: { deepLocate: false; cacheable: false; abortSignal?: AbortSignal }): Promise<unknown>;
  addProgressListener(listener: AgentProgressListener): () => void;
  getUIContext(): Promise<UIContext>;
  aiLocate(prompt: string, options: { deepLocate: true; cacheable: false; uiContext: UIContext }): Promise<{ center: number[] }>;
  interface: { inputPrimitives: { pointer: { tap(point: { x: number; y: number }): Promise<void> } } };
}

export function videoActionPhaseChecks(phase: VideoActionPhase): VideoExpectation[] {
  const playing: VideoExpectation = { tag: 'status-text', equal: 'playing', timeoutMs: 20000 };
  if (phase === 'replace-playing-source') return [playing];
  if (phase === 'stop-play-null') return [playing,
    { tag: 'callback-log', contains: 'play_ok', timeoutMs: 20000 },
    { tag: 'callback-log', contains: 'success=true', timeoutMs: 20000 }];
  throw new Error('Unknown original video action phase.');
}
export function videoActionPhaseTargets(phase: VideoActionPhase): readonly [string, string] {
  if (phase === 'replace-playing-source') return ['Play', 'Src B'];
  if (phase === 'stop-play-null') return ['Play Null', 'Stop'];
  throw new Error('Unknown original video action phase.');
}

// Only two source-bound playback-time fragments use this path. All model
// calls finish before playback starts; public device input primitives then
// drive real taps without TaskBuilder's automatic screenshots. Original source
// screenshots stay in place. No selector, fixture action hook or media change.
export async function executeVideoActionPhase(
  agent: VideoTimedAgent,
  phase: VideoActionPhase,
  assertSource: (input: VideoExpectation) => Promise<void>,
  captureEvidence: () => Promise<void>,
  signal?: AbortSignal,
) {
  const expected = videoActionPhaseChecks(phase);
  const labels = videoActionPhaseTargets(phase);
  const points = await prepareVideoButtons(agent, labels, signal);
  const tap = (index: number) => tapPreparedVideoButton(agent, labels[index], points, signal);
  await tap(0);
  for (const input of expected) { signal?.throwIfAborted(); await assertSource(structuredClone(input)); }
  signal?.throwIfAborted();
  await captureEvidence();
  signal?.throwIfAborted();
  // Even capture/device overhead must not allow an ended video to pass.
  await assertSource({ tag: 'status-text', equal: 'playing', immediate: true });
  await tap(1);
  let consumed = 0;
  let disposed = false;
  return {
    async consume(input: VideoExpectation) {
      if (disposed) throw new Error('Video phase evidence was disposed.');
      if (!isDeepStrictEqual(input, expected[consumed])) throw new Error('Video phase assertion identity or order differs from the original.');
      consumed++;
      return consumed === expected.length;
    },
    dispose() { disposed = true; },
  };
}
