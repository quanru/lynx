import type { AgentProgressEvent, AgentProgressListener } from '@midscene/core';
import { isDeepStrictEqual } from 'node:util';
import type { VideoExpectation } from './video-expectation.ts';

export interface VideoProgressSource {
  addProgressListener(listener: AgentProgressListener): () => void;
}

// Read-only observer for a two-click aiAct phase. It never selects, locates,
// clicks, scrolls or fabricates a document. Source assertions run at the first
// actual action completion, before any later model planning can outlive media.
export function observeVideoActionPhase(
  agent: VideoProgressSource,
  checks: readonly VideoExpectation[],
  assertSource: (input: VideoExpectation) => Promise<void>,
  assertStillPlaying: () => Promise<void>,
  captureEvidence: () => Promise<void>,
) {
  if (!checks.length || checks[0].tag !== 'status-text' || !('equal' in checks[0]) || checks[0].equal !== 'playing') {
    throw new Error('Video action phase requires the original playing assertion first.');
  }
  const expected = checks.map(input => structuredClone(input));
  let started = false;
  let running = false;
  let taps = 0;
  let checked = false;
  let complete = false;
  let consumed = 0;
  let disposed = false;
  let failure: Error | undefined;
  const fail = (message: string) => { failure ??= new Error(message); };
  const listen = async (event: AgentProgressEvent) => {
    if (disposed || event.scope !== 'aiAct') return;
    const data = event.data as { action?: { name?: string }; error?: string } | undefined;
    try {
      if (event.phase === 'start') {
        if (started) throw new Error('Video phase cannot accept another aiAct instruction.');
        started = true;
      } else if (event.phase === 'action_running' && data?.action?.name === 'Tap') {
        if (!started || complete || running || taps >= 2) throw new Error('Unexpected extra or out-of-order video tap.');
        if (taps === 1) {
          if (!checked || failure) throw new Error('Second video tap cannot precede successful original assertions.');
          // Do not replay a cached playing value after the video has ended.
          // This fresh read is immediately before the second physical action.
          await assertStillPlaying();
        }
        running = true;
      } else if (event.phase === 'action_done' && data?.action?.name === 'Tap') {
        if (!running || complete) throw new Error('Video tap completion has no matching action start.');
        running = false;
        taps++;
        if (taps === 1) {
          for (const input of expected) await assertSource(input);
          await captureEvidence();
          checked = true;
        }
      } else if (event.phase === 'action_failed' || event.phase === 'failed') {
        throw new Error(`Video aiAct phase failed: ${data?.error ?? event.phase}`);
      } else if (event.phase === 'complete') {
        if (!started || running || taps !== 2 || !checked) throw new Error('Video phase requires exactly two completed taps and all original assertions.');
        complete = true;
      }
    } catch (error) {
      // SDK progress listeners deliberately swallow exceptions. Persist every
      // observer failure and surface it through the following assertion node.
      failure ??= error instanceof Error ? error : new Error(String(error));
    }
  };
  const remove = agent.addProgressListener(listen);
  return {
    async consume(input: VideoExpectation) {
      if (disposed) throw new Error('Video phase evidence was disposed.');
      if (failure) throw failure;
      if (!complete) throw new Error('Video phase did not complete before assertion consumption.');
      if (!isDeepStrictEqual(input, expected[consumed])) {
        fail('Video phase assertion identity or order differs from the original.');
        throw failure;
      }
      consumed++;
      return consumed === expected.length;
    },
    dispose() {
      if (!disposed) remove();
      disposed = true;
    },
  };
}

export type VideoActionPhase = 'replace-playing-source' | 'stop-play-null';

export function videoActionPhaseChecks(phase: VideoActionPhase): VideoExpectation[] {
  const playing: VideoExpectation = { tag: 'status-text', equal: 'playing', timeoutMs: 20000 };
  if (phase === 'replace-playing-source') return [playing];
  if (phase === 'stop-play-null') return [playing,
    { tag: 'callback-log', contains: 'play_ok', timeoutMs: 20000 },
    { tag: 'callback-log', contains: 'success=true', timeoutMs: 20000 }];
  throw new Error('Unknown original video action phase.');
}
