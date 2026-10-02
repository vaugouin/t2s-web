# t2s-web

A web client for **fastapi-text2sql** that runs without MariaDB. It uses browser-native JavaScript and a small Node.js gateway. Only the gateway knows the API credentials. Business data comes through the API; public TMDb images may load directly from `https://image.tmdb.org` using image paths returned by the API.

The migration target is all **90 PHP routes in `tmdb-front/html/tmdb/`**. This initial implementation is **not full feature parity**: it uses today's API for search, photos, samples and 18 entity-detail families, while the migration catalogue explains the remaining API dependencies. The old front and API are unchanged.

The complete specification, proposed endpoints and implementation tasks are maintained in the owner's private T2S backlog (`repos/t2s-web.md`). The public [route inventory](web/legacy-routes.json) records all 90 legacy routes and their current coverage.

## Run locally

Node.js 22 or newer is required. There are no npm dependencies to install.

1. Copy `.env.example` to `.env`.
2. Set `T2S_BLUE_URL` to the API base URL (including its deployment prefix), and `T2S_BLUE_API_KEY` to the existing API key. Optionally configure Green separately. Keep these values on the server; never put them in browser code, URLs or source control.
3. Run `npm start`.
4. Open [localhost:4180](http://127.0.0.1:4180/).

The client starts without configuration so its settings and migration catalogue can be inspected. It displays the missing configuration instead of fake results. Requests to a real configured API may invoke its models, consume quota and write the API's normal logs/cache. The automated tests do not make those requests.

`HOST` defaults to `127.0.0.1`, `PORT` to `4180`. `T2S_TIMEOUT_MS` defaults to 180000. `T2S_BASE_PATH` defaults to `/`; set it to `/t2s-web/` when mounting at that prefix. Both API URLs are fixed by server configuration, not supplied by the browser. The web process needs no MariaDB, ChromaDB, TMDb, Plex or model-provider credential.

## Current scope

- Text and attached-photo search; EN/FR, cache controls, task-specific model overrides and Blue/Green selection.
- API response rendering, copied diagnostics and SQL, mixed/scalar results and honest pagination without invented totals.
- Raw JPEG/PNG/WebP upload and subsequent `image_ref` search, including preview and removal. Upload alone does not run recognition.
- Sample/showcase browsing with category and expected-result information.
- Existing API entity details and targeted relationship pagination, Wikipedia text and attribution, TMDb images from API-provided paths, media metadata and freshness.
- A searchable migration catalogue that retains all legacy routes, including unavailable wrappers and the historical fixed-poster prototype.

Some old detail sections and private actions are unavailable because their API contracts do not exist. In particular: full browse/search/discover/trending, raw Wikidata/source inspection, watch-provider/release views, private Plex/releases/subtitles, imports, tagging/VIP/completion edits, evaluation edits and collector supervision. Do not treat an API-backed base detail as complete parity with the PHP page.

### Images and other media

Public TMDb images are an authorized exception to the API-only business-data boundary. The browser may load them directly from **`https://image.tmdb.org`** using poster, backdrop, portrait, still or logo paths supplied by existing API responses. This needs no TMDb API key, direct TMDb metadata request or new binary-media endpoint. Missing paths and failed images retain named placeholders; the client does not invent an image from an entity ID.

Uploaded vision photos remain private API resources: they are uploaded and retrieved through the authenticated gateway, with the API's retention metadata. Other media hosts, third-party video players and private media downloads remain outside this exception. The proposed opaque `/media/{media_id}` contract is still relevant for unsupported non-TMDb or protected resources, but is **not a prerequisite for public TMDb images** and is not called or implemented. Standard Wikipedia text already exists in the detail API and does not require a new endpoint.

### Pagination and identity

Search results are `{index,data}` wrappers. Later pages retain the original question, returned hash, image and options; HTTP 200 is still checked for business errors. The API currently supplies no reliable total or `has_more` contract.

Detail pagination requires `collection=...`; `page=2` alone does not advance every relation. Targeted results are merged, preserving the other sections. TMDb collection/list IDs must never be sent as T2S collection/list IDs. Season zero is valid; episode identities are composite. Media-row IDs are not movie IDs.

## Security and configuration boundary

The gateway permits only existing API routes used by the client, with bounded JSON/image payloads, validated query parameters, deadlines and no upstream redirect following. It injects `X-API-Key` server-side and does not forward browser cookies, authorization headers or an arbitrary target URL. Static serving is allowlisted. The content security policy keeps business requests on the same origin and allows the TMDb HTTPS image host for images. This exception does not expose the API key or turn the gateway into an arbitrary media proxy.

This is not an Internet-facing authentication service. Before any remote deployment, put it behind the site's authenticated reverseproxy and review per-user permissions, quotas and private capabilities. An API key is a service credential, not proof that every visitor is entitled to private operations. Those operations remain unsupported until the API supplies proper authorization contracts.

## Deploy behind nginx

Deployment addresses are maintained in private operator documentation and are not published here. The application becomes usable after the container is started and nginx is configured and reloaded. The application and its gateway must remain behind authenticated access.

`docker-compose.yml` builds the image and starts the non-root, read-only `t2s-web` container on the existing external `reverseproxy` network. It listens on port 4180 inside that network, with **no published host port**. No database or shared data volume is used. Compose overrides `HOST`, `PORT` and `T2S_BASE_PATH` for this deployment; the four API settings come from the ignored `.env` file at runtime. `.env` is also excluded from the image build context.

On the Docker host:

```sh
cd ~/docker
git clone https://github.com/vaugouin/t2s-web.git
cd t2s-web
```

Place your `.env` in this checkout using your normal secure file-transfer or editing tool. Set the two API URLs and keys as on the workstation. The URLs must be reachable **from the container**: `127.0.0.1` there means the client container itself. Do not publish the file, paste keys into commands, or print expanded Compose configuration.

Then run:

```sh
bash ~/docker/t2s-web/deploy.sh
git -C ~/docker/reverseproxy pull --ff-only
bash ~/docker/reverseproxy/reload.sh
```

`deploy.sh` builds, validates configuration without printing credentials, starts only this service and waits for its health check. The reverseproxy repository provides the protected location and `reload.sh`, which runs `nginx -t` before a graceful reload. It does not restart the other sites. For updates, first run `git -C ~/docker/t2s-web pull --ff-only`, then rerun `deploy.sh`; reload nginx only when its configuration changes.

The nginx location must **preserve the original URI**, including `/t2s-web/`, and preserve the public `Host` header. It uses Docker DNS with a variable upstream so an absent client container does not prevent nginx startup. Do not apply the prefix-stripping rewrite used by some other applications. The bare `/t2s-web` redirects to the trailing-slash URL and preserves its query.

Validate the mounted application at `/t2s-web/health`. An anonymous request through nginx must return 401; after signing in, check the page, settings, and static assets. Existing API tests use synthetic data; a live search invokes the configured API normally. If necessary, stop only this client with `docker compose stop t2s-web`; its route will be unavailable while the other nginx sites remain running.

## Verification

```sh
npm run check
npm test
```

Tests use `node:test` and a local synthetic API fixture. They verify gateway contracts, bounded inputs, credential isolation, response handling and image URLs without a database, model call or production API. On 2026-10-02, syntax checks and all **35 tests** passed: 18 gateway, 9 API-helper and 8 media tests. Browser checks covered text/photo search, upload metadata, HTTP-200 business errors, details, relationship paging, EN/FR settings persistence, nested samples, legacy URLs, inert edits and a 390-pixel mobile layout. Core controls are bilingual; technical metadata and migration descriptions remain partly English.

Additional browser checks used an isolated instance mounted at `/t2s-web/` with synthetic API responses and real public TMDb image downloads. They confirmed loaded `w342` images, lazy loading and `no-referrer`, one existing-detail request to resolve a missing card image path, a named placeholder after an intentional image 404, detail hero/gallery images and images in expanded examples and list views. No production API or model call was made.

The owner confirmed local API configuration and subsequently reported the VPS deployment working. The agent did not independently verify the production Docker/nginx runtime through SSH; local test results and the owner's deployment confirmation are separate evidence. API proposals are documentation only. Existing legacy broken routes require an explicit product decision before they can count as replaced functionality.
