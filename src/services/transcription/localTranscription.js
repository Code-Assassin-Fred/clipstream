// src/services/transcription/localTranscription.js — Local stub for transcription

const logger = require('../../logger');

/**
 * Create a local transcription service stub.
 * Returns a placeholder message since real transcription requires Azure AI Speech.
 */
function createLocalTranscription() {
  return {
    /**
     * Transcribe a video — in local mode returns a placeholder
     * @param {Object} opts - { mediaUrl, videoId }
     * @returns {{ text: string }}
     */
    async transcribe({ mediaUrl: _mediaUrl, videoId }) {
      logger.info('Transcription not available in local mode', { videoId });
      return { text: 'Transcript not available in local mode' };
    },
  };
}

module.exports = { createLocalTranscription };

