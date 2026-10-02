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
