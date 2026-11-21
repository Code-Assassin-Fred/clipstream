// src/config.js — Reads and validates environment variables with safe defaults for local mode

const os = require('os');
const path = require('path');

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Storage mode: 'local' or 'azure'
  storageMode: process.env.STORAGE_MODE || 'local',

  // Local mode settings
  localDataDir: process.env.LOCAL_DATA_DIR || './data',

  // Azure Blob Storage
  azureStorageAccount: process.env.AZURE_STORAGE_ACCOUNT || '',
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  azureBlobContainer: process.env.AZURE_BLOB_CONTAINER || 'videos',
  mediaBaseUrl: process.env.MEDIA_BASE_URL || '',

  // Azure Cosmos DB
  cosmosEndpoint: process.env.COSMOS_ENDPOINT || '',
  cosmosKey: process.env.COSMOS_KEY || '',
  cosmosDatabase: process.env.COSMOS_DATABASE || 'clipstream',

  // Azure AI Language (sentiment)
  azureLanguageEndpoint: process.env.AZURE_LANGUAGE_ENDPOINT || '',
  azureLanguageKey: process.env.AZURE_LANGUAGE_KEY || '',

  // Azure AI Speech (transcription)
  azureSpeechKey: process.env.AZURE_SPEECH_KEY || '',
  azureSpeechRegion: process.env.AZURE_SPEECH_REGION || '',

  // Authentication mode: 'dev' or 'easyauth'
  authMode: process.env.AUTH_MODE || 'dev',

  // Upload limits
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB, 10) || 100,
  allowedVideoTypes: (process.env.ALLOWED_VIDEO_TYPES || 'video/mp4,video/webm').split(',').map(t => t.trim()),

  // Debug
  enableDebugEndpoints: process.env.ENABLE_DEBUG_ENDPOINTS === 'true',

  // Instance identification: container replica name in Azure Container Apps, or hostname locally
  get instanceId() {
    return process.env.CONTAINER_APP_REPLICA_NAME || os.hostname();
  },

  // Derived
  get maxUploadBytes() {
    return this.maxUploadMb * 1024 * 1024;
  },
};

/**
 * Validate Azure configuration — fail fast if required vars are missing in azure mode
 */
function validateAzureConfig() {
  if (config.storageMode !== 'azure') return;

  const required = {
    AZURE_STORAGE_CONNECTION_STRING: config.azureStorageConnectionString,
    COSMOS_ENDPOINT: config.cosmosEndpoint,
    COSMOS_KEY: config.cosmosKey,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Azure mode requires these environment variables: ${missing.join(', ')}. ` +
      'Set STORAGE_MODE=local for local development.',
    );
  }
}

// Resolve localDataDir to absolute path
config.localDataDir = path.resolve(config.localDataDir);

module.exports = { config, validateAzureConfig };
