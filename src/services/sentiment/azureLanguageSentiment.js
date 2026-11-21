// src/services/sentiment/azureLanguageSentiment.js — Azure AI Language sentiment analysis

const { config } = require('../../config');
const logger = require('../../logger');

/**
 * Create Azure AI Language Sentiment Service.
 * Uses @azure/ai-language-text.
 */
function createAzureLanguageSentiment(customClient = null) {
  let client = customClient;

  if (!client && config.azureLanguageEndpoint && config.azureLanguageKey) {
    const { TextAnalysisClient, AzureKeyCredential } = require('@azure/ai-language-text');
    client = new TextAnalysisClient(
      config.azureLanguageEndpoint,
      new AzureKeyCredential(config.azureLanguageKey),
    );
  }

  return {
    async analyse(text) {
      if (!client) {
        logger.warn('Azure Language client not configured, falling back to neutral');
        return { label: 'neutral', score: 0.5 };
      }

      try {
        const results = await client.analyze('SentimentAnalysis', [text]);
        const result = results[0];

        if (result.error) {
          logger.error('Azure sentiment analysis error', { error: result.error });
          return { label: 'neutral', score: 0.5 };
        }

        const sentiment = result.sentiment; // 'positive' | 'neutral' | 'negative' | 'mixed'
        const label = sentiment === 'mixed' ? 'neutral' : sentiment;
        const confidenceScores = result.confidenceScores;
        const score = confidenceScores ? confidenceScores[sentiment] || 0.5 : 0.5;

        logger.debug('Azure sentiment result', { label, score });
        return { label, score };
      } catch (err) {
        logger.error('Azure sentiment service failed', { error: err.message });
        return { label: 'neutral', score: 0.5 };
      }
    },
  };
}

module.exports = { createAzureLanguageSentiment };
