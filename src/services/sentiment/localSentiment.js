// src/services/sentiment/localSentiment.js — Word-list heuristic sentiment analysis

const logger = require('../../logger');

// Simple word lists for local sentiment analysis
const POSITIVE_WORDS = [
  'good', 'great', 'awesome', 'amazing', 'excellent', 'fantastic', 'wonderful',
  'love', 'like', 'best', 'beautiful', 'perfect', 'brilliant', 'superb',
  'happy', 'joy', 'fun', 'cool', 'nice', 'impressive', 'outstanding',
  'incredible', 'remarkable', 'delightful', 'terrific', 'fabulous',
];

const NEGATIVE_WORDS = [
  'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'ugly',
  'boring', 'stupid', 'dumb', 'disgusting', 'pathetic', 'trash', 'garbage',
  'annoying', 'disappointing', 'poor', 'useless', 'rubbish', 'lame',
  'mediocre', 'atrocious', 'dreadful', 'appalling', 'abysmal',
];

/**
 * Create a local sentiment analyser using word-list heuristics
 */
function createLocalSentiment() {
  return {
    /**
     * Analyse text sentiment using word-list heuristic
     * @param {string} text
     * @returns {{ label: 'positive'|'neutral'|'negative', score: number }}
     */
    async analyse(text) {
      const words = text.toLowerCase().split(/\W+/).filter(Boolean);
      let positiveCount = 0;
      let negativeCount = 0;

      for (const word of words) {
        if (POSITIVE_WORDS.includes(word)) positiveCount++;
        if (NEGATIVE_WORDS.includes(word)) negativeCount++;
      }

      const total = positiveCount + negativeCount;

      if (total === 0) {
        return { label: 'neutral', score: 0.5 };
      }

      const positiveRatio = positiveCount / total;
      const negativeRatio = negativeCount / total;

      if (positiveRatio > negativeRatio) {
        const score = 0.5 + (positiveRatio * 0.5);
        logger.debug('Sentiment analysis (local)', { label: 'positive', score });
        return { label: 'positive', score: Math.min(score, 1.0) };
      }

      if (negativeRatio > positiveRatio) {
        const score = 0.5 + (negativeRatio * 0.5);
        logger.debug('Sentiment analysis (local)', { label: 'negative', score });
        return { label: 'negative', score: Math.min(score, 1.0) };
      }

      return { label: 'neutral', score: 0.5 };
    },
  };
}

module.exports = { createLocalSentiment };

