#!/usr/bin/env bash
# Build lại image và deploy bản production lên máy nhà (cổng 5555).
set -euo pipefail
cd "$(dirname "$0")"

PORT=5555
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

# Bí mật sinh ngẫu nhiên một lần, giữ nguyên cho các lần sau (deploy/.env không commit).
secret() { node -e "console.log(require('crypto').randomBytes(${1:-24}).toString('hex'))"; }
touch .env
chmod 600 .env
grep -q '^POSTGRES_PASSWORD=' .env || echo "POSTGRES_PASSWORD=$(secret)" >> .env
grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(secret 48)" >> .env

"${COMPOSE[@]}" up -d --build --remove-orphans

echo "Chờ http://localhost:${PORT}/api/health ..."
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo "✔ XÓM đang chạy: http://localhost:${PORT}"
    "${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
    exit 0
  fi
  sleep 2
done

echo "✘ Health check thất bại sau 120s" >&2
"${COMPOSE[@]}" logs --tail 40 server web >&2
exit 1
