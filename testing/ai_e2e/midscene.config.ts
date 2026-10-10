import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
import { IOSAgent, IOSDevice } from '@midscene/ios';
import { defineNode } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import type { AgentProvider, AgentReleaseResult, MidsceneUIAgent } from '@midscene/test/midscene';
import { connectDevtool } from './scripts/devtool-client.mjs';
import { createNativeSessions } from './native-sessions.ts';
import { fixtureUri, nativeFixture } from './native-fixtures.ts';
import type { NativeFixtureName } from './native-fixtures.ts';
import { expectNativeValue } from './native-expectation.ts';
import type { NativeExpectInput } from './native-expectation.ts';
import { runNativeCommand } from './native-command.ts';
import type { NativeCommandInput } from './native-command.ts';
import { expectNativePixels } from './native-pixels.ts';
import { readVisibleViewEvidence } from './native-view-evidence.ts';
import { createOwnedDeviceVisibilityReader } from './native-wda.ts';
import { createVisibleNativeSessions } from './native-visible-sessions.ts';
import { createSparklingContracts, sparklingRoutes } from './sparkling-contracts.ts';
import type { SparklingContract } from './sparkling-contracts.ts';
import { readOwnedRouteAlert, deliverOwnedExternalRoute } from './sparkling-native-io.ts';

// @midscene/core writes agent reports to
// <cwd>/midscene_run/report/<reportFileName>.html. releaseAgent must return the
// same absolute path so the test-run report can embed each case's step details.
// Sharing one agent would attach details to the wrong scope and mark the summary unresolved.
const reportDir = resolve('./midscene_run/report');
const reportPath = (prefix: string, runId: string) => resolve(reportDir, `${prefix}-${runId}.html`);
const aiContexts = {
  aiAct: 'Follow the coordinate format requested by the active action protocol. When it requests normalized 0–1000 coordinates, convert screenshot pixel positions using x / screenshot width * 1000 and y / screenshot height * 1000 before emitting locate.point. Do not label raw screenshot pixels as normalized coordinates. The center of the full screenshot is [500, 500] in that normalized format, regardless of its pixel dimensions. Check that the converted point lies inside the described target, using its left/right and upper/lower relationships.',
};

// Project context produced by setup and available to YAML nodes. Each project
// has one registry that creates and releases agents lazily by case runId.
interface AgentRegistry {
  getAgent(runId: string): MidsceneUIAgent | Promise<MidsceneUIAgent>;
  releaseAgent(runId: string): Promise<AgentReleaseResult | void>;
}

interface ProjectContext {
  platform: 'android' | 'ios';
  agentRegistry: AgentRegistry;
  getNativeSession(runId: string, fixture: NativeFixtureName): ReturnType<ReturnType<typeof createNativeSessions>['get']>;
  getNativeViewEvidence?(runId: string): ReturnType<typeof readVisibleViewEvidence>;
  runSparklingContract?(runId: string, input: SparklingContract): Promise<void>;
}

const nativeExpectNode = defineNode<NativeExpectInput & { fixture: NativeFixtureName }, void, ProjectContext>({
  name: 'native.expect',
  description: 'Preserve original native test-tag text, existence and inline attribute assertions through CDP.',
  async execute(execution) {
    if (execution.scope !== 'case') throw new Error('native.expect requires case scope.');
    const session = await execution.context.getNativeSession(execution.case.runId, execution.input.fixture);
    await expectNativeValue(session.readDocument, execution.input);
  },
});

const sparklingNode = defineNode<SparklingContract, void, ProjectContext>({
  name: 'native.sparkling',
  description: 'Preserve original iOS Sparkling visible-session, route, capability and native XElement input contracts.',
  async execute(execution) {
    if (execution.scope !== 'case' || execution.context.platform !== 'ios' || !execution.context.runSparklingContract) {
      throw new Error('Sparkling contracts require an iOS case-owned session.');
    }
    await execution.context.runSparklingContract(execution.case.runId, execution.input);
  },
});

const nativeCommandNode = defineNode<NativeCommandInput & { fixture: NativeFixtureName }, void, ProjectContext>({
  name: 'native.cdp',
  description: 'Execute original DOM.focus or Input.insertText protocol contracts against the bound fixture session.',
  async execute(execution) {
    if (execution.scope !== 'case') throw new Error('native.cdp requires case scope.');
    const session = await execution.context.getNativeSession(execution.case.runId, execution.input.fixture);
    await runNativeCommand(session, execution.input);
  },
});

const nativePixelsNode = defineNode<{ fixture: 'textEvent' | 'image' | 'layoutLinear'; baseline: 'text_flattern_element' | 'image' | 'layout_linear'; tag?: 'flatten-text' }, void, ProjectContext>({
  name: 'native.pixels',
  description: 'Preserve the original cropped native JPEG-stream pixel baseline and grayscale threshold.',
  async execute(execution) {
    if (execution.scope !== 'case') throw new Error('Invalid native pixel scope.');
    const contracts = { textEvent: 'text_flattern_element', image: 'image', layoutLinear: 'layout_linear' };
    if (!Object.hasOwn(contracts, execution.input.fixture)
      || contracts[execution.input.fixture] !== execution.input.baseline) throw new Error('Invalid native pixel fixture.');
    const session = await execution.context.getNativeSession(execution.case.runId, execution.input.fixture);
    await expectNativePixels(session, execution.context.platform, execution.case.runId,
      execution.input.baseline, execution.input.tag,
      execution.context.getNativeViewEvidence ? () => execution.context.getNativeViewEvidence!(execution.case.runId) : undefined);
  },
});

