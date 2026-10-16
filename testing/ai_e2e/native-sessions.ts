import { bindFixtureSession, NativeFixtureBindingError } from './native-session.ts';
import type { NativeClient } from './native-session.ts';

export interface NativeConnection extends NativeClient { close(): void }
type BoundSession = Awaited<ReturnType<typeof bindFixtureSession>>;
interface Lease {
  key: string;
  closed: boolean;
  client?: NativeConnection;
  pending: Promise<BoundSession>;
}

// Connections belong to case attempts, never to a global newest LynxView.
export function createNativeSessions(connect: () => Promise<NativeConnection>, { bindingTimeoutMs = 10_000 } = {}) {
  if (!Number.isFinite(bindingTimeoutMs) || bindingTimeoutMs < 0) throw new Error('Invalid native fixture readiness timeout.');
  const runs = new Map<string, Lease>();
  function close(lease: Lease) {
    lease.closed = true;
    lease.client?.close();
    lease.client = undefined;
  }
  function release(runId: string) {
    const lease = runs.get(runId);
    if (!lease) return;
    runs.delete(runId);
    close(lease);
  }
  return {
    get(runId: string, tags: string[], texts: string[] = []): Promise<BoundSession> {
      const key = JSON.stringify({ tags, texts });
      const existing = runs.get(runId);
      if (existing) {
        if (existing.key !== key) return Promise.reject(new Error('A native case cannot switch fixture identity.'));
        return existing.pending;
      }
      const lease: Lease = { key, closed: false, pending: undefined! };
      // Defer connection creation so the lease owns cleanup even when connect
      // rejects synchronously or teardown races an in-flight handshake.
      lease.pending = Promise.resolve().then(async () => {
        if (lease.closed) throw new Error('Native case was released before connection.');
        const client = await connect();
        if (lease.closed) {
          client.close();
          throw new Error('Native case was released during connection.');
        }
        lease.client = client;
        const deadline = Date.now() + bindingTimeoutMs;
        for (;;) {
          try {
            const session = await bindFixtureSession(client, tags, texts);
            if (lease.closed) throw new Error('Native case was released during fixture binding.');
            return session;
          } catch (error) {
            // Only an absent, not-yet-mounted fixture is a readiness condition.
            // Ambiguous identities, invalid DOM and CDP/transport errors fail.
            if (!(error instanceof NativeFixtureBindingError) || error.matches !== 0
              || Date.now() >= deadline || lease.closed) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.min(200, deadline - Date.now())));
            if (lease.closed) throw new Error('Native case was released during fixture readiness.');
          }
        }
      }).catch(error => {
        close(lease);
        throw error;
      });
      runs.set(runId, lease);
      return lease.pending;
    },
    release,
    releaseAll() { for (const runId of [...runs.keys()]) release(runId); },
  };
}
