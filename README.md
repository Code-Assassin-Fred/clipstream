# ClipStream

A cloud-native, TikTok-style short-form video-sharing web application built with Node.js, Express, and vanilla HTML/CSS/JS. Designed for local development with Azure deployment support.

[![CI](https://github.com/example/clipstream/actions/workflows/ci.yml/badge.svg)](https://github.com/example/clipstream/actions)

---

## Documentation

Full architectural, technical, database, and operational documentation is available in [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md).

---

## Implemented Features (F1 – F15)

All 15 application and platform features from the coursework specification are implemented:

| Feature | Description | Implementation |
|:---|:---|:---|
| **F1: Video Upload** | MP4/WebM uploads with progress bar, validation | `POST /api/videos` |
| **F2: Paginated Feed** | Reverse-chronological feed with HTTP 206 range playback | `GET /api/videos` |
| **F3: Likes** | One like per user/video with live count | `POST /api/videos/:id/like` |
| **F4: Comments** | Threaded comments with sentiment badge | `/api/videos/:id/comments` |
| **F5: Delete Video** | Owner can delete video, media, likes, and comments | `DELETE /api/videos/:id` |
| **F6: View Counter** | Counts view on playback start (once per page load) | `POST /api/videos/:id/view` |
| **F7: Search** | Substring text search over title, desc, tags, transcript | `GET /api/videos?q=` |
| **F8: Tags & Filter** | Up to 5 tags; click chip to filter feed | `GET /api/videos?tag=` |
| **F9: Trending Feed** | Algorithmic engagement decay scoring; 30s cache | `GET /api/videos?sort=trending` |
| **F10: My Videos** | Filter feed to current user's uploads with delete | `GET /api/videos?uploaderId=me` |
| **F11: Identity** | Microsoft Entra (EasyAuth) in Azure; Dev mode locally | `src/middleware/auth.js` |
| **F12: Sentiment AI** | Positive/Neutral/Negative. Toxic comments collapsed | `src/services/sentiment/*` |
| **F13: Transcription** | Background audio transcription feeding search | `src/services/transcription/*` |
| **F14: Observability** | `/health`, `/ready`, `/api/info`, `X-Instance-Id` footer | `src/routes/health.js`, `info.js` |
| **F15: CI/CD Pipeline** | GitHub Actions: lint, test, coverage, docker build | `.github/workflows/ci.yml` |

---

## Quick Start

### 1. Local Development

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Optional: seed sample videos
node scripts/seed.js

# Start server
npm start
# or with live reloading:
npm run dev
```

Open `http://localhost:3000` in your browser.

### 2. Docker & Docker Compose

Run two identical replicas locally with shared storage:
```bash
docker compose up --build
```
- Instance 1: `http://localhost:3000`
- Instance 2: `http://localhost:3001`

---

## Testing & Quality

- **Run all tests (87 tests):**
  ```bash
  npm test
  ```
- **Run tests with coverage (target >80% line coverage):**
  ```bash
  npm run test:coverage
  ```
- **Lint check:**
  ```bash
  npm run lint
  ```
- **Pipeline Gate Demonstration:**
  Set `FAIL_TEST=true` to verify that failing tests reject the CI build:
  ```bash
  FAIL_TEST=true npm test
  ```

---

## Environment Configuration

See `.env.example` for all configurable parameters:
- `STORAGE_MODE`: `local` (default) or `azure`
- `AUTH_MODE`: `dev` (default) or `easyauth`
- `LOCAL_DATA_DIR`: Filesystem storage path in local mode
- Azure mode connection variables: `AZURE_STORAGE_CONNECTION_STRING`, `COSMOS_ENDPOINT`, `COSMOS_KEY`, etc.

---

## Key Decisions

1. **Zero-Framework Frontend:** Pure vanilla JS and CSS served statically without bundlers to maximize clarity, performance, and maintainability.
2. **XSS Defense:** User-supplied strings are exclusively written using DOM `textContent`, never `innerHTML`.
3. **Pluggable Adapter Pattern:** Local file stores and Azure services adhere to identical interfaces via a runtime factory.
4. **Stateless Compute:** All state resides in external media and metadata stores to ensure uninhibited horizontal replica scaling.
