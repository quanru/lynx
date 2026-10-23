import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

test('provider retry backoff remains abortable inside the original step deadline', { timeout: 15000 }, async t => {
  const inherited = new Map(Object.entries(process.env).filter(([key]) => /^(MIDSCENE_|OPENAI_)/.test(key)));
  for (const key of inherited.keys()) delete process.env[key];
  t.after(() => { for (const [key, value] of inherited) process.env[key] = value; });
  const { Agent } = await import('../node_modules/@midscene/core/dist/es/agent/agent.mjs');
  const { defineActionTap } = await import('@midscene/core/device');
  const { default: sharp } = await import('sharp');
  const screenshot = 'data:image/png;base64,' + (await sharp({ create: {
    width: 120, height: 240, channels: 3, background: '#ffffff',
  } }).png().toBuffer()).toString('base64');
  const controller = new AbortController();
  const reason = new Error('Original step deadline');
  let requests = 0, firstResponseAt, abortTimer;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the inert request. */ }
    requests++;
    firstResponseAt ??= Date.now();
    response.writeHead(429, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Model-free RPM control', type: 'TooManyRequests' } }));
    abortTimer = setTimeout(() => controller.abort(reason), 100);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { clearTimeout(abortTimer); server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchImpl = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.origin, origin, 'No external model request is allowed');
    return fetchImpl(input, options);
  });
  const agent = new Agent({
    interfaceType: 'ios', describe: () => 'Model-free provider retry control',
    screenshotBase64: async () => screenshot, size: async () => ({ width: 40, height: 80 }),
    actionSpace: () => [defineActionTap(() => assert.fail('No physical action after provider failure'))],
    url: async () => 'test://provider-retry', destroy: async () => {},
  }, {
    generateReport: false, autoPrintReportMsg: false, waitAfterAction: 0,
    modelConfig: {
      MIDSCENE_MODEL_API_KEY: 'model-free-test-placeholder',
      MIDSCENE_MODEL_NAME: 'test', MIDSCENE_MODEL_FAMILY: 'deepseek',
      MIDSCENE_MODEL_BASE_URL: `${origin}/v1`,
      MIDSCENE_MODEL_RETRY_COUNT: '2', MIDSCENE_MODEL_RETRY_INTERVAL: '30000',
    },
  });
  t.after(() => agent.destroy());
  await assert.rejects(agent.aiAct('Tap the test button once.', {
    effort: 'deepThink', deepLocate: false, cacheable: false, abortSignal: controller.signal,
  }), () => controller.signal.reason === reason);
  assert.equal(requests, 1, 'Aborting the backoff must prevent a second provider request');
  assert.ok(Date.now() - firstResponseAt < 5000, 'The 30-second provider backoff must not extend the step deadline');
});
