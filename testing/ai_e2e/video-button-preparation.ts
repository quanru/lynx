import { isDeepStrictEqual } from 'node:util';
import type { VideoTimedAgent } from './video-action-phase.ts';

// All model work precedes the source-bound playback fragment. Cached points
// are local to this fragment and may not survive navigation or scrolling.
export async function makeVideoButtonsVisible(agent: VideoTimedAgent, labels: readonly string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const unique = [...new Set(labels)];
  if (!unique.length) return;
  let unexpectedAction = false;
  const remove = agent.addProgressListener(event => {
    const data = event.data as { action?: { name?: string } } | undefined;
    if (event.scope === 'aiAct' && event.phase === 'action_running' && data?.action?.name !== 'Scroll') unexpectedAction = true;
  });
  try {
    await agent.aiAct('Before the timed video fragment, make these buttons visible together: ' + unique.map(label => JSON.stringify(label)).join(', ') + '. The blue controls use crowded fixed-width rows: their labels may be truncated even when the buttons are fully on screen. The seek row directly below Clear/Play/Play Null/Pause/Stop starts with Seek 0s, then Seek 2s, then Near End; Seek 2s is the SECOND blue control in that row, not the status text. Use the visible row and neighbors to identify a truncated label. If the target button bodies are already on screen, finish without scrolling; scrolling cannot reveal text clipped inside a button. Scroll inside the actual gray video demo panel only if a button body is off screen. Do not tap any button, change playback or scroll the blank area outside the panel.', { deepLocate: false, cacheable: false, ...(signal ? { abortSignal: signal } : {}) });
  } finally { remove(); }
  signal?.throwIfAborted();
  if (unexpectedAction) throw new Error('Video visibility preparation performed a non-scroll action.');
}

export async function locateVideoButton(agent: VideoTimedAgent, label: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const result = await agent.aiLocate('The single visible button labeled exactly ' + JSON.stringify(label) + ' in the video demo panel. Labels in crowded blue rows can be truncated. Locate the center INSIDE the actual blue button body, not its text baseline, status text or blank space. For Seek 2s, use the second control in the seek row directly below Clear/Play/Play Null/Pause/Stop, between Seek 0s and Near End.', { deepLocate: true, cacheable: false });
  // The pinned aiLocate API cannot abort an in-flight request. Never accept a
  // late result or start a subsequent physical action after cancellation.
  signal?.throwIfAborted();
  if (!Array.isArray(result?.center) || result.center.length !== 2 || result.center.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid visual point for original timed video action.');
  return [...result.center];
}

export async function prepareVideoButtons(agent: VideoTimedAgent, labels: readonly string[], signal?: AbortSignal) {
  await makeVideoButtonsVisible(agent, labels, signal);
  const unique = [...new Set(labels)];
  const points = new Map<string, number[]>();
  for (const label of unique) {
    const center = await locateVideoButton(agent, label, signal);
    if ([...points.values()].some(point => isDeepStrictEqual(point, center))) throw new Error('Distinct original video buttons resolved to the same point.');
    points.set(label, center);
  }
  return points;
}

export async function tapPreparedVideoButton(agent: VideoTimedAgent, label: string, points: ReadonlyMap<string, number[]>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const center = points.get(label);
  if (!center) throw new Error('Original video button was not visually prelocated.');
  await agent.callActionInActionSpace('Tap', { locate: { prompt: label, locatedPixelResult: { center: [...center] }, deepLocate: false, cacheable: false } });
  signal?.throwIfAborted();
}
