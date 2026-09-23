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

test('puts passed cases and linked screenshots in the collapsed appendix', () => {
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
  assert.doesNotMatch(summary, /### Needs attention/);
  assert.match(summary, /All 1 cases passed/);
  assert.match(summary, /<details>\n<summary>Appendix: passed cases \(1\)<\/summary>/);
  assert.match(
    summary,
    /<a href="[^\"]+runner-step=case%3Asteps%3A0"><img src="https:\/\/example\.github\.io\/project\/android\/previews\/showcase\.jpg" alt="Open the Showcase page" width="160"><\/a>/,
  );
  assert.match(summary, /runner-step=case%3Asteps%3A0/);
});

test('shows abnormal cases with screenshots before passed-only appendix', () => {
  const failed = structuredClone(run.projects[0].documents[0].cases[0]);
  failed.name = 'Failed case';
  failed.status = 'failed';
  failed.attempts[0].steps = [{ status: 'failed', error: { message: 'Assertion failed' } }];
  const notRun = structuredClone(run.projects[0].documents[0].cases[0]);
  notRun.name = 'Not-run case';
  notRun.status = 'not-run';
  notRun.notRunReason = 'Blocked by setup';
  const passed = structuredClone(run.projects[0].documents[0].cases[0]);
  passed.name = 'Passed case';
  const summary = renderSummary({
    title: 'Lynx Explorer × Midscene',
    runUrl: 'https://github.com/example/project/actions/runs/123',
    pagesUrl: 'https://example.github.io/project/',
    entries: [{
      label: 'Android',
      result: 'failure',
      run: { ...run, status: 'failed' },
      reportPath: 'android/report/test-run.html',
      cases: [
        { ...passed, previewPath: 'android/previews/passed.jpg' },
        notRun,
        { ...failed, previewPath: 'android/previews/failed.jpg', stepId: 'case:steps:0' },
      ],
    }],
  });
  const appendix = summary.indexOf('<details>');
  assert.ok(summary.indexOf('Failed case') < appendix);
  assert.ok(summary.indexOf('Failed case') < summary.indexOf('Not-run case'));
  assert.ok(summary.indexOf('Not-run case') < appendix);
  assert.ok(summary.indexOf('Passed case') > appendix);
  assert.match(summary.slice(0, appendix), /failed\.jpg[^\n]+Assertion failed/);
  assert.doesNotMatch(summary.slice(0, appendix), /passed\.jpg/);
  assert.match(summary.slice(appendix), /passed\.jpg/);
  assert.doesNotMatch(summary.slice(appendix), /failed\.jpg/);
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
    entries: [{
      label: 'iOS',
      result: 'failure',
      run: failedRun,
      reportPath: 'ios/report/test-run.html',
      cases: [{ ...testCase, previewPath: 'ios/previews/broken.jpg' }],
    }],
  });
  assert.match(summary, /Broken \\| \\\[case\\\]/);
  assert.match(summary, /&lt;unsafe&gt; \\| reason/);
  assert.match(summary, /alt="Broken &#124; \[case\]"/);
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

test('keeps prior run reports at immutable URLs', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'midscene-summary-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const site = path.join(root, 'site');
  await mkdir(source, { recursive: true });
  const file = path.join(source, 'test-run.html');
  const makeEntry = async (marker) => {
    const html = `<html>${marker}</html>`;
    await writeFile(file, html);
    return { label: 'Android', report: { file, html, dump: run } };
  };
  const [first] = await preparePagesSite({
    entries: [await makeEntry('first')],
    siteDirectory: site,
    sitePrefix: 'runs/123-1',
  });
  const [second] = await preparePagesSite({
    entries: [await makeEntry('second')],
    siteDirectory: site,
    sitePrefix: 'runs/124-1',
  });
  assert.equal(first.reportPath, 'runs/123-1/android/report/test-run.html');
  assert.equal(second.reportPath, 'runs/124-1/android/report/test-run.html');
  assert.equal(await readFile(path.join(site, first.reportPath), 'utf8'), '<html>first</html>');
  assert.equal(await readFile(path.join(site, second.reportPath), 'utf8'), '<html>second</html>');
});

test('rejects a run prefix that escapes the Pages site', async () => {
  await assert.rejects(
    preparePagesSite({ entries: [], siteDirectory: '/tmp/unused', sitePrefix: '../bad' }),
    /sitePrefix must be/,
  );
});
