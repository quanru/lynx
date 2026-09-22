import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  preparePagesSite,
  renderSummary,
  testRunDump,
} from './render-ci-summary.mjs';

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
              caseId: 'showcase',
              name: 'Open the Showcase page',
              status: 'success',
              attempts: [
                {
                  durationMs: 52_000,
                  steps: [
                    {
                      id: 'case:steps:0',
                      status: 'success',
                      agentDetails: [
                        { reportId: 'report-1', executionId: 'execution-1' },
                      ],
                    },
                  ],
                },
              ],
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

test('renders summary tables and linked screenshot evidence', () => {
  const summary = renderSummary({
    title: 'Lynx Explorer × Midscene',
    runUrl: 'https://github.com/example/project/actions/runs/123',
    pagesUrl: 'https://example.github.io/project/',
    entries: [
      {
        label: 'Android',
        result: 'success',
        artifact: 'midscene-ai-e2e-android',
        run,
        reportPath: 'android/report/test-run.html',
        cases: [
          {
            ...run.projects[0].documents[0].cases[0],
            previewPath: 'android/previews/showcase.jpg',
            stepId: 'case:steps:0',
          },
        ],
      },
    ],
  });
  assert.match(
    summary,
    /\| Android \| ✅ Passed \| 1 \| 1 \| 0 \| 0 \| 1m 13s \|/,
  );
  assert.match(summary, /All 1 cases passed/);
  assert.match(summary, /Open HTML/);
  assert.match(
    summary,
    /\[!\[Open the Showcase page\]\(https:\/\/example\.github\.io\/project\/android\/previews\/showcase\.jpg\)\]/,
  );
  assert.match(summary, /runner-step=case%3Asteps%3A0/);
});

test('reports infrastructure failures when no Midscene report exists', () => {
  const summary = renderSummary({
    title: 'Lynx Explorer × Midscene',
    runUrl: 'https://github.com/example/project/actions/runs/123',
    pagesUrl: 'https://example.github.io/project/',
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
    pagesUrl: 'https://example.github.io/project/',
    entries: [{ label: 'iOS', result: 'failure', run: failedRun }],
  });
  assert.match(summary, /Broken \\| \\\[case\\\]/);
  assert.match(summary, /&lt;unsafe&gt; \\| reason/);
});

test('extracts a node screenshot and publishes a linked HTML report', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'midscene-summary-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source', 'report');
  const site = path.join(root, 'site');
  await mkdir(source, { recursive: true });
  const html = [
    '<!doctype html><html><body>',
    `<script type="midscene_web_dump" data-report-id="report-1">${
      JSON.stringify({
        executions: [
          {
            id: 'execution-1',
            tasks: [
              { uiContext: { screenshot: { id: 'screenshot-1' } } },
            ],
          },
        ],
      })
    }</script>`,
    '<script type="midscene-image" data-id="screenshot-1">data:image/jpeg;base64,/9j/2Q==</script>',
    `<script type="midscene_test_run_dump">${JSON.stringify(run)}</script>`,
    '</body></html>',
  ].join('');
  const reportFile = path.join(source, 'test-run.html');
  await writeFile(reportFile, html);

  const [entry] = await preparePagesSite({
    entries: [
      {
        label: 'Android',
        result: 'success',
        report: { dump: run, file: reportFile, html },
      },
    ],
    siteDirectory: site,
  });

  assert.equal(entry.reportPath, 'android/report/test-run.html');
  assert.equal(entry.cases[0].previewPath, 'android/previews/showcase.jpg');
  assert.equal(entry.cases[0].stepId, 'case:steps:0');
  assert.deepEqual(
    await readFile(path.join(site, entry.cases[0].previewPath)),
    Buffer.from('/9j/2Q==', 'base64'),
  );
  assert.match(
    await readFile(path.join(site, entry.reportPath), 'utf8'),
    /midscene_test_run_dump/,
  );
});

test('extracts a file-backed Midscene 1.13 screenshot', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'midscene-summary-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source', 'report');
  const screenshots = path.join(source, 'screenshots');
  const site = path.join(root, 'site');
  await mkdir(screenshots, { recursive: true });
  const screenshotBytes = Buffer.from('/9j/2Q==', 'base64');
  await writeFile(path.join(screenshots, 'screenshot-1.jpeg'), screenshotBytes);
  const html = [
    '<!doctype html><html><body>',
    `<script type="midscene_web_dump" data-report-id="report-1">${
      JSON.stringify({
        executions: [
          {
            id: 'execution-1',
            tasks: [
              {
                uiContext: {
                  screenshot: {
                    type: 'midscene_screenshot_ref',
                    id: 'screenshot-1',
                    mimeType: 'image/jpeg',
                    storage: 'file',
                    path: './screenshots/screenshot-1.jpeg',
                  },
                },
              },
            ],
          },
        ],
      })
    }</script>`,
    `<script type="midscene_test_run_dump">${JSON.stringify(run)}</script>`,
    '</body></html>',
  ].join('');
  const reportFile = path.join(source, 'test-run.html');
  await writeFile(reportFile, html);

  const [entry] = await preparePagesSite({
    entries: [
      {
        label: 'Android',
        result: 'success',
        report: { dump: run, file: reportFile, html },
      },
    ],
    siteDirectory: site,
  });

  assert.equal(entry.cases[0].previewPath, 'android/previews/showcase.jpg');
  assert.deepEqual(
    await readFile(path.join(site, entry.cases[0].previewPath)),
    screenshotBytes,
  );
});
