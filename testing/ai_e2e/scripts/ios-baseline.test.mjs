import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { iosBaseline, selectIOSSimulator, validateIOSToolchain, describeIOSToolchain } from './ios-baseline.mjs';

const udid = '11111111-2222-3333-4444-555555555555';
const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-26-2';
const device = { name: 'iPhone 17', isAvailable: true, udid };

test('baseline toolchain rejects the actually observed Xcode 16.4 / iOS 18.5 defaults', () => {
  validateIOSToolchain(iosBaseline);
  for (const toolchain of [undefined, {}, { xcodeVersion: '16.4', simulatorSDK: '18.5' },
    { xcodeVersion: '26.2', simulatorSDK: '26.2' }, { xcodeVersion: '26.3', simulatorSDK: '18.5' }]) {
    assert.throws(() => validateIOSToolchain(toolchain), /Original iOS baselines require/);
  }
});

test('simulator selection requires one available iPhone 17 in exactly the baseline runtime', () => {
  const list = { devices: { [runtime]: [
    { ...device, name: 'iPhone 18' }, { ...device, name: 'iPhone 17 Pro' },
    { ...device, isAvailable: false }, device,
  ], 'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [{ ...device, name: 'iPhone 16' }] } };
  assert.equal(selectIOSSimulator(list, '26.2'), udid);
  for (const entries of [[], [{ ...device, isAvailable: false }], [device, device],
    [{ ...device, name: 'iPhone 16' }], [{ ...device, udid: '../invalid' }]]) {
    assert.throws(() => selectIOSSimulator({ devices: { [runtime]: entries } }, '26.2'), /exactly one/);
  }
  assert.throws(() => selectIOSSimulator(list, '18.5'), /SDK does not match/);
  assert.throws(() => selectIOSSimulator({ devices: {} }, '26.2'), /runtime is unavailable/);
});

test('toolchain metadata describes actual selected executables and rejects a wrong simulator SDK', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lynx-ios-toolchain-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'xcodebuild'), '#!/bin/sh\nprintf "Xcode 26.3\\nBuild version 17C529\\n"\n', { mode: 0o700 });
  await writeFile(join(directory, 'xcrun'), '#!/bin/sh\nprintf "26.2\\n"\n', { mode: 0o700 });
  const env = { ...process.env, PATH: directory + ':' + process.env.PATH };
  assert.deepEqual(describeIOSToolchain(env), { xcodeVersion: '26.3', simulatorSDK: '26.2' });
  await writeFile(join(directory, 'xcrun'), '#!/bin/sh\nprintf "18.5\\n"\n', { mode: 0o700 });
  assert.throws(() => describeIOSToolchain(env), /Original iOS baselines require/);
});

test('both source build and WDA execution select the same baseline toolchain, preserving upstream device identity', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  assert.equal(workflow.match(/name: Select original iOS baseline toolchain/g)?.length, 2);
  assert.match(workflow, /if: matrix\.platform == 'ios'\s+run: node lynx\/testing\/ai_e2e\/scripts\/ios-baseline\.mjs select-toolchain/);
  assert.match(workflow, /run: node testing\/ai_e2e\/scripts\/ios-baseline\.mjs select-toolchain >> "\$GITHUB_ENV"/);
  const upstream = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.ok(upstream.includes('name=' + iosBaseline.simulatorName + '"'));
  const wda = readFileSync(new URL('./start-wda.sh', import.meta.url), 'utf8');
  assert.match(wda, /simctl list devices available --json/);
  assert.match(wda, /ios-baseline\.mjs" select-simulator "\$SDK_VERSION"/);
  assert.doesNotMatch(wda, /sort -uV|tail -1(?:\s|$)/);
  const build = readFileSync(new URL('./build-explorer.sh', import.meta.url), 'utf8');
  assert.match(build, /ios-baseline\.mjs', 'describe'/);
  assert.match(build, /iosToolchain \? \{ iosToolchain \}/);
});
