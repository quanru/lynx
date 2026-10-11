import { isDeepStrictEqual } from 'node:util';
import type { VideoTimedAgent } from './video-action-phase.ts';
import { locateVideoButton, makeVideoButtonsVisible } from './video-button-preparation.ts';
import { videoPlaybackOperations } from './video-playback-phase.ts';
import type { VideoPlaybackPhase } from './video-playback-phase.ts';

// A case/attempt owns these points. Each model request is a separate runner
// step, and the complete, one-shot result is consumed before playback starts.
export class VideoPhasePreparation {
  private pending = new Map<string, { phase: VideoPlaybackPhase; labels: string[]; points: Map<string, number[]>; busy: boolean }>();

  async prepare(runId: string, phase: VideoPlaybackPhase, stage: 'visibility' | number, agent: VideoTimedAgent, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const labels = [...new Set(videoPlaybackOperations(phase).filter(op => op.type === 'tap').map(op => op.label))];
    if (!labels.length) throw new Error('Readiness does not require video preparation.');
    let state = this.pending.get(runId);
    if (stage === 'visibility') {
      if (state) throw new Error('Previous video preparation has not been consumed.');
      state = { phase, labels, points: new Map(), busy: true };
      this.pending.set(runId, state);
      try {
        await makeVideoButtonsVisible(agent, labels, signal);
        signal?.throwIfAborted();
        if (this.pending.get(runId) !== state) throw new Error('Video preparation was released.');
        state.busy = false;
      } catch (error) { this.release(runId); throw error; }
      return;
    }
    if (!state || state.phase !== phase || state.busy || !Number.isInteger(stage) || stage !== state.points.size || stage >= labels.length) throw new Error('Invalid video preparation phase or location order.');
    state.busy = true;
    try {
      const center = await locateVideoButton(agent, labels[stage], signal);
      signal?.throwIfAborted();
      if (this.pending.get(runId) !== state) throw new Error('Video preparation was released.');
      if ([...state.points.values()].some(point => isDeepStrictEqual(point, center))) throw new Error('Distinct original video buttons resolved to the same point.');
      state.points.set(labels[stage], center);
      state.busy = false;
    } catch (error) { this.release(runId); throw error; }
  }

  consume(runId: string, phase: VideoPlaybackPhase) {
    const state = this.pending.get(runId);
    if (!state) return undefined;
    if (state.phase !== phase || state.busy || state.points.size !== state.labels.length) throw new Error('Incomplete or mismatched video preparation.');
    this.pending.delete(runId);
    return new Map([...state.points].map(([label, center]) => [label, [...center]]));
  }

  release(runId: string) { this.pending.delete(runId); }
}
