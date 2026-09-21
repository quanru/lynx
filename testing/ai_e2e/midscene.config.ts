import { resolve } from 'node:path';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
import { IOSAgent, IOSDevice } from '@midscene/ios';
import { defineNode } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import type { AgentProvider, AgentReleaseResult, MidsceneUIAgent } from '@midscene/test/midscene';

// Agent 报告由 @midscene/core 写到 <cwd>/midscene_run/report/<reportFileName>.html。
// releaseAgent 时把同一绝对路径交还 runner，test-run 汇总报告才能把逐步详情
// 嵌进对应用例（共享单 agent 会让详情挂错 scope，汇总页全部 unresolved）。
const reportDir = resolve('./midscene_run/report');
const reportPath = (prefix: string, runId: string) => resolve(reportDir, `${prefix}-${runId}.html`);

// setup 产出、YAML 节点可见的 project 上下文。
// agentRegistry 每个 project 一份：按 case runId 懒建/回收 agent。
interface AgentRegistry {
  getAgent(runId: string): MidsceneUIAgent | Promise<MidsceneUIAgent>;
  releaseAgent(runId: string): Promise<AgentReleaseResult | void>;
}

interface ProjectContext {
  // explorer.open 自定义节点用：对指定 case run 的设备 terminate+launch App。
  relaunchExplorer: (runId: string) => Promise<void>;
  agentRegistry: AgentRegistry;
}

// createMidsceneNodes 需要在 config 加载时就拿到 provider 对象，而 registry
// 在 setup 时才诞生；用一个 project 级槽位把两者接起来。getAgent 直接走
// execution.context（更直接），releaseAgent 只有 runId，走槽位闭包。
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

// 跨端统一节点：launch App 并保证从首页开始。
// 节点只在 case 级使用，直接读 execution.case.runId。
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

// Android: Midscene 直连 adb，无需 Appium / Espresso。
// 多设备时用 ANDROID_SERIAL 指定（emulator-5554 等），默认取第一台。
// 注意：Agent.destroy() 会连带销毁其持有的 device，因此 device 必须每个 case
// run 各建一份，随 agent 一起回收——不能全 project 共享同一个 AndroidDevice。
const androidSetup = defineProjectSetup<ProjectContext>({
  name: 'android',
  async setup() {
    // setup 阶段只探测目标设备；连接延迟到每个 run。
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
        // Release 包自带签名，直接 launch；先 terminate 保证从首页开始。
        await device.terminate('com.lynx.explorer').catch(() => {});
        await device.launch('com.lynx.explorer');
      },
      agentRegistry: {
        getAgent: async (runId) => (await ensure(runId)).agent,
        async releaseAgent(runId) {
          const entry = runs.get(runId);
          if (!entry) return;
          runs.delete(runId);
          // agent.destroy() 会一并关闭该 run 自有的 adb 设备连接。
          await entry.agent.destroy();
          return { reportPath: reportPath('android', runId) };
        },
      },
    };
  },
});

// iOS: Midscene 直连本机 WebDriverAgent（模拟器上由 xcodebuild test 常驻，端口 8100）。
// 同 Android：IOSDevice 会话随 Agent 销毁，device 每个 case run 各建一份。
const iosSetup = defineProjectSetup<ProjectContext>({
  name: 'ios',
  async setup() {
    const wdaPort = Number(process.env.WDA_PORT ?? 8100);
    const wdaHost = process.env.WDA_HOST ?? 'localhost';
    // 先探一次，配置错误时在 setup 阶段就失败，而不是第一个用例才报错。
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
        // WDA 的 launch 只会 activate：App 若停留在上次导航的深层页面，
        // 不会自动回首页。先 terminate 再 launch，保证每个用例从首页开始。
        await device.terminate('com.lynx.LynxExplorer');
        await device.launch('com.lynx.LynxExplorer');
      },
      agentRegistry: {
        getAgent: async (runId) => (await ensure(runId)).agent,
        async releaseAgent(runId) {
          const entry = runs.get(runId);
          if (!entry) return;
          runs.delete(runId);
          // agent.destroy() 会一并关闭该 run 自有的 WDA 会话。
          await entry.agent.destroy();
          return { reportPath: reportPath('ios', runId) };
        },
      },
    };
  },
});

// setup 外包一层：把当次 setup 的 registry 绑进 project 槽位供 releaseAgent 使用。
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
