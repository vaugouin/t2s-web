#!/usr/bin/env bash
# Run on the Docker host from a Git checkout. No host Node.js is required.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
  echo "Create .env with the API URLs and keys before deploying." >&2
  exit 1
fi
if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "Docker Compose is required." >&2
  exit 1
fi
docker network inspect reverseproxy >/dev/null
"${compose[@]}" config --quiet
"${compose[@]}" build t2s-web
# Validate configuration without printing URLs or credentials or querying the API.
"${compose[@]}" run --rm --no-deps --entrypoint node t2s-web --input-type=module -e '
  import {loadConfig} from "./server.mjs";
  try {
    const config=loadConfig();
    if (!Object.values(config.upstreams).some(value=>value.key)) throw new Error();
    if (config.basePath!=="/t2s-web/") throw new Error();
  } catch { console.error("Invalid or incomplete server-side API configuration."); process.exit(1); }
'
"${compose[@]}" up -d --no-deps t2s-web
for ((attempt=1; attempt<=45; attempt++)); do
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' t2s-web)
  if [[ "$status" == healthy ]]; then
    echo "t2s-web is healthy on the reverseproxy network (no host port published)."
    echo "Activate the protected /t2s-web/ nginx route with reverseproxy's reload.sh."
    exit 0
  fi
  if [[ "$status" == unhealthy ]]; then
    echo "t2s-web health check failed; inspect docker logs t2s-web." >&2
    exit 1
  fi
  sleep 2
done
echo "Timed out waiting for t2s-web health; nginx has not been changed." >&2
exit 1
