#!/usr/bin/env bash
# Check model endpoint connectivity before spending time starting an emulator or WDA.
# Usage: bash scripts/preflight-model.sh
set -euo pipefail

: "${MIDSCENE_MODEL_API_KEY:?MIDSCENE_MODEL_API_KEY is required}"
: "${MIDSCENE_MODEL_NAME:?MIDSCENE_MODEL_NAME is required}"
: "${MIDSCENE_MODEL_BASE_URL:?MIDSCENE_MODEL_BASE_URL is required}"
: "${MIDSCENE_MODEL_FAMILY:?MIDSCENE_MODEL_FAMILY is required}"

node --input-type=module <<'NODE'
const baseUrl = process.env.MIDSCENE_MODEL_BASE_URL.replace(/\/+$/, '');
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.MIDSCENE_MODEL_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: process.env.MIDSCENE_MODEL_NAME,
    messages: [{ role: 'user', content: 'Reply OK.' }],
    max_tokens: 1,
  }),
  signal: AbortSignal.timeout(90_000),
});
if (!response.ok) {
  throw new Error(`Model preflight returned HTTP ${response.status}`);
}
await response.arrayBuffer();
console.log('Model endpoint reachable.');
NODE
