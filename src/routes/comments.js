// src/routes/comments.js — Comment listing and creation routes

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { validateCommentText, validateLimit } = require('../utils/validation');

const router = express.Router();

// Rate limiting on comment creation
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

/**
 * GET /api/videos/:id/comments — List comments for a video with pagination
 */
router.get('/videos/:id/comments', async (req, res, next) => {
  try {
    const { metadata } = req.app.locals.services;

    // Check video exists
    const video = await metadata.getVideo(req.params.id);
    if (!video) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    const limit = validateLimit(req.query.limit);
    const cursor = req.query.cursor || undefined;

    const result = await metadata.listComments({
      videoId: req.params.id,
      limit,
      cursor,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/videos/:id/comments — Add a comment with sentiment analysis
 */
router.post('/videos/:id/comments', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    const { metadata, sentiment } = req.app.locals.services;

    // Check video exists
    const video = await metadata.getVideo(req.params.id);
    if (!video) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    // Validate comment text
    const textResult = validateCommentText(req.body.text);
    if (!textResult.valid) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: textResult.error },
      });
    }

    // Analyse sentiment
    const sentimentResult = await sentiment.analyse(textResult.value);

    // Determine if comment should be flagged (negative + score >= 0.85)
    const flagged = sentimentResult.label === 'negative' && sentimentResult.score >= 0.85;

    const comment = await metadata.addComment({
      id: uuidv4(),
      videoId: req.params.id,
      userId: req.user.id,
      userName: req.user.name,
      text: textResult.value,
      sentiment: sentimentResult.label,
      sentimentScore: sentimentResult.score,
      flagged,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

