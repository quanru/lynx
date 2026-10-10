import type { NativeConnection } from '../native-sessions.ts';
export function connectDevtool(options?: {
  host?: string;
  port?: number;
  timeoutMs?: number;
}): Promise<NativeConnection>;
