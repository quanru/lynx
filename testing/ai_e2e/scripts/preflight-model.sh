#!/usr/bin/env bash
# Verify model image-reading capability before starting an emulator or WDA.
# Usage: bash scripts/preflight-model.sh
set -euo pipefail

: "${MIDSCENE_MODEL_API_KEY:?MIDSCENE_MODEL_API_KEY is required}"
: "${MIDSCENE_MODEL_NAME:?MIDSCENE_MODEL_NAME is required}"
: "${MIDSCENE_MODEL_BASE_URL:?MIDSCENE_MODEL_BASE_URL is required}"
: "${MIDSCENE_MODEL_FAMILY:?MIDSCENE_MODEL_FAMILY is required}"

node "$(dirname "$0")/vision-preflight.mjs"
