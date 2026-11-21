# ClipStream: Technical Specification

COM769 Scalable Advanced Software Solutions, Coursework 2. A cloud-native video-sharing web application (TikTok-style), built locally, stored on GitHub, deployed to Microsoft Azure.

## 1. How to use this document

This specification is written for an AI coding agent working inside VS Code, and for the student supervising it. It covers **Part A** in full (everything built on the laptop and pushed to GitHub) and defines the **interfaces and hand-off** for **Part B** (Azure deployment).

Rules for the agent:

1. Work through the stages in Section 14 **in order**. Finish and verify each stage before starting the next.
2. Make **one Git commit per stage** (or smaller), using the commit messages suggested.
3. **Never commit secrets.** Only `.env.example` is committed. `.env` is in `.gitignore`.
4. The application must run **fully locally with no Azure account** (local mode), and switch to Azure services purely through environment variables (Azure mode). No code changes between the two.
5. Keep the backend **stateless**. No data may be kept in process memory that matters across requests (except caches that can be rebuilt). This is what makes horizontal scaling possible.
6. After each stage, run `npm test` and `npm run lint`. Both must pass.
7. Keep code simple, commented where the design choice matters, and consistent. Prefer clarity over cleverness.

## 2. Goals and marking context

The coursework is marked on scalability, cloud-native design, advanced features, CI/CD, performance profiling and a demonstrated deployment, not on UI polish. The design therefore prioritises:

- Stateless, containerised backend that can run as many identical replicas.
- Separation of concerns: compute, media storage and metadata storage are independent services.
- Pluggable service interfaces so that local mode and Azure mode share the same code paths.
- Observability: health endpoints, structured logs, an instance identifier visible in the UI and API.
- Automation: tests, build and deploy driven by GitHub Actions.

Advanced features targeted (at least three): **CI/CD pipeline**, **identity framework** (Microsoft Entra via App Service/Container Apps authentication), **sentiment analysis** of comments (Azure AI Language), and **speech transcription** (Azure AI Speech). Part A builds the seams for these with local stubs.

## 3. Technology stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js 22 LTS (or newer LTS) | CommonJS modules for simplicity |
| Web framework | Express 4 | JSON API plus static file serving |
| Uploads | multer (disk storage to a temp dir) | Streamed on to blob storage in Azure mode |
| Media storage | Azure Blob Storage (`@azure/storage-blob`) | Local mode: files on disk |
| Metadata | Azure Cosmos DB NoSQL (`@azure/cosmos`) | Local mode: JSON file store |
| Azure auth | `@azure/identity` (DefaultAzureCredential) | Used only in Azure mode |
| Frontend | Plain HTML, CSS and JavaScript (no framework, no build step) | Served from `/public` |
| Tests | Jest and Supertest | Unit and API tests, services mocked |
| Lint | ESLint | Recommended rules |
| Container | Docker (multi-stage, non-root user) | Image pushed to Azure Container Registry in Part B |
| CI/CD | GitHub Actions | CI in Part A, deploy job added in Part B |
| Monitoring | Application Insights (Part B) | Part A emits structured JSON logs |

Do not introduce React, TypeScript, an ORM, or a frontend build tool. They add complexity without adding marks.

## 4. Architecture

### 4.1 Logical architecture

```
 Browser (HTML/JS)
     |
     |  HTTPS
     v
 [CDN / Front Door]  <-- caches static files and video blobs (Part B)
     |
     v
 [Container App: ClipStream API + static site]   x N identical replicas (autoscale)
     |            |               |                 |
     |            |               |                 +--> Azure AI Language (sentiment)
     |            |               +--------------------> Azure AI Speech (transcription)
     |            +------------------------------------> Cosmos DB (metadata, comments, likes)
     +-------------------------------------------------> Blob Storage (video files)

 GitHub repo --> GitHub Actions (test, build image) --> Azure Container Registry --> Container App
```

### 4.2 Design patterns to implement and name in the report

