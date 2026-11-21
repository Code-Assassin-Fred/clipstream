# ClipStream — Final Technical Documentation

**Coursework Project:** COM769 Scalable Advanced Software Solutions — Coursework 2  
**Application:** ClipStream (Cloud-Native Video-Sharing Web Platform)  
**Version:** 1.0.0  
**Authors:** ClipStream Engineering Team  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Implemented Features](#2-implemented-features)
3. [Architecture](#3-architecture)
4. [Technical Implementation](#4-technical-implementation)
5. [Database Documentation](#5-database-documentation)
6. [Configuration and Environment Variables](#6-configuration-and-environment-variables)
7. [Setup and Installation](#7-setup-and-installation)
8. [Usage Guide](#8-usage-guide)
9. [Implementation Decisions](#9-implementation-decisions)
10. [Limitations and Future Improvements](#10-limitations-and-future-improvements)

---

## 1. Project Overview

**ClipStream** is a cloud-native, TikTok-style short-form video-sharing web application built to demonstrate modern scalable architecture, stateless compute, decoupled storage, intelligent AI enhancements, containerisation, and automated CI/CD workflows.

The application allows authenticated creators to upload MP4 and WebM videos with titles, descriptions, and tags. Viewers can scroll through a dynamic video feed, play videos using streaming HTTP range requests, like content, increment view counts upon playback, engage via comments with automated AI sentiment analysis, and search videos across titles, tags, descriptions, and speech transcripts.

### Key Capabilities
- **Dual-Mode Operation:** Functions 100% locally on a developer workstation (`STORAGE_MODE=local`) without external cloud accounts, and switches to Microsoft Azure enterprise cloud services (`STORAGE_MODE=azure`) purely through environment variables without code modifications.
- **Stateless Backend Design:** Express compute tier stores no cross-request state in process memory, enabling horizontal scaling across multiple container replicas.
- **Decoupled Architecture:** Clean separation of compute, media blob storage, metadata persistence, and AI analytical services via the Adapter (Storage Abstraction) pattern.
- **Embedded AI Capabilities:** Real-time sentiment classification of comments (flagging hostile/negative content) and automated background speech transcription of uploaded media.
- **Production Observability:** Per-request structured JSON telemetry, container liveness (`/health`) and readiness (`/ready`) probes, and serving replica tracking via `X-Instance-Id` headers.

---

## 2. Implemented Features

All 15 required features (F1 through F15) from the authoritative specification feature register are implemented, tested, and operational:

| ID | Feature Name | Group | Implementation Summary | Source Locations | Status |
|:---|:---|:---|:---|:---|:---|
| **F1** | Video Upload with Validation | Core | Multipart upload for MP4/WebM files up to 100MB with client-side progress tracking (`XMLHttpRequest`), MIME type validation, and input sanitisation. | `src/routes/videos.js`, `src/utils/validation.js`, `public/js/app.js` | Complete |
| **F2** | Paginated Feed & HTML5 Playback | Core | Reverse-chronological feed with cursor-based pagination and HTML5 video streaming supporting HTTP 206 range requests. | `src/routes/videos.js`, `src/services/metadata/*`, `public/index.html` | Complete |
| **F3** | Video Likes | Core | Idempotent toggle like per user/video with live counters; prevents duplicate likes. | `POST /api/videos/:id/like`, `src/services/metadata/*` | Complete |
| **F4** | Video Comments | Core | Create and retrieve comments per video with author display, relative timestamps, and sentiment indicators. | `src/routes/comments.js`, `src/services/metadata/*` | Complete |
| **F5** | Delete Own Video | Core | Video owners can permanently delete their videos, cascading across media files, likes, and comments (403 for non-owners). | `DELETE /api/videos/:id`, `src/routes/videos.js` | Complete |
| **F6** | View Counter | Engagement | Atomic view increment triggered once per video play per page load; rate-limited. | `POST /api/videos/:id/view`, `src/routes/videos.js` | Complete |
| **F7** | Video Search | Discovery | Case-insensitive substring text search across video title, description, tags, and transcripts. | `GET /api/videos?q=...`, `src/services/metadata/*` | Complete |
| **F8** | Tags & Tag Filtering | Discovery | Up to 5 alphanumeric tags per video (2–20 chars). Tag chips on cards trigger instant feed filtering. | `src/utils/validation.js`, `GET /api/videos?tag=...` | Complete |
| **F9** | Trending Feed | Discovery | Engagement scoring algorithm ranking videos by likes, comments, views, and decay over time; cached for 30s. | `GET /api/videos?sort=trending`, `src/services/metadata/*` | Complete |
| **F10** | My Videos (Profile) | Discovery | Filter feed to the signed-in user's uploads with one-click deletion controls. | `GET /api/videos?uploaderId=me`, `public/js/app.js` | Complete |
| **F11** | Identity & Sign-In | Advanced | Dual-mode authentication: development simulation (`AUTH_MODE=dev`) and Azure App Service / Easy Auth headers (`AUTH_MODE=easyauth`). | `src/middleware/auth.js`, `src/routes/info.js` | Complete |
| **F12** | Comment Sentiment Analysis | Advanced (AI) | Analyzes comment polarity (positive, neutral, negative). Strongly negative comments (score ≥ 0.85) are automatically collapsed behind a "Show anyway" toggle. | `src/services/sentiment/*`, `src/routes/comments.js`, `public/js/app.js` | Complete |
| **F13** | Speech Transcription | Advanced (AI) | Asynchronous post-upload transcription pipeline feeding searchable transcripts displayed in an expandable accordion under each video. | `src/services/transcription/*`, `src/routes/videos.js` | Complete |
| **F14** | Observability & Instance Indicator | Platform | Liveness (`/health`), readiness (`/ready`), instance metadata (`/api/info`), structured JSON logs, `X-Instance-Id` header, and dynamic UI replica monitor. | `src/logger.js`, `src/routes/health.js`, `src/routes/info.js` | Complete |
| **F15** | CI/CD Pipeline | Platform | Multi-job GitHub Actions workflow executing code linting, Jest test execution with coverage enforcement, and Docker multi-stage image verification. | `.github/workflows/ci.yml`, `Dockerfile` | Complete |

---

## 3. Architecture

### 3.1 Logical Architecture

ClipStream adopts an n-tier cloud-native architecture decoupling compute from persistent storage and analytical intelligence:

```
+-------------------------------------------------------------------------+
|                              CLIENT LAYER                               |
|        Vanilla Browser Client (HTML5 / ES6 Vanilla JS / Modern CSS)     |
+-------------------------------------------------------------------------+
                                    |
                            HTTPS / REST API
                                    v
+-------------------------------------------------------------------------+
|                  INGRESS & EDGE (Production Azure / CDN)                |
|           Azure Front Door / CDN (Edge caching of video blobs & UI)     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                         STATELESS COMPUTE TIER                          |
|             Azure Container Apps / Docker Replicas (Express 4)          |
|    - App Instance 1 (Host A)        - App Instance N (Autoscale Target) |
|    - Middlewares: Helmet, Auth, RateLimiter, Compression, RequestLogger  |
|    - REST Routes: Health, Info, Videos, Comments, Debug Load Generator  |
+-------------------------------------------------------------------------+
                                    |
                +-------------------+-------------------+
                | (Storage Abstraction / Factory Pattern)|
                v                                       v
+--------------------------------+   +------------------------------------+
|          MEDIA STORAGE         |   |           METADATA STORAGE         |
| Local: File System Disk Store  |   | Local: JSON Store with Atomic Sync |
| Azure: Azure Blob Storage      |   | Azure: Azure Cosmos DB NoSQL       |
|   (BlockBlobClient streams)    |   |   (Partitioned: /id, /videoId)     |
+--------------------------------+   +------------------------------------+
                |                                       |
                v                                       v
+--------------------------------+   +------------------------------------+
|      SENTIMENT ANALYSIS        |   |         SPEECH TRANSCRIPTION       |
| Local: Heuristic Word-List     |   | Local: Placeholder Stub            |
| Azure: Azure AI Language Text  |   | Azure: Azure AI Speech Services    |
+--------------------------------+   +------------------------------------+
```

### 3.2 Design Patterns Implemented

1. **Stateless Service Pattern:**
   The Express server retains no in-memory session or user state. Every request carries authentication tokens or headers (`X-Dev-User` or `X-MS-CLIENT-PRINCIPAL-*`), allowing any available replica to handle any incoming request.
2. **Adapter (Storage Abstraction) Pattern:**
   Uniform interfaces (`MediaStore`, `MetadataStore`, `SentimentService`, `TranscriptionService`) wrap underlying storage backends. The factory function `createServices()` instantiates either local filesystem/heuristic adapters or Azure SDK client adapters based on `STORAGE_MODE`.
3. **Health Endpoint Monitoring Pattern:**
   Separate `/health` (process liveness probe) and `/ready` (dependency connectivity check against media and metadata stores) endpoints enable container orchestrators to manage traffic routing and restart dead replicas.
4. **Cache-Aside & Edge Caching:**
   Media files are uploaded with `Cache-Control: public, max-age=86400` headers, allowing CDNs to cache video bytes and offload streaming bandwidth from compute nodes.
5. **Circuit Breaker / Asynchronous Decoupling:**
   Audio transcription is triggered asynchronously after upload completion; failures in the AI transcription pipeline never block video publishing or fail user uploads.

---

## 4. Technical Implementation

### 4.1 Project Directory Structure

```
clipstream/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions automated lint, test, docker build
├── docs/
│   ├── DOCUMENTATION.md           # This comprehensive documentation file
│   ├── TECHNICAL_SPEC.md          # Technical specification reference
│   └── architecture/
│       └── README.md              # Architecture diagram plan & documentation
├── public/                        # Static frontend assets (no build step)
│   ├── css/
│   │   └── styles.css             # Responsive theme styling & layout rules
│   ├── js/
│   │   └── app.js                 # Vanilla JavaScript client application
│   └── index.html                 # Single-page interface markup
├── scripts/
│   ├── load.js                    # k6 load testing script with ramping stages
│   └── seed.js                    # Sample dataset generator script
├── src/
│   ├── middleware/
│   │   ├── auth.js                # Dev & EasyAuth authentication middleware
│   │   ├── errorHandler.js        # Centralized JSON error response handler
│   │   └── requestLogger.js       # Structured JSON per-request telemetry logger
│   ├── routes/
│   │   ├── comments.js            # Comment listing & creation with sentiment
│   │   ├── health.js              # /health (liveness) & /ready (readiness) probes
│   │   ├── info.js                # /api/info instance telemetry endpoint
│   │   └── videos.js              # Video upload, feed, view, like & delete endpoints
│   ├── services/
│   │   ├── index.js               # Service factory (switches local vs azure)
│   │   ├── media/
│   │   │   ├── azureBlobMediaStore.js   # Azure Blob Storage adapter
│   │   │   └── localMediaStore.js       # Local disk filesystem adapter
│   │   ├── metadata/
│   │   │   ├── cosmosMetadataStore.js   # Azure Cosmos DB NoSQL adapter
│   │   │   └── localMetadataStore.js    # Atomic JSON file persistence adapter
│   │   ├── sentiment/
│   │   │   ├── azureLanguageSentiment.js# Azure AI Language Text adapter
│   │   │   └── localSentiment.js        # Heuristic word-list analyzer adapter
│   │   └── transcription/
│   │       ├── azureSpeechTranscription.js # Azure AI Speech SDK adapter
│   │       └── localTranscription.js       # Local mode stub adapter
│   ├── utils/
│   │   └── validation.js          # Input validation, sanitization & tag parser
│   ├── app.js                     # Express application factory (exported for tests)
│   ├── config.js                  # Central configuration loader with validation
│   ├── logger.js                  # Structured JSON stdout/stderr emitter
│   └── server.js                  # HTTP listener with graceful SIGTERM/SIGINT shutdown
├── tests/
│   ├── auth.test.js               # Authentication & EasyAuth header tests
│   ├── azure.test.js              # Azure SDK client adapter tests (mocked)
│   ├── comments.test.js           # Comment posting, listing & sentiment tests
│   ├── health.test.js             # Liveness, readiness & info endpoint tests
│   ├── helpers.js                 # In-memory mock service fixtures & test app factory
│   ├── pipeline-gate.test.js      # Deliberate CI/CD pipeline gate demonstration test
│   ├── stores.test.js             # Local media, metadata & sentiment adapter tests
│   └── videos.test.js             # Video upload, pagination, search & delete tests
├── .dockerignore                  # Docker build exclusions
├── .env.example                   # Environment variable template
├── .eslintrc.json                 # ESLint rules configuration
├── .gitignore                     # Git tracking exclusions
├── Dockerfile                     # Multi-stage production container definition
├── docker-compose.yml             # Multi-container local orchestration configuration
├── package.json                   # Project dependencies and operational scripts
└── README.md                      # Repository quickstart and project overview
```

### 4.2 REST API Specifications

All endpoints emit standard JSON responses. Responses include the custom header `X-Instance-Id: <hostname>` indicating which compute node serviced the request.

#### Health & Telemetry
- `GET /health`
  - **Auth:** None
  - **Status:** `200 OK`
  - **Response:** `{"status":"ok"}`
- `GET /ready`
  - **Auth:** None
  - **Status:** `200 OK` (healthy) or `503 Service Unavailable` (degraded)
  - **Response:** `{"status":"ready","checks":{"media":true,"metadata":true}}`
- `GET /api/info`
  - **Auth:** None
  - **Response:** `{"instanceId":"hostname","mode":"local","version":"1.0.0","uptimeSeconds":120,"startedAt":"2026-11-21T10:00:00.000Z"}`
- `GET /api/me`
  - **Auth:** Optional
  - **Response:** Current user object `{ id, name, email }` or `null` if anonymous.

#### Videos & Discovery
- `GET /api/videos`
  - **Auth:** None (except `uploaderId=me` which requires auth)
  - **Query Parameters:**
    - `limit` (integer, default: 10, max: 50)
    - `cursor` (opaque base64 string for pagination)
    - `q` (search term across title, description, tags, transcript)
    - `tag` (filter by exact tag)
    - `uploaderId` (filter by author ID; `'me'` resolves to current user)
    - `sort` (`'new'` for newest-first, `'trending'` for engagement rank)
  - **Response:** `{"items": [...videos], "nextCursor": "base64String|null"}`
- `GET /api/videos/:id`
  - **Auth:** None
  - **Response:** Single video object, or `404 Not Found`.
- `POST /api/videos`
  - **Auth:** Required
  - **Content-Type:** `multipart/form-data`
  - **Fields:** `file` (MP4/WebM binary), `title` (1–100 chars), `description` (0–500 chars), `tags` (comma-separated string).
  - **Response:** `201 Created` with created video record.
- `POST /api/videos/:id/like`
  - **Auth:** Required
  - **Response:** `200 OK` with `{"liked": true|false, "likeCount": number}`.
- `POST /api/videos/:id/view`
  - **Auth:** None (rate-limited)
  - **Response:** `200 OK` with `{"viewCount": number}`.
- `DELETE /api/videos/:id`
  - **Auth:** Required (owner only)
  - **Response:** `204 No Content` on success, `403 Forbidden` if requester is not owner, `404 Not Found` if missing.

#### Comments & Sentiment
- `GET /api/videos/:id/comments`
  - **Auth:** None
  - **Query Parameters:** `limit` (default: 10, max: 50), `cursor`
  - **Response:** `{"items": [...comments], "nextCursor": "base64String|null"}`
- `POST /api/videos/:id/comments`
  - **Auth:** Required
  - **Body:** `{"text": "1-300 characters"}`
  - **Response:** `201 Created` with comment document including `sentiment`, `sentimentScore`, and `flagged` status.

#### Demonstration Endpoint
- `GET /api/debug/burn?ms=200`
  - **Auth:** None (active only when `ENABLE_DEBUG_ENDPOINTS=true`)
  - **Purpose:** Executes a synchronous CPU busy-wait for up to 2000ms to trigger autoscaling CPU metrics during live demonstrations.

---

## 5. Database Documentation

### 5.1 Document Schemas

All entities are represented as native JSON documents across both the local file store and Azure Cosmos DB NoSQL.

#### 1. Video Document (`videos` collection / container)
- **Partition Key (Cosmos DB):** `/id`
```json
{
  "id": "c57f722e-a5e2-45e6-bd95-976ba709e99a",
  "title": "Scaling Cloud Native Architectures",
  "description": "Walkthrough of horizontal container scaling in Azure.",
  "tags": ["cloud", "azure", "containers"],
  "uploaderId": "dev@clipstream.local",
  "uploaderName": "Dev User",
  "mediaKey": "c57f722e-a5e2-45e6-bd95-976ba709e99a.mp4",
  "mediaUrl": "/media/c57f722e-a5e2-45e6-bd95-976ba709e99a.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 14205882,
  "createdAt": "2026-11-21T10:15:30.000Z",
  "likeCount": 15,
  "commentCount": 3,
  "viewCount": 142,
  "transcript": "Welcome everyone to today's cloud architecture demonstration.",
  "transcriptStatus": "done"
}
```

#### 2. Comment Document (`comments` collection / container)
- **Partition Key (Cosmos DB):** `/videoId`
```json
{
  "id": "a18e390c-99d1-4177-848e-fb22d10c5981",
  "videoId": "c57f722e-a5e2-45e6-bd95-976ba709e99a",
  "userId": "dev@clipstream.local",
  "userName": "Dev User",
  "text": "Great overview of the stateless compute tier!",
  "sentiment": "positive",
  "sentimentScore": 0.94,
  "flagged": false,
  "createdAt": "2026-11-21T10:20:00.000Z"
}
```

#### 3. Like Document (`likes` collection / container)
- **Partition Key (Cosmos DB):** `/videoId`
- **Document ID Pattern:** `<videoId>:<userId>` (guarantees idempotency and single like per user)
```json
{
  "id": "c57f722e-a5e2-45e6-bd95-976ba709e99a:dev@clipstream.local",
  "videoId": "c57f722e-a5e2-45e6-bd95-976ba709e99a",
  "userId": "dev@clipstream.local",
  "createdAt": "2026-11-21T10:18:12.000Z"
}
```

### 5.2 Data Relationships & Cascade Deletion

```
  +------------------+
  |      VIDEO       | (Partition: /id)
  | id (PK)          |
  +--------+---------+
           | 1
           |
           +-----------------------------+
           | 1:N                         | 1:N
           v                             v
  +------------------+          +------------------+
  |     COMMENT      |          |       LIKE       |
  | videoId (FK/PK)  |          | videoId (FK/PK)  |
  | id               |          | id (<video>:<usr>|
  +------------------+          +------------------+
```

When a video owner executes `DELETE /api/videos/:id`:
1. The media file is removed from disk or Blob storage (`media.delete(video.mediaKey)`).
2. All corresponding comments with `videoId = :id` are deleted (`deleteCommentsAndLikes`).
3. All corresponding likes with `videoId = :id` are deleted.
4. The primary video document is deleted from the `videos` container.

---

## 6. Configuration and Environment Variables

Configuration is loaded through `src/config.js` with zero external dependencies. In `STORAGE_MODE=azure`, the application verifies all required connection credentials at startup and fails fast with an explicit descriptive error if any are missing.

| Variable Name | Default (Local) | Azure Mode Requirement | Description |
|:---|:---|:---|:---|
| `PORT` | `3000` | Optional | Port on which the HTTP server listens. |
| `NODE_ENV` | `development` | `production` | Node execution environment (`development`, `production`). |
| `STORAGE_MODE` | `local` | **`azure`** | Controls adapter selection (`local` or `azure`). |
| `LOCAL_DATA_DIR` | `./data` | N/A | Filesystem path for local media files and `db.json`. |
| `AUTH_MODE` | `dev` | **`easyauth`** | Authentication provider (`dev` or `easyauth`). |
| `MAX_UPLOAD_MB` | `100` | Optional | Maximum allowed video upload size in Megabytes. |
| `ALLOWED_VIDEO_TYPES`| `video/mp4,video/webm`| Optional | Comma-delimited MIME whitelist for uploads. |
| `ENABLE_DEBUG_ENDPOINTS`| `false` | Set `true` for demo | Enables `/api/debug/burn` CPU stress endpoint. |
| `AZURE_STORAGE_CONNECTION_STRING`| `""` | **Required** in Azure | Connection string for Azure Blob Storage account. |
| `AZURE_BLOB_CONTAINER`| `videos` | Optional | Target container name in Azure Blob Storage. |
| `MEDIA_BASE_URL` | `""` | Optional | Custom CDN base URL for video streaming (e.g. Azure Front Door). |
| `COSMOS_ENDPOINT` | `""` | **Required** in Azure | HTTPS endpoint URL of Azure Cosmos DB NoSQL account. |
| `COSMOS_KEY` | `""` | **Required** in Azure | Primary read-write key for Azure Cosmos DB account. |
| `COSMOS_DATABASE` | `clipstream` | Optional | Target Cosmos DB database name. |
| `AZURE_LANGUAGE_ENDPOINT`| `""` | Recommended in Azure | Endpoint URL for Azure AI Language Cognitive Service. |
| `AZURE_LANGUAGE_KEY` | `""` | Recommended in Azure | API Key for Azure AI Language Cognitive Service. |
| `AZURE_SPEECH_KEY` | `""` | Recommended in Azure | Subscription Key for Azure AI Speech Cognitive Service. |
| `AZURE_SPEECH_REGION` | `""` | Recommended in Azure | Region identifier for Azure AI Speech (e.g. `westeurope`). |

---

## 7. Setup and Installation

### 7.1 Prerequisites
- **Node.js:** Node.js 22 LTS or newer.
- **Package Manager:** npm 10 or newer.
- **Docker & Docker Compose:** Required only for containerized deployment.

### 7.2 Local Development Setup

1. **Clone the repository and enter the directory:**
   ```bash
   cd clipstream
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure the environment file:**
   ```bash
   cp .env.example .env
   ```
   *(The default `.env.example` is fully operational for local execution with no changes needed).*

4. **Seed sample data (Optional):**
   ```bash
   npm run seed
   ```

5. **Start the development server:**
   ```bash
   npm start
   # or with live reloading:
   npm run dev
   ```

6. **Access the application:**
   Open `http://localhost:3000` in any web browser.

### 7.3 Running Tests and Quality Checks

- **Run all automated tests:**
  ```bash
  npm test
  ```
- **Run tests with coverage reporting:**
  ```bash
  npm run test:coverage
  ```
- **Execute code linter:**
  ```bash
  npm run lint
  ```

### 7.4 Running with Docker Compose

To run the application inside Docker containers with two simulated replicas:
```bash
docker compose up --build
```
- Access **Instance 1** on `http://localhost:3000`
- Access **Instance 2** on `http://localhost:3001`
- Both instances share the persistent volume mounted at `/app/data`.

---

## 8. Usage Guide

### 8.1 Video Feed & Discovery
- **Browsing:** The main feed loads the newest videos automatically. Scroll down and click **Load More** to fetch subsequent pages.
- **Sorting:** Toggle between **New** (chronological order) and **Trending** (algorithmic engagement score).
- **Searching:** Type in the top search box and press Enter or click the magnifying glass to search video titles, descriptions, tags, and transcripts.
- **Tag Filtering:** Click any `#tag` badge on a video card to filter the feed to videos sharing that tag. Click the `×` on the filter chip to reset.

### 8.2 Video Playback & View Tracking
- Click Play on any video player. Video streams instantly with HTML5 range request support.
- When playback starts, the system automatically registers a view count increment (recorded once per page load per video).

### 8.3 Uploading Videos
1. Click **📤 Upload Video** in the upper toolbar.
2. Enter a **Title** (1–100 chars), **Description** (optional, up to 500 chars), and up to 5 comma-separated **Tags**.
3. Select an MP4 or WebM video file.
4. Click **Upload**. A real-time progress bar monitors network transfer. Upon completion, the new video appears immediately at the top of the feed.

### 8.4 Likes & Comments
- Click **❤️ Like** to toggle your like status on any video.
- Click **💬 Comments** to reveal the conversation thread.
- Type in the input box and click **Post** to submit a comment.
- Each comment displays a colored sentiment badge:
  - 🟢 **Green:** Positive sentiment.
  - ⚪ **Grey:** Neutral sentiment.
  - 🔴 **Red:** Negative sentiment.
- Comments detected as strongly negative (score ≥ 0.85) are automatically collapsed with a notice and require clicking **Show anyway** to reveal.

### 8.5 Speech Transcripts
- Click **📝 Show Transcript** beneath any video card to view the automated speech transcription.

### 8.6 Video Management (Profile)
- Click **My Videos** in the header navigation to view only the videos you uploaded.
- Click **🗑️ Delete** on your own videos to permanently remove the video, video file, comments, and likes.

---

## 9. Implementation Decisions

| Decision | Rationale |
|:---|:---|
| **Vanilla JS Frontend (No Framework)** | Chosen to keep the client codebase lightweight, zero-dependency, and buildless. HTML files and assets are served directly as static files, completely eliminating bundler overhead (Webpack/Vite) while meeting all reactive UI requirements. |
| **Strict `textContent` Usage** | User-generated content (titles, descriptions, comments, usernames) is rendered exclusively via DOM `textContent` APIs rather than `innerHTML` to eliminate Cross-Site Scripting (XSS) risks. |
| **CommonJS Modules** | CommonJS (`require`/`module.exports`) was selected over ES Modules for native compatibility with Node.js LTS, Jest test mocking fixtures, and legacy Azure SDK modules without transpile steps. |
| **Atomic File Sync for Local DB** | Local metadata persistence (`localMetadataStore.js`) writes JSON updates to an OS temporary file first before executing an atomic filesystem rename to `db.json`. This completely prevents file corruption during server interrupts. |
| **Lazy-Loaded Azure Services** | The services factory dynamically imports `@azure/*` packages only when `STORAGE_MODE=azure`. This guarantees local development never fails or requires Azure packages or connection credentials. |
| **Opaque Base64 Cursor Pagination** | Pagination cursors encode `{ createdAt, id }` in base64. This prevents client tampering and ensures deterministic ordering across replicas regardless of query limit changes. |
| **In-Memory Trending Cache (30s)** | Trending feed calculation scores the top 200 videos using an engagement-decay algorithm. Caching for 30 seconds per replica prevents database exhaustion while honoring the stateless principle (cache is non-critical and rebuildable). |
| **Composite Key for Likes** | Likes documents use `id: "<videoId>:<userId>"`. This guarantees at the database level that a user cannot submit duplicate likes on a video. |

---

## 10. Limitations and Future Improvements

### Current Limitations
1. **Local Store Concurrency:** The local JSON store (`db.json`) is designed for single-replica developer testing. Concurrent writes across multiple container replicas in local mode can experience file locking contention. (Resolved in Azure mode via Cosmos DB).
2. **Cross-Partition Feed Queries:** The Cosmos DB `videos` container uses `/id` as its partition key. Consequently, queries that order across all videos (like the global chronological feed) require cross-partition execution.
3. **Substring Search Scalability:** The current search implementation executes SQL `CONTAINS()` substring evaluation. While effective for moderate datasets, large-scale deployments would experience high Request Unit (RU) consumption in Cosmos DB.
4. **Synchronous Upload Processing:** Uploaded video files stream directly through the API server before reaching Blob storage. For very large files (e.g. 500MB+), this consumes container network bandwidth.

### Future Improvements & Roadmap
1. **Azure AI Search Integration:** Offload search queries from Cosmos DB to Azure AI Search with full-text indexing, tokenization, stemming, and fuzzy matching.
2. **Direct-to-Blob Client Uploads (SAS Tokens):** Update `POST /api/videos` to issue a temporary Shared Access Signature (SAS) URL, allowing client browsers to upload directly to Azure Blob Storage and offloading compute container bandwidth.
3. **Queue-Based Asynchronous Workers (Competing Consumers):** Decouple speech transcription using Azure Storage Queues or Azure Service Bus. Worker containers can consume transcription jobs independently with exponential backoff and dead-lettering.
4. **Shared Distributed Cache (Azure Cache for Redis):** Replace the per-replica in-memory trending feed cache with a shared Redis instance to maintain consistent trending ranks across hundreds of autoscale replicas.
5. **Synthetic Partitioning for Video Feeds:** Implement synthetic date-bucket partition keys (e.g., `bucket: "2026-W47"`) to limit feed queries to specific temporal partitions in Cosmos DB.

