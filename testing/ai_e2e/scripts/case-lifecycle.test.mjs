import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { nativeFixture } from '../native-fixtures.ts';

const source = readFileSync(new URL('../midscene.config.ts', import.meta.url), 'utf8');
const yaml = readFileSync(new URL('../cases/native/explorer.yaml', import.meta.url), 'utf8');
const require = createRequire(new URL('../midscene.config.ts', import.meta.url));

function loadProject(failLaunch = false, visibleBinding = false) {
  const events = [];
  let id = 0;
  class Device {
    constructor() { this.id = ++id; }
    async connect() { events.push([this.id, 'connect']); }
    async terminate(app) { events.push([this.id, 'terminate', app]); }
    async launch(app) {
      events.push([this.id, 'launch', app]);
      if (failLaunch) throw new Error('launch failed');
    }
    async destroy() { events.push([this.id, 'destroy']); }
  }
  class Agent {
    constructor(device, options) { this.device = device; this.options = options; }
    async destroy() { await this.device.destroy(); }
  }
  const modules = {
    '@midscene/android': { AndroidAgent: Agent, AndroidDevice: Device, getConnectedDevices: async () => [{ udid: 'test-device' }] },
    '@midscene/ios': { IOSAgent: Agent, IOSDevice: Device },
    '@midscene/test/config': { defineProjectSetup: x => x, defineTestProject: x => x },
    '@midscene/test': { defineNode: x => x },
    '@midscene/test/midscene': { createMidsceneNodes: () => [] },
    './scripts/devtool-client.mjs': { connectDevtool: async () => ({
      refreshSessions: async () => [{ session_id: 7 }],
      request: async () => ({ root: { nodeId: 0, nodeName: 'view', children:
        nativeFixture('domFocus').tags.map((tag, index) => ({ nodeId: index + 1,
          nodeName: 'view', attributes: ['lynx-test-tag', tag] })) } }),
      close: () => events.push(['native', 'close']),
    }) },
  };
  const module = { exports: {} };
  if (visibleBinding) modules['./native-visible-sessions.ts'] = { createVisibleNativeSessions() {
    const active = new Set();
    return {
      async observe(runId, tag) {
        active.add(runId);
        events.push(['visible', 'observe', runId, tag]);
        return { sessionId: 7, viewId: 'homepage', readDocument: async () => ({ nodeId: 0, nodeName: '#document', children: [
          { nodeId: 1, nodeName: 'text', attributes: ['lynx-test-tag', 'bundle-runtime-label'], children: [
            { nodeId: 2, nodeName: 'raw-text', attributes: ['text', 'Open with Lynx'] },
          ] },
        ] }) };
      },
      release(runId) { if (active.delete(runId)) events.push(['visible', 'close', runId]); },
      releaseAll() { for (const runId of [...active]) this.release(runId); },
    };
  } };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => modules[name] ?? require(name), process });
  return { project: module.exports.default, events };
}

