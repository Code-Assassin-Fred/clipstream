// src/services/metadata/cosmosMetadataStore.js — Azure Cosmos DB implementation

const { config } = require('../../config');
const logger = require('../../logger');

/**
 * Create Azure Cosmos DB Metadata Store.
 * Uses @azure/cosmos.
 */
async function createCosmosMetadataStore(customCosmosClient = null) {
  let client = customCosmosClient;

  if (!client) {
    const { CosmosClient } = require('@azure/cosmos');
    client = new CosmosClient({
      endpoint: config.cosmosEndpoint,
      key: config.cosmosKey,
    });
  }

  // Ensure database exists with shared 400 RU/s throughput (not per-container)
  const { database } = await client.databases.createIfNotExists(
    { id: config.cosmosDatabase },
    { throughput: 400 },
  );

  const { container: videosContainer } = await database.containers.createIfNotExists({
    id: 'videos',
    partitionKey: { paths: ['/id'] },
  });

  const { container: commentsContainer } = await database.containers.createIfNotExists({
    id: 'comments',
    partitionKey: { paths: ['/videoId'] },
  });

  const { container: likesContainer } = await database.containers.createIfNotExists({
    id: 'likes',
    partitionKey: { paths: ['/videoId'] },
  });

  // Simple trending cache in memory (30 seconds per replica)
  let trendingCache = { items: null, timestamp: 0 };

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

  logger.info('Cosmos DB Metadata Store initialized', { database: config.cosmosDatabase });

  return {
    async createVideo(video) {
      const { resource } = await videosContainer.items.create(video);
      return resource;
    },

    async getVideo(id) {
      try {
        const { resource } = await videosContainer.item(id, id).read();
        return resource || null;
      } catch (err) {
        if (err.code === 404 || err.statusCode === 404) return null;
        throw err;
      }
    },

    async listVideos({ limit = 10, cursor, q, tag, uploaderId, sort = 'new' } = {}) {
      if (sort === 'trending') {
        const now = Date.now();
        if (trendingCache.items && now - trendingCache.timestamp < 30000) {
          return { items: trendingCache.items.slice(0, limit), nextCursor: null };
        }

        // Fetch up to 200 most recent videos
        const querySpec = {
          query: 'SELECT TOP 200 * FROM c ORDER BY c.createdAt DESC',
        };
        const { resources } = await videosContainer.items.query(querySpec).fetchAll();
        const scored = resources
          .map(v => {
            const hours = (now - new Date(v.createdAt).getTime()) / 3600000;
            const score = ((v.likeCount || 0) * 3 + (v.commentCount || 0) * 2 + (v.viewCount || 0))
              / Math.pow(hours + 2, 1.2);
            return { ...v, _score: score };
          })
          .sort((a, b) => b._score - a._score)
          .map(({ _score: _, ...v }) => v);

        trendingCache = { items: scored, timestamp: now };
        return { items: scored.slice(0, limit), nextCursor: null };
      }

      // Default: sort = 'new'
      const whereClauses = [];
      const parameters = [];

      if (q) {
        whereClauses.push('(CONTAINS(LOWER(c.title), @q) OR CONTAINS(LOWER(c.description), @q) OR ARRAY_CONTAINS(c.tags, @q) OR CONTAINS(LOWER(c.transcript), @q))');
        parameters.push({ name: '@q', value: q.toLowerCase() });
      }

      if (tag) {
        whereClauses.push('ARRAY_CONTAINS(c.tags, @tag)');
        parameters.push({ name: '@tag', value: tag.toLowerCase() });
      }

      if (uploaderId) {
        whereClauses.push('c.uploaderId = @uploaderId');
        parameters.push({ name: '@uploaderId', value: uploaderId });
      }

      const cursorData = decodeCursor(cursor);
      if (cursorData) {
        whereClauses.push('(c.createdAt < @cursorCreatedAt OR (c.createdAt = @cursorCreatedAt AND c.id < @cursorId))');
        parameters.push({ name: '@cursorCreatedAt', value: cursorData.createdAt });
        parameters.push({ name: '@cursorId', value: cursorData.id });
      }

      let query = 'SELECT * FROM c';
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }
      query += ' ORDER BY c.createdAt DESC';

      const querySpec = { query, parameters };
      const { resources } = await videosContainer.items.query(querySpec).fetchAll();

      const items = resources.slice(0, limit);
      const nextCursor = items.length === limit && resources.length > limit
        ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null;

      return { items, nextCursor };
    },

    async updateVideo(id, patch) {
      try {
        const { resource: current } = await videosContainer.item(id, id).read();
        if (!current) return null;
        const updated = { ...current, ...patch };
        const { resource } = await videosContainer.item(id, id).replace(updated);
        return resource;
      } catch (err) {
        if (err.code === 404 || err.statusCode === 404) return null;
        throw err;
      }
    },

    async toggleLike({ videoId, userId }) {
      const likeId = `${videoId}:${userId}`;
      try {
        const { resource: existing } = await likesContainer.item(likeId, videoId).read();
        if (existing) {
          await likesContainer.item(likeId, videoId).delete();
          // Decrement video likeCount
          const patchOps = [{ op: 'incr', path: '/likeCount', value: -1 }];
          const { resource: video } = await videosContainer.item(videoId, videoId).patch(patchOps);
          return { liked: false, likeCount: Math.max(0, video.likeCount) };
        }
      } catch (err) {
        if (err.code !== 404 && err.statusCode !== 404) throw err;
      }

      // Add like
      await likesContainer.items.create({
        id: likeId,
        videoId,
        userId,
        createdAt: new Date().toISOString(),
      });
      const patchOps = [{ op: 'incr', path: '/likeCount', value: 1 }];
      const { resource: video } = await videosContainer.item(videoId, videoId).patch(patchOps);
      return { liked: true, likeCount: video.likeCount };
    },

    async addComment(comment) {
      const { resource } = await commentsContainer.items.create(comment);
      // Increment commentCount
      const patchOps = [{ op: 'incr', path: '/commentCount', value: 1 }];
      await videosContainer.item(comment.videoId, comment.videoId).patch(patchOps);
      return resource;
    },

    async listComments({ videoId, limit = 10, cursor } = {}) {
      const whereClauses = ['c.videoId = @videoId'];
      const parameters = [{ name: '@videoId', value: videoId }];

      const cursorData = decodeCursor(cursor);
      if (cursorData) {
        whereClauses.push('(c.createdAt < @cursorCreatedAt OR (c.createdAt = @cursorCreatedAt AND c.id < @cursorId))');
        parameters.push({ name: '@cursorCreatedAt', value: cursorData.createdAt });
        parameters.push({ name: '@cursorId', value: cursorData.id });
      }

      const query = `SELECT * FROM c WHERE ${whereClauses.join(' AND ')} ORDER BY c.createdAt DESC`;
      const querySpec = { query, parameters };
      const { resources } = await commentsContainer.items.query(querySpec).fetchAll();

      const items = resources.slice(0, limit);
      const nextCursor = items.length === limit && resources.length > limit
        ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null;

      return { items, nextCursor };
    },

    async incrementViews(id) {
      try {
        const patchOps = [{ op: 'incr', path: '/viewCount', value: 1 }];
        const { resource: video } = await videosContainer.item(id, id).patch(patchOps);
        return { viewCount: video.viewCount };
      } catch (err) {
        if (err.code === 404 || err.statusCode === 404) return null;
        throw err;
      }
    },

    async deleteVideo(id) {
      try {
        await videosContainer.item(id, id).delete();
        return true;
      } catch (err) {
        if (err.code === 404 || err.statusCode === 404) return false;
        throw err;
      }
    },

    async deleteCommentsAndLikes(videoId) {
      // Query all comments for video
      const { resources: comments } = await commentsContainer.items.query({
        query: 'SELECT c.id FROM c WHERE c.videoId = @videoId',
        parameters: [{ name: '@videoId', value: videoId }],
      }).fetchAll();
      for (const c of comments) {
        await commentsContainer.item(c.id, videoId).delete().catch(() => {});
      }

      // Query all likes for video
      const { resources: likes } = await likesContainer.items.query({
        query: 'SELECT c.id FROM c WHERE c.videoId = @videoId',
        parameters: [{ name: '@videoId', value: videoId }],
      }).fetchAll();
      for (const l of likes) {
        await likesContainer.item(l.id, videoId).delete().catch(() => {});
      }
    },

    async healthCheck() {
      try {
        await database.read();
        return true;
      } catch (err) {
        logger.error('Cosmos healthCheck failed', { error: err.message });
        return false;
      }
    },
  };
}

module.exports = { createCosmosMetadataStore };

