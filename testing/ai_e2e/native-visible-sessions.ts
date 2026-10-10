import { decodeDocumentRoot } from './native-dom.ts';
import type { NativeConnection } from './native-sessions.ts';
import type { createOwnedDeviceVisibilityReader } from './native-wda.ts';
import { resolveVisibleNativeSession, VisibleNativeBindingError } from './native-visible-session.ts';

type Reader = ReturnType<typeof createOwnedDeviceVisibilityReader>;
interface Lease { closed: boolean; client?: NativeConnection; pending: Promise<NativeConnection> }

// A case owns its socket, while each routing phase explicitly observes the
// displayed view again. Retained homepage/parent handles stay on their original
// session across rerenders; they never silently switch to the newest session.
export function createVisibleNativeSessions(connect: () => Promise<NativeConnection>, getReader: (runId: string) => Promise<Reader>) {
  const leases = new Map<string, Lease>();
  const released = new Set<string>();
  let disposed = false;
  const check = (lease: Lease) => { if (lease.closed) throw new Error('Visible native case was released.'); };
  function leaseFor(runId: string) {
    if (typeof runId !== 'string' || !runId) throw new Error('Invalid visible native case identity.');
    if (disposed || released.has(runId)) throw new Error('Visible native case was released.');
    let lease = leases.get(runId);
    if (!lease) {
      lease = { closed: false, pending: undefined! };
      const owned = lease;
      owned.pending = Promise.resolve().then(async () => {
        check(owned);
        const client = await connect();
        if (owned.closed) { client.close(); check(owned); }
        owned.client = client;
        return client;
      });
      leases.set(runId, owned);
    }
    return lease;
  }
  function release(runId: string) {
    released.add(runId);
    const lease = leases.get(runId);
    if (!lease) return;
    leases.delete(runId);
    lease.closed = true;
    lease.client?.close();
    lease.client = undefined;
  }
  return {
    async observe(runId: string, tag: string, expectedText?: string, timeoutMs = 20_000) {
      if (typeof tag !== 'string' || !tag || expectedText !== undefined && typeof expectedText !== 'string'
        || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid visible native observation.');
      const lease = leaseFor(runId);
      const client = await lease.pending;
      check(lease);
      const reader = await getReader(runId);
      check(lease);
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Visible native fixture readiness timed out.');
        try {
          const contexts = await reader.contexts(tag, remaining);
          check(lease);
          const identity = await resolveVisibleNativeSession(client, contexts, tag, expectedText, deadline - Date.now());
          check(lease);
          const request = async (method: string, params?: Record<string, unknown>) => {
            check(lease);
            const result = await client.request(identity.sessionId, method, params);
            check(lease);
            return result;
          };
          return Object.freeze({ ...identity, request,
            readDocument: async () => decodeDocumentRoot(await request('DOM.getDocument')),
          });
        } catch (error) {
          check(lease);
          // Only zero matches are a mounting/readiness condition. Ambiguity and
          // malformed/transport failures cannot turn into a later green result.
          if (!(error instanceof VisibleNativeBindingError) || error.matches !== 0 || Date.now() >= deadline) throw error;
          await new Promise(resolve => setTimeout(resolve, Math.min(200, deadline - Date.now())));
          check(lease);
        }
      }
    },
    release,
    releaseAll() { disposed = true; for (const runId of [...leases.keys()]) release(runId); },
  };
}
