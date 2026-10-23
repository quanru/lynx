import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVision } from './vision-preflight.mjs';

const config = {
  baseUrl: 'https://example.test/api/v3/',
  apiKey: 'test-key',
  modelName: 'test-endpoint',
  modelFamily: 'deepseek',
};

function response(content, model = 'actual-vision-version') {
  return {
    ok: true,
    json: async () => ({ model, choices: [{ message: { content } }] }),
  };
}

test('connection timeouts receive at most three attempts with fresh abort signals', async () => {
  const signals = [];
  const delays = [];
  const timeout = new TypeError('fetch failed', {
    cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
  });
  const model = await checkVision({
    ...config,
    sleepImpl: async (delay) => delays.push(delay),
    fetchImpl: async (_, request) => {
      signals.push(request.signal);
      if (signals.length < 3) throw timeout;
      return response('731942');
    },
  });
  assert.equal(model, 'actual-vision-version');
  assert.equal(new Set(signals).size, 3);
  assert.deepEqual(delays, [10_000, 10_000]);
  let attempts = 0;
  await assert.rejects(checkVision({
    ...config,
    sleepImpl: async () => {},
    fetchImpl: async () => { attempts++; throw timeout; },
  }), (error) => error === timeout);
  assert.equal(attempts, 3);
});

test('preflight does not retry capability failures, HTTP errors or other transport errors', async () => {
  for (const result of [response('wrong'), { ok: false, status: 503 }, new Error('network error')]) {
    let attempts = 0;
    await assert.rejects(checkVision({
      ...config,
      sleepImpl: async () => assert.fail('unexpected retry'),
      fetchImpl: async () => {
        attempts++;
        if (result instanceof Error) throw result;
        return result;
      },
    }));
    assert.equal(attempts, 1);
  }
});

test('preflight requires image-only OCR and reports the actual response model', async () => {
  const model = await checkVision({
    ...config,
    fetchImpl: async (url, request) => {
      assert.equal(url, 'https://example.test/api/v3/chat/completions');
      const body = JSON.parse(request.body);
      assert.equal(body.thinking.type, 'disabled');
      const parts = body.messages[0].content;
      assert.match(parts[0].image_url.url, /^data:image\/png;base64,/);
      assert.doesNotMatch(parts[1].text, /731942/);
      return response('731942\n');
    },
  });
  assert.equal(model, 'actual-vision-version');
});

test('HTTP 200 from a text-only or wrong-answer endpoint is not sufficient', async () => {
  for (const answer of ['OK', 'I cannot see this image.', '731943', null]) {
    await assert.rejects(
      checkVision({ ...config, fetchImpl: async () => response(answer) }),
      /image-only challenge/,
    );
  }
});

test('failed HTTP requests cannot pass the capability gate', async () => {
  await assert.rejects(
    checkVision({
      ...config,
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    /HTTP 401/,
  );
});

test('missing settings fail before any model call', async () => {
  await assert.rejects(
    checkVision({
      ...config,
      apiKey: '',
      fetchImpl: async () => assert.fail('unexpected fetch'),
    }),
    /four MIDSCENE_MODEL/,
  );
});

test('other providers do not receive an unsupported thinking option', async () => {
  await checkVision({
    ...config,
    modelFamily: 'other',
    fetchImpl: async (_, request) => {
      assert.equal(JSON.parse(request.body).thinking, undefined);
      return response('731942');
    },
  });
});
