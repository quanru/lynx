import assert from 'node:assert/strict';
import test from 'node:test';
import { redactModelOutput } from './verify-model.mjs';

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
