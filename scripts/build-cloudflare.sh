#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

echo "[impactmatch] Installing frontend dependencies (Cloudflare build)..."
npm install --prefix "${FRONTEND_DIR}"

echo "[impactmatch] Building frontend bundle for Cloudflare Pages..."
npm run build --prefix "${FRONTEND_DIR}"

echo "[impactmatch] Build complete. Artifacts located in ${FRONTEND_DIR}/dist"

