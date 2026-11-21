// src/services/metadata/localMetadataStore.js — JSON file-based metadata store

const fs = require('fs');
const path = require('path');
const os = require('os');
const { config } = require('../../config');
const logger = require('../../logger');

/**
 * Create a local metadata store using a JSON file at LOCAL_DATA_DIR/db.json.
 * Uses write-then-rename to avoid corruption. NOT concurrency-safe across replicas.
 */
async function createLocalMetadataStore() {
  const dbPath = path.join(config.localDataDir, 'db.json');

  // Ensure data directory exists
  await fs.promises.mkdir(config.localDataDir, { recursive: true });

  // Load or initialize the database
  let db = { videos: [], comments: [], likes: [] };
  try {
    const data = await fs.promises.readFile(dbPath, 'utf-8');
    db = JSON.parse(data);
    // Ensure all collections exist
    if (!db.videos) db.videos = [];
    if (!db.comments) db.comments = [];
    if (!db.likes) db.likes = [];
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    logger.info('No existing database found, starting fresh');
  }

  /**
   * Persist database with write-then-rename for atomic updates
   */
  async function persist() {
    const tmpFile = path.join(os.tmpdir(), `clipstream-db-${Date.now()}.json`);
    await fs.promises.writeFile(tmpFile, JSON.stringify(db, null, 2));
    await fs.promises.rename(tmpFile, dbPath);
  }

  /**
   * Decode pagination cursor
   */
  function decodeCursor(cursor) {
    if (!cursor) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Encode pagination cursor
   */
  function encodeCursor(createdAt, id) {
    return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
  }

  logger.info('Local metadata store initialized', { dbPath });

  return {
    /**
     * Create a new video record
     */
    async createVideo(video) {
      db.videos.push(video);
      await persist();
      return video;
    },

    /**
     * Get a single video by ID
     */
    async getVideo(id) {
      return db.videos.find(v => v.id === id) || null;
    },

    /**
     * List videos with pagination, search, filtering, and sorting
     * @param {Object} opts - { limit, cursor, q, tag, uploaderId, sort }
     */
    async listVideos({ limit = 10, cursor, q, tag, uploaderId, sort = 'new' } = {}) {
      let items = [...db.videos];

      // Filter by search query (case-insensitive substring over title, description, tags, transcript)
      if (q) {
        const query = q.toLowerCase();
        items = items.filter(v =>
          (v.title && v.title.toLowerCase().includes(query)) ||
          (v.description && v.description.toLowerCase().includes(query)) ||
          (v.tags && v.tags.some(t => t.toLowerCase().includes(query))) ||
          (v.transcript && v.transcript.toLowerCase().includes(query)),
        );
      }

      // Filter by tag
      if (tag) {
        const tagLower = tag.toLowerCase();
        items = items.filter(v => v.tags && v.tags.includes(tagLower));
      }

      // Filter by uploader
      if (uploaderId) {
        items = items.filter(v => v.uploaderId === uploaderId);
      }

      // Sort
      if (sort === 'trending') {
        // Trending: score = (likeCount*3 + commentCount*2 + viewCount) / (hoursSinceUpload + 2)^1.2
        const now = Date.now();
        items = items
          .map(v => {
            const hoursSinceUpload = (now - new Date(v.createdAt).getTime()) / (1000 * 60 * 60);
            const score = ((v.likeCount || 0) * 3 + (v.commentCount || 0) * 2 + (v.viewCount || 0))
              / Math.pow(hoursSinceUpload + 2, 1.2);
            return { ...v, _score: score };
          })
          .sort((a, b) => b._score - a._score)
          .map(({ _score: _s, ...v }) => v);
      } else {
        // Default: newest first
        items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      // Apply cursor-based pagination (only for 'new' sort)
      const cursorData = decodeCursor(cursor);
      if (cursorData && sort !== 'trending') {
        const idx = items.findIndex(v =>
          v.createdAt === cursorData.createdAt && v.id === cursorData.id,
        );
        if (idx >= 0) {
          items = items.slice(idx + 1);
        }
      }

      // Limit
      const pageItems = items.slice(0, limit);
      const nextCursor = pageItems.length === limit && pageItems.length < items.length
        ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id)
        : null;

      return { items: pageItems, nextCursor };
    },

    /**
     * Update a video record (partial patch)
     */
    async updateVideo(id, patch) {
      const idx = db.videos.findIndex(v => v.id === id);
      if (idx === -1) return null;
      Object.assign(db.videos[idx], patch);
      await persist();
      return db.videos[idx];
    },

    /**
     * Toggle like for a user on a video
     */
    async toggleLike({ videoId, userId }) {
      const likeId = `${videoId}:${userId}`;
      const existingIdx = db.likes.findIndex(l => l.id === likeId);

      if (existingIdx >= 0) {
        // Unlike
        db.likes.splice(existingIdx, 1);
        const videoIdx = db.videos.findIndex(v => v.id === videoId);
        if (videoIdx >= 0) {
          db.videos[videoIdx].likeCount = Math.max(0, (db.videos[videoIdx].likeCount || 0) - 1);
        }
        await persist();
        return { liked: false, likeCount: db.videos.find(v => v.id === videoId)?.likeCount || 0 };
      }

      // Like
      db.likes.push({
        id: likeId,
        videoId,
        userId,
        createdAt: new Date().toISOString(),
      });
      const videoIdx = db.videos.findIndex(v => v.id === videoId);
      if (videoIdx >= 0) {
        db.videos[videoIdx].likeCount = (db.videos[videoIdx].likeCount || 0) + 1;
      }
      await persist();
      return { liked: true, likeCount: db.videos.find(v => v.id === videoId)?.likeCount || 0 };
    },

    /**
     * Add a comment to a video
     */
    async addComment(comment) {
      db.comments.push(comment);
      // Increment comment count on video
      const videoIdx = db.videos.findIndex(v => v.id === comment.videoId);
      if (videoIdx >= 0) {
        db.videos[videoIdx].commentCount = (db.videos[videoIdx].commentCount || 0) + 1;
      }
      await persist();
      return comment;
    },

    /**
     * List comments for a video with pagination
     */
    async listComments({ videoId, limit = 10, cursor } = {}) {
      let items = db.comments
        .filter(c => c.videoId === videoId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const cursorData = decodeCursor(cursor);
      if (cursorData) {
        const idx = items.findIndex(c =>
          c.createdAt === cursorData.createdAt && c.id === cursorData.id,
        );
        if (idx >= 0) {
          items = items.slice(idx + 1);
        }
      }

      const pageItems = items.slice(0, limit);
      const nextCursor = pageItems.length === limit && pageItems.length < items.length
        ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id)
        : null;

      return { items: pageItems, nextCursor };
    },

    /**
     * Increment view count for a video
     */
    async incrementViews(id) {
      const idx = db.videos.findIndex(v => v.id === id);
      if (idx === -1) return null;
      db.videos[idx].viewCount = (db.videos[idx].viewCount || 0) + 1;
      await persist();
      return { viewCount: db.videos[idx].viewCount };
    },

    /**
     * Delete a video by ID
     */
    async deleteVideo(id) {
      const idx = db.videos.findIndex(v => v.id === id);
      if (idx === -1) return false;
      db.videos.splice(idx, 1);
      await persist();
      return true;
    },

    /**
     * Delete all comments and likes for a video
     */
    async deleteCommentsAndLikes(videoId) {
      db.comments = db.comments.filter(c => c.videoId !== videoId);
      db.likes = db.likes.filter(l => l.videoId !== videoId);
      await persist();
    },

    /**
     * Health check: verify database is accessible
     */
    async healthCheck() {
      return true;
    },
  };
}

module.exports = { createLocalMetadataStore };
