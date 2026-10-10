import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTestProject } from '@midscene/test/config';
const root = fileURLToPath(new URL('../', import.meta.url));
let nextRunId = 0;
async function fixture() {
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects[0];
  const reports = [], reads = [], taps = [];
  let state = 'ready';
  const agent = {
    aiLocate: async prompt => ({ center: prompt.includes('"Src B"') ? [200, 100] : [100, 100] }),
    callActionInActionSpace: async (type, input) => { taps.push([type, input]); state = taps.length === 1 ? 'playing' : 'ready'; },
    addProgressListener: () => () => {},
    aiAct: async () => { assert.equal(taps.length, 0, 'Only visibility preparation may plan before playback'); },
    recordToReport: async (...args) => reports.push(args),
  };
  const context = { platform: 'android', agentRegistry: { getAgent: async () => agent },
    getNativeSession: async () => ({
      readDocument: async () => {
        reads.push(state);
        return { nodeId: 0, nodeName: '#document', children: [
          { nodeId: 1, nodeName: 'TEXT', attributes: ['lynx-test-tag', 'status-text'], children: [
            { nodeId: 2, nodeName: 'RAW-TEXT', attributes: ['text', state] },
          ] },
        ] };
      },
      captureFrame: async () => ({ data: Buffer.from('protocol-frame-marker').toString('base64') }),
    }) };
  const runId = 'phase-node-' + ++nextRunId;
  return { reports, reads, taps,
    run: (name, input) => project.nodes.get(name).execute({ scope: 'case', case: { runId }, context, input }) };
}
test('collected timed node preserves the SDK action contract and reports source-time evidence after exact consumption', async () => {
  const f = await fixture();
  await f.run('native.videoPhase', { phase: 'replace-playing-source' });
  await f.run('native.video', { tag: 'status-text', equal: 'playing', timeoutMs: 20000 });
  assert.deepEqual(f.reads, ['playing', 'playing']);
  assert.equal(f.taps.length, 2);
  assert.equal(f.reports.length, 1);
  assert.equal(f.reports[0][1].screenshots[0].base64, 'data:image/jpeg;base64,' + Buffer.from('protocol-frame-marker').toString('base64'));
  await assert.rejects(f.run('native.videoPhase', { phase: 'arbitrary' }), /Unknown/);
});
test('phase nodes reject arbitrary input, duplicate execution and changed assertion identity', async () => {
  const f = await fixture();
  await assert.rejects(f.run('native.videoPhase', { phase: 'replace-playing-source', timeoutMs: 99999 }), /Invalid/);
  await f.run('native.videoPhase', { phase: 'replace-playing-source' });
  await assert.rejects(f.run('native.videoPhase', { phase: 'stop-play-null' }), /not been consumed/);
  assert.equal(f.taps.length, 2);
  await assert.rejects(f.run('native.video', { tag: 'status-text', equal: 'ended', timeoutMs: 20000 }), /identity or order/);
});

test('complete playback readiness uses the real registered node without planning, taps or extra reads', async () => {
  const f = await fixture();
  await f.run('native.videoPhase', { phase: 'basic-ready' });
  assert.deepEqual(f.reads, ['ready']);
  assert.deepEqual(f.taps, []);
  assert.deepEqual(f.reports, []);
  await assert.rejects(f.run('native.videoPhase', { phase: 'basic-ready', timeoutMs: 99999 }), /Invalid/);
});

test('complete playback nodes cannot bypass an unconsumed boundary assertion', async () => {
  const f = await fixture();
  await f.run('native.videoPhase', { phase: 'replace-playing-source' });
  await assert.rejects(f.run('native.videoPhase', { phase: 'basic-playback' }), /not been consumed/);
  assert.equal(f.taps.length, 2);
});
