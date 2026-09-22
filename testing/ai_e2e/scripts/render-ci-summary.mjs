#!/usr/bin/env node

import {
  appendFile,
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function splitAssignment(value, optionName) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`--${optionName} must use LABEL=VALUE`);
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function parseArguments(argv) {
  const options = { entries: [], results: new Map(), artifacts: new Map() };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? '<end>'}`);
    }
    const name = key.slice(2);
    if (name === 'entry') options.entries.push(splitAssignment(value, name));
    else if (name === 'result') {
      const [label, result] = splitAssignment(value, name);
      options.results.set(label, result);
    } else if (name === 'artifact') {
      const [label, artifact] = splitAssignment(value, name);
      options.artifacts.set(label, artifact);
    } else options[name] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function findHtmlFiles(directory) {
  const results = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const item = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(item);
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        results.push(item);
      }
    }
  }
  await visit(directory);
  return results.sort();
}

// Some report versions contain unescaped control characters inside JSON strings.
function normalizeJsonControlCharacters(source) {
  let normalized = '';
  let insideString = false;
  let escaped = false;
  for (const character of source) {
    if (!insideString) {
      normalized += character;
      if (character === '"') insideString = true;
    } else if (escaped) {
      normalized += character;
      escaped = false;
    } else if (character === '\\') {
      normalized += character;
      escaped = true;
    } else if (character === '"') {
      normalized += character;
      insideString = false;
    } else if (character.charCodeAt(0) <= 0x1f) {
      normalized += `\\u${
        character.charCodeAt(0).toString(16).padStart(4, '0')
      }`;
    } else normalized += character;
  }
  return normalized;
}

export function testRunDump(reportHtml) {
  const match = reportHtml.match(
    /<script\s+type=["']midscene_test_run_dump["'][^>]*>\s*(\{[\s\S]*?)<\/script>/,
  );
  return match ? JSON.parse(normalizeJsonControlCharacters(match[1])) : null;
}

async function latestRun(directory) {
  const runs = [];
  for (const file of await findHtmlFiles(directory)) {
    const html = await readFile(file, 'utf8');
    const dump = testRunDump(html);
    if (dump?.kind === 'test-runner' && dump.schemaVersion === 1) {
      runs.push({ dump, file, html });
    }
  }
  return runs
    .sort((left, right) =>
      String(left.dump.endedAt).localeCompare(String(right.dump.endedAt))
    )
    .at(-1);
}

function scriptAttributes(source) {
  const attributes = new Map();
  for (const match of source.matchAll(/([\w-]+)=["']([^"']*)["']/g)) {
    attributes.set(match[1], match[2]);
  }
  return attributes;
}

function embeddedEvidence(reportHtml) {
  const dumps = [];
  for (
    const match of reportHtml.matchAll(
      /<script\s+([^>]*\btype=["']midscene_web_dump["'][^>]*)>\s*(\{[\s\S]*?)<\/script>/g,
    )
  ) {
    try {
      dumps.push({
        reportId: scriptAttributes(match[1]).get('data-report-id'),
        dump: JSON.parse(normalizeJsonControlCharacters(match[2].trim())),
      });
    } catch {
      // The report UI bundle contains example script tags; only JSON dumps count.
    }
  }
  const images = new Map();
  for (
    const match of reportHtml.matchAll(
      /<script\s+([^>]*\btype=["']midscene-image["'][^>]*)>([\s\S]*?)<\/script>/g,
    )
  ) {
    const id = scriptAttributes(match[1]).get('data-id');
    const data = match[2].trim().match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/,
    );
    if (id && data) {
      images.set(id, {
        bytes: Buffer.from(data[2].replaceAll(/\s/g, ''), 'base64'),
        extension: data[1] === 'jpeg' ? 'jpg' : data[1],
      });
    }
  }
  return { dumps, images };
}

function allAttemptSteps(attempt) {
  return [
    ...(attempt?.beforeEach ?? []),
    ...(attempt?.steps ?? []),
    ...(attempt?.afterEach ?? []),
  ];
}

function selectedStep(testCase) {
  const steps = allAttemptSteps(testCase.attempts?.at(-1));
  const hasEvidence = (step) => (step?.agentDetails?.length ?? 0) > 0;
  if (testCase.status === 'success') {
    return steps.findLast(hasEvidence) ?? steps.at(-1);
  }
  return (
    steps.find((step) => step.status === 'failed' && hasEvidence(step))
      ?? steps.find((step) => step.status === 'failed')
      ?? steps.findLast(hasEvidence)
      ?? steps.at(-1)
  );
}

function screenshotForStep(step, evidence) {
  for (const detail of [...(step?.agentDetails ?? [])].reverse()) {
    const candidates = evidence.dumps.filter(
      (item) => !detail.reportId || item.reportId === detail.reportId,
    );
    for (const item of candidates) {
      const execution = item.dump?.executions?.find(
        (entry) => entry.id === detail.executionId,
      );
      for (const task of [...(execution?.tasks ?? [])].reverse()) {
        const screenshot = evidence.images.get(task?.uiContext?.screenshot?.id);
        if (screenshot) return screenshot;
      }
    }
  }
  return null;
}

function slug(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report'
  );
}

function rawCases(run) {
  return (run?.projects ?? []).flatMap((project) =>
    (project.documents ?? []).flatMap((document) => document.cases ?? [])
  );
}

export async function preparePagesSite({ entries, siteDirectory }) {
  await mkdir(siteDirectory, { recursive: true });
  const prepared = [];
  for (const entry of entries) {
    if (!entry.report) {
      prepared.push(entry);
      continue;
    }
    const entrySlug = slug(entry.label);
    const reportDirectory = path.join(siteDirectory, entrySlug, 'report');
    const previewDirectory = path.join(siteDirectory, entrySlug, 'previews');
    await cp(path.dirname(entry.report.file), reportDirectory, {
      recursive: true,
    });
    await mkdir(previewDirectory, { recursive: true });
    const evidence = embeddedEvidence(entry.report.html);
    const cases = [];
    for (const [index, testCase] of rawCases(entry.report.dump).entries()) {
      const step = selectedStep(testCase);
      const screenshot = screenshotForStep(step, evidence);
      const caseSlug = slug(testCase.caseId ?? `${index + 1}-${testCase.name}`);
      let previewPath;
      if (screenshot) {
        previewPath =
          `${entrySlug}/previews/${caseSlug}.${screenshot.extension}`;
        await writeFile(
          path.join(siteDirectory, previewPath),
          screenshot.bytes,
        );
      }
      cases.push({ ...testCase, previewPath, stepId: step?.id });
    }
    prepared.push({
      ...entry,
      cases,
      reportPath: `${entrySlug}/report/${path.basename(entry.report.file)}`,
      run: entry.report.dump,
    });
  }
  const links = prepared
    .filter((entry) => entry.reportPath)
    .map(
      (entry) =>
        `<li><a href="${escapeHtml(entry.reportPath)}">${
          escapeHtml(entry.label)
        } Midscene report</a></li>`,
    )
    .join('\n');
  await writeFile(
    path.join(siteDirectory, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Midscene reports</title><body><main><h1>Midscene reports</h1><ul>${links}</ul></main></body></html>\n`,
  );
  await writeFile(path.join(siteDirectory, '.nojekyll'), '');
  return prepared;
}