- **Stateless service / horizontal scaling.** Any replica can serve any request.
- **Storage abstraction (adapter pattern).** `MediaStore`, `MetadataStore`, `SentimentService`, `TranscriptionService` interfaces with local and Azure implementations chosen by a factory.
- **Cache-aside / edge caching.** CDN caches media and static assets (Part B).
- **Health endpoint monitoring.** `/health` (liveness) and `/ready` (readiness).
- **Externalised configuration.** All settings from environment variables.
- **Competing consumers / queue-based load levelling (stretch).** Transcription work could be queued (Azure Storage Queue) and handled by background workers. Implement only if time allows; otherwise list in limitations and roadmap.

### 4.3 Request flows

**Upload.** Browser sends `POST /api/videos` (multipart: file, title, description). The API validates type and size, streams the file to the `MediaStore`, creates a metadata record in the `MetadataStore`, and returns the new video record. Transcription is triggered asynchronously after the response.

**Feed.** Browser calls `GET /api/videos?limit=10&cursor=...`. The API reads a page of video records, newest first, and returns them with a `nextCursor`. Video playback uses the `mediaUrl` in each record directly (blob or CDN URL), so media bytes never pass through the API.

**Comment.** `POST /api/videos/:id/comments`. The API runs the text through `SentimentService`, stores the comment with its sentiment label and score, and increments the comment count.

**Like.** `POST /api/videos/:id/like` toggles the current user’s like. Likes are stored one record per user per video to prevent duplicates, and a counter on the video record is updated.

## 5. Repository structure

```
clipstream/
├── .github/workflows/ci.yml
├── docs/
│   ├── TECHNICAL_SPEC.md          (this document)
│   └── architecture/              (diagrams added later)
├── public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
├── src/
│   ├── server.js                  (starts HTTP server, graceful shutdown)
│   ├── app.js                     (builds the Express app, exported for tests)
│   ├── config.js                  (reads and validates env vars)
│   ├── logger.js                  (structured JSON logging)
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── requestLogger.js
│   ├── routes/
│   │   ├── health.js
│   │   ├── videos.js
│   │   ├── comments.js
│   │   └── info.js
│   ├── services/
│   │   ├── index.js               (factory: returns local or Azure implementations)
│   │   ├── media/
│   │   │   ├── localMediaStore.js
│   │   │   └── azureBlobMediaStore.js
│   │   ├── metadata/
│   │   │   ├── localMetadataStore.js
│   │   │   └── cosmosMetadataStore.js
│   │   ├── sentiment/
│   │   │   ├── localSentiment.js
│   │   │   └── azureLanguageSentiment.js
│   │   └── transcription/
│   │       ├── localTranscription.js
│   │       └── azureSpeechTranscription.js
│   └── utils/validation.js
├── tests/
│   ├── health.test.js
│   ├── videos.test.js
│   ├── comments.test.js
│   ├── auth.test.js
│   └── stores.test.js
├── scripts/
│   └── seed.js                    (optional sample data)
├── .dockerignore
├── .env.example
├── .eslintrc.json
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

Azure implementations (`azure*.js`, `cosmos*.js`) may be written in Part A as thin, documented code, but they are only exercised in Part B. They must be lazy-loaded so local mode never requires Azure packages or credentials.

## 6. Configuration

All configuration is read in `src/config.js` from environment variables, with safe defaults for local mode.

```
# .env.example
PORT=3000
NODE_ENV=development

# local | azure
STORAGE_MODE=local

# local mode
LOCAL_DATA_DIR=./data

# azure mode (Part B)
AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_CONNECTION_STRING=
AZURE_BLOB_CONTAINER=videos
MEDIA_BASE_URL=            # optional CDN or custom base URL for media
COSMOS_ENDPOINT=
COSMOS_KEY=
COSMOS_DATABASE=clipstream
AZURE_LANGUAGE_ENDPOINT=
AZURE_LANGUAGE_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=

# auth: dev | easyauth
AUTH_MODE=dev