for (const name of ['android-explorer', 'ios-explorer']) {
  test(`${name} restarts once per case, reuses within a case and releases devices`, async () => {
    const { project, events } = loadProject();
    const context = await project.projects.find(p => p.name === name).setup.setup({ onTeardown() {} });
    const first = await context.agentRegistry.getAgent('case-1');
    assert.equal(await context.agentRegistry.getAgent('case-1'), first);
    const second = await context.agentRegistry.getAgent('case-2');
    assert.notEqual(first, second);
    for (const agent of [first, second]) {
      assert.match(agent.options.aiContexts.aiAct, /active action protocol/);
      assert.match(agent.options.aiContexts.aiAct, /x \/ screenshot width \* 1000/);
      assert.match(agent.options.aiContexts.aiAct, /y \/ screenshot height \* 1000/);
      assert.match(agent.options.aiContexts.aiAct, /Do not label raw screenshot pixels as normalized coordinates/);
      const steps = events.filter(e => e[0] === agent.device.id).map(e => e[1]);
      assert.deepEqual(steps, ['connect', 'terminate', 'launch']);
    }
    await context.agentRegistry.releaseAgent('case-1');
    await context.agentRegistry.releaseAgent('case-2');
    assert.equal(events.filter(e => e[1] === 'destroy' && [first.device.id, second.device.id].includes(e[0])).length, 2);
  });

  test(`${name} retains cleanup ownership when launch fails`, async () => {
    const { project, events } = loadProject(true);
    const context = await project.projects.find(p => p.name === name).setup.setup({ onTeardown() {} });
    await assert.rejects(context.agentRegistry.getAgent('case-1'), /launch failed/);
    const launchedId = events.find(e => e[1] === 'launch')[0];
    assert.equal(await context.agentRegistry.releaseAgent('case-1'), undefined);
    assert.ok(events.some(e => e[0] === launchedId && e[1] === 'destroy'));
  });

  test(`${name} releases case native sockets before devices and cleans project sockets`, async () => {
    const { project, events } = loadProject();
    const teardowns = [];
    const context = await project.projects.find(p => p.name === name).setup.setup({ onTeardown(fn) { teardowns.push(fn); } });
    await context.getNativeSession('case-1', 'domFocus');
    const agent = await context.agentRegistry.getAgent('case-1');
    await context.agentRegistry.releaseAgent('case-1');
    const closeIndex = events.findIndex(event => event[0] === 'native');
    const destroyIndex = events.findIndex(event => event[0] === agent.device.id && event[1] === 'destroy');
    assert.ok(closeIndex >= 0 && closeIndex < destroyIndex);
    await context.getNativeSession('case-2', 'domFocus');
    for (const teardown of teardowns) await teardown();
    assert.equal(events.filter(event => event[0] === 'native').length, 2);
    await context.agentRegistry.releaseAgent('case-2');
    assert.equal(events.filter(event => event[0] === 'native').length, 2);
  });
}

test('Native YAML retains assertions but uses standard readiness nodes', () => {
  assert.doesNotMatch(source + yaml, /explorer\.open|openExplorerNode/);
  assert.doesNotMatch(yaml, /- wait:/);
  assert.equal((yaml.match(/- aiAssert:/g) ?? []).length, 4);
  assert.match(yaml, /scaleToFill.*aspectFit/);
});

test('Sparkling handles belong to one iOS attempt and close before its device, never reopening after release or teardown', async () => {
  const { project, events } = loadProject(false, true);
  const teardowns = [];
  const context = await project.projects.find(p => p.name === 'ios-explorer').setup.setup({ onTeardown(fn) { teardowns.push(fn); } });
  await context.runSparklingContract('case-1', { contract: 'home' });
  await context.runSparklingContract('case-1', { contract: 'runtime', runtime: 'lynx' });
  const agent = await context.agentRegistry.getAgent('case-1');
  await context.agentRegistry.releaseAgent('case-1');
  const close = events.findIndex(e => e[0] === 'visible' && e[1] === 'close');
  const destroy = events.findIndex(e => e[0] === agent.device.id && e[1] === 'destroy');
  assert.ok(close >= 0 && close < destroy);
  const launches = events.filter(e => e[1] === 'launch').length;
  await assert.rejects(context.runSparklingContract('case-1', { contract: 'home' }), /released/);
  await assert.rejects(context.agentRegistry.getAgent('case-1'), /released/);
  assert.equal(events.filter(e => e[1] === 'launch').length, launches);
  await assert.rejects(context.runSparklingContract('case-2', { contract: 'runtime', runtime: 'lynx' }), /homepage binding/);
  await context.agentRegistry.releaseAgent('case-2');
  await context.runSparklingContract('case-3', { contract: 'home' });
  for (const teardown of teardowns) await teardown();
  await assert.rejects(context.agentRegistry.getAgent('new-case'), /released/);
  await context.agentRegistry.releaseAgent('case-3');
  assert.equal(events.filter(e => e[0] === 'visible' && e[1] === 'close').length, 2);
});
