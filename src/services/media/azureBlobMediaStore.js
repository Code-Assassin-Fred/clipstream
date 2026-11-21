// src/services/media/azureBlobMediaStore.js — Azure Blob Storage implementation

const fs = require('fs');
const { config } = require('../../config');
const logger = require('../../logger');

/**
 * Create Azure Blob Media Store.
 * Uses @azure/storage-blob.
 */
async function createAzureBlobMediaStore(customBlobServiceClient = null) {
  let blobServiceClient = customBlobServiceClient;

  if (!blobServiceClient) {
    const { BlobServiceClient } = require('@azure/storage-blob');
    if (config.azureStorageConnectionString) {
      blobServiceClient = BlobServiceClient.fromConnectionString(config.azureStorageConnectionString);
    } else if (config.azureStorageAccount) {
      const { DefaultAzureCredential } = require('@azure/identity');
      blobServiceClient = new BlobServiceClient(
        `https://${config.azureStorageAccount}.blob.core.windows.net`,
        new DefaultAzureCredential(),
      );
    } else {
      blobServiceClient = BlobServiceClient.fromConnectionString('');
    }
  }

  const containerClient = blobServiceClient.getContainerClient(config.azureBlobContainer);
  await containerClient.createIfNotExists();
  logger.info('Azure Blob Media Store initialized', { container: config.azureBlobContainer });

  return {
    /**
     * Save a file to Azure Blob Storage
     * @param {Object} opts - { tempPath, filename, contentType }
     * @returns {{ mediaKey: string, mediaUrl: string }}
     */
    async save({ tempPath, filename, contentType }) {
      const blockBlobClient = containerClient.getBlockBlobClient(filename);
      const readStream = fs.createReadStream(tempPath);

      await blockBlobClient.uploadStream(readStream, 4 * 1024 * 1024, 4, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobCacheControl: 'public, max-age=86400',
        },
      });

      const mediaUrl = config.mediaBaseUrl
        ? `${config.mediaBaseUrl.replace(/\/$/, '')}/${filename}`
        : blockBlobClient.url;

      logger.info('Uploaded blob to Azure Storage', { mediaKey: filename, mediaUrl });
      return { mediaKey: filename, mediaUrl };
    },

    /**
     * Delete a blob by key
     */
    async delete(mediaKey) {
      const blockBlobClient = containerClient.getBlockBlobClient(mediaKey);
      await blockBlobClient.deleteIfExists();
      logger.info('Deleted blob from Azure Storage', { mediaKey });
    },

    /**
     * Health check: verify container exists and is accessible
     */
    async healthCheck() {
      try {
        return await containerClient.exists();
      } catch (err) {
        logger.error('Azure Blob healthCheck failed', { error: err.message });
        return false;
      }
    },
  };
}

module.exports = { createAzureBlobMediaStore };

