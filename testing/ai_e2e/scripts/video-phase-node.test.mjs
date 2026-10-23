import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadTestProject } from '@midscene/test/config';
import { buildTestRunReportDump, collectWorkflowDocument, runWorkflowDocument } from '@midscene/test';
import { TestRunReportAssembler } from '@midscene/core/report';
import { testRunDump } from './render-ci-summary.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
let nextRunId = 0;
async function fixture() {
  const controller = new AbortController();
  const project = (await loadTestProject(root + 'midscene.config.ts')).projects[0];
  const reports = [], reads = [], taps = [];
  let state = 'ready';
  const agent = {
    getUIContext: async () => ({ shrunkShotToLogicalRatio: 1, shotSize: { width: 1206, height: 2622 } }),
    aiLocate: async prompt => ({ center: prompt.includes('"Src B"') ? [200, 100] : [100, 100] }),
    interface: { inputPrimitives: { pointer: { tap: async point => { taps.push(point); state = taps.length === 1 ? 'playing' : 'ready'; } } } },
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
  return { reports, reads, taps, controller, agent, project, context,
    run: (name, input) => project.nodes.get(name).execute({ scope: 'case', case: { runId }, context, input, signal: controller.signal }) };
}
test('real SDK execution and assembled HTML retain successful and failed native assertion evidence', async t => {
  const f = await fixture();
  const sourcePath = 'scripts/fixtures/assertion-report.yaml';
  const resolveNode = name => f.project.nodes.get(name);
  const document = collectWorkflowDocument({ projectId: f.project.projectId,
    projectName: f.project.name, sourcePath, absolutePath: root + sourcePath }, { resolveNode });
  const steps = [];
  const execution = await runWorkflowDocument(document, { resolveNode, projectContext: f.context,
    onStepResult: (_info, result) => { steps.push(result); } });
  assert.deepEqual(steps.map(step => step.status), ['success', 'failed']);
  const observations = [steps[0].output.data.observations[0], steps[1].error.details.evidence.observations[0]];
  assert.deepEqual(observations.map(item => item.actual), ['ready', 'ready']);
  assert.deepEqual(observations.map(item => item.matched), [true, false]);
  assert.match(steps[1].error.message, /Original video assertion failed/);
  assert.deepEqual(f.reads, ['ready', 'ready']);
  assert.deepEqual(f.taps, []);
  assert.deepEqual(f.reports, []);
  const outputDir = await mkdtemp(join(tmpdir(), 'native-assertion-report-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const now = new Date().toISOString();
  const report = await new TestRunReportAssembler().assembleAsync({
    outputDir, reportFileName: 'assertion-evidence', sources: [],
    buildRunnerDump: index => buildTestRunReportDump({
      runId: 'assertion-evidence-test', status: 'failed', startedAt: now, endedAt: now, durationMs: 0,
      summary: { total: 2, passed: 1, failed: 1, notRun: 0, filtered: 0, collectionErrors: 0, documentFailures: 0, projectFailures: 0 },
      projects: [{ projectId: f.project.projectId, name: f.project.name, status: 'failed', retry: 0,
        cases: execution.cases.map(item => ({ ...item, documentId: document.documentId })),
        documents: [execution.document], collectionErrors: [] }],
    }, index),
  });
  const dump = testRunDump(await readFile(report, 'utf8'));
  const cases = dump.projects.flatMap(project => project.documents.flatMap(doc => doc.cases));
  assert.deepEqual(cases.map(item => item.status), ['success', 'failed']);
  const reportSteps = cases.map(item => item.attempts[0].steps[0]);
  assert.equal(reportSteps[0].output.data.value.observations[0].actual, 'ready');
  assert.equal(reportSteps[1].error.details.value.evidence.observations[0].actual, 'ready');
  assert.equal(reportSteps[1].error.details.value.evidence.observations[0].matched, false);
});
test('ordinary video node returns the original observed value without screenshots or extra reads', async () => {
  const f = await fixture();
  const input = { tag: 'status-text', equal: 'ready', immediate: true };
  const result = await f.run('native.video', input);
  assert.match(result.summary, /Verified status-text: "ready"/);
  assert.equal(result.data.observations.length, 1);
  const observation = result.data.observations[0];
  assert.deepEqual(observation.expected, input);
  assert.equal(observation.actual, 'ready');
  assert.equal(observation.matched, true);
  assert.ok(Number.isFinite(observation.observedAt));
  assert.deepEqual(f.reads, ['ready']);
  assert.deepEqual(f.taps, []);
  assert.deepEqual(f.reports, []);
});

test('the registered native node rejects an expired runner signal before readiness reads or playback', async () => {
  const f = await fixture();
  const reason = new Error('Original runner timeout');
  f.controller.abort(reason);
  for (const phase of ['basic-ready', 'basic-play-pause', 'replace-playing-source']) {
    await assert.rejects(f.run('native.videoPhase', { phase }), error => error === reason);
  }
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.taps, []);
  assert.deepEqual(f.reports, []);
});
test('collected timed node preserves the SDK action contract and reports source-time evidence after exact consumption', async () => {
  const f = await fixture();
  const phaseResult = await f.run('native.videoPhase', { phase: 'replace-playing-source' });
  const result = await f.run('native.video', { tag: 'status-text', equal: 'playing', timeoutMs: 20000 });
  assert.deepEqual(phaseResult.data.observations.map(item => item.actual), ['playing', 'playing']);
  assert.equal(result.data.observations.length, 1);
  assert.equal(result.data.observations[0].actual, 'playing', 'Retain the earlier playing sample, not the ready state after switching source');
  assert.equal(result.data.observations[0].matched, true);
  assert.match(result.summary, /earlier action-time checkpoint/);
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
  await assert.rejects(f.run('native.videoPhase', { phase: 'basic-play-pause' }), /not been consumed/);
  assert.equal(f.taps.length, 2);
});

test('registered playback preparation has separate model-only steps and cannot bypass missing or partial grounding', async () => {
  const f = await fixture();
  let locations = 0;
  f.agent.aiLocate = async () => ({ center: [100 + ++locations * 50, 100] });
  await assert.rejects(f.run('native.videoPhase', { phase: 'basic-loop' }), /Missing case-owned/);
  await f.run('native.videoPhase', { phase: 'basic-loop', prepare: 'visibility' });
  await assert.rejects(f.run('native.videoPhase', { phase: 'basic-loop' }), /Incomplete/);
  await f.run('native.videoPhase', { phase: 'basic-loop', prepare: 0 });
  await f.run('native.videoPhase', { phase: 'basic-loop', prepare: 1 });
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.taps, []);
  assert.equal(locations, 2);
  f.controller.abort(new Error('runner deadline'));
  await assert.rejects(f.run('native.videoPhase', { phase: 'basic-loop' }), /runner deadline/);
  assert.deepEqual(f.taps, []);
});
