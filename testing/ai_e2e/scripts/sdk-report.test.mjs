import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runTestProject } from '@midscene/test/config';
import {
  mergeNativeReports,
  preparePagesSite,
  renderSummary,
  testRunDump,
} from './render-ci-summary.mjs';

test('real pinned SDK reports retain passed and failed cases through publication without a model or browser', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'midscene-sdk-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, 'midscene.config.mjs');
  await writeFile(
    configPath,
    [
      'import { defineNode } from '
      + JSON.stringify(import.meta.resolve('@midscene/test')) + ';',
      'import { defineTestProject } from '
      + JSON.stringify(import.meta.resolve('@midscene/test/config')) + ';',
      'export default defineTestProject({',
      'output: { reportDir: '
      + JSON.stringify(path.join(root, 'midscene_run/report')) + ' },',
      'projects: [{ name: "sdk-contract", retry: 0, files: { include: ["case.yaml"] } }],',
      'nodes: [defineNode({name: "contract", execute({input}) { if (input.fail) throw new Error("Exact contract failed"); }})]',
      '});',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'case.yaml'),
    JSON.stringify({
      cases: [
        { name: 'Passing contract', steps: [{ contract: { fail: false } }] },
        { name: 'Failing contract', steps: [{ contract: { fail: true } }] },
      ],
    }),
  );
  const result = await runTestProject({
    projectRoot: root,
    configPath,
    resultDir: path.join(root, '.midscene/test-results'),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 1);
  const html = await readFile(result.reportPath, 'utf8');
  const dump = testRunDump(html);
  assert.equal(dump.schemaVersion, 1);
  assert.equal(dump.summary.passed, 1);
  assert.equal(dump.summary.failed, 1);
  const site = path.join(root, 'site');
  const entries = await preparePagesSite({
    entries: [{
      label: 'SDK',
      result: 'failure',
      report: { file: result.reportPath, html, dump },
    }],
    siteDirectory: site,
  });
  const merged = await mergeNativeReports(entries, site, '');
  const mergedHtml = await readFile(path.join(site, merged), 'utf8');
  assert.equal(testRunDump(mergedHtml).summary.failed, 1);
  const summary = renderSummary({
    title: 'SDK publication contract',
    runUrl: 'https://example.test/run',
    pagesUrl: 'https://example.test/pages',
    entries,
    nativeReportPath: merged,
  });
  assert.match(summary, /1 need attention · 1 passed/);
  assert.ok(summary.indexOf('Failing contract') < summary.indexOf('<details>'));
  assert.ok(summary.indexOf('Passing contract') > summary.indexOf('<details>'));
  assert.doesNotMatch(summary, /<img/);
});
