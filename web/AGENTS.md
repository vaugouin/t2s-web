# Browser client

Read ../AGENTS.md. Browser-native modules, accessible HTML, responsive CSS.
Request business data only through the same-origin gateway. The user explicitly
allows catalogue pictures from `https://image.tmdb.org`; derive their URLs only
from TMDb paths returned by fastapi-text2sql. Render API text with
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
- `media.mjs` owns the strict TMDb host/path/size boundary. Never reinterpret
  Wikimedia, private upload or generated-art fields as TMDb image paths. Gallery
  `IMAGE_PATH` needs a known TMDb relation or typed image-search result. Other
  media stay metadata/source links; do not embed external videos.
- Missing card pictures may load existing entity detail endpoints, lazily when
  visible, with `rows_per_page=1`. The loader limits concurrency to four, caches
  image descriptors and misses by deployment/language/entity, deduplicates calls,
  and aborts pending work on route changes. No TMDb API requests or keys are used.
- Images use lazy loading, fixed aspect ratios, meaningful alt text, no referrer
  and an error fallback. Private photographs still use local blobs/API uploads.
- Entity card artwork and its fallback are keyboard-accessible links to the same
  entity as the title, for all card/list/sample/relation views. TMDb gallery images
  link to their existing validated source URL instead of inventing an entity ID.
- On person pages, group `movie_cast`, `movie_crew`, `series_cast` and `series_crew`
  by typed movie/series ID within the current relation page only. Keep cast/crew
  separate, preserve distinct characters/jobs/departments and original `CREDIT_ROWS`
  in each merged card, and leave the API response and credit-count pagination intact.
  Do not invent unique-title totals or fetch extra pages to deduplicate globally.
- Movie headings use `DAT_RELEASE` / `RELEASE_YEAR`; series use `DAT_FIRST_AIR`,
  `DAT_LAST_AIR` and their year fields. Explicit ongoing `STATUS` values use
  `present` / `en cours`; unknown bounds stay `?`, and absent dates add no suffix.
  Never substitute the current year or treat an ongoing show's last air date as
  its termination date. Presentation helpers and contracts live in `presentation.mjs`.
