// tests/azure.test.js — Unit tests for Azure service implementations using mocked SDKs

const { createAzureBlobMediaStore } = require('../src/services/media/azureBlobMediaStore');
const { createCosmosMetadataStore } = require('../src/services/metadata/cosmosMetadataStore');
const { createAzureLanguageSentiment } = require('../src/services/sentiment/azureLanguageSentiment');
const { createAzureSpeechTranscription } = require('../src/services/transcription/azureSpeechTranscription');

describe('Azure Blob Media Store (Mocked)', () => {
  let store;
  let mockBlockBlobClient;
  let mockContainerClient;

  beforeEach(async () => {
    mockBlockBlobClient = {
      uploadStream: jest.fn().mockResolvedValue({}),
      deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      url: 'https://stclipstream.blob.core.windows.net/videos/test.mp4',
    };

    mockContainerClient = {
      createIfNotExists: jest.fn().mockResolvedValue({}),
      getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      exists: jest.fn().mockResolvedValue(true),
    };

    const mockBlobServiceClient = {
      getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
    };

    store = await createAzureBlobMediaStore(mockBlobServiceClient);
  });

  test('healthCheck returns container existence', async () => {
    const isHealthy = await store.healthCheck();
    expect(isHealthy).toBe(true);
    expect(mockContainerClient.exists).toHaveBeenCalled();
  });

  test('delete calls deleteIfExists on blob client', async () => {
    await store.delete('test.mp4');
    expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
  });
});

describe('Azure Cosmos Metadata Store (Mocked)', () => {
  let store;
  let mockVideosContainer;
  let mockCommentsContainer;
  let mockLikesContainer;
  let mockCosmosClient;

  beforeEach(async () => {
    mockVideosContainer = {
      items: {
        create: jest.fn().mockImplementation(v => Promise.resolve({ resource: v })),
        query: jest.fn().mockReturnValue({
          fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
        }),
      },
      item: jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue({ resource: { id: 'v1', title: 'Cosmos Video', likeCount: 0 } }),
        replace: jest.fn().mockImplementation(v => Promise.resolve({ resource: v })),
        patch: jest.fn().mockResolvedValue({ resource: { id: 'v1', likeCount: 1, viewCount: 1, commentCount: 1 } }),
        delete: jest.fn().mockResolvedValue({}),
      }),
    };

    mockCommentsContainer = {
      items: {
        create: jest.fn().mockImplementation(c => Promise.resolve({ resource: c })),
        query: jest.fn().mockReturnValue({
          fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
        }),
      },
      item: jest.fn().mockReturnValue({
        delete: jest.fn().mockResolvedValue({}),
      }),
    };

    mockLikesContainer = {
      items: {
        create: jest.fn().mockImplementation(l => Promise.resolve({ resource: l })),
        query: jest.fn().mockReturnValue({
          fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
        }),
      },
      item: jest.fn().mockReturnValue({
        read: jest.fn().mockRejectedValue({ code: 404 }), // not liked yet
        delete: jest.fn().mockResolvedValue({}),
      }),
    };

    const mockDatabase = {
      read: jest.fn().mockResolvedValue({}),
      containers: {
        createIfNotExists: jest.fn().mockImplementation(({ id }) => {
          if (id === 'videos') return Promise.resolve({ container: mockVideosContainer });
          if (id === 'comments') return Promise.resolve({ container: mockCommentsContainer });
          if (id === 'likes') return Promise.resolve({ container: mockLikesContainer });
          return Promise.resolve({ container: {} });
        }),
      },
    };

    mockCosmosClient = {
      databases: {
        createIfNotExists: jest.fn().mockResolvedValue({ database: mockDatabase }),
      },
    };

    store = await createCosmosMetadataStore(mockCosmosClient);
  });

  test('creates video', async () => {
    const video = await store.createVideo({ id: 'v1', title: 'Cosmos Video' });
    expect(mockCosmosClient.databases.createIfNotExists).toHaveBeenCalledWith(
      { id: 'clipstream' },
      { throughput: 400 },
    );
    expect(video.id).toBe('v1');
    expect(mockVideosContainer.items.create).toHaveBeenCalled();
  });

  test('retrieves video', async () => {
    const video = await store.getVideo('v1');
    expect(video.title).toBe('Cosmos Video');
  });

  test('toggles like using atomic patch', async () => {
    const result = await store.toggleLike({ videoId: 'v1', userId: 'user1' });
    expect(result.liked).toBe(true);
    expect(result.likeCount).toBe(1);
    expect(mockVideosContainer.item).toHaveBeenCalled();
  });

  test('increments view count using atomic patch', async () => {
    const result = await store.incrementViews('v1');
    expect(result.viewCount).toBe(1);
  });

  test('deletes video', async () => {
    const result = await store.deleteVideo('v1');
    expect(result).toBe(true);
  });

  test('healthCheck returns true when database is readable', async () => {
    const isHealthy = await store.healthCheck();
    expect(isHealthy).toBe(true);
  });
});

describe('Azure AI Language Sentiment (Mocked)', () => {
  test('returns classified sentiment from mocked client', async () => {
    const mockClient = {
      analyze: jest.fn().mockResolvedValue([
        {
          sentiment: 'positive',
          confidenceScores: { positive: 0.95, neutral: 0.03, negative: 0.02 },
        },
      ]),
    };

    const service = createAzureLanguageSentiment(mockClient);
    const result = await service.analyse('I love this app!');
    expect(result.label).toBe('positive');
    expect(result.score).toBe(0.95);
  });

  test('returns fallback neutral when client is null', async () => {
    const service = createAzureLanguageSentiment(null);
    const result = await service.analyse('Some text');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0.5);
  });
});

describe('Azure AI Speech Transcription (Mocked)', () => {
  test('transcribes via custom/mocked client', async () => {
    const mockClient = {
      transcribe: jest.fn().mockResolvedValue({ text: 'Speech transcribed successfully' }),
    };

    const service = createAzureSpeechTranscription(mockClient);
    const result = await service.transcribe({ mediaUrl: 'https://...', videoId: 'v1' });
    expect(result.text).toBe('Speech transcribed successfully');
  });

  test('returns fallback message when credentials not set', async () => {
    const service = createAzureSpeechTranscription(null);
    const result = await service.transcribe({ mediaUrl: 'https://...', videoId: 'v1' });
    expect(result.text).toContain('Transcription');
  });
});

