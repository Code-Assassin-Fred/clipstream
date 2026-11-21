// tests/comments.test.js — Tests for comment API endpoints

const request = require('supertest');
const { createTestApp } = require('./helpers');

describe('Comments API', () => {
  let app, services;

  beforeEach(() => {
    ({ app, services } = createTestApp());
    // Add a test video
    services._data.videos.push({
      id: 'v1', title: 'Test Video',
      uploaderId: 'dev@clipstream.local',
      createdAt: '2024-01-01T00:00:00Z',
      likeCount: 0, commentCount: 0, viewCount: 0, tags: [],
    });
  });

  describe('POST /api/videos/:id/comments', () => {
    test('creates a comment with sentiment', async () => {
      const res = await request(app)
        .post('/api/videos/v1/comments')
        .send({ text: 'This is a great video!' });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe('This is a great video!');
      expect(res.body.videoId).toBe('v1');
      expect(res.body.sentiment).toBeDefined();
      expect(res.body.sentimentScore).toBeDefined();
      expect(res.body.id).toBeDefined();
    });

    test('returns 400 for empty comment text', async () => {
      const res = await request(app)
        .post('/api/videos/v1/comments')
        .send({ text: '' });

      expect(res.status).toBe(400);
    });

    test('returns 400 for comment text exceeding 300 chars', async () => {
      const res = await request(app)
        .post('/api/videos/v1/comments')
        .send({ text: 'x'.repeat(301) });

      expect(res.status).toBe(400);
    });

    test('returns 404 for comment on non-existent video', async () => {
      const res = await request(app)
        .post('/api/videos/nonexistent/comments')
        .send({ text: 'Hello' });

      expect(res.status).toBe(404);
    });

    test('flags negative comments with high score', async () => {
      const { app: flagApp } = createTestApp({
        sentiment: {
          async analyse() {
            return { label: 'negative', score: 0.90 };
          },
        },
      });
      // Add video to the new app's services
      flagApp.locals.services._data = { videos: [{ id: 'v1', title: 'T', commentCount: 0, tags: [] }], comments: [], likes: [] };
      // Need to override the metadata methods
      flagApp.locals.services.metadata.getVideo = async (id) => {
        return flagApp.locals.services._data.videos.find(v => v.id === id) || null;
      };
      flagApp.locals.services.metadata.addComment = async (comment) => {
        flagApp.locals.services._data.comments.push(comment);
        return comment;
      };

      const res = await request(flagApp)
        .post('/api/videos/v1/comments')
        .send({ text: 'This is terrible garbage trash awful horrible' });

      expect(res.status).toBe(201);
      expect(res.body.flagged).toBe(true);
    });

    test('does not flag neutral comments', async () => {
      const res = await request(app)
        .post('/api/videos/v1/comments')
        .send({ text: 'Interesting perspective' });

      expect(res.status).toBe(201);
      expect(res.body.flagged).toBe(false);
    });
  });

  describe('GET /api/videos/:id/comments', () => {
    test('returns empty comments list', async () => {
      const res = await request(app).get('/api/videos/v1/comments');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    test('returns comments for a video', async () => {
      services._data.comments.push(
        { id: 'c1', videoId: 'v1', text: 'First', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'c2', videoId: 'v1', text: 'Second', createdAt: '2024-01-02T00:00:00Z' },
      );

      const res = await request(app).get('/api/videos/v1/comments');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].id).toBe('c2'); // newest first
    });

    test('returns 404 for comments on non-existent video', async () => {
      const res = await request(app).get('/api/videos/nonexistent/comments');
      expect(res.status).toBe(404);
    });
  });
});
