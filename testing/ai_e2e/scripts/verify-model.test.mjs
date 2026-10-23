import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionTimeoutsOnly, redactModelOutput, verifyModel } from './verify-model.mjs';

const connectionFailure = `AI model request failed after 0 retries (1/1 attempts). Last error: Request timed out.
OpenAI fetch error: TypeError: fetch failed
Cause: ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error (timeout: 10000ms)`;
const verification = failures => failures.map(([role, message]) => `${role}: ${message}\n`).join('\n')
  + `\nRequest endpoints:\n  default: https://example.test/chat/completions\n\nRequests sent: 4. Checks: ${4 - failures.length} passed, ${failures.length} failed.\n`;

test('only complete verifier evidence of connection-only failures is retryable', () => {
  const timeout = verification([['insight', connectionFailure], ['default', connectionFailure]]);
  assert.equal(connectionTimeoutsOnly(timeout), true);
  assert.equal(connectionTimeoutsOnly(`\u001b[31m${timeout}\u001b[0m`), true);
  for (const output of [
    '', verification([]),
    verification([['insight', 'The model could not read the image'], ['default', connectionFailure]]),
    verification([['default', 'AI model request failed: HTTP 401']]),
    verification([['default', 'AI model request failed: Request timed out.']]),
    verification([['default', connectionFailure], ['default', connectionFailure]]),
    timeout.replace('2 failed', '3 failed'),
    timeout.replace('insight:', 'unknown-role:'),
    timeout.replaceAll('UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'),
  ]) assert.equal(connectionTimeoutsOnly(output), false);
});

test('official verifier retries at most three times, redacts every attempt, and requires a real success', async () => {
  for (const recovered of [true, false]) {
    let calls = 0;
    const waits = [], output = [];
    const status = await verifyModel({
      execute(command, args, options, callback) {
        calls++;
        assert.equal(command, process.execPath);
        assert.deepEqual(args.slice(1), ['model', 'verify']);
        assert.equal(options.timeout, 180_000);
        const success = recovered && calls === 3;
        callback(success ? null : { code: 1 }, success ? verification([]) : verification([['default', connectionFailure]]),
          'Authorization: Bearer do-not-print-this\n');
      },
      wait: async ms => waits.push(ms), stdout: text => output.push(text), stderr: text => output.push(text),
    });
    assert.equal(status, recovered ? 0 : 1);
    assert.equal(calls, 3);
    assert.deepEqual(waits, [10_000, 10_000]);
    assert.doesNotMatch(output.join(''), /do-not-print-this/);
  }
});

test('capability failures and killed or malformed verifier executions never get another attempt', async () => {
  for (const result of [
    { error: { code: 1 }, out: verification([['insight', 'wrong image answer'], ['default', connectionFailure]]) },
    { error: { code: 1 }, out: 'Unrecognized CLI output' },
    { error: { code: null, killed: true }, out: verification([['default', connectionFailure]]) },
  ]) {
    let calls = 0;
    assert.equal(await verifyModel({
      execute(command, args, options, callback) { calls++; callback(result.error, result.out, ''); },
      wait: async () => assert.fail('unexpected retry'), stdout: () => {}, stderr: () => {},
    }), 1);
    assert.equal(calls, 1);
  }
});

test('official model verifier output redacts environment and local credentials', () => {
  const output =
    'failure sk-secret-local / sk-secret-shell / Authorization: Bearer unlisted-token';
  const safe = redactModelOutput(output, {
    MIDSCENE_MODEL_API_KEY: 'sk-secret-local',
    OTHER_API_KEY: 'sk-secret-shell',
  });
  assert.equal(
    safe,
    'failure [REDACTED] / [REDACTED] / Authorization: Bearer [REDACTED]',
  );
});

test('successful verification retains capability results and diagnostics without secrets', () => {
  assert.equal(
    redactModelOutput('Text PASS\nImage PASS\nAI locate PASS', {}),
    'Text PASS\nImage PASS\nAI locate PASS',
  );
  assert.equal(
    redactModelOutput('long-secret and long', {
      API_KEY: 'long-secret',
      TOKEN: 'long',
    }),
    '[REDACTED] and [REDACTED]',
  );
});
