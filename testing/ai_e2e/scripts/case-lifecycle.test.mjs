import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../midscene.config.ts', import.meta.url), 'utf8');
const yaml = readFileSync(new URL('../cases/native/explorer.yaml', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

function loadProject(failLaunch = false) {
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
    constructor(device) { this.device = device; }
    async destroy() { await this.device.destroy(); }
  }
  const modules = {
    '@midscene/android': { AndroidAgent: Agent, AndroidDevice: Device, getConnectedDevices: async () => [{ udid: 'test-device' }] },
    '@midscene/ios': { IOSAgent: Agent, IOSDevice: Device },
    '@midscene/test/config': { defineProjectSetup: x => x, defineTestProject: x => x },
    '@midscene/test/midscene': { createMidsceneNodes: () => [] },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => modules[name] ?? require(name), process });
  return { project: module.exports.default, events };
}

for (const name of ['android-explorer', 'ios-explorer']) {
  test(`${name} restarts once per case, reuses within a case and releases devices`, async () => {
    const { project, events } = loadProject();
    const context = await project.projects.find(p => p.name === name).setup.setup({});
    const first = await context.agentRegistry.getAgent('case-1');
    assert.equal(await context.agentRegistry.getAgent('case-1'), first);
    const second = await context.agentRegistry.getAgent('case-2');
    assert.notEqual(first, second);
    for (const agent of [first, second]) {
      const steps = events.filter(e => e[0] === agent.device.id).map(e => e[1]);
      assert.deepEqual(steps, ['connect', 'terminate', 'launch']);
    }
    await context.agentRegistry.releaseAgent('case-1');
    await context.agentRegistry.releaseAgent('case-2');
    assert.equal(events.filter(e => e[1] === 'destroy' && [first.device.id, second.device.id].includes(e[0])).length, 2);
  });

  test(`${name} retains cleanup ownership when launch fails`, async () => {
    const { project, events } = loadProject(true);
    const context = await project.projects.find(p => p.name === name).setup.setup({});
    await assert.rejects(context.agentRegistry.getAgent('case-1'), /launch failed/);
    const launchedId = events.find(e => e[1] === 'launch')[0];
    assert.equal(await context.agentRegistry.releaseAgent('case-1'), undefined);
    assert.ok(events.some(e => e[0] === launchedId && e[1] === 'destroy'));
  });
}

test('Native YAML retains assertions but uses standard readiness nodes', () => {
  assert.doesNotMatch(source + yaml, /explorer\.open|openExplorerNode/);
  assert.doesNotMatch(yaml, /- wait:/);
  assert.equal((yaml.match(/- aiAssert:/g) ?? []).length, 4);
  assert.match(yaml, /scaleToFill.*aspectFit/);
});
