import type { NativeClient } from '../native-session.ts';
export function captureNativeFrame(client: NativeClient, sessionId: number, timeoutMs?: number): Promise<{ data: string }>;
