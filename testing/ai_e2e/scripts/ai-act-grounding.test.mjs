import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectWorkflowDocument } from '@midscene/test';
import { loadTestProject } from '@midscene/test/config';

test('native actions independently refine small controls but retain full-frame navigation and crowded seek context', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const loaded = await loadTestProject(root + 'midscene.config.ts');
  for (const project of loaded.projects) {
    const dirs = ['cases/native', ...(project.name.startsWith('ios') ? ['cases/ios-sparkling'] : [])];
    let count = 0, crowdedCount = 0;
    for (const dir of dirs) for (const file of readdirSync(root + dir).filter(file => /\.ya?ml$/.test(file))) {
      const sourcePath = dir + '/' + file;
      const document = collectWorkflowDocument({ projectId: project.projectId, projectName: project.name,
        sourcePath, absolutePath: root + sourcePath }, {
        resolveNode: project.nodes.get.bind(project.nodes), variables: project.variables, env: process.env,
      });
      for (const item of document.cases) for (const step of item.definition.steps) if (step.node === 'aiAct') {
        count++;
        const crowdedSeek = (sourcePath === 'cases/native/video-modes.yaml'
          && step.input.prompt.startsWith('Click the single Seek 2s button once:'))
          || (sourcePath === 'cases/native/video-boundary.yaml'
            && (step.input.prompt.startsWith('Click the single "Seek Null" button once:')
              || step.input.prompt.includes('This is the Seek Null control;')));
        if (crowdedSeek) crowdedCount++;
        const inlineText = project.name.startsWith('ios') && sourcePath === 'cases/native/event.yaml'
          && step.input.prompt.startsWith('Click only the inline text');
        const deepLocate = (/^cases\/native\/video-/.test(sourcePath) && !crowdedSeek) || inlineText;
        assert.deepEqual(step.input.options, { effort: 'deepThink', deepLocate, cacheable: false },
          `${project.name}/${sourcePath}/${item.definition.name}`);
      }
    }
    assert.ok(count > 0, 'The contract must inspect actual collected actions');
    assert.equal(crowdedCount, 2, 'Keep full-frame grounding for exactly Seek 2s and Seek Null');
  }
});

test('public deepThink aiAct independently grounds the full frame without planner coordinates or cropping', { timeout: 15000 }, async t => {
  // This test must never inherit real planning/insight endpoints or credentials.
  const modelEnvironment = new Map(Object.entries(process.env).filter(([key]) => /^(MIDSCENE_|OPENAI_)/.test(key)));
  for (const key of modelEnvironment.keys()) delete process.env[key];
  t.after(() => { for (const [key, value] of modelEnvironment) process.env[key] = value; });
  const { Agent } = await import('../node_modules/@midscene/core/dist/es/agent/agent.mjs');
  const { defineActionTap } = await import('@midscene/core/device');
  const { default: sharp } = await import('sharp');
  const screenshot = 'data:image/png;base64,' + (await sharp({ create: {
    width: 120, height: 240, channels: 3, background: '#ffffff',
  } }).png().toBuffer()).toString('base64');
  const requests = [];
  const replies = [
    '<planning>Tap the test button once.</planning><log>Tap the button</log><action-type>Tap</action-type><action-param-json>{"locate":{"prompt":"the test button"}}</action-param-json>',
    '<｜｜point｜｜>[[500, 500]]<｜｜/point｜｜>',
  ];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: 'model-free-control', model: 'test',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: replies[requests.length - 1] ?? 'Unexpected extra request' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchImpl = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.origin, origin, 'Model-free regression must not contact any external endpoint');
    return fetchImpl(input, options);
  });
  const controller = new AbortController();
  const stop = new Error('Stop after the single inert test tap');
  const taps = [];
  const agent = new Agent({
    interfaceType: 'ios', describe: () => 'Model-free static test',
    screenshotBase64: async () => screenshot,
    size: async () => ({ width: 40, height: 80 }),
    actionSpace: () => [defineActionTap(point => { taps.push(point); controller.abort(stop); })],
    url: async () => 'test://grounding', destroy: async () => {},
  }, {
    generateReport: false, autoPrintReportMsg: false, waitAfterAction: 0,
    modelConfig: {
      MIDSCENE_MODEL_API_KEY: 'model-free-test-placeholder',
      MIDSCENE_MODEL_NAME: 'test', MIDSCENE_MODEL_FAMILY: 'deepseek',
      MIDSCENE_MODEL_BASE_URL: `${origin}/v1`,
    },
  });
  t.after(() => agent.destroy());
  await agent.aiAct('Tap the test button once.', {
    effort: 'deepThink', deepLocate: false, cacheable: false,
    abortSignal: controller.signal,
  }).catch(() => { assert.equal(controller.signal.reason, stop); });
  assert.deepEqual(taps, [{ x: 20, y: 40 }]);
  assert.equal(requests.length, 2, 'Exactly one planner request and one full-frame locator request');
  const textParts = request => request.messages.flatMap(message => typeof message.content === 'string'
    ? [message.content] : message.content.filter(part => part.type === 'text').map(part => part.text)).join('\n');
  assert.doesNotMatch(textParts(requests[0]), /"point"\s*:/, 'Deep planning must not request inline action coordinates');
  const imageParts = requests[1].messages.flatMap(message => Array.isArray(message.content)
    ? message.content.filter(part => part.type === 'image_url') : []);
  assert.equal(imageParts.length, 1);
  const metadata = await sharp(Buffer.from(imageParts[0].image_url.url.split(',')[1], 'base64')).metadata();
  assert.deepEqual([metadata.width, metadata.height], [120, 240], 'Locator receives the complete screenshot');
  const tasks = agent.dump.executions.flatMap(execution => execution.tasks);
  const locate = tasks.find(task => task.subType === 'Locate');
  assert.ok(locate, 'The SDK must actually run an independent Locate task');
  assert.equal(locate.param.locatedPixelResult, undefined);
  assert.equal(locate.log.dump.deepLocate, false);
  assert.equal(locate.log.dump.taskInfo.searchArea, undefined);
});
