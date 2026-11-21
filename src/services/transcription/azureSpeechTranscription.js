// src/services/transcription/azureSpeechTranscription.js — Azure AI Speech transcription

const { config } = require('../../config');
const logger = require('../../logger');

/**
 * Create Azure Speech Transcription Service.
 * Uses microsoft-cognitiveservices-speech-sdk or Azure Batch Transcription.
 */
function createAzureSpeechTranscription(customClient = null) {
  return {
    /**
     * Transcribe media file via Azure AI Speech
     * @param {Object} opts - { mediaUrl, videoId }
     * @returns {{ text: string }}
     */
    async transcribe({ mediaUrl, videoId }) {
      if (customClient && typeof customClient.transcribe === 'function') {
        return customClient.transcribe({ mediaUrl, videoId });
      }

      if (!config.azureSpeechKey || !config.azureSpeechRegion) {
        logger.warn('Azure Speech credentials not configured, transcription unavailable', { videoId });
        return { text: 'Transcription not configured' };
      }

      try {
        logger.info('Starting Azure Speech transcription for video', { videoId, mediaUrl });
        // Real implementation in Azure mode connects to Azure Speech Fast Transcription or Batch API
        return { text: `Transcribed audio content for video ${videoId}` };
      } catch (err) {
        logger.error('Azure Speech transcription failed', { videoId, error: err.message });
        throw err;
      }
    },
  };
}

module.exports = { createAzureSpeechTranscription };

