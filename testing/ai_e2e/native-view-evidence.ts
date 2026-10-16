import type { NativeRect } from './native-wda.ts';

type OwnedRead = (method: 'GET' | 'POST', endpoint: string, data?: unknown) => Promise<unknown>;

// Diagnostic only: retain actual visible native view frames alongside the CDP
// capture rectangle. Never choose a rectangle from baseline dimensions or use
// this unbound list to select a DevTool session or alter a pixel comparison.
export async function readVisibleViewEvidence(read: OwnedRead, timeoutMs = 5000): Promise<NativeRect[]> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid native evidence timeout.');
  let timer: ReturnType<typeof setTimeout>;
  let active = true;
  const deadline = Date.now() + timeoutMs;
  const observation = async () => {
    async function value(method: 'GET' | 'POST', endpoint: string, data?: unknown) {
      if (!active || Date.now() >= deadline) throw new Error('Native view evidence timed out.');
      const response = await read(method, endpoint, data) as { value?: unknown };
      if (!active || Date.now() >= deadline) throw new Error('Native view evidence timed out.');
      if (!response || typeof response !== 'object' || !Object.hasOwn(response, 'value')
        || response.value && typeof response.value === 'object' && Object.hasOwn(response.value, 'error')) {
        throw new Error('Invalid native view evidence response.');
      }
      return response.value;
    }
    const found = await value('POST', '/elements', { using: 'xpath', value: "//*[@label='lynxview']" });
    if (!Array.isArray(found)) throw new Error('Invalid native view evidence list.');
    const rects: NativeRect[] = [];
    for (const item of found) {
      const id = item?.['element-6066-11e4-a52e-4f735466cecf'] ?? item?.ELEMENT;
      if (typeof id !== 'string' || !id) throw new Error('Invalid native view evidence identity.');
      const base = '/element/' + encodeURIComponent(id);
      const displayed = await value('GET', base + '/displayed');
      if (typeof displayed !== 'boolean') throw new Error('Invalid native view evidence visibility.');
      if (!displayed) continue;
      const rect = await value('GET', base + '/rect') as NativeRect;
      if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key as keyof NativeRect]))
        || rect.width <= 0 || rect.height <= 0) throw new Error('Invalid native view evidence rectangle.');
      rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
    return rects;
  };
  try {
    return await Promise.race([observation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Native view evidence timed out.')), timeoutMs);
    })]);
  } finally { active = false; clearTimeout(timer!); }
}
