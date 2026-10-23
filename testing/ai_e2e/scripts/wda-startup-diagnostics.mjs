import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outputLimit = 256 * 1024;

/** Capture failure-only startup evidence; never retry or manipulate the device. */
export async function captureWDAStartupDiagnostics(directory, pid, udid, run = spawnSync) {
  if (!/^[1-9][0-9]*$/.test(String(pid)) || !/^[0-9a-f-]{36}$/i.test(udid)) {
    throw new Error('WDA diagnostics require an explicit process and simulator identity');
  }
  await mkdir(directory, { recursive: true });
  const commands = [
    ['process', 'ps', ['-p', String(pid), '-o', 'pid,ppid,stat,etime,pcpu,comm']],
    ['simulators', 'xcrun', ['simctl', 'list', 'devices', '--json']],
    ['simulator-testmanager', 'xcrun', ['simctl', 'spawn', udid, 'log', 'show', '--info', '--debug', '--last', '5m', '--style', 'compact', '--predicate',
      'process == "testmanagerd" OR process == "WebDriverAgentRunner-Runner" OR process == "SpringBoard" OR process == "runningboardd" OR process == "debugserver"']],
    ['host-simulator', '/usr/bin/log', ['show', '--info', '--debug', '--last', '5m', '--style', 'compact', '--predicate',
      'process == "testmanagerd" OR process == "CoreSimulatorService" OR process == "com.apple.CoreSimulator.CoreSimulatorService" OR process == "debugserver" OR process == "SimulatorTrampoline"']],
  ];
  const results = [];
  for (const [name, command, args] of commands) {
    const result = run(command, args, {
      timeout: 10_000, maxBuffer: outputLimit, killSignal: 'SIGKILL',
      encoding: 'buffer', shell: false,
    });
    for (const stream of ['stdout', 'stderr']) {
      await writeFile(path.join(directory, `${name}.${stream}.log`),
        Buffer.from(result[stream] ?? '').subarray(0, outputLimit));
    }
    results.push({ name, command, args, status: result.status ?? null,
      signal: result.signal ?? null, errorCode: result.error?.code ?? null });
  }
  await writeFile(path.join(directory, 'diagnostics.json'), JSON.stringify({
    note: 'Read-only startup diagnostics, up to 10 seconds and 256 KiB per stream per command. The xcresult bundle may be incomplete while xcodebuild is still alive; absence is not a successful launch.',
    pid: String(pid), udid, results,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  captureWDAStartupDiagnostics(...process.argv.slice(2)).catch(() => {
    console.error('WDA startup diagnostics could not be fully captured; the original startup failure is unchanged.');
    process.exitCode = 1;
  });
}
