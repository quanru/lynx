#!/usr/bin/env node

import {
  appendFile,
  cp,
  mkdir,
  open,
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
  const options = {
    entries: [],
    results: new Map(),
    artifacts: new Map(),
    artifactAttempts: new Map(),
  };
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
    } else if (name === 'artifact-attempt') {
      const [label, attempt] = splitAssignment(value, name);
      if (options.artifactAttempts.has(label)) {
        throw new Error('Duplicate artifact attempt label');
      }
      options.artifactAttempts.set(label, attempt);
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
        const references = [
          task?.uiContext?.screenshot,
          ...(task?.recorder ?? []).filter(item => item.type === 'screenshot')
            .map(item => item.screenshot),
        ].filter(Boolean);
        for (const reference of references) {
          const embedded = evidence.images.get(reference?.id);
          if (embedded) return embedded;
          if (
            reference?.storage === 'file'
            && typeof reference.path === 'string'
          ) {
            const extension = reference.mimeType === 'image/jpeg'
              ? 'jpg'
              : reference.mimeType?.replace('image/', '')
                ?? path.extname(reference.path).slice(1)
                ?? 'jpg';
            return { extension, path: reference.path };
          }
        }
      }
    }
  }
  return null;
}

async function screenshotBytes(screenshot, reportFile) {
  if (!screenshot) return null;
  if (screenshot.bytes) return screenshot.bytes;
  if (!screenshot.path) return null;
  const reportDirectory = path.resolve(path.dirname(reportFile));
  const source = path.resolve(reportDirectory, screenshot.path);
  const relative = path.relative(reportDirectory, source);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return null;
  }
  try {
    return await readFile(source);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
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

export async function preparePagesSite(
  { entries, siteDirectory, sitePrefix = '' },
) {
  if (sitePrefix && !/^runs\/[0-9]+-[0-9]+$/.test(sitePrefix)) {
    throw new Error('sitePrefix must be runs/RUN_ID-ATTEMPT');
  }
  await mkdir(siteDirectory, { recursive: true });
  const runDirectory = path.join(siteDirectory, sitePrefix);
  const prepared = [];
  for (const entry of entries) {
    if (!entry.report) {
      prepared.push(entry);
      continue;
    }
    const entrySlug = slug(entry.label);
    const reportDirectory = path.join(runDirectory, entrySlug, 'report');
    const previewDirectory = path.join(runDirectory, entrySlug, 'previews');
    await cp(path.dirname(entry.report.file), reportDirectory, {
      recursive: true,
    });
    await mkdir(previewDirectory, { recursive: true });
    const evidence = embeddedEvidence(entry.report.html);
    const cases = [];
    for (const [index, testCase] of rawCases(entry.report.dump).entries()) {
      const step = selectedStep(testCase);
      // Keep the link on the failure. Prefer its nearest preceding capture.
      // An immediate assertion may have no prior capture; only accept a direct
      // first afterEach record, with no intervening case/cleanup action. Never
      // borrow another attempt's image or a screenshot taken after navigation.
      const attempt = testCase.attempts?.at(-1);
      const steps = allAttemptSteps(attempt);
      const preceding = steps.slice(0, steps.indexOf(step) + 1).reverse();
      const cleanup = attempt?.afterEach?.[0];
      const candidates = [...preceding];
      if (
        step?.status === 'failed' && attempt?.steps?.at(-1) === step
        && cleanup?.node === 'recordToReport' && cleanup.status === 'success'
      ) {
        candidates.push(cleanup);
      }
      const screenshot = candidates.map(item =>
        screenshotForStep(item, evidence)
      ).find(Boolean);
      const screenshotContent = await screenshotBytes(
        screenshot,
        entry.report.file,
      );
      const caseSlug = slug(testCase.caseId ?? `${index + 1}-${testCase.name}`);
      let previewPath;
      if (screenshotContent) {
        previewPath = `${
          sitePrefix ? `${sitePrefix}/` : ''
        }${entrySlug}/previews/${caseSlug}.${screenshot.extension}`;
        await writeFile(
          path.join(siteDirectory, previewPath),
          screenshotContent,
        );
      }
      cases.push({ ...testCase, previewPath, stepId: step?.id });
    }
    prepared.push({
      ...entry,
      cases,
      reportPath: `${sitePrefix ? `${sitePrefix}/` : ''}${entrySlug}/report/${
        path.basename(entry.report.file)
      }`,
      run: entry.report.dump,
    });
  }
  await writeFile(path.join(siteDirectory, '.nojekyll'), '');
  return prepared;
}

export async function mergeNativeReports(entries, siteDirectory, sitePrefix) {
  if (entries.some((entry) => !entry.reportPath)) {
    // A missing platform report must not leave the archived index pointing to
    // an older, complete run. Keep current evidence links without implying a
    // complete merged report or inventing evidence for an unexecuted platform.
    await mkdir(siteDirectory, { recursive: true });
    const items = entries.map((entry) =>
      `<li>${escapeHtml(entry.label)}: ${
        escapeHtml(entry.result ?? 'unknown')
      } — ${
        entry.reportPath
          ? `<a href="${
            escapeHtml(entry.reportPath)
          }">Open available report</a>`
          : 'No report was produced; inspect this run’s Actions logs and artifacts.'
      }</li>`
    ).join('\n');
    await writeFile(
      path.join(siteDirectory, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>Incomplete Midscene reports</title>\n<h1>⚠️ Incomplete Midscene reports</h1>\n<p>${
        escapeHtml(sitePrefix || 'Current run')
      }</p>\n<ul>${items}</ul>\n`,
    );
    return null;
  }
  const { mergeReportFiles } = await import('@midscene/core');
  const htmlPaths = entries.map((entry) =>
    path.join(siteDirectory, entry.reportPath)
  );
  const outputDir = path.join(siteDirectory, sitePrefix);
  const { mergedReportPath } = mergeReportFiles({
    htmlPaths,
    outputDir,
    outputName: 'native-report',
  });
  const reportPath = path.relative(siteDirectory, mergedReportPath)
    .split(path.sep).join('/');
  await writeFile(
    path.join(siteDirectory, 'index.html'),
    `<!doctype html><meta http-equiv="refresh" content="0;url=${
      escapeHtml(reportPath)
    }"><a href="${escapeHtml(reportPath)}">Open the Midscene Test report</a>\n`,
  );
  return reportPath;
}

