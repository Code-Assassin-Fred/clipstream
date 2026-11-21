// src/services/index.js — Factory: returns local or Azure service implementations

const { config } = require('../config');
const logger = require('../logger');

/**
 * Create all service implementations based on STORAGE_MODE.
 * Azure implementations are lazy-loaded so local mode never imports Azure packages.
 */
async function createServices() {
  logger.info('Initializing services', { mode: config.storageMode });

  if (config.storageMode === 'azure') {
    // Lazy-load Azure implementations
    const { createAzureBlobMediaStore } = require('./media/azureBlobMediaStore');
    const { createCosmosMetadataStore } = require('./metadata/cosmosMetadataStore');
    const { createAzureLanguageSentiment } = require('./sentiment/azureLanguageSentiment');
    const { createAzureSpeechTranscription } = require('./transcription/azureSpeechTranscription');

    const media = await createAzureBlobMediaStore();
    const metadata = await createCosmosMetadataStore();
    const sentiment = createAzureLanguageSentiment();
    const transcription = createAzureSpeechTranscription();

    return { media, metadata, sentiment, transcription };
  }

  // Local mode (default)
  const { createLocalMediaStore } = require('./media/localMediaStore');
  const { createLocalMetadataStore } = require('./metadata/localMetadataStore');
  const { createLocalSentiment } = require('./sentiment/localSentiment');
  const { createLocalTranscription } = require('./transcription/localTranscription');

  const media = await createLocalMediaStore();
  const metadata = await createLocalMetadataStore();
  const sentiment = createLocalSentiment();
  const transcription = createLocalTranscription();

  return { media, metadata, sentiment, transcription };
}

module.exports = { createServices };

