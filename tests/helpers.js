// tests/helpers.js — Shared test utilities

const { createApp } = require('../src/app');

/**
 * Create in-memory fake services for testing
 */
function createFakeServices() {
  const videos = [];
  const comments = [];
  const likes = [];

  function decodeCursor(cursor) {
    if (!cursor) return null;
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch (_e) {
      return null;
    }
  }

  function encodeCursor(createdAt, id) {
    return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
  }

  return {
    media: {
      async save({ tempPath: _tempPath, filename }) {
        const mediaKey = filename;
        const mediaUrl = `/media/${filename}`;
        return { mediaKey, mediaUrl };
      },
      async delete(_mediaKey) {},
      async healthCheck() { return true; },
    },

    metadata: {
      async createVideo(video) {
        videos.push(video);
        return video;
      },

      async getVideo(id) {
        return videos.find(v => v.id === id) || null;
      },

      async listVideos({ limit = 10, cursor, q, tag, uploaderId, sort = 'new' } = {}) {
        let items = [...videos];

        if (q) {
          const query = q.toLowerCase();
          items = items.filter(v =>
            (v.title && v.title.toLowerCase().includes(query)) ||
            (v.description && v.description.toLowerCase().includes(query)) ||
            (v.tags && v.tags.some(t => t.toLowerCase().includes(query))) ||
            (v.transcript && v.transcript.toLowerCase().includes(query)),
          );
        }

        if (tag) {
          items = items.filter(v => v.tags && v.tags.includes(tag.toLowerCase()));
        }

        if (uploaderId) {
          items = items.filter(v => v.uploaderId === uploaderId);
        }

        if (sort === 'trending') {
          const now = Date.now();
          items = items
            .map(v => {
              const hours = (now - new Date(v.createdAt).getTime()) / 3600000;
              const score = ((v.likeCount || 0) * 3 + (v.commentCount || 0) * 2 + (v.viewCount || 0))
                / Math.pow(hours + 2, 1.2);
              return { ...v, _score: score };
            })
            .sort((a, b) => b._score - a._score)
            .map(({ _score: _, ...v }) => v);
        } else {
          items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        const cursorData = decodeCursor(cursor);
        if (cursorData && sort !== 'trending') {
          const idx = items.findIndex(v =>
            v.createdAt === cursorData.createdAt && v.id === cursorData.id,
          );
          if (idx >= 0) items = items.slice(idx + 1);
        }

        const pageItems = items.slice(0, limit);
        const nextCursor = pageItems.length === limit && pageItems.length < items.length
          ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id)
          : null;

        return { items: pageItems, nextCursor };
      },

      async updateVideo(id, patch) {
        const idx = videos.findIndex(v => v.id === id);
        if (idx === -1) return null;
        Object.assign(videos[idx], patch);
        return videos[idx];
      },

      async toggleLike({ videoId, userId }) {
        const likeId = `${videoId}:${userId}`;
        const existingIdx = likes.findIndex(l => l.id === likeId);

        if (existingIdx >= 0) {
          likes.splice(existingIdx, 1);
          const v = videos.find(v => v.id === videoId);
          if (v) v.likeCount = Math.max(0, (v.likeCount || 0) - 1);
          return { liked: false, likeCount: v ? v.likeCount : 0 };
        }

        likes.push({ id: likeId, videoId, userId, createdAt: new Date().toISOString() });
        const v = videos.find(v => v.id === videoId);
        if (v) v.likeCount = (v.likeCount || 0) + 1;
        return { liked: true, likeCount: v ? v.likeCount : 0 };
      },

      async addComment(comment) {
        comments.push(comment);
        const v = videos.find(v => v.id === comment.videoId);
        if (v) v.commentCount = (v.commentCount || 0) + 1;
        return comment;
      },

      async listComments({ videoId, limit = 10, cursor } = {}) {
        let items = comments
          .filter(c => c.videoId === videoId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const cursorData = decodeCursor(cursor);
        if (cursorData) {
          const idx = items.findIndex(c =>
            c.createdAt === cursorData.createdAt && c.id === cursorData.id,
          );
          if (idx >= 0) items = items.slice(idx + 1);
        }

        const pageItems = items.slice(0, limit);
        const nextCursor = pageItems.length === limit && pageItems.length < items.length
          ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id)
          : null;

        return { items: pageItems, nextCursor };
      },

      async incrementViews(id) {
        const v = videos.find(v => v.id === id);
        if (!v) return null;
        v.viewCount = (v.viewCount || 0) + 1;
        return { viewCount: v.viewCount };
      },

      async deleteVideo(id) {
        const idx = videos.findIndex(v => v.id === id);
        if (idx === -1) return false;
        videos.splice(idx, 1);
        return true;
      },

      async deleteCommentsAndLikes(videoId) {
        const ci = comments.filter(c => c.videoId !== videoId);
        comments.length = 0;
        comments.push(...ci);
        const li = likes.filter(l => l.videoId !== videoId);
        likes.length = 0;
        likes.push(...li);
      },

      async healthCheck() { return true; },
    },

    sentiment: {
      async analyse(_text) {
        return { label: 'neutral', score: 0.5 };
      },
    },

    transcription: {
      async transcribe() {
        return { text: 'Test transcript' };
      },
    },

    // Expose internals for test assertions
    _data: { videos, comments, likes },
  };
}

/**
 * Create a test app with fake services
 */
function createTestApp(overrides = {}) {
  const services = createFakeServices();

  // Apply any overrides to services
  if (overrides.sentiment) {
    Object.assign(services.sentiment, overrides.sentiment);
  }
  if (overrides.transcription) {
    Object.assign(services.transcription, overrides.transcription);
  }

  const app = createApp(services);
  return { app, services };
}

module.exports = { createFakeServices, createTestApp };
