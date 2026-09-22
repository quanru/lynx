#!/usr/bin/env node

import { appendFile, readFile, readdir } from 'node:fs/promises';
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
  return match
    ? JSON.parse(normalizeJsonControlCharacters(match[1]))
    : null;
}

async function latestRun(directory) {
  const runs = [];
  for (const file of await findHtmlFiles(directory)) {
    const dump = testRunDump(await readFile(file, 'utf8'));
    if (dump?.kind === 'test-runner' && dump.schemaVersion === 1) {
      runs.push({ dump, file });
    }
  }
  return runs.sort((left, right) =>
    String(left.dump.endedAt).localeCompare(String(right.dump.endedAt))
  ).at(-1);
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

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function casesFor(run) {
  return (run?.projects ?? []).flatMap((project) =>
    (project.documents ?? []).flatMap((document) =>
      (document.cases ?? []).map((testCase) => ({
        ...testCase,
        project: project.name,
      }))
    )
  );
}

function failedReason(testCase) {
  const attempt = testCase.attempts?.at(-1);
  const steps = [
    ...(attempt?.beforeEach ?? []),
    ...(attempt?.steps ?? []),
    ...(attempt?.afterEach ?? []),
  ];
  return (
    steps.find((step) => step.status === 'failed')?.error?.message
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

export function renderSummary({ title, runUrl, entries }) {
  const rows = entries.map(({ label, result, artifact, run }) => {
    const summary = run?.summary ?? {};
    const reportLink = artifact
      ? `[${inlineCell(artifact)}](${runUrl}#artifacts)`
      : `[Workflow run](${runUrl})`;
    return `| ${inlineCell(label)} | ${statusLabel(result, run)} | ${
      summary.total ?? 0
    } | ${summary.passed ?? 0} | ${summary.failed ?? 0} | ${
      summary.notRun ?? 0
    } | ${formatDuration(run?.durationMs)} | ${reportLink} |`;
  });
  const allCases = entries.flatMap((entry) =>
    casesFor(entry.run).map((testCase) => ({ ...entry, testCase }))
  );
  const failedCases = allCases.filter(
    ({ testCase }) => testCase.status !== 'success',
  );
  const sections = [
    `## ${title}`,
    '',
    '| Platform | Result | Cases | Passed | Failed | Not run | Duration | Report artifact |',
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
      ...failedCases.map(({ label, testCase }) => {
        const attempt = testCase.attempts?.at(-1);
        return `| ${inlineCell(label)} | ❌ ${inlineCell(testCase.name)} | ${
          formatDuration(attempt?.durationMs)
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
    '<details>',
    `<summary>All cases (${allCases.length})</summary>`,
    '',
    '| Platform | Case | Status | Duration |',
    '|:--|:--|:--|--:|',
    ...allCases.map(({ label, testCase }) => {
      const attempt = testCase.attempts?.at(-1);
      const status = testCase.status === 'success'
        ? '✅ Passed'
        : testCase.status === 'not-run'
        ? '⏭️ Not run'
        : '❌ Failed';
      return `| ${inlineCell(label)} | ${
        inlineCell(testCase.name)
      } | ${status} | ${formatDuration(attempt?.durationMs)} |`;
    }),
    '',
    '</details>',
    '',
    'Download the linked artifact to open the complete Midscene HTML report and inspect screenshots, model reasoning, and replay data.',
    '',
  );
  return sections.join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.entries.length) {
    throw new Error('At least one --entry is required');
  }
  const entries = await Promise.all(
    options.entries.map(async ([label, directory]) => ({
      label,
      result: options.results.get(label) ?? 'unknown',
      artifact: options.artifacts.get(label),
      run: (await latestRun(directory))?.dump,
    })),
  );
  const markdown = renderSummary({
    title: required(options, 'title'),
    runUrl: required(options, 'run-url'),
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
