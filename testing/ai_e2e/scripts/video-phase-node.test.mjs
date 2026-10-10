import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTestProject } from '@midscene/test/config';

const { AgentProgressBus } = await import(new URL('../node_modules/@midscene/core/dist/es/agent/progress/progress-bus.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
let nextRunId = 0;

async function fixture() {
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects[0];
  const bus = new AgentProgressBus();
  const reports = [];
  const reads = [];
  let state = 'ready';
  const agent = {
    addProgressListener: listener => bus.subscribe(listener),
    aiAct: () => assert.fail('The observer must never drive a UI action'),
    recordToReport: async (...args) => { reports.push(args); },
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
  return { bus, reports, reads, setState: value => { state = value; },
    run: (name, input) => project.nodes.get(name).execute({ scope: 'case', case: { runId }, context, input }),
    emit: phase => bus.publish('aiAct', phase, { action: { name: 'Tap' } }) };
}

test('collected native nodes report action-time evidence and consume only source-bound assertions', async () => {
  const f = await fixture();
  await f.run('native.videoPhase', { phase: 'replace-playing-source' });
  await f.emit('start');
  await f.emit('action_running');
  f.setState('playing');
  await f.emit('action_done');
  await f.emit('action_running');
  f.setState('ready');
  await f.emit('action_done');
  await f.emit('complete');
  await f.run('native.video', { tag: 'status-text', equal: 'playing', timeoutMs: 20000 });
  assert.deepEqual(f.reads, ['playing', 'playing']);
  assert.equal(f.reports.length, 1);
  assert.equal(f.reports[0][1].screenshots.length, 1);
  assert.equal(f.reports[0][1].screenshots[0].base64, 'data:image/jpeg;base64,' + Buffer.from('protocol-frame-marker').toString('base64'));
  assert.equal(f.bus.listenerCount, 0);
  await assert.rejects(f.run('native.videoPhase', { phase: 'arbitrary' }), /Unknown/);
});

test('phase nodes reject arbitrary assertions and duplicate arming', async () => {
  const f = await fixture();
  await assert.rejects(f.run('native.videoPhase', { phase: 'replace-playing-source', timeoutMs: 99999 }), /Invalid/);
  await f.run('native.videoPhase', { phase: 'replace-playing-source' });
  await assert.rejects(f.run('native.videoPhase', { phase: 'stop-play-null' }), /not been consumed/);
  await f.emit('start');
  await f.emit('action_running');
  f.setState('playing');
  await f.emit('action_done');
  await f.emit('action_running');
  await f.emit('action_done');
  await f.emit('complete');
  await assert.rejects(f.run('native.video', { tag: 'status-text', equal: 'ended', timeoutMs: 20000 }), /identity or order/);
});