// createMidsceneNodes needs a provider while loading the config, but setup
// creates the registry later. A project-level slot connects those lifecycles.
// getAgent uses execution.context directly; releaseAgent only receives runId
// and therefore uses the slot closure.
interface RegistrySlot {
  current?: AgentRegistry;
}

const nodesFor = (
  agentClass: Parameters<typeof createMidsceneNodes>[0]['agentClass'],
  slot: RegistrySlot,
) =>
  [...createMidsceneNodes<ProjectContext>({
    agentClass,
    agentProvider: {
      getAgent: (runId, execution) => execution.context.agentRegistry.getAgent(runId),
      releaseAgent: (runId) => {
        if (!slot.current) throw new Error('agentRegistry is unavailable before project setup.');
        return slot.current.releaseAgent(runId);
      },
    } satisfies AgentProvider<ProjectContext>,
  }), nativeExpectNode, nativeCommandNode, nativePixelsNode, sparklingNode];

// Android connects directly through adb without Appium or Espresso. Use
// ANDROID_SERIAL to select a device when several are connected; otherwise use
// the first. Agent.destroy() also destroys its device, so each case run owns a
// device and agent pair rather than sharing one AndroidDevice across a project.
const androidSetup = defineProjectSetup<ProjectContext>({
  name: 'android',
  async setup({ onTeardown }) {
    // Discover the target during setup, then connect separately for each run.
    const devices = await getConnectedDevices();
    if (!devices.length) {
      throw new Error('No Android device found. Start an emulator and check `adb devices`.');
    }
    const wanted = process.env.ANDROID_SERIAL;
    const udid = wanted && devices.some((d) => d.udid === wanted)
      ? wanted
      : devices[0].udid;

    const runs = new Map<string, { device: AndroidDevice; agent: AndroidAgent }>();
    const nativeSessions = createNativeSessions(() => connectDevtool({
      port: Number(process.env.DEVTOOL_PORT ?? 18901),
    }));
    onTeardown(() => nativeSessions.releaseAll());
    const ensure = async (runId: string) => {
      let entry = runs.get(runId);
      if (!entry) {
        const device = new AndroidDevice(udid);
        await device.connect();
        const agent = new AndroidAgent(device, { reportFileName: `android-${runId}.html`, aiContexts });
        entry = { device, agent };
        runs.set(runId, entry);
        // Bootstrap once per case run, before its first AI node. Store the entry
        // first so registered teardown can release it even if launch fails.
        await device.terminate('com.lynx.explorer').catch(() => {});
        await device.launch('com.lynx.explorer');
      }
      return entry;
    };

    return {
      platform: 'android',
      async getNativeSession(runId, fixture) {
        const definition = nativeFixture(fixture);
        await ensure(runId);
        return nativeSessions.get(runId, [...definition.tags], 'texts' in definition ? [...definition.texts] : []);
      },
      agentRegistry: {
        getAgent: async (runId) => (await ensure(runId)).agent,
        async releaseAgent(runId) {
          nativeSessions.release(runId);
          const entry = runs.get(runId);
          if (!entry) return;
          runs.delete(runId);
          // agent.destroy() also closes this run's adb device connection.
          await entry.agent.destroy();
          const report = reportPath('android', runId);
          return existsSync(report) ? { reportPath: report } : undefined;
        },
      },
    };
  },
});

