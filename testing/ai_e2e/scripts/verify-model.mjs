import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseEnv, stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Use the official verifier, but never print its credential-bearing failure curl.
export function redactModelOutput(output, settings) {
  let safe = output;
  const secrets = Object.entries(settings)
    .filter(([name, value]) => /KEY|TOKEN|PASSWORD|SECRET/i.test(name) && value)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) safe = safe.split(secret).join('[REDACTED]');
  return safe.replace(/(Authorization:\s*Bearer\s+)[^\s'"]+/gi, '$1[REDACTED]');
}

// Fail closed if the pinned CLI's output format changes or any capability,
// authentication, HTTP, or post-connection request check fails. The official
// verifier intentionally ignores MIDSCENE_MODEL_RETRY_COUNT and sends each
// check once, so only pure connection-establishment failures are retried here.
export function connectionTimeoutsOnly(output) {
  const text = stripVTControlCharacters(output);
  const summary = /Requests sent: \d+\. Checks: (\d+) passed, (\d+) failed\./.exec(text);
  if (!summary || Number(summary[1]) + Number(summary[2]) !== 4 || Number(summary[2]) === 0) return false;
  const section = text.split('Request endpoints:')[0];
  const failures = [...section.matchAll(/(?:^|\n)(planning|insight|locate|default): ([\s\S]*?)(?=\n(?:planning|insight|locate|default): |$)/g)];
  return failures.length === Number(summary[2]) && new Set(failures.map(match => match[1])).size === failures.length
    && failures.every(match => match[2].startsWith('AI model request failed')
      && /^Cause: ConnectTimeoutError \[UND_ERR_CONNECT_TIMEOUT\]: Connect Timeout Error/m.test(match[2]));
}

export async function verifyModel({ execute = execFile, wait = sleep,
  stdout = text => process.stdout.write(text), stderr = text => process.stderr.write(text) } = {}) {
  let local = {};
  try {
    local = parseEnv(await readFile('.env', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const settings = { ...process.env, ...local };
  const cli = fileURLToPath(
    new URL(
      '../node_modules/@midscene/test/bin/midscene-test',
      import.meta.url,
    ),
  );
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await new Promise(resolveResult => {
      execute(process.execPath, [cli, 'model', 'verify'], {
        maxBuffer: 4 * 1024 * 1024,
        timeout: 180_000,
      }, (error, out, err) => resolveResult({ error, out, err }));
    });
    stdout(redactModelOutput(result.out, settings));
    stderr(redactModelOutput(result.err, settings));
    if (!result.error) return 0;
    if (result.error.code !== 1 || attempt === 3 || !connectionTimeoutsOnly(result.out)) {
      stderr('Official Midscene model verification failed. Credentials have been redacted.\n');
      return 1;
    }
    stderr(`Model verification only failed to establish connections; retrying (${attempt + 1}/3) in 10s.\n`);
    await wait(10_000);
  }
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await verifyModel();
}