function inlineCell(value) {
  return String(value ?? '—')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/[\r\n]+/g, ' ');
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
  if (!testCase.supplemental && testCase.stepId) {
    url.hash = new URLSearchParams({ 'runner-step': testCase.stepId })
      .toString();
  }
  return url.href;
}

function caseScreenshot(pagesUrl, entry, testCase) {
  if (testCase.expectedInventory) return 'Unavailable';
  if (testCase.evidencePolicy === 'source-return' && !testCase.previewPath) {
    return 'Not applicable (source return)';
  }
  if (testCase.evidencePolicy === 'non-ui') return 'Not applicable (non-UI)';
  if (testCase.evidencePolicy === 'source-skip') {
    return 'Not applicable (source-skipped)';
  }
  if (!pagesUrl) return 'Not published';
  if (!testCase.previewPath || !entry.reportPath) return '—';
  const target = escapeHtml(caseUrl(pagesUrl, entry, testCase));
  const image = escapeHtml(pageUrl(pagesUrl, testCase.previewPath));
  return `<a href="${target}"><img src="${image}" alt="Screenshot" width="160"></a>`;
}

function caseName(testCase) {
  return inlineCell(testCase.name);
}

function caseRow(pagesUrl, entry, testCase, detail, runUrl) {
  return `| ${inlineCell(entry.label)} | ${caseName(testCase)} | ${
    caseScreenshot(pagesUrl, entry, testCase)
  } | ${inlineCell(detail)} | ${
    formatDuration(testCase.attempts?.at(-1)?.durationMs)
  } | ${
    pagesUrl && entry.reportPath
      ? `[Open report](${caseUrl(pagesUrl, entry, testCase)})`
      : entry.reportPath && entry.artifact && runUrl
      ? `[Find artifact: ${inlineCell(entry.artifact)}](${runUrl}#artifacts)`
      : testCase.evidencePolicy === 'source-skip' && !entry.reportPath
      ? 'Not generated (source-skipped)'
      : 'Unavailable'
  } |`;
}

/** Validate external source-contract evidence without counting it as YAML. */
export function validateSupplementalEvidence(value) {
  const fail = message => {
    throw new Error(`Invalid supplemental evidence: ${message}`);
  };
  const object = (item, fields) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail('expected object');
    }
    if (Object.keys(item).some(key => !fields.includes(key))) {
      fail('unknown field');
    }
  };
  const text = item => typeof item === 'string' && item.trim().length > 0;
  object(value, ['label', 'sourceCount', 'expectedCount', 'errors', 'cases']);
  if (!text(value.label)) fail('label is required');
  for (const field of ['sourceCount', 'expectedCount']) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      fail(`${field} must be a nonnegative integer`);
    }
  }
  if (value.sourceCount > value.expectedCount) {
    fail('sourceCount exceeds expectedCount');
  }
  if (!Array.isArray(value.errors) || !value.errors.every(text)) {
    fail('errors must be nonempty strings');
  }
  if (
    !Array.isArray(value.cases) || value.cases.length !== value.expectedCount
  ) fail('case count must equal expectedCount');
  const identities = new Set();
  for (const item of value.cases) {
    object(item, [
      'platform',
      'name',
      'status',
      'reason',
      'durationMs',
      'previewPath',
      'reportPath',
      'artifact',
      'evidencePolicy',
    ]);
    if (!text(item.platform) || !text(item.name)) {
      fail('case platform and name are required');
    }
    const identity = JSON.stringify([item.platform, item.name]);
    if (identities.has(identity)) fail(`duplicate case ${identity}`);
    identities.add(identity);
    if (
      !['success', 'failed', 'not-run', 'flaky', 'skipped', 'not-applicable']
        .includes(
          item.status,
        )
    ) {
      fail('unknown case status');
    }
    const policy = item.evidencePolicy ?? 'ui';
    if (!['ui', 'non-ui', 'source-skip', 'source-return'].includes(policy)) {
      fail('unknown evidencePolicy');
    }
    if ((policy === 'source-skip') !== (item.status === 'skipped')) {
      fail('source-skip requires skipped status exclusively');
    }
    if (
      ['non-ui', 'source-skip'].includes(policy) && item.previewPath != null
    ) {
      fail('exempt cases cannot claim screenshots');
    }
    if (
      policy === 'source-skip'
      && (!text(item.reason) || item.durationMs != null)
    ) {
      fail('source-skipped cases require a reason and no execution duration');
    }
    if ((policy === 'source-return') !== (item.status === 'not-applicable')) {
      fail('source-return requires not-applicable status exclusively');
    }
    if (policy === 'source-return' && !text(item.reason)) {
      fail('source-return requires a reason');
    }
    for (const field of ['reason', 'artifact']) {
      if (item[field] != null && !text(item[field])) {
        fail(`${field} must be a nonempty string`);
      }
    }
    if (
      item.durationMs != null
      && (!Number.isFinite(item.durationMs) || item.durationMs < 0)
    ) fail('invalid durationMs');
    for (const field of ['previewPath', 'reportPath']) {
      const file = item[field];
      if (file == null) continue;
      if (
        typeof file !== 'string'
        || !/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/.test(file)
        || file.split('/').some(segment =>
          !segment || segment === '.' || segment === '..'
        )
      ) {
        fail(`${field} must be a safe site-relative file path`);
      }
    }
  }
  return value;
}

async function readEvidenceJson(file) {
  const limit = 1024 * 1024;
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error('Evidence JSON exceeds 1 MiB');
    return JSON.parse(buffer.subarray(0, length).toString('utf8'));
  } finally {
    await handle.close();
  }
}

/** Use source-collected cases only when matching workflow evidence proves their execution state. */
export async function loadExpectedCaseEvidence(directory, identity, report) {
  const optional = async name => {
    try {
      return await readEvidenceJson(path.join(directory, name));
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  };
  const inventory = await optional('expected-cases.json');
  const execution = await optional('execution-status.json');
  if (inventory === undefined && execution === undefined) return {};
  const fail = message => {
    throw new Error(`Invalid expected-case evidence: ${message}`);
  };
  const object = value =>
    value && typeof value === 'object' && !Array.isArray(value);
  if (!object(inventory) || !object(execution)) {
    fail('inventory and execution status must both exist');
  }
  if (
    !/^[a-f0-9]{40}$/.test(identity.sha ?? '')
    || !/^[1-9][0-9]*$/.test(identity.runId ?? '')
    || !/^[1-9][0-9]*$/.test(identity.attempt ?? '')
  ) fail('current CI identity is required');
  const currentAttempt = identity.currentAttempt ?? identity.attempt;
  if (
    !/^[1-9][0-9]*$/.test(currentAttempt)
    || BigInt(identity.attempt) > BigInt(currentAttempt)
  ) fail('artifact attempt exceeds current attempt');
  for (const value of [inventory, execution]) {
    if (value.schemaVersion !== 1) fail('unsupported schemaVersion');
    for (const field of ['sha', 'runId', 'attempt', 'label']) {
      if (value[field] !== identity[field]) {
        fail(`${field} does not match the current artifact consumer`);
      }
    }
    if (typeof value.projectName !== 'string' || !value.projectName.trim()) {
      fail('projectName is required');
    }
  }
  if (inventory.projectName !== execution.projectName) {
    fail('project identity mismatch');
  }
  if (
    !['success', 'failure', 'cancelled', 'skipped'].includes(execution.outcome)
  ) fail('unknown execution outcome');
  if (
    !Number.isSafeInteger(inventory.expectedCount)
    || inventory.expectedCount < 1
    || !Array.isArray(inventory.cases)
    || inventory.cases.length !== inventory.expectedCount
  ) fail('empty or inconsistent case count');
  const ids = new Set();
  const names = new Set();
  for (const item of inventory.cases) {
    if (
      !object(item) || typeof item.name !== 'string' || !item.name.trim()
      || typeof item.caseId !== 'string' || !/^[a-f0-9]{64}$/.test(item.caseId)
    ) fail('invalid case identity');
    if (
      typeof item.sourcePath !== 'string'
      || !/^[A-Za-z0-9_-][A-Za-z0-9._/-]*\.ya?ml$/.test(item.sourcePath)
      || item.sourcePath.split('/').some(part =>
        !part || part === '.' || part === '..'
      )
    ) fail('unsafe source path');
    const key = JSON.stringify([item.sourcePath, item.name]);
    if (ids.has(item.caseId) || names.has(key)) fail('duplicate expected case');
    ids.add(item.caseId);
    names.add(key);
  }
  if (report) {
    const actual = rawCases(report.dump);
    if (execution.outcome === 'skipped') {
      fail('report contradicts skipped execution');
    }
    if (
      actual.length !== inventory.cases.length
      || actual.some(item =>
        !inventory.cases.some(expected =>
          expected.caseId === item.caseId && expected.name === item.name
        )
      )
      || new Set(actual.map(item => item.caseId)).size !== actual.length
    ) fail('HTML case identities differ from collected inventory');
    return {
      inventoryAttempt: inventory.attempt,
      reusedInventory: inventory.attempt !== currentAttempt,
    }; // Actual results remain authoritative.
  }
  const skipped = execution.outcome === 'skipped';
  return {
    inventoryAttempt: inventory.attempt,
    reusedInventory: inventory.attempt !== currentAttempt,
    cases: inventory.cases.map(item => ({
      ...item,
      expectedInventory: true,
      status: skipped ? 'not-run' : 'failed',
      notRunReason: skipped
        ? 'Device setup or prerequisites prevented the workflow test step from running. No screenshot or HTML report exists.'
        : `Result unavailable: workflow test step ended as ${execution.outcome}, but no readable HTML report exists; individual case execution is unknown.`,
      attempts: [],
    })),
  };
}

function supplementalStatus(item) {
  const status = {
    success: '⚠️ Passed; evidence missing',
    failed: '❌ Failed',
    'not-run': '⏭️ Not run',
    flaky: '⚠️ Flaky',
    'not-applicable': '⚠️ Source return; evidence missing',
  }[item.status];
  const reasons = [item.reason];
  if ((item.evidencePolicy ?? 'ui') === 'ui' && !item.previewPath) {
    reasons.push('Screenshot unavailable');
  }
  if (!item.reportPath) reasons.push('HTML report unavailable');
  return `${status}: ${
    reasons.filter(Boolean).join('; ') || 'No failure detail was recorded.'
  }`;
}

export const SUMMARY_BYTE_LIMIT = 950 * 1024;

/** Share report targets between thumbnails and the Report column without changing image URLs. */
export function compactSummaryReportLinks(markdown) {
  const references = new Map();
  const reference = url => {
    if (!references.has(url)) {
      references.set(url, `m${references.size.toString(36)}`);
    }
    return references.get(url);
  };
  const compact = markdown.replace(
    /<a href="([^"]+)">(<img[^>]+>)<\/a>/g,
    (_, escapedUrl, image) => {
      const url = escapedUrl.replaceAll('&quot;', '"').replaceAll('&#39;', '\'')
        .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll(
          '&amp;',
          '&',
        );
      return `[${image}][${reference(url)}]`;
    },
  ).replace(
    /\[Open report\]\(([^)]+)\)/g,
    (_, url) => `[Open report][${reference(url)}]`,
  );
  if (!references.size) return markdown;
  return `${compact}\n${
    [...references].map(([url, id]) => `[${id}]: <${url}>`).join('\n')
  }\n`;
}

/** Preserve every row on disk, but never silently exceed GitHub's per-step upload limit. */
export async function writeSummaryWithinLimit(
  output,
  markdown,
  runUrl,
  siteDirectory,
) {
  let existing = '';
  try {
    existing = await readFile(output, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const bytes = Buffer.byteLength(existing + markdown);
  if (bytes > SUMMARY_BYTE_LIMIT) {
    const fullPath = path.join(siteDirectory, 'summary-overflow.md');
    await mkdir(siteDirectory, { recursive: true });
    await writeFile(fullPath, existing + markdown);
    await writeFile(
      path.join(siteDirectory, 'summary-overflow.json'),
      JSON.stringify({
        schemaVersion: 1,
        status: 'summary-overflow',
        bytes,
        limit: SUMMARY_BYTE_LIMIT,
        runUrl,
      }),
    );
    const diagnostic =
      `\n## Summary publication failed\n\nThe complete case table exceeds the ${SUMMARY_BYTE_LIMIT}-byte safety limit (${bytes} bytes). No case rows were truncated. Complete Markdown was saved as summary-overflow.md for diagnostic upload. [Inspect run artifacts and logs](${runUrl}#artifacts) for source reports and any successfully uploaded overflow diagnostics.\n`;
    if (Buffer.byteLength(existing + diagnostic) <= SUMMARY_BYTE_LIMIT) {
      await appendFile(output, diagnostic);
    }
    throw new Error(
      `Summary exceeds ${SUMMARY_BYTE_LIMIT}-byte safety limit: ${bytes} bytes; complete Markdown saved to ${fullPath}`,
    );
  }
  await appendFile(output, markdown);
}

