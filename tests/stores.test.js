// tests/stores.test.js — Tests for local service implementations

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Local Metadata Store', () => {
  let store;
  const testDataDir = path.join(os.tmpdir(), `clipstream-test-${Date.now()}`);

  beforeAll(async () => {
    process.env.LOCAL_DATA_DIR = testDataDir;
    jest.resetModules();
    const { createLocalMetadataStore } = require('../src/services/metadata/localMetadataStore');
    store = await createLocalMetadataStore();
  });

  afterAll(() => {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    delete process.env.LOCAL_DATA_DIR;
    jest.resetModules();
  });

  test('creates and retrieves a video', async () => {
    const video = await store.createVideo({
      id: 'v1', title: 'Test Video', description: 'desc',
      createdAt: '2024-01-01T00:00:00Z', likeCount: 0, commentCount: 0,
      viewCount: 0, tags: ['test'],
    });

    expect(video.id).toBe('v1');

    const retrieved = await store.getVideo('v1');
    expect(retrieved.title).toBe('Test Video');
  });

  test('returns null for missing video', async () => {
    const result = await store.getVideo('nonexistent');
    expect(result).toBeNull();
  });

  test('lists videos newest first', async () => {
    await store.createVideo({
      id: 'v2', title: 'Second', createdAt: '2024-01-02T00:00:00Z',
      likeCount: 0, commentCount: 0, viewCount: 0, tags: [],
    });
    await store.createVideo({
      id: 'v3', title: 'Third', createdAt: '2024-01-03T00:00:00Z',
      likeCount: 0, commentCount: 0, viewCount: 0, tags: [],
    });

    const result = await store.listVideos({ limit: 10 });
    expect(result.items[0].id).toBe('v3');
  });

  test('pagination works correctly', async () => {
    const page1 = await store.listVideos({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await store.listVideos({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);
  });

  test('toggles like on and off', async () => {
    const liked = await store.toggleLike({ videoId: 'v1', userId: 'user1' });
    expect(liked.liked).toBe(true);
    expect(liked.likeCount).toBe(1);

    const unliked = await store.toggleLike({ videoId: 'v1', userId: 'user1' });
    expect(unliked.liked).toBe(false);
    expect(unliked.likeCount).toBe(0);
  });

  test('adds and lists comments', async () => {
    await store.addComment({
      id: 'c1', videoId: 'v1', text: 'Great!',
      createdAt: '2024-01-01T00:00:00Z',
    });
    await store.addComment({
      id: 'c2', videoId: 'v1', text: 'Nice!',
      createdAt: '2024-01-02T00:00:00Z',
    });

    const result = await store.listComments({ videoId: 'v1' });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('c2'); // newest first
  });

  test('increments view count', async () => {
    const result = await store.incrementViews('v1');
    expect(result.viewCount).toBeGreaterThanOrEqual(1);
  });

  test('deletes video and cascades', async () => {
    await store.deleteCommentsAndLikes('v1');
    const deleted = await store.deleteVideo('v1');
    expect(deleted).toBe(true);

    const retrieved = await store.getVideo('v1');
    expect(retrieved).toBeNull();
  });

  test('healthCheck returns true', async () => {
    expect(await store.healthCheck()).toBe(true);
  });
});

describe('Local Media Store', () => {
  let store;
  const testDataDir = path.join(os.tmpdir(), `clipstream-media-test-${Date.now()}`);
  const testFile = path.join(os.tmpdir(), 'test-upload.mp4');

  beforeAll(async () => {
    process.env.LOCAL_DATA_DIR = testDataDir;
    jest.resetModules();
    fs.writeFileSync(testFile, 'fake video content');
    const { createLocalMediaStore } = require('../src/services/media/localMediaStore');
    store = await createLocalMediaStore();
  });

  afterAll(() => {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    try { fs.unlinkSync(testFile); } catch (_e) { /* ignore */ }
    delete process.env.LOCAL_DATA_DIR;
    jest.resetModules();
  });

  test('saves and returns media key and URL', async () => {
    const result = await store.save({
      tempPath: testFile,
      filename: 'test-video.mp4',
      contentType: 'video/mp4',
    });

    expect(result.mediaKey).toBe('test-video.mp4');
    expect(result.mediaUrl).toContain('/media/');
  });

  test('deletes a media file', async () => {
    // Save first
    fs.writeFileSync(testFile, 'more fake content');
    await store.save({
      tempPath: testFile,
      filename: 'to-delete.mp4',
      contentType: 'video/mp4',
    });

    // Delete
    await store.delete('to-delete.mp4');

    // Verify file is gone
    const filePath = path.join(testDataDir, 'media', 'to-delete.mp4');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('healthCheck returns true', async () => {
    expect(await store.healthCheck()).toBe(true);
  });
});

describe('Local Sentiment', () => {
  let sentiment;

  beforeAll(() => {
    const { createLocalSentiment } = require('../src/services/sentiment/localSentiment');
    sentiment = createLocalSentiment();
  });

  test('detects positive sentiment', async () => {
    const result = await sentiment.analyse('This is great and amazing!');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0.5);
  });

  test('detects negative sentiment', async () => {
    const result = await sentiment.analyse('This is terrible and awful');
    expect(result.label).toBe('negative');
    expect(result.score).toBeGreaterThan(0.5);
  });

  test('detects neutral sentiment', async () => {
    const result = await sentiment.analyse('The sky is blue today');
    expect(result.label).toBe('neutral');
  });
});

describe('Validation', () => {
  const { validateTitle, validateDescription, validateCommentText, validateTags } = require('../src/utils/validation');

  test('validateTitle rejects empty', () => {
    expect(validateTitle('').valid).toBe(false);
  });

  test('validateTitle accepts valid title', () => {
    expect(validateTitle('My Video').valid).toBe(true);
  });

  test('validateTitle rejects > 100 chars', () => {
    expect(validateTitle('x'.repeat(101)).valid).toBe(false);
  });

  test('validateDescription allows empty', () => {
    expect(validateDescription('').valid).toBe(true);
  });

  test('validateDescription rejects > 500 chars', () => {
    expect(validateDescription('x'.repeat(501)).valid).toBe(false);
  });

  test('validateCommentText rejects empty', () => {
    expect(validateCommentText('').valid).toBe(false);
  });

  test('validateCommentText rejects > 300 chars', () => {
    expect(validateCommentText('x'.repeat(301)).valid).toBe(false);
  });

  test('validateTags parses comma-separated tags', () => {
    const result = validateTags('coding, music, art');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['coding', 'music', 'art']);
  });

  test('validateTags rejects tags shorter than 2 chars', () => {
    expect(validateTags('a').valid).toBe(false);
  });

  test('validateTags rejects more than 5 tags', () => {
    expect(validateTags('a1,b2,c3,d4,e5,f6').valid).toBe(false);
  });

  test('validateTags deduplicates', () => {
    const result = validateTags('coding,coding,music');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['coding', 'music']);
  });

  test('validateTags rejects special characters', () => {
    expect(validateTags('hello world').valid).toBe(false);
  });
});

