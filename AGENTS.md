# t2s-web

API-only web client for fastapi-text2sql. The migration target is every route in
`../tmdb-front/html/tmdb/`, including private operations and known broken legacy
wrappers. Feature parity must be tracked honestly: missing API contracts are
documented dependencies, not implemented features.

- Never connect to MariaDB, import SQL helpers, accept arbitrary SQL, or read another
  repository's secrets. Do not change fastapi-text2sql in this project.
- All business data and media must pass through the configured fastapi-text2sql
  API. Do not bypass gaps with TMDb, Wikidata, Plex, MovieMatch, filesystem or DB
  access. Outbound navigation to a source is distinct from fetching its data.
- Use Node.js 22 or newer and browser-native modules. Keep API keys server-side.
  The same-origin gateway has an explicit method/path allowlist and fixed upstreams.
- User-visible missing capabilities must say that they are unavailable; do not
  manufacture results, totals, source freshness or successful writes.
- `README.md` documents execution and limitations. The canonical backlog is
  `%USERPROFILE%/Nestor/projets/t2s-backlog/repos/t2s-web.md` in the separate
  local Nestor repository.
- Each new source directory requires AGENTS.md and a CLAUDE.md pointer. Use UTF-8
  and LF. Ignore `.claude/`, secrets, dependency folders and temporary output.
- Tests must use local API fixtures, not paid searches or production services.
- This repository is public. Do not publish production deployment addresses in
  source, documentation, repository metadata or screenshots. Keep them in the
  private operator documentation; public examples use localhost or example.com.
- `T2S_BASE_PATH` defaults to `/`; deployments below a URL prefix must set it
  explicitly, for example `/t2s-web/`. The server retains and validates this
  prefix, redirects its missing trailing slash while preserving the query, and
  serves nothing outside it. Nginx must forward the original URI without stripping
  the prefix; health checks use `${T2S_BASE_PATH}health` after normalization.
- Agents share this checkout. Edit only assigned files and preserve others' work.