// iOS connects directly to a local WebDriverAgent kept alive by xcodebuild test
// on port 8100. As on Android, each case run owns its IOSDevice session because
// destroying the agent also destroys the device.
const iosSetup = defineProjectSetup<ProjectContext>({
  name: 'ios',
  async setup({ onTeardown }) {
    const wdaPort = Number(process.env.WDA_PORT ?? 8100);
    const wdaHost = process.env.WDA_HOST ?? 'localhost';
    // Probe once so configuration errors fail during setup instead of case one.
    const probe = new IOSDevice({ wdaPort, wdaHost });
    await probe.connect();
    await probe.destroy();

    const runs = new Map<string, { device: IOSDevice; agent: IOSAgent }>();
    const releasedRuns = new Set<string>();
    let disposed = false;
    const nativeSessions = createNativeSessions(() => connectDevtool({
      port: Number(process.env.DEVTOOL_PORT ?? 8901),
    }));
    onTeardown(() => nativeSessions.releaseAll());
    const sparklingContracts = new Map<string, ReturnType<typeof createSparklingContracts>>();
    const visibilityReader = async (runId: string) => {
      const { device } = await ensure(runId);
      return createOwnedDeviceVisibilityReader((method, endpoint, data) => device.runWdaRequest(method, endpoint, data));
    };
    const visibleSessions = createVisibleNativeSessions(() => connectDevtool({
      port: Number(process.env.DEVTOOL_PORT ?? 8901),
    }), visibilityReader);
    onTeardown(() => { disposed = true; visibleSessions.releaseAll(); sparklingContracts.clear(); });
    const ensure = async (runId: string) => {
      if (disposed || releasedRuns.has(runId)) throw new Error('iOS case was already released.');
      let entry = runs.get(runId);
      if (!entry) {
        const device = new IOSDevice({ wdaPort, wdaHost });
        await device.connect();
        const agent = new IOSAgent(device, { reportFileName: `ios-${runId}.html`, aiContexts });
        entry = { device, agent };
        runs.set(runId, entry);
        // WDA launch preserves deep navigation state. Terminate and launch once
        // per case run before its first AI node, preserving home-screen isolation.
        await device.terminate('com.lynx.LynxExplorer');
        if (releasedRuns.has(runId)) throw new Error('iOS case was released during startup.');
        await device.launch('com.lynx.LynxExplorer');
        if (releasedRuns.has(runId)) throw new Error('iOS case was released during startup.');
      }
      return entry;
    };

    return {
      platform: 'ios',
      async runSparklingContract(runId, input) {
        const { device } = await ensure(runId);
        let contract = sparklingContracts.get(runId);
        if (!contract) {
          const request = (method: 'GET' | 'POST', endpoint: string, data?: unknown) => device.runWdaRequest(method, endpoint, data);
          contract = createSparklingContracts((tag, expectedText, timeoutMs) => visibleSessions.observe(runId, tag, expectedText, timeoutMs), await visibilityReader(runId), {
            readAlert: (timeoutMs) => readOwnedRouteAlert(request, timeoutMs),
            openExternal: (route) => deliverOwnedExternalRoute(request, route),
          });
          sparklingContracts.set(runId, contract);
        }
        await contract(input);
      },
      async getNativeViewEvidence(runId) {
        const { device } = await ensure(runId);
        // Public SDK API scopes these reads to this case's existing WDA session.
        return readVisibleViewEvidence((method, endpoint, data) => device.runWdaRequest(method, endpoint, data));
      },
      async getNativeSession(runId, fixture) {
        const definition = nativeFixture(fixture);
        await ensure(runId);
        return nativeSessions.get(runId, [...definition.tags], 'texts' in definition ? [...definition.texts] : []);
      },
      agentRegistry: {
        getAgent: async (runId) => (await ensure(runId)).agent,
        async releaseAgent(runId) {
          releasedRuns.add(runId);
          visibleSessions.release(runId);
          sparklingContracts.delete(runId);
          nativeSessions.release(runId);
          const entry = runs.get(runId);
          if (!entry) return;
          runs.delete(runId);
          // agent.destroy() also closes this run's WDA session.
          await entry.agent.destroy();
          const report = reportPath('ios', runId);
          return existsSync(report) ? { reportPath: report } : undefined;
        },
      },
    };
  },
});

// Bind each setup registry into its project slot for releaseAgent.
const bindSetup = (
  setup: ReturnType<typeof defineProjectSetup<ProjectContext>>,
  slot: RegistrySlot,
) =>
  defineProjectSetup<ProjectContext>({
    name: setup.name,
    async setup(args) {
      const context = await setup.setup(args);
      slot.current = context.agentRegistry;
      return context;
    },
  });

const androidSlot: RegistrySlot = {};
const iosSlot: RegistrySlot = {};

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'android-explorer',
      variables: { eventUri: fixtureUri('android', 'event'), domFocusUri: fixtureUri('android', 'domFocus'), insertTextUri: fixtureUri('android', 'insertText'), textEventUri: fixtureUri('android', 'textEvent'), imageUri: fixtureUri('android', 'image'), layoutLinearUri: fixtureUri('android', 'layoutLinear') },
      setup: bindSetup(androidSetup, androidSlot),
      nodes: nodesFor(AndroidAgent, androidSlot),
      files: { include: ['cases/native/**/*.{yaml,yml}'] },
      retry: 1,
    },
    {
      name: 'ios-explorer',
      variables: { eventUri: fixtureUri('ios', 'event'), domFocusUri: fixtureUri('ios', 'domFocus'), insertTextUri: fixtureUri('ios', 'insertText'), textEventUri: fixtureUri('ios', 'textEvent'), imageUri: fixtureUri('ios', 'image'), layoutLinearUri: fixtureUri('ios', 'layoutLinear'), ...sparklingRoutes },
      setup: bindSetup(iosSetup, iosSlot),
      nodes: nodesFor(IOSAgent, iosSlot),
      files: { include: ['cases/native/**/*.{yaml,yml}', 'cases/ios-sparkling/**/*.{yaml,yml}'] },
      retry: 1,
    },
  ],
  test: {
    maxConcurrency: 1,
    testTimeout: 180_000,
  },
  output: {
    reportDir: './midscene_run/report',
  },
});