# limits
MAX_UPLOAD_MB=100
ALLOWED_VIDEO_TYPES=video/mp4,video/webm

# demo helpers
ENABLE_DEBUG_ENDPOINTS=false
```

In Azure mode, `config.js` must fail fast at start-up with a clear message if required variables are missing.

## 7. Service interfaces

Each interface is a plain JavaScript object with async methods. The factory in `src/services/index.js` returns `{ media, metadata, sentiment, transcription }` based on `STORAGE_MODE`.

### 7.1 MediaStore

- `save({ tempPath, filename, contentType }) -> { mediaKey, mediaUrl }` stores the file and returns its key and a playable URL.
- `delete(mediaKey) -> void`
- `healthCheck() -> boolean`

Local: copies to `LOCAL_DATA_DIR/media/`, served by Express at `/media/<key>` with HTTP range support (`express.static` supports this). Azure: streams to the blob container using `BlockBlobClient.uploadStream`, sets `Content-Type` and `Cache-Control: public, max-age=86400`, and returns `MEDIA_BASE_URL` (if set) or the blob URL.

### 7.2 MetadataStore

- `createVideo(video) -> video`
- `getVideo(id) -> video | null`
- `listVideos({ limit, cursor }) -> { items, nextCursor }` (newest first)
- `updateVideo(id, patch) -> video`
- `toggleLike({ videoId, userId }) -> { liked, likeCount }`
- `addComment(comment) -> comment`
- `listComments({ videoId, limit, cursor }) -> { items, nextCursor }`
- `healthCheck() -> boolean`

Local: a JSON file at `LOCAL_DATA_DIR/db.json`, loaded and saved with simple write-then-rename to avoid corruption. This is for development only and is **not** concurrency-safe across replicas, which is exactly why Azure mode uses Cosmos DB. Azure: Cosmos DB containers described in Section 8.

### 7.3 SentimentService

- `analyse(text) -> { label: 'positive'|'neutral'|'negative', score: number }`

Local: a tiny word-list heuristic (a few dozen positive and negative words). Azure: Azure AI Language sentiment analysis, mapping the returned sentiment to the same shape.

### 7.4 TranscriptionService

- `transcribe({ mediaUrl, videoId }) -> { text }` (called in the background, never blocks the upload response)

Local: returns a placeholder such as `Transcript not available in local mode`. Azure: Azure AI Speech batch or fast transcription. Failures are logged and must never fail the upload.

## 8. Data model

All records are JSON documents.

**Video** (`videos` container; partition key `/id`)

```json
{
  "id": "uuid",
  "title": "string (1-100 chars)",
  "description": "string (0-500 chars)",
  "uploaderId": "user identifier (email or sub)",
  "uploaderName": "display name",
  "mediaKey": "string",
  "mediaUrl": "https://...",
  "contentType": "video/mp4",
  "sizeBytes": 12345,
  "createdAt": "ISO 8601 UTC",
  "likeCount": 0,
  "commentCount": 0,
  "transcript": null,
  "transcriptStatus": "pending | done | failed | unavailable"
}
```

**Comment** (`comments` container; partition key `/videoId`)

```json
{
  "id": "uuid",
  "videoId": "uuid",
  "userId": "string",
  "userName": "string",
  "text": "string (1-300 chars)",
  "sentiment": "positive | neutral | negative",
  "sentimentScore": 0.0,
  "createdAt": "ISO 8601 UTC"
}
```

**Like** (`likes` container; partition key `/videoId`)

```json
{ "id": "<videoId>:<userId>", "videoId": "uuid", "userId": "string", "createdAt": "ISO 8601 UTC" }
```

Design note for the report: the feed query is cross-partition because the partition key is `/id`. That is acceptable at coursework scale and is recorded as a known limitation, with the roadmap fix being a synthetic partition key (for example a date bucket) plus a read-optimised feed view.

## 9. REST API

All responses are JSON unless stated. Errors use `{ "error": { "code": "STRING", "message": "text" } }` with the right HTTP status.

| Method and path | Auth | Purpose | Success |
| --- | --- | --- | --- |
| `GET /health` | none | Liveness: process is up | 200 `{status:"ok"}` |
| `GET /ready` | none | Readiness: stores reachable | 200 or 503 with per-dependency status |
| `GET /api/info` | none | Instance details: `instanceId` (hostname), `mode`, `version`, `uptimeSeconds`, `startedAt` | 200 |
| `GET /api/me` | optional | Current user or `null` | 200 |
| `GET /api/videos?limit=&cursor=` | none | Paged feed, newest first, limit 1 to 50, default 10 | 200 `{items,nextCursor}` |
| `GET /api/videos/:id` | none | One video | 200 or 404 |
| `POST /api/videos` | required | Multipart upload: `file`, `title`, `description` | 201 video |
| `POST /api/videos/:id/like` | required | Toggle like | 200 `{liked,likeCount}` |
| `GET /api/videos/:id/comments?limit=&cursor=` | none | Paged comments | 200 |
| `POST /api/videos/:id/comments` | required | Body `{text}`; sentiment analysed | 201 comment |
| `GET /api/debug/burn?ms=200` | none | **Only if** `ENABLE_DEBUG_ENDPOINTS=true`. Busy-waits for `ms` (max 2000) to generate CPU load for scaling demos | 200 |

Cross-cutting requirements:

- Every response includes the header `X-Instance-Id: <hostname>`. This lets the demo show different replicas answering.
- Upload validation: reject if no file, wrong content type, or over `MAX_UPLOAD_MB` (413). Delete the temp file in all cases.
- Input validation on all text fields (trim, length limits, reject empty). Escape output on the frontend (use `textContent`, never `innerHTML` with user data).
- Use `helmet` for security headers and `compression` for JSON responses. Add simple rate limiting (`express-rate-limit`) on write routes.
- `404` JSON for unknown `/api/*` routes; a central error handler returns 500 without leaking stack traces in production.

## 10. Authentication

`src/middleware/auth.js` populates `req.user` (or leaves it undefined) according to `AUTH_MODE`:

- **dev**: user comes from the request header `X-Dev-User` (for tests and Postman). If absent, use a default user `dev@clipstream.local` named `Dev User`. This keeps local development friction-free.
- **easyauth**: when Azure Container Apps or App Service authentication is enabled, the platform injects headers. Read `X-MS-CLIENT-PRINCIPAL-NAME` (identity) and `X-MS-CLIENT-PRINCIPAL-ID`. If the name header is missing on a protected route, return 401. Never trust these headers unless `AUTH_MODE=easyauth`, and note in the README that the platform strips and re-sets them.

A `requireAuth` middleware returns 401 `{error:{code:"UNAUTHENTICATED"}}` when `req.user` is missing. The frontend shows a Sign in link pointing to `/.auth/login/aad` in easyauth mode and a notice in dev mode.

## 11. Backend implementation notes

- `src/app.js` builds and exports the Express app (no `listen`) so Supertest can import it with injected fake services. `src/server.js` calls `listen` and handles `SIGTERM` and `SIGINT` for graceful shutdown (stop accepting connections, finish in-flight requests, exit). This matters because autoscaling stops replicas.
- Listen on `0.0.0.0` and `process.env.PORT`.
- Logging: one JSON line per request with `timestamp, level, method, path, status, durationMs, instanceId`. No `console.log` elsewhere except through `logger.js`.
- Pagination cursor: opaque base64 string encoding the last item’s `createdAt` and `id`.
- Uploads: multer writes to the OS temp dir with a file size limit; a `fileFilter` checks MIME type. After `MediaStore.save`, remove the temp file in a `finally` block.
- Static files: `express.static('public')` with sensible cache headers (`max-age` for CSS/JS, `no-cache` for `index.html`).
- Trust proxy: `app.set('trust proxy', 1)` so rate limiting and logs see client IPs behind the Azure ingress.
- Debug endpoint exists only behind `ENABLE_DEBUG_ENDPOINTS`. Never enable it in the final public deployment except briefly for the load-test demo.

## 12. Frontend specification

One page, no framework. Files: `public/index.html`, `public/css/styles.css`, `public/js/app.js`.

Layout and behaviour:

- **Header:** app name, current user (from `/api/me`) with Sign in link when anonymous.
- **Feed:** vertical list of video cards. Each card has a `<video controls preload="metadata">` element using `mediaUrl`, title, description, uploader, relative time, a like button with count, and a comments toggle with count.
- **Infinite scroll or Load more button** using `nextCursor`.
- **Comments panel** per video: list (each comment shows a coloured badge for its sentiment: green, grey, red) and a form to add a comment (disabled when not signed in).
- **Upload form:** title, description, file picker, a progress bar (use `XMLHttpRequest` for upload progress), error messages from the API.
- **Footer status bar:** shows `instanceId` and mode from `/api/info`, refreshed every 5 seconds. During the scaling demo this visibly changes between replicas.
- **Responsive:** works on phone width. Plain CSS, a clean dark or light theme, accessible contrast, keyboard-usable buttons, `alt`/`aria-label` where relevant.
- Never insert user-provided text with `innerHTML`. Use `textContent` or DOM APIs.

## 13. Containerisation and CI

### 13.1 Dockerfile (multi-stage, non-root)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
```

`.dockerignore` must exclude `node_modules`, `.git`, `.env`, `data`, `tests`, `docs`.

### 13.2 docker-compose.yml

One service `api` built from the Dockerfile, port `3000:3000`, `env_file: .env`, and a named volume mounted at `/app/data` with `LOCAL_DATA_DIR=/app/data`. A second service `api2` (optional) on port `3001` sharing the same volume can be used to show two instances locally.

### 13.3 GitHub Actions: `.github/workflows/ci.yml`

Triggers: `push` to any branch and `pull_request` to `main`.

Job `test`: checkout, `actions/setup-node` (Node 22, npm cache), `npm ci`, `npm run lint`, `npm test -- --coverage`, upload the coverage report as an artifact.

Job `docker-build` (needs `test`): `docker build` the image to confirm it builds (no push yet).

Part B will add a `deploy` job that runs only on `main`: log in to Azure with OIDC, build and push the image to Azure Container Registry tagged with the commit SHA, and update the Container App to that image.

## 14. Build stages (agent checklist)

Each stage lists deliverables and acceptance criteria.

**Stage 0: Project bootstrap.** `git init`-ready folder, `package.json` with scripts (`start`, `dev`, `test`, `lint`), dependencies installed, `.gitignore`, `.env.example`, ESLint config, README skeleton, and this spec saved at `docs/TECHNICAL_SPEC.md`. *Accept:* `npm run lint` passes. *Commit:* `chore: bootstrap project`.

**Stage 1: Core server.** `config.js`, `logger.js`, `app.js`, `server.js` with graceful shutdown, `/health`, `/ready`, `/api/info`, `X-Instance-Id` header, error handler. *Accept:* `curl localhost:3000/health` returns ok; tests for health and info pass. *Commit:* `feat: core server and health endpoints`.

**Stage 2: Service layer (local mode).** Interfaces, factory, local media and metadata stores, local sentiment and transcription stubs. *Accept:* unit tests for `localMetadataStore` (create, list newest first, pagination, like toggle, comments) and `localMediaStore` pass. *Commit:* `feat: storage abstraction with local implementations`.

**Stage 3: Auth middleware.** Dev and easyauth modes, `requireAuth`, `/api/me`. *Accept:* auth tests cover 401 and success paths in both modes. *Commit:* `feat: authentication middleware`.

**Stage 4: Video and comment API.** All routes in Section 9 with validation, upload handling, rate limiting, security headers. *Accept:* Supertest tests cover upload success, wrong type, oversize, missing fields, feed pagination, like toggle, comment creation with sentiment, and 404 cases. Manual Postman check works. *Commit:* `feat: video, like and comment API`.

**Stage 5: Frontend.** Section 12 complete and working against local mode. *Accept:* in a browser you can upload an MP4, see it in the feed, play it, like it, comment, and see the instance ID in the footer. *Commit:* `feat: web frontend`.

**Stage 6: Azure implementations (code only).** `azureBlobMediaStore`, `cosmosMetadataStore`, `azureLanguageSentiment`, `azureSpeechTranscription`, lazy-loaded by the factory, with config validation. Cosmos store must create the database and containers if missing (`createIfNotExists`) using the partition keys in Section 8. *Accept:* unit tests with mocked SDK clients pass; local mode still runs without Azure packages being imported. *Commit:* `feat: Azure service implementations`.

**Stage 7: Containerisation.** Dockerfile, `.dockerignore`, compose file. *Accept:* `docker compose up --build` serves the app on port 3000 and data persists across restarts. *Commit:* `build: add Docker and compose`.

**Stage 8: CI.** `ci.yml` as in Section 13.3. *Accept:* push to GitHub produces a green run. *Commit:* `ci: add test and docker build workflow`.

**Stage 9: Documentation.** README with architecture overview, run instructions (local, Docker), env var table, API summary, testing, and a Part B placeholder section. Add a short `docs/architecture/README.md` listing diagrams still to be drawn. *Commit:* `docs: README and architecture notes`.

## 15. Testing requirements

- Jest and Supertest. Import `createApp(services)` from `src/app.js` and inject in-memory fakes.
- Minimum 25 meaningful tests across the files in Section 5. Target at least 80 percent line coverage on `src/`.
- Test names describe behaviour (`returns 413 when file exceeds limit`).
- Tests must not touch the network or Azure and must clean up temp files.
- Add a negative test that proves a failing test blocks the pipeline (the student will demonstrate this once in the video or slides).

## 16. Hand-off to Part B (Azure)

The student creates these Azure resources manually after Part A is on GitHub. The agent should make sure the code is ready for them.

| Resource | Suggested name | Used by |
| --- | --- | --- |
| Resource group | `rg-clipstream` | everything |
| Storage account and container | `stclipstream<unique>`, container `videos` | `azureBlobMediaStore` |
| Cosmos DB account (free tier), database `clipstream` | `cosmos-clipstream-<unique>` | `cosmosMetadataStore` |
| Container Registry (Basic) | `acrclipstream<unique>` | CD pipeline |
| Container Apps environment and app | `cae-clipstream`, `ca-clipstream-api` | runtime |
| Log Analytics and Application Insights | `appi-clipstream` | monitoring |
| Azure AI Language and Speech | `lang-clipstream`, `speech-clipstream` | AI features |

In Azure the Container App is configured with `STORAGE_MODE=azure`, `AUTH_MODE=easyauth`, the endpoints and keys as **secrets** (referenced as environment variables), target port `3000`, health probes on `/health` and `/ready`, min replicas 1, max replicas 5 to 10, and an HTTP concurrency scaling rule. Part B will also add the CDN, autoscale load test, traffic-splitting (blue/green or canary) demo, and the deploy job in GitHub Actions.

Image and cost notes: keep the container at 0.25 vCPU and 0.5 GiB per replica for the demo, and delete the resource group after the submission video is recorded.

## 17. Definition of done for Part A

- `npm test` and `npm run lint` pass; coverage report generated.
- `docker compose up --build` runs the full app locally.
- Everything pushed to GitHub on `main`, CI green, no secrets in history.
- README explains how to run, test and configure.
- The app works in local mode end to end, and the Azure code paths exist behind `STORAGE_MODE=azure`.

## 18. Paste-ready starting prompt for the VS Code agent

> You are building the ClipStream project described in `docs/TECHNICAL_SPEC.md`. Read the whole spec first. Then execute Stages 0 to 9 in order, one stage at a time. After each stage run `npm test` and `npm run lint`, fix any failures, and make a Git commit with the suggested message. Do not skip stages, do not add frameworks that the spec rules out, and never commit secrets. The app must run completely locally in `STORAGE_MODE=local` without any Azure account. Stop after each stage and summarise what you did and what the acceptance check showed before moving on. If something in the spec is ambiguous, choose the simplest option that satisfies the acceptance criteria and note the decision in the README under a Decisions heading.

## 19. Feature register (15 application features)

The original sections describe the core of the app. This register is the **authoritative list of features** the finished app must have. It extends Sections 7, 8, 9 and 12 where noted. Infrastructure capabilities such as the CDN, autoscaling and canary deployment belong to Part B and are not counted here.

| # | Feature | Group | What it does | Where it lives |
| --- | --- | --- | --- | --- |
| F1 | Video upload with validation | Core | Upload MP4 or WebM with title, description and tags. Type and size checks. Progress bar. | `POST /api/videos`, upload form |
| F2 | Paginated feed and playback | Core | Newest-first feed with Load more. HTML5 playback with range requests. | `GET /api/videos`, feed UI |
| F3 | Likes | Core | Toggle like, one per user per video, live count. | `POST /api/videos/:id/like` |
| F4 | Comments | Core | Add and list comments per video. | `/api/videos/:id/comments` |
| F5 | Delete own video | Core | Owner can delete a video, its comments, likes and media file. | `DELETE /api/videos/:id` |
| F6 | View counter | Engagement | Counts a view when playback starts (once per page load per video). | `POST /api/videos/:id/view` |
| F7 | Search | Discovery | Search by text across title, description, tags and transcript. | `GET /api/videos?q=` |
| F8 | Tags and tag filter | Discovery | Up to 5 tags per video. Click a tag to filter the feed. | `tags` field, `GET /api/videos?tag=` |
| F9 | Trending feed | Discovery | Ranks recent videos by engagement. Toggle between New and Trending. | `GET /api/videos?sort=trending` |
| F10 | My videos (profile) | Discovery | Shows the signed-in user’s own uploads with delete buttons. | `GET /api/videos?uploaderId=me` |
| F11 | Identity and sign-in | Advanced | Microsoft Entra sign-in in Azure. Dev user locally. Gates upload, like, comment, delete. | `middleware/auth.js` |
| F12 | Comment sentiment analysis | Advanced (AI) | Each comment is classified positive, neutral or negative. Strongly negative comments are flagged and collapsed with a Show anyway link. | `SentimentService`, comments UI |
| F13 | Speech transcription | Advanced (AI) | Uploaded videos are transcribed in the background. The transcript appears under the video and feeds search (F7). | `TranscriptionService` |
| F14 | Observability and instance indicator | Platform | `/health`, `/ready`, `/api/info`, structured logs, `X-Instance-Id`, footer showing the serving replica. | `routes/health.js`, `routes/info.js` |
| F15 | CI/CD pipeline | Platform | Lint, test, build image on every push. Part B adds deploy to Azure. | `.github/workflows` |

### 19.1 Changes to the data model (extends Section 8)

**Video** gains these fields:

```json
{
  "tags": ["string"],
  "viewCount": 0
}
```

Tags are lower-case, 2 to 20 characters, letters, digits and hyphens only, maximum 5 per video, de-duplicated.

**Comment** gains:

```json
{ "flagged": false }
```

`flagged` is true when `sentiment` is `negative` and `sentimentScore` is at least 0.85. Flagged comments are still stored and returned, and the frontend collapses them.

### 19.2 Changes to MetadataStore (extends Section 7.2)

- `listVideos({ limit, cursor, q, tag, uploaderId, sort })` where `sort` is `new` (default) or `trending`.
- `incrementViews(id) -> { viewCount }` (use an atomic increment: Cosmos patch operation `incr`; local store simple increment).
- `deleteVideo(id) -> boolean` and `deleteCommentsAndLikes(videoId)`.

Search behaviour: case-insensitive substring match over `title`, `description`, `tags` and `transcript`. In Cosmos use `CONTAINS(LOWER(c.title), @q)` and `ARRAY_CONTAINS(c.tags, @tag)` with parameterised queries (never string concatenation). Record in the report that this is a limitation at large scale and that the roadmap fix is Azure AI Search.

Trending behaviour: fetch up to the 200 most recent videos, score each with

`score = (likeCount * 3 + commentCount * 2 + viewCount) / (hoursSinceUpload + 2) ^ 1.2`

sort by score descending, and cache the result in memory for 30 seconds. Document that a per-replica cache is acceptable because it is only an optimisation and can be rebuilt, and that Redis would be the shared-cache upgrade.

### 19.3 Changes to the REST API (extends Section 9)

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/videos/:id/view` | none | Increment view count. Returns `{viewCount}`. Rate limited. |
| `DELETE /api/videos/:id` | required, owner only | Delete video, media, comments, likes. 403 if not the owner, 404 if missing. Returns 204. |
| `GET /api/videos?q=&tag=&sort=&uploaderId=` | none (except `uploaderId=me` which needs auth) | Search, filter and sort the feed. `uploaderId=me` resolves to the signed-in user. |

`POST /api/videos` now also accepts a `tags` field (comma-separated string).

### 19.4 Changes to the frontend (extends Section 12)

- Header gains a search box (submits on Enter, debounced), a **New / Trending** toggle, and a **My videos** link when signed in.
- Each card shows view count, tag chips (clickable, they set the tag filter), and a Delete button visible only to the owner.
- Flagged comments are collapsed behind a Show anyway link.
- A transcript section on each card is collapsed by default and shows the transcript status (pending, done, unavailable).
- Active filters (search term, tag, sort) are shown as removable chips above the feed.

## 20. Stage 10: Features F5 to F10 and updates to F12 and F13

**Order note.** If the agent has **not yet started Stage 6**, run this stage first (call it Stage 5.5) so the Azure stores are written with the new methods. If Stage 6 is already done, run Stage 10 after Stage 9 and extend the Azure stores as part of it.

Deliverables:

1. Data model, store interface and API changes from Sections 19.1 to 19.3, in both local and Azure store implementations.
2. Tag parsing and validation in `utils/validation.js`.
3. View counting, delete cascade (video, media file, comments, likes), search, tag filter, trending sort with 30-second cache, and `uploaderId=me`.
4. Sentiment flagging rule from Section 19.1 in the comment route.
5. Frontend changes from Section 19.4.
6. At least 15 new tests covering: tag validation, search matches in each field, tag filter, trending order, view increment, delete as owner, delete as another user (403), delete missing video (404), cascade removal of comments and likes, `uploaderId=me` requires auth, and flagged-comment rule.

Acceptance: `npm test` and `npm run lint` pass; in the browser you can upload with tags, search, filter by tag, switch to Trending, view My videos, and delete a video you own. Commit message: `feat: search, tags, trending, views, delete and profile`.

Update the definition of done (Section 17): all 15 features F1 to F15 are implemented and demonstrable, and the README contains a table of the features and where each is implemented.

## 21. Updated starting prompt for the VS Code agent

> Read `docs/TECHNICAL_SPEC.md` in full, including Sections 19 to 21. The finished app must implement all 15 features in the Section 19 feature register. Execute the stages in this order: 0, 1, 2, 3, 4, 5, then Stage 10 (described in Section 20), then 6, 7, 8, 9. After each stage run `npm test` and `npm run lint`, fix failures, and commit with the suggested message. Stop after each stage and summarise what you did and what the acceptance check showed before moving on. Never commit secrets, do not add frameworks the spec rules out, and the app must run fully locally in `STORAGE_MODE=local`. If something is ambiguous, choose the simplest option that meets the acceptance criteria and record it in the README under a Decisions heading.