function inlineCell(value) {
  return String(value ?? '—')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function failedReason(testCase) {
  return (
    allAttemptSteps(testCase.attempts?.at(-1)).find(
      (step) => step.status === 'failed',
    )?.error?.message
      ?? testCase.notRunReason
      ?? 'No failure detail was recorded.'
  );
}

function statusLabel(result, run) {
  if (result === 'success' && run?.status === 'success') return '✅ Passed';
  if (result === 'cancelled') return '⏹️ Cancelled';
  if (result === 'skipped') return '⏭️ Skipped';
  if (!run) return '❌ Failed before report';
  return '❌ Failed';
}

function normalizedBaseUrl(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function pageUrl(baseUrl, relativePath) {
  return new URL(relativePath, normalizedBaseUrl(baseUrl)).href;
}

function caseUrl(baseUrl, entry, testCase) {
  const url = new URL(entry.reportPath, normalizedBaseUrl(baseUrl));
  if (testCase.stepId) {
    url.hash = new URLSearchParams({ 'runner-step': testCase.stepId })
      .toString();
  }
  return url.href;
}

function screenshotGrid(pagesUrl, entries) {
  const cells = entries.flatMap((entry) =>
    (entry.cases ?? [])
      .filter((testCase) => testCase.previewPath)
      .map((testCase) => {
        const target = caseUrl(pagesUrl, entry, testCase);
        const image = pageUrl(pagesUrl, testCase.previewPath);
        const name = inlineCell(testCase.name);
        return `[![${name}](${image})](${target})<br>[${name}](${target})`;
      })
  );
  if (!cells.length) return '_No node screenshots were produced._';
  const rows = [];
  for (let index = 0; index < cells.length; index += 3) {
    const row = cells.slice(index, index + 3);
    while (row.length < 3) row.push('');
    rows.push(`| ${row.join(' | ')} |`);
  }
  return ['| | | |', '|:--|:--|:--|', ...rows].join('\n');
}

export function renderSummary({ title, runUrl, pagesUrl, entries }) {
  const rows = entries.map(({ label, result, artifact, run, reportPath }) => {
    const summary = run?.summary ?? {};
    const links = [
      reportPath ? `[Open HTML](${pageUrl(pagesUrl, reportPath)})` : null,
      artifact ? `[Artifact](${runUrl}#artifacts)` : null,
    ]
      .filter(Boolean)
      .join(' · ') || `[Workflow run](${runUrl})`;
    return `| ${inlineCell(label)} | ${statusLabel(result, run)} | ${
      summary.total ?? 0
    } | ${summary.passed ?? 0} | ${summary.failed ?? 0} | ${
      summary.notRun ?? 0
    } | ${formatDuration(run?.durationMs)} | ${links} |`;
  });
  const allCases = entries.flatMap((entry) =>
    (entry.cases ?? rawCases(entry.run)).map((testCase) => ({
      entry,
      testCase,
    }))
  );
  const failedCases = allCases.filter(
    ({ testCase }) => testCase.status !== 'success',
  );
  const sections = [
    `## ${title}`,
    '',
    '| Platform | Result | Cases | Passed | Failed | Not run | Duration | Evidence |',
    '|:--|:--|--:|--:|--:|--:|--:|:--|',
    ...rows,
    '',
  ];
  if (failedCases.length) {
    sections.push(
      `### Failures (${failedCases.length})`,
      '',
      '| Platform | Case | Duration | Reason |',
      '|:--|:--|--:|:--|',
      ...failedCases.map(({ entry, testCase }) => {
        const name = entry.reportPath
          ? `[${inlineCell(testCase.name)}](${
            caseUrl(pagesUrl, entry, testCase)
          })`
          : inlineCell(testCase.name);
        return `| ${inlineCell(entry.label)} | ❌ ${name} | ${
          formatDuration(testCase.attempts?.at(-1)?.durationMs)
        } | ${inlineCell(failedReason(testCase))} |`;
      }),
      '',
    );
  } else if (
    entries.every(
      ({ result, run }) => result === 'success' && run?.status === 'success',
    )
  ) {
    sections.push(`**All ${allCases.length} cases passed.**`, '');
  }
  sections.push(
    '### Node screenshots',
    '',
    screenshotGrid(pagesUrl, entries),
    '',
    '<details>',
    `<summary>All cases (${allCases.length})</summary>`,
    '',
    '| Platform | Case | Status | Duration |',
    '|:--|:--|:--|--:|',
    ...allCases.map(({ entry, testCase }) => {
      const status = testCase.status === 'success'
        ? '✅ Passed'
        : testCase.status === 'not-run'
        ? '⏭️ Not run'
        : '❌ Failed';
      const name = entry.reportPath
        ? `[${inlineCell(testCase.name)}](${
          caseUrl(pagesUrl, entry, testCase)
        })`
        : inlineCell(testCase.name);
      return `| ${inlineCell(entry.label)} | ${name} | ${status} | ${
        formatDuration(testCase.attempts?.at(-1)?.durationMs)
      } |`;
    }),
    '',
    '</details>',
    '',
    'Each image is the original Midscene node screenshot. Click an image or case name to open the complete HTML report at that exact step.',
    '',
  );
  return sections.join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.entries.length) {
    throw new Error('At least one --entry is required');
  }
  const loaded = await Promise.all(
    options.entries.map(async ([label, directory]) => ({
      label,
      result: options.results.get(label) ?? 'unknown',
      artifact: options.artifacts.get(label),
      report: await latestRun(directory),
    })),
  );
  const entries = await preparePagesSite({
    entries: loaded,
    siteDirectory: required(options, 'site-dir'),
  });
  const markdown = renderSummary({
    title: required(options, 'title'),
    runUrl: required(options, 'run-url'),
    pagesUrl: required(options, 'pages-url'),
    entries,
  });
  await appendFile(required(options, 'output'), markdown);
  const missingReports = entries
    .filter(({ result, run }) => result === 'success' && !run)
    .map(({ label }) => label);
  if (missingReports.length) {
    throw new Error(
      `Successful jobs did not produce readable Midscene reports: ${
        missingReports.join(', ')
      }`,
    );
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
