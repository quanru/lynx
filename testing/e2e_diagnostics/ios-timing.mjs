import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, cp, lstat, mkdir, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const bundleId = 'com.lynx.LynxExplorer';
export const iosTimingVersions = Object.freeze({ appium: '2.11.2', xcuitest: '7.24.18',
  wdaClient: '8.9.1', iosSimulator: '6.2.6', wdaCommit: '54fc1a254632911fdc48e2b6fbcca2481d27d223' });

export async function iosProducerIdentity(id, repository, api) {
  if (!/^[1-9][0-9]*$/.test(id ?? '') || repository !== 'quanru/lynx') throw new Error('Invalid fork producer identity');
  const run = await api(`actions/runs/${id}`);
  if (run.id !== Number(id) || run.repository?.full_name !== repository
    || run.path !== '.github/workflows/midscene-ai-e2e.yml'
    || !['in_progress', 'waiting', 'completed'].includes(run.status)
    || !/^[0-9a-f]{40}$/.test(run.head_sha ?? '') || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
    throw new Error('Unverified iOS producer run');
  }
  const jobs = await api(`actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error('Incomplete producer job inventory');
  const builds = jobs.jobs.filter(job => job.name === 'Build current-source Explorer · ios');
  if (builds.length !== 1 || builds[0].status !== 'completed' || builds[0].conclusion !== 'success') {
    throw new Error('Producer iOS build must be completed successfully');
  }
  return { id: run.id, head: run.head_sha, attempt: run.run_attempt, url: run.html_url,
    iosBuildJob: builds[0].id, conclusion: run.conclusion };
}

export function requireOnlySimulator(list, udid) {
  if (!/^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/.test(udid ?? '')) throw new Error('Invalid simulator UDID');
  const booted = Object.entries(list.devices ?? {}).flatMap(([runtime, devices]) =>
    devices.filter(device => device.state === 'Booted').map(device => ({ ...device, runtime })));
  if (booted.length !== 1 || booted[0].udid !== udid || booted[0].name !== 'iPhone 17'
    || booted[0].runtime !== 'com.apple.CoreSimulator.SimRuntime.iOS-26-2' || booted[0].isAvailable !== true) {
    throw new Error('Comparison requires exactly the selected booted iPhone 17 / iOS 26.2 simulator');
  }
  return { udid, name: booted[0].name, runtime: booted[0].runtime };
}

export async function appInventory(directory) {
  const files = [];
  async function visit(relative = '') {
    for (const name of (await readdir(path.join(directory, relative))).sort()) {
      const item = path.posix.join(relative, name);
      const absolute = path.join(directory, item);
      const stat = await lstat(absolute);
      if (stat.isDirectory()) await visit(item);
      else if (stat.isSymbolicLink()) files.push({ path: item, type: 'symlink', target: await readlink(absolute) });
      else if (stat.isFile()) files.push({ path: item, type: 'file', size: stat.size,
        sha256: createHash('sha256').update(await readFile(absolute)).digest('hex') });
      else throw new Error('Unsupported application bundle entry');
    }
  }
  await visit();
  if (!files.some(file => file.path === 'Info.plist') || !files.some(file => file.path === 'LynxExplorer')) {
    throw new Error('Incomplete Explorer bundle inventory');
  }
  return files;
}

export function assertSameApp(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Installed Explorer differs from source artifact');
}

function command(executable, args, options = {}) {
  return execFileSync(executable, args, { encoding: 'utf8', timeout: 120_000, ...options }).trim();
}

function context() {
  const { IOS_TIMING_DIR: directory, SOURCE_ROOT: source, HARNESS_ROOT: harness,
    SOURCE_SHA: sha, SIMULATOR_UDID: udid, SAMPLE_LABEL: sample, PAIR_ORDER: order } = process.env;
  if (![directory, source, harness].every(value => value && path.isAbsolute(value))
    || !/^[0-9a-f]{40}$/.test(sha ?? '') || !/^[A-Za-z0-9_.-]{1,80}$/.test(sample ?? '')
    || !['original-first', 'migrated-first'].includes(order)) throw new Error('Invalid paired iOS timing context');
  return { directory, source, harness, sha, udid, sample, order };
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

async function deviceEvidence(ctx, label) {
  const simulator = requireOnlySimulator(JSON.parse(command('xcrun', ['simctl', 'list', 'devices', '--json'])), ctx.udid);
  const { describeIOSToolchain } = await import(pathToFileURL(path.join(ctx.source, 'testing/ai_e2e/scripts/ios-baseline.mjs')));
  const toolchain = describeIOSToolchain();
  const installed = command('xcrun', ['simctl', 'get_app_container', ctx.udid, bundleId, 'app']);
  const payload = await appInventory(installed);
  assertSameApp(JSON.parse(await readFile(path.join(ctx.directory, 'source-app-inventory.json'), 'utf8')), payload);
  const result = { schemaVersion: 1, sourceSha: ctx.sha, simulator, toolchain, bundleId,
    appInventorySha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    wdaCommit: command('git', ['-C', path.join(process.env.WDA_WORKDIR, 'WebDriverAgent'), 'rev-parse', 'HEAD']) };
  if (result.wdaCommit !== iosTimingVersions.wdaCommit) throw new Error('WDA server revision changed');
  await writeJson(path.join(ctx.directory, `device-${label}.json`), result);
  return result;
}

async function originalDevice(ctx, suite) {
  const cwd = path.join(ctx.source, 'testing/integration_test/test_script');
  // Use the original resource implementation, not a separate guessed selector.
  const code = 'import json\nfrom lynx_e2e._impl.device.resource import DeviceHandler\n'
    + 'print("TIMING_DEVICES=" + json.dumps([device.udid for device in DeviceHandler()._get_ios_devices()]))';
  const stdout = command('python3', ['-c', code], { cwd });
  const lines = stdout.split('\n').filter(line => line.startsWith('TIMING_DEVICES='));
  if (lines.length !== 1 || JSON.stringify(JSON.parse(lines[0].slice(15))) !== JSON.stringify([ctx.udid])) {
    throw new Error('Original resource manager does not uniquely select the benchmark simulator');
  }
  await writeJson(path.join(ctx.directory, `original-device-${suite}.json`), { udids: [ctx.udid] });
}

async function runLogged(executable, args, cwd, env, log) {
  const started = process.hrtime.bigint();
  const stream = createWriteStream(log, { flags: 'wx' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    stream.on('error', reject);
    child.stdout.on('data', chunk => { stream.write(chunk); process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { stream.write(chunk); process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => stream.end(() => resolve({ exitCode, signal,
      durationMs: Number(process.hrtime.bigint() - started) / 1e6 })));
  });
  return result;
}

async function side(name) {
  if (!['original', 'migrated'].includes(name)) throw new Error('Expected original or migrated side');
  const ctx = context();
  const result = { schemaVersion: 1, platform: 'ios', sourceSha: ctx.sha, sample: ctx.sample,
    order: ctx.order, side: name, executions: [], setupOutcome: 'failure', provenanceOutcome: 'failure' };
  try {
    const expected = JSON.parse(await readFile(path.join(ctx.directory, 'source-app-inventory.json'), 'utf8'));
    assertSameApp(expected, await appInventory(path.join(ctx.directory, 'source-build/LynxExplorer.app')));
    // Both sides start with a clean data container; neither case implementation is changed.
    command('xcrun', ['simctl', 'uninstall', ctx.udid, bundleId]);
    command('xcrun', ['simctl', 'install', ctx.udid, path.join(ctx.directory, 'source-build/LynxExplorer.app')]);
    await deviceEvidence(ctx, `${name}-before`);
    result.setupOutcome = 'success';
    if (name === 'original') {
      for (const suite of ['core', 'xelement', 'sparkling']) {
        try {
          await originalDevice(ctx, suite);
          const execution = await runLogged('python3', [path.join(ctx.harness, 'testing/e2e_diagnostics/original-timing.py'),
            '--output', path.join(ctx.directory, 'original', `${suite}-timing.json`), '--platform', 'ios',
            '--source-sha', ctx.sha, '--session-id', `${ctx.sample}-original`, '--suite', suite,
            '--', 'manage.py', 'runtest', `ios_test.${suite}`],
          path.join(ctx.source, 'testing/integration_test/test_script'), process.env,
          path.join(ctx.directory, `original-${suite}.log`));
          result.executions.push({ suite, ...execution });
        } catch (error) {
          result.executions.push({ suite, exitCode: null, signal: null, setupError: error.name });
        }
      }
      const screenshots = path.join(ctx.source, 'testing/integration_test/test_script/screenshots');
      try { await cp(screenshots, path.join(ctx.directory, 'original-screenshots'), { recursive: true, errorOnExist: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else {
      const env = { ...process.env, GITHUB_SHA: ctx.sha };
      result.executions.push({ suite: 'ios-explorer', ...await runLogged('node',
        ['scripts/run-ci.mjs', '--project', 'ios-explorer'], path.join(ctx.source, 'testing/ai_e2e'), env,
        path.join(ctx.directory, 'migrated.log')) });
    }
    command('git', ['-C', ctx.source, 'diff', '--exit-code', '--', 'testing/integration_test/test_script',
      'testing/integration_test/demo_pages', 'testing/ai_e2e']);
    await deviceEvidence(ctx, `${name}-after`);
    result.provenanceOutcome = 'success';
  } finally {
    await writeJson(path.join(ctx.directory, `side-${name}.json`), result);
  }
  if (result.executions.length !== (name === 'original' ? 3 : 1)
    || result.executions.some(item => item.exitCode !== 0 || item.signal)) process.exitCode = 1;
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'producer') {
    const { SOURCE_RUN_ID: id, GITHUB_REPOSITORY: repository, IOS_TIMING_DIR: directory,
      GITHUB_OUTPUT: output, GH_TOKEN: token } = process.env;
    if (!directory || !output || !token) throw new Error('Missing producer metadata context');
    const producer = await iosProducerIdentity(id, repository, async endpoint => {
      const response = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Producer API status ${response.status}`);
      return response.json();
    });
    await writeJson(path.join(directory, 'producer.json'), producer);
    await appendFile(output, `head=${producer.head}\nattempt=${producer.attempt}\n`);
  } else if (mode === 'appium-config') {
    const ctx = context();
    await writeJson(path.join(process.env.APPIUM_HOME, 'package.json'), { private: true,
      overrides: { 'appium-webdriveragent': iosTimingVersions.wdaClient, 'appium-ios-simulator': iosTimingVersions.iosSimulator } });
    await writeJson(path.join(ctx.directory, 'appium-default-capabilities.json'), {
      'appium:webDriverAgentUrl': 'http://127.0.0.1:8100', 'appium:useNewWDA': false,
      'appium:udid': ctx.udid, 'appium:platformVersion': '26.2',
    });
  } else if (mode === 'inventory-app') {
    const ctx = context();
    await writeJson(path.join(ctx.directory, 'source-app-inventory.json'),
      await appInventory(path.join(ctx.directory, 'source-build/LynxExplorer.app')));
    await writeJson(path.join(ctx.directory, 'runner-environment.json'), { platform: os.platform(),
      architecture: os.arch(), cpus: os.cpus().map(cpu => ({ model: cpu.model, speed: cpu.speed })),
      totalMemory: os.totalmem(), imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion,
      node: process.version, originalPython: command('python3', ['--version']),
      order: ctx.order, sample: ctx.sample });
  } else if (mode === 'side') await side(process.argv[3]);
  else throw new Error('Expected producer, appium-config, inventory-app or side');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
