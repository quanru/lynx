import { resolve } from 'node:path';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
import { IOSAgent, IOSDevice } from '@midscene/ios';
import { defineNode } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import type { AgentProvider, AgentReleaseResult, MidsceneUIAgent } from '@midscene/test/midscene';

// @midscene/core writes agent reports to
// <cwd>/midscene_run/report/<reportFileName>.html. releaseAgent must return the
// same absolute path so the test-run report can embed each case's step details.
// Sharing one agent would attach details to the wrong scope and mark the summary unresolved.
const reportDir = resolve('./midscene_run/report');
const reportPath = (prefix: string, runId: string) => resolve(reportDir, `${prefix}-${runId}.html`);

// Project context produced by setup and available to YAML nodes. Each project
// has one registry that creates and releases agents lazily by case runId.
interface AgentRegistry {
  getAgent(runId: string): MidsceneUIAgent | Promise<MidsceneUIAgent>;
  releaseAgent(runId: string): Promise<AgentReleaseResult | void>;
}

interface ProjectContext {
  // Used by explorer.open to terminate and launch the app for a specific case run.
  relaunchExplorer: (runId: string) => Promise<void>;
  agentRegistry: AgentRegistry;
}

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
  createMidsceneNodes<ProjectContext>({
    agentClass,
    agentProvider: {
      getAgent: (runId, execution) => execution.context.agentRegistry.getAgent(runId),
      releaseAgent: (runId) => {
        if (!slot.current) throw new Error('agentRegistry is unavailable before project setup.');
        return slot.current.releaseAgent(runId);
      },
    } satisfies AgentProvider<ProjectContext>,
  });

// Cross-platform node that launches the app and starts from the home screen.
// It is case-scoped and reads execution.case.runId directly.
const openExplorerNode = defineNode<void, void, ProjectContext>({
  name: 'explorer.open',
  description: 'Open the Lynx Explorer native app home screen.',
  async execute(execution) {
    if (execution.scope !== 'case') {
      throw new Error('explorer.open can only be used as a case-level step.');
    }
    await execution.context.relaunchExplorer(execution.case.runId);
  },
});

// Android connects directly through adb without Appium or Espresso. Use
// ANDROID_SERIAL to select a device when several are connected; otherwise use
// the first. Agent.destroy() also destroys its device, so each case run owns a
// device and agent pair rather than sharing one AndroidDevice across a project.
const androidSetup = defineProjectSetup<ProjectContext>({
  name: 'android',
  async setup() {
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
    const ensure = async (runId: string) => {
      let entry = runs.get(runId);
      if (!entry) {
        const device = new AndroidDevice(udid);
        await device.connect();
        const agent = new AndroidAgent(device, { reportFileName: `android-${runId}.html` });
        entry = { device, agent };
        runs.set(runId, entry);
      }
      return entry;
    };

    return {
      relaunchExplorer: async (runId) => {
        const { device } = await ensure(runId);
        // The signed release launches directly. Terminate first to return home.
        await device.terminate('com.lynx.explorer').catch(() => {});
        await device.launch('com.lynx.explorer');
      },
      agentRegistry: {
        getAgent: async (runId) => (await ensure(runId)).agent,
        async releaseAgent(runId) {
          const entry = runs.get(runId);
          if (!entry) return;
          runs.delete(runId);
          // agent.destroy() also closes this run's adb device connection.
          await entry.agent.destroy();
          return { reportPath: reportPath('android', runId) };
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
  async setup() {
    const wdaPort = Number(process.env.WDA_PORT ?? 8100);
    const wdaHost = process.env.WDA_HOST ?? 'localhost';
    // Probe once so configuration errors fail during setup instead of case one.
    const probe = new IOSDevice({ wdaPort, wdaHost });
    await probe.connect();
    await probe.destroy();

    const runs = new Map<string, { device: IOSDevice; agent: IOSAgent }>();
    const ensure = async (runId: string) => {
      let entry = runs.get(runId);
      if (!entry) {
        const device = new IOSDevice({ wdaPort, wdaHost });
        await device.connect();
        const agent = new IOSAgent(device, { reportFileName: `ios-${runId}.html` });
        entry = { device, agent };
        runs.set(runId, entry);
      }
      return entry;
    };

    return {
      relaunchExplorer: async (runId) => {
        const { device } = await ensure(runId);
        // WDA launch only activates the app and preserves deep navigation state.
        // Terminate first so every case starts on the home screen.
        await device.terminate('com.lynx.LynxExplorer');
        await device.launch('com.lynx.LynxExplorer');
      },
      agentRegistry: {
        getAgent: async (runId) => (await ensure(runId)).agent,
        async releaseAgent(runId) {
          const entry = runs.get(runId);
          if (!entry) return;
          runs.delete(runId);
          // agent.destroy() also closes this run's WDA session.
          await entry.agent.destroy();
          return { reportPath: reportPath('ios', runId) };
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
      setup: bindSetup(androidSetup, androidSlot),
      nodes: [...nodesFor(AndroidAgent, androidSlot), openExplorerNode],
      files: { include: ['cases/native/**/*.{yaml,yml}'] },
      retry: 1,
    },
    {
      name: 'ios-explorer',
      setup: bindSetup(iosSetup, iosSlot),
      nodes: [...nodesFor(IOSAgent, iosSlot), openExplorerNode],
      files: { include: ['cases/native/**/*.{yaml,yml}'] },
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
