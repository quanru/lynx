// Match the original LynxDebuggerScreenCast capture protocol. This is not a
// device screenshot replacement: native pixel baselines use this JPEG stream.
export async function captureNativeFrame(client, sessionId, timeoutMs = 60_000) {
  if (!Number.isInteger(sessionId) || sessionId < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid native screencast session or timeout.');
  }
  await client.request(sessionId, 'Page.enable');
  const frame = client.waitForNotification(sessionId, 'Page.screencastFrame', timeoutMs);
  let started = false;
  // Observe rejection immediately even when startScreencast fails first.
  const received = frame.promise.then(params => {
    if (typeof params.data !== 'string' || !params.data
      || params.data.length > 64 * 1024 * 1024
      || Buffer.from(params.data, 'base64').toString('base64') !== params.data) {
      throw new Error('Invalid native screencast image data.');
    }
    return params;
  });
  received.catch(() => {});
  let failure;
  try {
    started = true;
    const [, params] = await Promise.all([
      client.request(sessionId, 'Page.startScreencast', {
        format: 'jpeg', maxHeight: 9999, maxWidth: 9999, quality: 100,
      }), received,
    ]);
    return params;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    frame.cancel();
    // No restart loop or fallback to another session/device screenshot.
    if (started) {
      try { await client.request(sessionId, 'Page.stopScreencast'); }
      catch (error) {
        if (failure) throw new AggregateError([failure, error], 'Native screencast failed and cleanup failed.');
        throw error;
      }
    }
  }
}
