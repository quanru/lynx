import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testRunDump } from '../ai_e2e/scripts/render-ci-summary.mjs';

const smokeNames = new Set([
  'Explorer home shows URL entry and showcase',
  'Open Showcase from home',
  'Browse into Showcase Image examples',
]);

function milliseconds(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid timing duration');
  return value;
}

/** Extract measured attempts, not an assertion of paired performance or fidelity. */
export function migratedTiming(dump, projectName) {
  if (!dump || !['android-explorer', 'ios-explorer'].includes(projectName)) {
    throw new Error('A structured native report and explicit project are required');
  }
  const projects = dump.projects?.filter(project => project.name === projectName);
  if (projects?.length !== 1) throw new Error('Missing or ambiguous native project');
  const cases = [];
  const identities = new Set();
  for (const document of projects[0].documents) {
    for (const item of document.cases) {
      if (identities.has(item.name)) throw new Error('Duplicate case: preserve document retry identity before comparing');
      identities.add(item.name);
      if (!smokeNames.has(item.name) && !/^(core|xelement|sparkling)\/[A-Za-z0-9]+$/.test(item.name)) {
        throw new Error('Unclassified native case');
      }
      const attempts = (item.attempts ?? []).map((attempt, index) => {
        if (attempt.attemptIndex !== index || !['success', 'failed'].includes(attempt.status)) {
          throw new Error('Invalid or noncontiguous case attempts');
        }
        const durationMs = milliseconds(attempt.durationMs);
        const elapsed = Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt);
        if (elapsed !== durationMs) throw new Error('SDK duration and timestamps disagree');
        const stepTotals = {};
        for (const step of [...(attempt.beforeEach ?? []), ...(attempt.steps ?? []), ...(attempt.afterEach ?? [])]) {
          const total = stepTotals[step.node] ??= { count: 0, durationMs: 0 };
          total.count++;
          total.durationMs += milliseconds(step.durationMs);
        }
        return {
          attempt: index + 1, attemptId: attempt.attemptId, status: attempt.status,
          executionStatus: attempt.executionStatus, cleanup: attempt.cleanup,
          startedAt: attempt.startedAt, endedAt: attempt.endedAt, durationMs,
          stepTotals,
        };
      });
      cases.push({
        caseName: item.name, caseId: item.caseId, sourcePath: document.sourcePath,
        category: smokeNames.has(item.name) ? 'additive-smoke' : 'original-source',
        status: item.status, attempts,
        totalAttemptMs: attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0),
        firstAttemptMs: attempts[0]?.durationMs ?? null,
      });
    }
  }
  return {
    schemaVersion: 1, kind: 'migrated-native-timing-observation',
    projectName, runId: dump.runId, status: dump.status,
    boundary: 'SDK case start through afterEach/resource cleanup; excludes subsequent result publication callback',
    clock: 'SDK Date wall clock; timestamp consistency checked, not a monotonic measurement',
    comparability: 'unverified: source, installed artifact, same runner/device and input fidelity require independent paired evidence',
    cases,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [html, projectName, output, ...extra] = process.argv.slice(2);
  if (!html || !projectName || !output || extra.length) throw new Error('Usage: migrated-timing.mjs REPORT.html PROJECT OUTPUT.json');
  const result = migratedTiming(testRunDump(await readFile(html, 'utf8')), projectName);
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
}
