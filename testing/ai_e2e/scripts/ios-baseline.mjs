// Baselines updated with Xcode 26.3 / iPhone 17 in upstream dfa91d8f.
// Do not silently use the hosted runner's Xcode 16.4 / iOS 18.5 default.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const iosBaseline = Object.freeze({
  xcodeVersion: '26.3', simulatorSDK: '26.2', simulatorName: 'iPhone 17',
  developerDirectory: '/Applications/Xcode_26.3.app/Contents/Developer',
});

export function validateIOSToolchain(toolchain) {
  if (toolchain?.xcodeVersion !== iosBaseline.xcodeVersion
    || toolchain?.simulatorSDK !== iosBaseline.simulatorSDK) {
    throw new Error('Original iOS baselines require Xcode 26.3 and iOS simulator SDK 26.2; no default-toolchain fallback.');
  }
}

export function selectIOSSimulator(list, sdk) {
  if (sdk !== iosBaseline.simulatorSDK) throw new Error('Original iOS baseline simulator SDK does not match.');
  const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-' + sdk.replaceAll('.', '-');
  const devices = list?.devices?.[runtime];
  if (!Array.isArray(devices)) throw new Error('Original iOS baseline simulator runtime is unavailable.');
  const matches = devices.filter(device => device?.name === iosBaseline.simulatorName && device.isAvailable === true);
  if (matches.length !== 1 || !/^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/.test(matches[0]?.udid)) {
    throw new Error('Original iOS baselines require exactly one available iPhone 17; no newest-device fallback.');
  }
  return matches[0].udid;
}

export function describeIOSToolchain(env = process.env) {
  const version = execFileSync('xcodebuild', ['-version'], { env, encoding: 'utf8' });
  const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-version'], { env, encoding: 'utf8' }).trim();
  const result = { xcodeVersion: /^Xcode ([^\n]+)$/m.exec(version)?.[1], simulatorSDK: sdk };
  validateIOSToolchain(result);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'select-toolchain') {
    describeIOSToolchain({ ...process.env, DEVELOPER_DIR: iosBaseline.developerDirectory });
    console.log('DEVELOPER_DIR=' + iosBaseline.developerDirectory);
  } else if (command === 'select-simulator') {
    console.log(selectIOSSimulator(JSON.parse(readFileSync(0, 'utf8')), process.argv[3]));
  } else if (command === 'describe') {
    console.log(JSON.stringify(describeIOSToolchain()));
  } else throw new Error('Expected select-toolchain, select-simulator or describe.');
}
