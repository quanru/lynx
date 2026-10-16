import { fileURLToPath } from 'node:url';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4AQMAAADlivq5AAAABlBMVEUMDAz///9dPQ0fAAAACXBIWXMAAAsTAAALEwEAmpwYAAACcklEQVR4nO3WQY7cIBAF0EJesOQI5BjZOUfJEbLMzhwNaRY5RrhBLGVDJMs/qipsD8Z092wTs+jpHr+x4VdBD+Ejg27djDuTdtyZtOPO5J/M5NclmM46ENGESB5ANgAWvUfwANGVHhciy+8NgCR/CHKYicYrnYkMMPMLArmiI+nbCy3TMfxLGgCsqm1Pj6pXeQwW1cMTvZCsrWjT0161TgpZNfU0XzW8VNFz0dOl/nbozLmJ9ulKT9lrYgZIZmWd+DPyWfOCpgwEi/iZ9QAuTySHH1jel2fXAKLFG1c+2V3/xNrqLD+i1T6JVlpEK9rVadNOG+pLT5uzdgDFjp7POjqsTzRfzYc2PZ2GVi/DYx0qnTfdVIdnjJVDzvsqsxW9tFqSlk2Vi7aY3RM9vddJtZai1jxj6eRcammRfE/L+mRPZdVkEVVruLXm9Ulb5NKDFmEUrXFVWtLY753MynoSHXt6m3ei72RBqsP5hAAkuz2TRHyKkKydN9RJS3WPvGfWqxEtJTtrORC2WmbWi+pqo6ku9eKH5l0PpQpTR/OCcjmrbLZFo9VH/Y2cg582XRVHdbnBtndA9NXydGisi1Proehokiuan3fS5XHzphe3a+6gJxqIm67iLnro6bWKW3Xq6qWKu6eDV13Hrbos/ELPpqv3BAFSPdVxF+2A39r4uWheHJ8rttUc6nz0yZ9yQOnev9ZOthcR+Txp57GW0GvNJZAtULRLr2i96nmBeKDHD+h1037X5gU97nroa2kG/boORdvn2mDX/pGW6fANA+ul/CfQyUTGfDRnqHvpSr8y6NbNuDNpx51JO+5M2nFn0o7/I5O/RblE9mhAZh4AAAAASUVORK5CYII=';
const expected = '731942';

// An image-only OCR challenge catches text-only models whose HTTP-200 replies
// hallucinate visual evidence from the assertion itself. No answer in the prompt.
export async function checkVision({
  baseUrl,
  apiKey,
  modelName,
  modelFamily,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !apiKey || !modelName || !modelFamily) {
    throw new Error(
      'Model vision preflight requires all four MIDSCENE_MODEL settings.',
    );
  }
  const request = {
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: image, detail: 'high' } },
        {
          type: 'text',
          text:
            'Read the six-digit code in this image. Reply with only those six digits, with no explanation.',
        },
      ],
    }],
    max_tokens: 128,
  };
  if (modelFamily === 'deepseek' || modelFamily === 'doubao-seed') {
    request.thinking = { type: 'disabled' };
  }
  const response = await fetchImpl(
    `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Model vision preflight returned HTTP ${response.status}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() !== expected) {
    throw new Error(
      'Model vision preflight failed: the endpoint could not read the image-only challenge. Use a vision-capable model; HTTP 200 alone is insufficient.',
    );
  }
  return data.model ?? modelName;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const model = await checkVision({
    baseUrl: process.env.MIDSCENE_MODEL_BASE_URL,
    apiKey: process.env.MIDSCENE_MODEL_API_KEY,
    modelName: process.env.MIDSCENE_MODEL_NAME,
    modelFamily: process.env.MIDSCENE_MODEL_FAMILY,
  });
  console.log(`Model vision preflight passed (${model}).`);
}