export function renderSummary(
  {
    title,
    runUrl,
    pagesUrl,
    entries,
    nativeReportPath,
    jobSummaryOnly = false,
    supplementalEvidence,
  },
) {
  const midsceneCases = entries.flatMap((entry) =>
    (entry.cases ?? rawCases(entry.run)).map((testCase) => ({
      entry,
      testCase,
    }))
  );
  const supplemental = supplementalEvidence === undefined
    ? undefined
    : validateSupplementalEvidence(supplementalEvidence);
  const supplementalCases = (supplemental?.cases ?? []).map(item => ({
    entry: {
      label: item.platform,
      reportPath: item.reportPath,
      artifact: item.artifact,
    },
    testCase: {
      ...item,
      supplemental: true,
      attempts: [{ durationMs: item.durationMs }],
      missingEvidence: item.evidencePolicy === 'source-skip'
        ? false
        : !item.reportPath
          || ((item.evidencePolicy ?? 'ui') === 'ui' && !item.previewPath),
    },
  }));
  const allCases = [...midsceneCases, ...supplementalCases];
  const attentionCases = allCases.filter(
    ({ testCase }) =>
      !['success', 'skipped', 'not-applicable'].includes(testCase.status)
      || testCase.missingEvidence,
  );
  const passedCases = allCases.filter(
    ({ testCase }) =>
      testCase.status === 'success' && !testCase.missingEvidence,
  );
  const sourceSkippedCases = supplementalCases.filter(({ testCase }) =>
    testCase.status === 'skipped'
  );
  const skippedCount = sourceSkippedCases.length;
  const sourceReturnCases = supplementalCases.filter(({ testCase }) =>
    testCase.status === 'not-applicable' && !testCase.missingEvidence
  );
  const returnedCount = sourceReturnCases.length;
  const infrastructureFailures = entries.filter((entry) =>
    (entry.result !== 'success' || entry.run?.status !== 'success')
    && !attentionCases.some(({ entry: caseEntry }) => caseEntry === entry)
  );
  const needsAttention = attentionCases.length + infrastructureFailures.length
    + (supplemental?.errors.length ?? 0);
  const allPassed = needsAttention === 0
    && (passedCases.length > 0 || skippedCount > 0 || returnedCount > 0);
  const successMessage = skippedCount || returnedCount
    ? `✅ ${passedCases.length} cases passed; ${skippedCount} source-skipped; ${returnedCount} source-returned (not applicable).`
    : `🎉 All ${passedCases.length} cases passed.`;
  const sections = [
    `## ${title}`,
    '',
    `**${
      allPassed ? '✅ ' : ''
    }${needsAttention} need attention · ${passedCases.length} passed${
      skippedCount ? ` · ${skippedCount} source-skipped` : ''
    }${returnedCount ? ` · ${returnedCount} source-returned` : ''}**`,
    '',
  ];
  if (supplemental) {
    sections.push(
      `Midscene YAML: ${midsceneCases.length} cases · ${
        inlineCell(supplemental.label)
      }: ${supplemental.sourceCount} source cases / ${supplemental.expectedCount} browser cases.`,
      '',
    );
    const nonUiCount = supplemental.cases.filter(item =>
      item.evidencePolicy === 'non-ui'
    ).length;
    if (nonUiCount || skippedCount) {
      sections.push(
        `Original evidence policies: ${nonUiCount} non-UI · ${skippedCount} source-skipped.`,
        '',
      );
    }
  }
  const attempts = entries.filter(entry => entry.inventoryAttempt).map(entry =>
    `${inlineCell(entry.label)}: attempt ${entry.inventoryAttempt}${
      entry.reusedInventory ? ' (reused)' : ''
    }`
  );
  if (attempts.length) {
    sections.push(`Evidence provenance — ${attempts.join(' · ')}.`, '');
  }
  if (!pagesUrl) {
    if (jobSummaryOnly) {
      sections.push(
        allPassed
          ? successMessage
          : needsAttention
          ? '⚠️ Tests or infrastructure need attention. See the job logs and artifacts for details.'
          : 'No cases were reported.',
        '',
      );
    }
    sections.push(
      `[Download HTML reports and screenshots from the run artifacts](${runUrl}#artifacts).`,
      '',
      'Screenshots and direct HTML links are not published. If publication is skipped or fails, download the named artifact from the run artifacts above and open its HTML report locally.',
      '',
    );
    if (jobSummaryOnly) return sections.join('\n');
  }
  if (pagesUrl && nativeReportPath) {
    sections.push(
      `[Open the published HTML report](${
        pageUrl(pagesUrl, nativeReportPath)
      })`,
      '',
    );
  }
  if (needsAttention) {
    sections.push(
      '### Needs attention',
      '',
      '| Platform | Case | Screenshot | Status / reason | Duration | Report |',
      '|:--|:--|:--|:--|--:|:--|',
      ...infrastructureFailures.map(({ label, result, artifact, run }) => {
        const evidence = artifact
          ? `[Artifact](${runUrl}#artifacts)`
          : `[Workflow run](${runUrl})`;
        return `| ${inlineCell(label)} | — | — | ${
          statusLabel(result, run)
        } · ${evidence} | ${formatDuration(run?.durationMs)} | ${evidence} |`;
      }),
      ...(supplemental?.errors ?? []).map(reason =>
        caseRow(
          pagesUrl,
          { label: supplemental.label },
          { name: 'Evidence validation', supplemental: true },
          `❌ Failed: ${reason}`,
          runUrl,
        )
      ),
      ...attentionCases
        .sort((a, b) =>
          Number(a.testCase.status === 'not-run')
          - Number(b.testCase.status === 'not-run')
        )
        .map(({ entry, testCase }) =>
          caseRow(
            pagesUrl,
            entry,
            testCase,
            testCase.supplemental
              ? supplementalStatus(testCase)
              : `${
                testCase.status === 'not-run' ? '⏭️ Not run' : '❌ Failed'
              }: ${failedReason(testCase)}`,
            runUrl,
          )
        ),
      '',
    );
  } else if (allPassed) {
    sections.push(successMessage, '');
  } else {
    sections.push('No cases were reported.', '');
  }
  sections.push(
    '<details>',
    skippedCount || returnedCount
      ? `<summary>Appendix: passed cases (${passedCases.length}) and source exclusions (${skippedCount} skipped, ${returnedCount} returned)</summary>`
      : `<summary>Appendix: passed cases (${passedCases.length})</summary>`,
    '',
    '| Platform | Case | Screenshot | Status | Duration | Report |',
    '|:--|:--|:--|:--|--:|:--|',
    ...passedCases.map(({ entry, testCase }) =>
      caseRow(pagesUrl, entry, testCase, '✅ Passed', runUrl)
    ),
    ...sourceSkippedCases.map(({ entry, testCase }) =>
      caseRow(
        pagesUrl,
        entry,
        testCase,
        `⏭️ Skipped in original source: ${testCase.reason}`,
        runUrl,
      )
    ),
    ...sourceReturnCases.map(({ entry, testCase }) =>
      caseRow(
        pagesUrl,
        entry,
        testCase,
        `↩️ Not applicable (original source return): ${testCase.reason}`,
        runUrl,
      )
    ),
    '',
    '</details>',
    '',
    ...(pagesUrl
      ? [
        supplemental
          ? 'Click a screenshot or Open report link for its HTML evidence. Midscene links select the exact step; original source-contract links open their browser report.'
          : 'Click a screenshot or Open report link to open the complete HTML report at that exact step.',
      ]
      : []),
    '',
  );
  return compactSummaryReportLinks(sections.join('\n'));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const supplementalEvidence = options['supplemental-evidence']
    ? validateSupplementalEvidence(
      await readEvidenceJson(options['supplemental-evidence']),
    )
    : undefined;
  if (!options.entries.length) {
    throw new Error('At least one --entry is required');
  }
  const loaded = await Promise.all(
    options.entries.map(async ([label, directory]) => {
      const report = await latestRun(directory);
      const runIdentity = /^runs\/([1-9][0-9]*)-([1-9][0-9]*)$/.exec(
        options['site-prefix'] ?? '',
      );
      const expected = await loadExpectedCaseEvidence(directory, {
        label,
        sha: options['expected-sha'] ?? process.env.GITHUB_SHA,
        runId: runIdentity?.[1],
        attempt: options.artifactAttempts.get(label) ?? runIdentity?.[2],
        currentAttempt: runIdentity?.[2],
      }, report);
      return {
        label,
        result: options.results.get(label) ?? 'unknown',
        artifact: options.artifacts.get(label),
        report,
        ...expected,
      };
    }),
  );
  const entries = await preparePagesSite({
    entries: loaded,
    siteDirectory: required(options, 'site-dir'),
    sitePrefix: options['site-prefix'] ?? '',
  });
  let nativeReportPath;
  if (options['job-summary-only'] === 'true') {
    nativeReportPath = entries.length === 1 ? entries[0].reportPath : null;
  } else {
    nativeReportPath = await mergeNativeReports(
      entries,
      required(options, 'site-dir'),
      options['site-prefix'] ?? '',
    );
  }
  const markdown = renderSummary({
    title: required(options, 'title'),
    runUrl: required(options, 'run-url'),
    pagesUrl: options['links-published'] === 'false'
      ? undefined
      : required(options, 'pages-url'),
    entries,
    nativeReportPath,
    jobSummaryOnly: options['job-summary-only'] === 'true',
    supplementalEvidence,
  });
  await writeSummaryWithinLimit(
    required(options, 'output'),
    markdown,
    required(options, 'run-url'),
    required(options, 'site-dir'),
  );
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
