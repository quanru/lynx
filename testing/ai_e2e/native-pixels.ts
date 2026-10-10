import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTaggedNode } from './native-dom.ts';
import type { bindFixtureSession } from './native-session.ts';

type BoundSession = Awaited<ReturnType<typeof bindFixtureSession>>;
export async function captureNativePixels(session: BoundSession, tag?: string) {
  const root = await session.readDocument();
  const body = root.children?.[0];
  if (!body || !Number.isInteger(body.nodeId) || body.nodeId < 0) throw new Error('Missing native LynxView body.');
  const result = await session.request('Lynx.getRectToWindow', { nodeId: body.nodeId }) as { rect?: unknown };
  const rect = (result?.rect ?? result) as Record<string, unknown>;
  const fields = ['left', 'top', 'width', 'height'];
  if (!rect || !fields.every(key => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
    || (rect.left as number) < 0 || (rect.top as number) < 0
    || (rect.width as number) <= 0 || (rect.height as number) <= 0) throw new Error('Invalid native LynxView rectangle.');
  async function padding(nodeId: number) {
    const box = await session.request('DOM.getBoxModel', { nodeId }) as { model?: { padding?: unknown } };
    const quad = box?.model?.padding;
    if (!Array.isArray(quad) || quad.length !== 8
      || quad.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid native padding quad.');
    return quad as number[];
  }
  const geometry = tag === undefined ? {} : {
    bodyPadding: await padding(body.nodeId),
    elementPadding: await padding(findTaggedNode(root, tag).nodeId),
  };
  const frame = await session.captureFrame();
  return { frame: frame.data, rect: Object.fromEntries(fields.map(key => [key, rect[key]])), ...geometry };
}

export async function expectNativePixels(session: BoundSession, platform: 'android' | 'ios',
  runId: string, baseline: 'text_flattern_element', tag: string): Promise<void> {
  if (!['android', 'ios'].includes(platform) || baseline !== 'text_flattern_element' || tag !== 'flatten-text'
    || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Invalid native pixel contract.');
  const payload = { ...await captureNativePixels(session, tag), platform };
  const root = fileURLToPath(new URL('./', import.meta.url));
  const script = resolve(root, 'scripts/compare-native-capture.py');
  const baselinePath = resolve(root, '../integration_test/test_script/resources', platform, baseline + '.png');
  const output = resolve(root, 'midscene_run/native-pixels', platform, runId);
  await new Promise<void>((yes, no) => {
    const child = execFile(process.env.MIDSCENE_PIXEL_PYTHON ?? 'python3', [script, baselinePath, output],
      { timeout: 60_000, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
        if (error) no(new Error(`Original native pixel contract failed; evidence: ${output}\n${stderr}`, { cause: error }));
        else yes();
      });
    child.stdin!.on('error', no);
    child.stdin!.end(JSON.stringify(payload));
  });
}
