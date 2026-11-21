// scripts/seed.js — Optional sample data seeder

const { v4: uuidv4 } = require('uuid');
const { createLocalMetadataStore } = require('../src/services/metadata/localMetadataStore');

async function seed() {
  console.log('Seeding initial data...');
  const metadata = await createLocalMetadataStore();

  const sampleVideos = [
    {
      id: uuidv4(),
      title: 'Welcome to ClipStream!',
      description: 'The premier cloud-native short-form video sharing platform.',
      tags: ['welcome', 'clipstream', 'demo'],
      uploaderId: 'dev@clipstream.local',
      uploaderName: 'ClipStream Team',
      mediaKey: 'sample1.mp4',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      contentType: 'video/mp4',
      sizeBytes: 15400000,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      likeCount: 42,
      commentCount: 3,
      viewCount: 150,
      transcript: 'Welcome to ClipStream, where high performance meets cloud scalability.',
      transcriptStatus: 'done',
    },
    {
      id: uuidv4(),
      title: 'Cloud Architecture Deep Dive',
      description: 'Understanding stateless services and Cosmos DB partitioning.',
      tags: ['cloud', 'azure', 'architecture'],
      uploaderId: 'dev@clipstream.local',
      uploaderName: 'Dev User',
      mediaKey: 'sample2.mp4',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      contentType: 'video/mp4',
      sizeBytes: 15000000,
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      likeCount: 28,
      commentCount: 1,
      viewCount: 95,
      transcript: 'In this session we explore cloud native patterns and autoscale triggers.',
      transcriptStatus: 'done',
    },
  ];

  for (const video of sampleVideos) {
    await metadata.createVideo(video);
    console.log(`Created sample video: ${video.title}`);

    // Add sample comments
    await metadata.addComment({
      id: uuidv4(),
      videoId: video.id,
      userId: 'alice@example.com',
      userName: 'Alice',
      text: 'Great platform! Smooth playback and clean UI.',
      sentiment: 'positive',
      sentimentScore: 0.95,
      flagged: false,
      createdAt: new Date().toISOString(),
    });
  }

  console.log('Seeding complete!');
}

seed().catch(console.error);

