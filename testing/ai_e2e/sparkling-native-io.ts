type OwnedRequest = (method: 'GET' | 'POST', endpoint: string, data?: unknown) => Promise<unknown>;

async function bounded<T>(read: () => Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid Sparkling native deadline.');
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Sparkling native observation timed out.')), timeoutMs);
    })]);
    if (Date.now() >= deadline) throw new Error('Sparkling native observation timed out.');
    return result;
  } catch (error) {
    if (Date.now() >= deadline) throw new Error('Sparkling native observation timed out.');
    throw error;
  } finally { clearTimeout(timer!); }
}

// Read-only alert observation. Only pinned WDA's structured HTTP 404 "no such
// alert" is absence; network errors, malformed JSON and HTTP 500 cannot pass.
export async function readOwnedRouteAlert(request: OwnedRequest, timeoutMs = 5000): Promise<string | null> {
  try {
    const response = await bounded(() => request('GET', '/alert/text'), timeoutMs) as { value?: unknown };
    if (!response || typeof response !== 'object' || typeof response.value !== 'string') throw new Error('Invalid Sparkling native alert text.');
    return response.value;
  } catch (error) {
    const failure = error as { name?: string; status?: number; response?: { value?: { error?: string } } };
    if (failure?.name === 'WebDriverRequestError' && failure.status === 404 && failure.response?.value?.error === 'no such alert') return null;
    throw error;
  }
}

export async function expectOwnedRouteAlert(read: (timeoutMs: number) => Promise<string | null>, dismissed: boolean, timeoutMs = 10_000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid Sparkling alert deadline.');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Sparkling route alert assertion timed out.');
    const text = await read(remaining);
    if (text !== null && !text.includes('missing_target')) throw new Error('Expected the original missing_target route alert.');
    if (Date.now() <= deadline && (dismissed ? text === null : text !== null)) return;
    const delay = deadline - Date.now();
    if (delay <= 0) throw new Error('Sparkling route alert assertion timed out.');
    await new Promise(resolve => setTimeout(resolve, Math.min(200, delay)));
  }
}

// This is the API under test, not an ordinary UI action: deliver the registered
// UIApplication external route to the explicit Explorer bundle, as the original
// mobile: deepLink contract does. Never fall back to Safari or restart Explorer.
export async function deliverOwnedExternalRoute(request: OwnedRequest, route: string, timeoutMs = 10_000) {
  if (!['hybrid://lynxview_page?nav_role=parent',
    'hybrid://lynxview_page?bundle=automation%2Fnav-basic%2Fmain.lynx.bundle&nav_role=parent'].includes(route)) {
    throw new Error('Invalid original Sparkling external route.');
  }
  const response = await bounded(() => request('POST', '/url', {
    url: 'lynx://open?url=' + encodeURIComponent(route), bundleId: 'com.lynx.LynxExplorer',
  }), timeoutMs) as { value?: unknown };
  if (!response || typeof response !== 'object' || !Object.hasOwn(response, 'value')
    || response.value && typeof response.value === 'object' && Object.hasOwn(response.value, 'error')) {
    throw new Error('Invalid Sparkling external route response.');
  }
}
