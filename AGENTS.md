# t2s-web

API-only web client for fastapi-text2sql. The migration target is every route in
`../tmdb-front/html/tmdb/`, including private operations and known broken legacy
wrappers. Feature parity must be tracked honestly: missing API contracts are
documented dependencies, not implemented features. `README.md` documents execution,
scope, the image exception, deployment and limitations. The canonical backlog is
`%USERPROFILE%/Nestor/projets/t2s-backlog/repos/t2s-web.md` in the separate
local Nestor repository.

- Never connect to MariaDB, import SQL helpers, accept arbitrary SQL, or read another
  repository's secrets. Do not change fastapi-text2sql in this project.
- All business data must pass through the configured fastapi-text2sql API. The only
  exception is public TMDb pictures from https://image.tmdb.org using API-returned
  paths (README § Images and other media). Never call the TMDb metadata API or
  infer that a generic image path is TMDb; do not widen the exception to other hosts.
- Keep API keys server-side. The same-origin gateway keeps an explicit method/path
  allowlist and fixed upstreams.
- User-visible missing capabilities must say that they are unavailable; do not
  manufacture results, totals, source freshness or successful writes.
- Each new source directory requires AGENTS.md and a CLAUDE.md pointer. Use UTF-8
  and LF. Ignore `.claude/`, secrets, dependency folders and temporary output.
- Commit every `.sh` file with Git mode `100755`. On Windows, use
  `git update-index --chmod=+x -- <script.sh>` and verify with `git ls-files --stage`.
- Tests must use local API fixtures, not paid searches or production services.
- This repository is public. Do not publish production deployment addresses in
  source, documentation, repository metadata or screenshots. Keep them in the
  private operator documentation; public examples use localhost or example.com.
- Under a URL prefix, `T2S_BASE_PATH` must be set explicitly and Nginx must forward
  the original URI without stripping the prefix (README § Deploy behind nginx).
- Agents share this checkout. Edit only assigned files and preserve others' work.
