import { isDeepStrictEqual } from 'node:util';
import type { AgentProgressListener } from '@midscene/core';
import type { VideoExpectation } from './video-expectation.ts';

export type VideoActionPhase = 'replace-playing-source' | 'stop-play-null';
export interface VideoTimedAgent {
  aiAct(prompt: string, options: { deepLocate: false; cacheable: false }): Promise<unknown>;
  addProgressListener(listener: AgentProgressListener): () => void;
  aiLocate(prompt: string, options: { deepLocate: false; cacheable: false }): Promise<{ center: number[] }>;
  callActionInActionSpace(type: string, input: unknown): Promise<unknown>;
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
// calls finish before playback starts; standard SDK Tap actions then drive
// the real device. No selector, DOM click, fixture action hook or media change.
export async function executeVideoActionPhase(
  agent: VideoTimedAgent,
  phase: VideoActionPhase,
  assertSource: (input: VideoExpectation) => Promise<void>,
  captureEvidence: () => Promise<void>,
) {
  const expected = videoActionPhaseChecks(phase);
  const labels = videoActionPhaseTargets(phase);
  // Normal visibility preparation still uses aiAct, before the timed fragment.
  // Reject any non-scroll action, even if the model later claims completion.
  let unexpectedAction = false;
  const remove = agent.addProgressListener(event => {
    const data = event.data as { action?: { name?: string } } | undefined;
    if (event.scope === 'aiAct' && event.phase === 'action_running' && data?.action?.name !== 'Scroll') unexpectedAction = true;
  });
  try {
    await agent.aiAct('Before the timed video fragment, make the buttons labeled exactly ' + JSON.stringify(labels[0]) + ' and ' + JSON.stringify(labels[1]) + ' visible together. Scroll inside the actual gray video demo panel only if needed. Do not tap any button, change playback or scroll the blank area outside the panel.', { deepLocate: false, cacheable: false });
  } finally { remove(); }
  if (unexpectedAction) throw new Error('Video visibility preparation performed a non-scroll action.');
  const points: number[][] = [];
  for (const label of labels) {
    const result = await agent.aiLocate('The single visible button labeled exactly ' + JSON.stringify(label) + ' in the video demo panel. Locate the actual button, not the status text or blank space.', { deepLocate: false, cacheable: false });
    if (!Array.isArray(result?.center) || result.center.length !== 2
      || result.center.some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error('Invalid visual point for original timed video action.');
    }
    points.push([...result.center]);
  }
  if (isDeepStrictEqual(points[0], points[1])) throw new Error('Distinct original video buttons resolved to the same point.');
  const tap = (index: number) => agent.callActionInActionSpace('Tap', {
    locate: { prompt: labels[index], locatedPixelResult: { center: [...points[index]] }, deepLocate: false, cacheable: false },
  });
  await tap(0);
  for (const input of expected) await assertSource(structuredClone(input));
  await captureEvidence();
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
