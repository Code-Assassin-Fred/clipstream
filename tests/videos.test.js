// tests/videos.test.js — Tests for video API endpoints

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createTestApp } = require('./helpers');

// Create a minimal valid MP4 file for upload tests
const TEST_VIDEO_DIR = path.join(os.tmpdir(), 'clipstream-test');
const TEST_VIDEO_PATH = path.join(TEST_VIDEO_DIR, 'test.mp4');

beforeAll(() => {
  fs.mkdirSync(TEST_VIDEO_DIR, { recursive: true });
  // Minimal MP4 file header (ftyp box)
  const mp4Header = Buffer.from([
    0x00, 0x00, 0x00, 0x1C, // box size: 28 bytes
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6F, 0x6D, // compatible brand: 'isom'
    0x69, 0x73, 0x6F, 0x32, // compatible brand: 'iso2'
    0x6D, 0x70, 0x34, 0x31, // compatible brand: 'mp41'
  ]);
  fs.writeFileSync(TEST_VIDEO_PATH, mp4Header);
});

afterAll(() => {
  try { fs.unlinkSync(TEST_VIDEO_PATH); } catch (_e) { /* ignore */ }
});

describe('Video API', () => {
  let app, services;

  beforeEach(() => {
    ({ app, services } = createTestApp());
  });

  describe('POST /api/videos — Upload', () => {
    test('uploads a video successfully with 201', async () => {
      const res = await request(app)
        .post('/api/videos')
        .field('title', 'My Test Video')
        .field('description', 'A test video upload')
        .field('tags', 'test,demo')
        .attach('file', TEST_VIDEO_PATH, { contentType: 'video/mp4' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('My Test Video');
      expect(res.body.description).toBe('A test video upload');
      expect(res.body.tags).toEqual(['test', 'demo']);
      expect(res.body.id).toBeDefined();
      expect(res.body.mediaUrl).toBeDefined();
      expect(res.body.likeCount).toBe(0);
      expect(res.body.commentCount).toBe(0);
      expect(res.body.viewCount).toBe(0);
    });

    test('returns 400 when no file provided', async () => {
      const res = await request(app)
        .post('/api/videos')
        .field('title', 'No File Video');

      expect(res.status).toBe(400);
    });

    test('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/videos')
        .attach('file', TEST_VIDEO_PATH, { contentType: 'video/mp4' });

      expect(res.status).toBe(400);
    });

    test('returns 415 for invalid file type', async () => {
      // Create a text file
      const txtPath = path.join(TEST_VIDEO_DIR, 'test.txt');
      fs.writeFileSync(txtPath, 'not a video');

      const res = await request(app)
        .post('/api/videos')
        .field('title', 'Bad File')
        .attach('file', txtPath, { contentType: 'text/plain' });

      expect([400, 415]).toContain(res.status);

      fs.unlinkSync(txtPath);
    });

    test('uploads with tags and validates them', async () => {
      const res = await request(app)
        .post('/api/videos')
        .field('title', 'Tagged Video')
        .field('tags', 'coding,music,art')
        .attach('file', TEST_VIDEO_PATH, { contentType: 'video/mp4' });

      expect(res.status).toBe(201);
      expect(res.body.tags).toEqual(['coding', 'music', 'art']);
    });

    test('rejects invalid tags', async () => {
      const res = await request(app)
        .post('/api/videos')
        .field('title', 'Bad Tags')
        .field('tags', 'a')  // too short
        .attach('file', TEST_VIDEO_PATH, { contentType: 'video/mp4' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/videos — Feed', () => {
    test('returns empty feed initially', async () => {
      const res = await request(app).get('/api/videos');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    test('returns videos newest first', async () => {
      // Create two videos
      services._data.videos.push(
        { id: 'v1', title: 'First', createdAt: '2024-01-01T00:00:00Z', tags: [], likeCount: 0, commentCount: 0, viewCount: 0 },
        { id: 'v2', title: 'Second', createdAt: '2024-01-02T00:00:00Z', tags: [], likeCount: 0, commentCount: 0, viewCount: 0 },
      );

      const res = await request(app).get('/api/videos');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].id).toBe('v2'); // newest first
      expect(res.body.items[1].id).toBe('v1');
    });

    test('pagination with limit and cursor', async () => {
      // Add 3 videos
      for (let i = 0; i < 3; i++) {
        services._data.videos.push({
          id: `v${i}`, title: `Video ${i}`,
          createdAt: new Date(2024, 0, i + 1).toISOString(),
          tags: [], likeCount: 0, commentCount: 0, viewCount: 0,
        });
      }

      const page1 = await request(app).get('/api/videos?limit=2');
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).toBeDefined();

      const page2 = await request(app).get(`/api/videos?limit=2&cursor=${page1.body.nextCursor}`);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();
    });
  });

  describe('GET /api/videos/:id', () => {
    test('returns a single video', async () => {
      services._data.videos.push({ id: 'v1', title: 'Test', tags: [] });

      const res = await request(app).get('/api/videos/v1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('v1');
    });

    test('returns 404 for missing video', async () => {
      const res = await request(app).get('/api/videos/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/videos/:id/like — Toggle like', () => {
    test('likes and unlikes a video', async () => {
      services._data.videos.push({ id: 'v1', title: 'Test', likeCount: 0, tags: [] });

      // Like
      const like = await request(app).post('/api/videos/v1/like');
      expect(like.status).toBe(200);
      expect(like.body.liked).toBe(true);
      expect(like.body.likeCount).toBe(1);

      // Unlike
      const unlike = await request(app).post('/api/videos/v1/like');
      expect(unlike.status).toBe(200);
      expect(unlike.body.liked).toBe(false);
      expect(unlike.body.likeCount).toBe(0);
    });

    test('returns 404 when liking a missing video', async () => {
      const res = await request(app).post('/api/videos/nonexistent/like');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/videos/:id/view — View counter', () => {
    test('increments view count', async () => {
      services._data.videos.push({ id: 'v1', title: 'Test', viewCount: 0, tags: [] });

      const res = await request(app).post('/api/videos/v1/view');
      expect(res.status).toBe(200);
      expect(res.body.viewCount).toBe(1);

      const res2 = await request(app).post('/api/videos/v1/view');
      expect(res2.body.viewCount).toBe(2);
    });

    test('returns 404 for missing video', async () => {
      const res = await request(app).post('/api/videos/nonexistent/view');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/videos/:id — Delete video', () => {
    test('owner can delete their video', async () => {
      services._data.videos.push({
        id: 'v1', title: 'Test', uploaderId: 'dev@clipstream.local',
        mediaKey: 'test.mp4', tags: [],
      });
      services._data.comments.push({ id: 'c1', videoId: 'v1' });
      services._data.likes.push({ id: 'v1:dev@clipstream.local', videoId: 'v1' });

      const res = await request(app).delete('/api/videos/v1');
      expect(res.status).toBe(204);

      // Verify cascade
      expect(services._data.videos).toHaveLength(0);
      expect(services._data.comments).toHaveLength(0);
      expect(services._data.likes).toHaveLength(0);
    });

    test('returns 403 when deleting another user\'s video', async () => {
      services._data.videos.push({
        id: 'v1', title: 'Test', uploaderId: 'other@test.com',
        mediaKey: 'test.mp4', tags: [],
      });

      const res = await request(app).delete('/api/videos/v1');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('returns 404 when deleting non-existent video', async () => {
      const res = await request(app).delete('/api/videos/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('Search and filter', () => {
    beforeEach(() => {
      services._data.videos.push(
        { id: 'v1', title: 'JavaScript Tutorial', description: 'Learn JS', tags: ['coding', 'javascript'], createdAt: '2024-01-01T00:00:00Z', likeCount: 10, commentCount: 5, viewCount: 100, transcript: 'hello world' },
        { id: 'v2', title: 'Cooking Show', description: 'Make pasta', tags: ['cooking', 'food'], createdAt: '2024-01-02T00:00:00Z', likeCount: 5, commentCount: 2, viewCount: 50 },
        { id: 'v3', title: 'Music Video', description: 'New song', tags: ['music'], createdAt: '2024-01-03T00:00:00Z', likeCount: 1, commentCount: 0, viewCount: 10 },
      );
    });

    test('search by title', async () => {
      const res = await request(app).get('/api/videos?q=javascript');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('v1');
    });

    test('search by description', async () => {
      const res = await request(app).get('/api/videos?q=pasta');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('v2');
    });

    test('search by tag content', async () => {
      const res = await request(app).get('/api/videos?q=coding');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('v1');
    });

    test('search by transcript', async () => {
      const res = await request(app).get('/api/videos?q=hello');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('v1');
    });

    test('filter by tag', async () => {
      const res = await request(app).get('/api/videos?tag=cooking');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('v2');
    });

    test('trending sort orders by engagement score', async () => {
      const res = await request(app).get('/api/videos?sort=trending');
      expect(res.body.items).toHaveLength(3);
      // v1 should be top (highest engagement despite being oldest)
      expect(res.body.items[0].id).toBe('v1');
    });

    test('uploaderId=me requires authentication', async () => {
      // In easyauth mode without headers
      const originalAuthMode = process.env.AUTH_MODE;
      process.env.AUTH_MODE = 'easyauth';
      jest.resetModules();
      const { createTestApp: freshCreateTestApp } = require('./helpers');
      const { app: easyApp } = freshCreateTestApp();

      const res = await request(easyApp).get('/api/videos?uploaderId=me');
      expect(res.status).toBe(401);

      process.env.AUTH_MODE = originalAuthMode || '';
      if (!originalAuthMode) delete process.env.AUTH_MODE;
      jest.resetModules();
    });

    test('uploaderId filters by uploader', async () => {
      services._data.videos[0].uploaderId = 'dev@clipstream.local';
      services._data.videos[1].uploaderId = 'other@test.com';
      services._data.videos[2].uploaderId = 'dev@clipstream.local';

      const res = await request(app).get('/api/videos?uploaderId=me');
      expect(res.body.items).toHaveLength(2);
    });
  });
});

