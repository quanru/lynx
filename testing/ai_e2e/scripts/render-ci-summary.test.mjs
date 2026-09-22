import assert from 'node:assert/strict';
import test from 'node:test';

import { renderSummary, testRunDump } from './render-ci-summary.mjs';

const run = {
  schemaVersion: 1,
  kind: 'test-runner',
  status: 'success',
  durationMs: 73_000,
  summary: { total: 1, passed: 1, failed: 0, notRun: 0 },
  projects: [
    {
      name: 'android-explorer',
      documents: [
        {
          cases: [
            {
              name: 'Open the Showcase page',
              status: 'success',
              attempts: [{ durationMs: 52_000, steps: [] }],
            },
          ],
        },
      ],
    },
  ],
};

test('extracts the runner dump from a Midscene HTML report', () => {
  const html = `<script type="midscene_test_run_dump">${
    JSON.stringify(run)
  }</script>`;
  assert.deepEqual(testRunDump(html), run);
});

test('renders platform and case summary tables', () => {
  const summary = renderSummary({
    title: 'Lynx Explorer × Midscene',
    runUrl: 'https://github.com/example/project/actions/runs/123',
    entries: [
      {
        label: 'Android',
        result: 'success',
        artifact: 'midscene-ai-e2e-android',
        run,
      },
    ],
  });
  assert.match(
    summary,
    /\| Android \| ✅ Passed \| 1 \| 1 \| 0 \| 0 \| 1m 13s \|/,
  );
  assert.match(summary, /All 1 cases passed/);
  assert.match(summary, /Open the Showcase page.*52s/);
  assert.match(summary, /midscene-ai-e2e-android/);
});

test('reports infrastructure failures when no Midscene report exists', () => {
  const summary = renderSummary({
    title: 'Lynx Explorer × Midscene',
    runUrl: 'https://github.com/example/project/actions/runs/123',
    entries: [
      { label: 'iOS', result: 'failure', artifact: 'ios', run: undefined },
    ],
  });
  assert.match(summary, /iOS.*Failed before report/);
});

test('escapes report-provided Markdown in failure rows', () => {
  const failedRun = structuredClone(run);
  failedRun.status = 'failed';
  failedRun.summary = { total: 1, passed: 0, failed: 1, notRun: 0 };
  const testCase = failedRun.projects[0].documents[0].cases[0];
  testCase.name = 'Broken | [case]';
  testCase.status = 'failed';
  testCase.attempts[0].steps = [
    { status: 'failed', error: { message: '<unsafe> | reason' } },
  ];
  const summary = renderSummary({
    title: 'Lynx Explorer × Midscene',
    runUrl: 'https://github.com/example/project/actions/runs/123',
    entries: [{ label: 'iOS', result: 'failure', run: failedRun }],
  });
  assert.match(summary, /Broken \\| \\\[case\\\]/);
  assert.match(summary, /&lt;unsafe&gt; \\| reason/);
});
