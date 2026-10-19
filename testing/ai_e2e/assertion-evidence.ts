import { isFatalDeviceError, WorkflowError } from '@midscene/test';

// Preserve failure status and its original cause. The SDK renders diagnostic
// details without requiring a device/report operation. WorkflowError uses the
// SDK's cross-module identity; NodeExecutionError.output is lost when a loaded
// config and runner use different CJS/ESM constructors in this SDK version.
export async function withAssertionEvidence<T>(node: string, data: unknown,
  signal: AbortSignal | undefined, execute: () => Promise<T>): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    // Cancellation and device recovery belong to the runner. Do not replace
    // their identity or claim that a pending observation completed.
    if (signal?.aborted || isFatalDeviceError(error)) throw error;
    throw new WorkflowError(`Node "${node}" failed: ${error instanceof Error ? error.message : String(error)}`, {
      code: 'NODE_EXECUTION_ERROR',
      cause: error,
      details: {
        node,
        evidenceStatus: 'Partial observations from a failed step; not evidence of a pass',
        evidence: structuredClone(data),
      },
    });
  }
}
