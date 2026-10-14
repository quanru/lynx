import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

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

export async function verifyModel() {
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
  return new Promise(resolveResult => {
    execFile(process.execPath, [cli, 'model', 'verify'], {
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      process.stdout.write(redactModelOutput(stdout, settings));
      process.stderr.write(redactModelOutput(stderr, settings));
      if (error) {
        process.stderr.write(
          'Official Midscene model verification failed. Credentials have been redacted.\n',
        );
      }
      resolveResult(error ? 1 : 0);
    });
  });
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await verifyModel();
}
