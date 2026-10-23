#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { requireNativeProjectGroup } from './native-ci-groups.mjs';

// Stop the CLI itself, not npm's intermediary process, early enough to let
// Midscene publish its failed/not-run cases before Actions kills the job.
export function supervise(child, {
  timeoutMs = 105 * 60_000, graceMs = 240_000,
  signals = process, timers = { setTimeout, clearTimeout }, log = console.error,
} = {}) {
  if (![timeoutMs, graceMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid CI supervision deadline.');
  return new Promise((resolveResult, reject) => {
    let interrupted = false, finished = false, escalation;
    const interrupt = signal => {
      if (finished || interrupted) return;
      interrupted = true;
      log('Interrupting Midscene; retain failed/not-run status and allow report finalization.');
      child.kill(signal);
      escalation = timers.setTimeout(() => {
        log('Midscene did not finalize within the bounded grace period.');
        child.kill('SIGKILL');
      }, graceMs);
    };
    const onInt = () => interrupt('SIGINT');
    const onTerm = () => interrupt('SIGTERM');
    signals.on('SIGINT', onInt);
    signals.on('SIGTERM', onTerm);
    const deadline = timers.setTimeout(onInt, timeoutMs);
    const cleanup = () => {
      finished = true;
      timers.clearTimeout(deadline);
      if (escalation !== undefined) timers.clearTimeout(escalation);
      signals.off('SIGINT', onInt);
      signals.off('SIGTERM', onTerm);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', code => {
      cleanup();
      // Interrupted execution must never be green, even if a child exits zero.
      resolveResult(interrupted || code === null ? 1 : code);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--project' || !['android-explorer', 'ios-explorer'].includes(args[1])) {
    throw new Error('Usage: node scripts/run-ci.mjs --project android-explorer|ios-explorer');
  }
  const cli = fileURLToPath(new URL('../node_modules/@midscene/test/bin/midscene-test', import.meta.url));
  requireNativeProjectGroup(args[1]);
  const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit' });
  process.exitCode = await supervise(child);
}
