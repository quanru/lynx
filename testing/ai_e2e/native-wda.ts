export interface NativeRect { x: number; y: number; width: number; height: number }
export interface VisibleNativeContext {
  viewId: string;
  viewRect: NativeRect;
  anchor: { tag: string; rect: NativeRect; texts: string[] };
}

// The same priority as the original Sparkling helper. A parent/child role marker
// takes precedence over homepage controls, which can survive behind a push.
export const displayAnchors = [
  'nav-page-marker', 'runtime-lynx', 'runtime-sparkling', 'bundle-url-input',
] as const;

export function nativeXPathLiteral(value: string) {
  if (!value.includes("'")) return "'" + value + "'";
  if (!value.includes('"')) return '"' + value + '"';
  return 'concat(' + value.split("'").map(part => "'" + part + "'").join(', "\'", ') + ')';
}

function elementIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid native WDA element list.');
  return value.map(item => {
    const id = item?.['element-6066-11e4-a52e-4f735466cecf'] ?? item?.ELEMENT;
    if (typeof id !== 'string' || !id) throw new Error('Invalid native WDA element identity.');
    return id;
  });
}

function nativeRect(value: unknown): NativeRect {
  const rect = value as NativeRect;
  if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key as keyof NativeRect]))
    || rect.width <= 0 || rect.height <= 0) throw new Error('Invalid native WDA rectangle.');
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

// Attach to an explicitly owned case session. Never discover or choose the
// newest WDA session, access SDK private fields, or add a selector-based action.
// The returned surface contains only native reads; it cannot close that session.
export function attachNativeVisibilityReader(options: { sessionId: string; host: string; port: number }) {
  if (!options || typeof options.sessionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(options.sessionId)
    || typeof options.host !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(options.host) || !Number.isInteger(options.port)
    || options.port < 1 || options.port > 65535) throw new Error('Invalid native WDA session attachment.');
  const base = `http://${options.host}:${options.port}/session/${options.sessionId}`;
  async function read(endpoint: string, deadline: number, data?: Record<string, string>): Promise<unknown> {
    const timeout = Math.ceil(deadline - Date.now());
    if (timeout <= 0) throw new Error('Native visibility observation timed out.');
    // Abort covers body decoding as well as response headers. Only element
    // search uses POST; session creation, actions and deletion are unavailable.
    const response = await fetch(base + endpoint, {
      method: data ? 'POST' : 'GET', signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) throw new Error(`Native WDA read failed (HTTP ${response.status}).`);
    const result = await response.json();
    if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'value')
      || result.value && typeof result.value === 'object' && Object.hasOwn(result.value, 'error')) {
      throw new Error('Invalid native WDA response.');
    }
    return result.value;
  }
  const endpoint = (id: string, suffix: string) => '/element/' + encodeURIComponent(id) + '/' + suffix;
  async function displayed(id: string, deadline: number) {
    const value = await read(endpoint(id, 'displayed'), deadline);
    if (typeof value !== 'boolean') throw new Error('Invalid native WDA visibility.');
    return value;
  }
  async function find(xpath: string, deadline: number, root?: string) {
    return elementIds(await read(root ? endpoint(root, 'elements') : '/elements', deadline,
      { using: 'xpath', value: xpath }));
  }
  return {
    async contexts(tag: string, timeoutMs = 5000): Promise<VisibleNativeContext[]> {
      if (typeof tag !== 'string' || !tag || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('Invalid native visibility observation.');
      }
      const deadline = Date.now() + timeoutMs;
      const contexts: VisibleNativeContext[] = [];
      const tags: string[] = [...displayAnchors];
      if (!tags.includes(tag)) tags.push(tag);
      for (const viewId of await find("//*[@label='lynxview']", deadline)) {
        if (!await displayed(viewId, deadline)) continue;
        let anchor: VisibleNativeContext['anchor'] | undefined;
        for (const candidate of tags) {
          for (const id of await find('.//*[@name=' + nativeXPathLiteral(candidate) + ']', deadline, viewId)) {
            if (!await displayed(id, deadline)) continue;
            const texts = new Set<string>();
            for (const attribute of ['text', 'value', 'label', 'name']) {
              const value = await read(endpoint(id, attribute === 'text' ? 'text' : 'attribute/' + attribute), deadline);
              if (typeof value === 'string' && value) texts.add(value);
            }
            anchor = { tag: candidate, texts: [...texts], rect: nativeRect(await read(endpoint(id, 'rect'), deadline)) };
            break;
          }
          if (anchor) break;
        }
        if (anchor) contexts.push({ viewId, viewRect: nativeRect(await read(endpoint(viewId, 'rect'), deadline)), anchor });
      }
      return contexts;
    },
    async displayedTypes(tag: string, timeoutMs = 5000): Promise<string[]> {
      if (typeof tag !== 'string' || !tag || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('Invalid native element-type observation.');
      }
      const deadline = Date.now() + timeoutMs;
      const types: string[] = [];
      for (const id of await find('//*[@name=' + nativeXPathLiteral(tag) + ']', deadline)) {
        if (!await displayed(id, deadline)) continue;
        const type = await read(endpoint(id, 'attribute/type'), deadline);
        if (typeof type !== 'string' || !type) throw new Error('Invalid native WDA element type.');
        types.push(type);
      }
      return types;
    },
  };
}
