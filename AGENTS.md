# t2s-web

API-only web client for fastapi-text2sql. The migration target is every route in
`../tmdb-front/html/tmdb/`, including private operations and known broken legacy
wrappers. Feature parity must be tracked honestly: missing API contracts are
documented dependencies, not implemented features.

- Never connect to MariaDB, import SQL helpers, accept arbitrary SQL, or read another
  repository's secrets. Do not change fastapi-text2sql in this project.
- All business data must pass through the configured fastapi-text2sql API.
  Public TMDb pictures are the explicit exception: render validated API-returned
  image references directly from https://image.tmdb.org, without a VPS media proxy.
  Never call the TMDb metadata API or infer that any generic image path is TMDb.
  Uploaded photos retain the existing authenticated API flow. Other external
  image hosts, video embeds, Wikidata/Plex/MovieMatch calls and DB access remain
  outside this permission. Outbound source links are explicit navigation.
- Use Node.js 22 or newer and browser-native modules. Keep API keys server-side.
  The same-origin gateway has an explicit method/path allowlist and fixed upstreams.
- User-visible missing capabilities must say that they are unavailable; do not
  manufacture results, totals, source freshness or successful writes.
- `README.md` documents execution and limitations. The canonical backlog is
  `%USERPROFILE%/Nestor/projets/t2s-backlog/repos/t2s-web.md` in the separate
  local Nestor repository.
- Each new source directory requires AGENTS.md and a CLAUDE.md pointer. Use UTF-8
  and LF. Ignore `.claude/`, secrets, dependency folders and temporary output.
- Commit every `.sh` file with Git mode `100755`. On Windows, use
  `git update-index --chmod=+x -- <script.sh>` and verify with `git ls-files --stage`.
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
