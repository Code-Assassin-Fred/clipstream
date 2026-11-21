// src/services/media/localMediaStore.js — Local file system media storage

const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const logger = require('../../logger');

/**
 * Create a local media store that saves files to LOCAL_DATA_DIR/media/
 */
async function createLocalMediaStore() {
  const mediaDir = path.join(config.localDataDir, 'media');

  // Ensure media directory exists
  await fs.promises.mkdir(mediaDir, { recursive: true });
  logger.info('Local media store initialized', { mediaDir });

  return {
    /**
     * Save a file from temp path to the media directory
     * @param {Object} opts - { tempPath, filename, contentType }
     * @returns {{ mediaKey: string, mediaUrl: string }}
     */
    async save({ tempPath, filename, contentType: _contentType }) {
      const mediaKey = filename;
      const destPath = path.join(mediaDir, mediaKey);

      await fs.promises.copyFile(tempPath, destPath);
      logger.debug('Media file saved', { mediaKey });

      // In local mode, media is served via express.static at /media/<key>
      const mediaUrl = `/media/${encodeURIComponent(mediaKey)}`;
      return { mediaKey, mediaUrl };
    },

    /**
     * Delete a media file by its key
     */
    async delete(mediaKey) {
      const filePath = path.join(mediaDir, mediaKey);
      try {
        await fs.promises.unlink(filePath);
        logger.debug('Media file deleted', { mediaKey });
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        logger.warn('Media file not found for deletion', { mediaKey });
      }
    },

    /**
     * Health check: verify media directory is accessible
     */
    async healthCheck() {
      try {
        await fs.promises.access(mediaDir, fs.constants.W_OK);
        return true;
      } catch (_err) {
        return false;
      }
    },
  };
}

module.exports = { createLocalMediaStore };

