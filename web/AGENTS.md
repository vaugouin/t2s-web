# Browser client

Read ../AGENTS.md. Browser-native modules, accessible HTML, responsive CSS.
Only request the same-origin gateway and local assets. Render API text with
textContent; never trust upstream HTML or turn arbitrary strings into URLs.
Keep credentials out of browser storage and responses. Language and viewing
country are independent preferences. API gaps stay visible and actionable in
the migration catalogue, not fake buttons claiming success.

- `legacy-routes.json` is a top-level array with one entry for each of the 90
  `tmdb-front/html/tmdb/*.php` files. The eight broken wrappers and fixed
  `posters.php` prototype are explicit. T2S collection/list identifiers must
  never be substituted for raw TMDb collection/list identifiers.
- `api.mjs` is DOM-free and exports the request/navigation/pagination helpers.
  Native browser fetch needs its global receiver: keep the default wrapper.
  Verify its contracts with `node --test web/api.test.mjs` from the repo root.
- Resolve API, configuration and inventory URLs against `import.meta.url`, not
  origin-root paths. HTML assets stay relative and navigation uses fragments, so
  root hosting, prefixed hosting and legacy `.php` entry points work identically.
- Search pagination resends the original question, returned hash and options;
  no reliable total exists. Detail relation pagination merges only the requested
  relation and preserves the other sections and previously known total.
- Never load catalogue images or embed videos from external URLs. The only
  displayed images are user photographs fetched from the API or selected locally.
  Source links are outbound navigation, sanitized to HTTP(S), not media fetches.
