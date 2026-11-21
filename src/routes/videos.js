// src/routes/videos.js — Video upload, feed, like, view, delete routes

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { requireAuth } = require('../middleware/auth');
const logger = require('../logger');
const {
  validateTitle,
  validateDescription,
  validateTags,
  validateLimit,
} = require('../utils/validation');

const router = express.Router();

// Rate limiting on write routes
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
});

const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

// Multer configuration for file uploads
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (config.allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${config.allowedVideoTypes.join(', ')}`), { status: 415 }));
    }
  },
});

/**
 * GET /api/videos — Paginated feed with search, filter, sort
 */
router.get('/videos', async (req, res, next) => {
  try {
    const limit = validateLimit(req.query.limit);
    const cursor = req.query.cursor || undefined;
    const q = req.query.q || undefined;
    const tag = req.query.tag || undefined;
    const sort = req.query.sort || 'new';

    let uploaderId;
    if (req.query.uploaderId === 'me') {
      if (!req.user) {
        return res.status(401).json({
          error: { code: 'UNAUTHENTICATED', message: 'Sign in to view your videos' },
        });
      }
      uploaderId = req.user.id;
    } else if (req.query.uploaderId) {
      uploaderId = req.query.uploaderId;
    }

    const result = await req.app.locals.services.metadata.listVideos({
      limit, cursor, q, tag, uploaderId, sort,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/videos/:id — Get a single video
 */
router.get('/videos/:id', async (req, res, next) => {
  try {
    const video = await req.app.locals.services.metadata.getVideo(req.params.id);
    if (!video) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }
    res.json(video);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/videos — Upload a new video (multipart: file, title, description, tags)
 */
router.post('/videos', requireAuth, writeLimiter, (req, res, next) => {
  upload.single('file')(req, res, async (uploadErr) => {
    // Track temp file for cleanup
    const tempFile = req.file ? req.file.path : null;
    try {
      if (uploadErr) {
        if (uploadErr.code === 'LIMIT_FILE_SIZE') {
          const err = new Error(`File too large. Maximum size is ${config.maxUploadMb}MB`);
          err.status = 413;
          throw err;
        }
        throw uploadErr;
      }

      if (!req.file) {
        const err = new Error('No video file provided');
        err.status = 400;
        throw err;
      }

      // Validate title
      const titleResult = validateTitle(req.body.title);
      if (!titleResult.valid) {
        const err = new Error(titleResult.error);
        err.status = 400;
        throw err;
      }

      // Validate description
      const descResult = validateDescription(req.body.description);
      if (!descResult.valid) {
        const err = new Error(descResult.error);
        err.status = 400;
        throw err;
      }

      // Validate tags
      const tagsResult = validateTags(req.body.tags);
      if (!tagsResult.valid) {
        const err = new Error(tagsResult.error);
        err.status = 400;
        throw err;
      }

      const { media, metadata, transcription } = req.app.locals.services;

      // Generate unique filename
      const ext = path.extname(req.file.originalname) || '.mp4';
      const filename = `${uuidv4()}${ext}`;

      // Save to media store
      const { mediaKey, mediaUrl } = await media.save({
        tempPath: req.file.path,
        filename,
        contentType: req.file.mimetype,
      });

      // Create video record
      const video = await metadata.createVideo({
        id: uuidv4(),
        title: titleResult.value,
        description: descResult.value,
        tags: tagsResult.value,
        uploaderId: req.user.id,
        uploaderName: req.user.name,
        mediaKey,
        mediaUrl,
        contentType: req.file.mimetype,
        sizeBytes: req.file.size,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        commentCount: 0,
        viewCount: 0,
        transcript: null,
        transcriptStatus: 'pending',
      });

      // Trigger transcription asynchronously (never blocks the upload response)
      transcription.transcribe({ mediaUrl, videoId: video.id })
        .then(async (result) => {
          await metadata.updateVideo(video.id, {
            transcript: result.text,
            transcriptStatus: result.text && !result.text.includes('not available') ? 'done' : 'unavailable',
          });
        })
        .catch((err) => {
          logger.error('Transcription failed', { videoId: video.id, error: err.message });
          metadata.updateVideo(video.id, { transcriptStatus: 'failed' }).catch(() => {});
        });

      res.status(201).json(video);
    } catch (err) {
      next(err);
    } finally {
      // Always clean up temp file
      if (tempFile) {
        fs.unlink(tempFile, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            logger.warn('Failed to clean up temp file', { tempFile, error: unlinkErr.message });
          }
        });
      }
    }
  });
});

/**
 * POST /api/videos/:id/like — Toggle like
 */
router.post('/videos/:id/like', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const video = await req.app.locals.services.metadata.getVideo(req.params.id);
    if (!video) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    const result = await req.app.locals.services.metadata.toggleLike({
      videoId: req.params.id,
      userId: req.user.id,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/videos/:id/view — Increment view count
 */
router.post('/videos/:id/view', viewLimiter, async (req, res, next) => {
  try {
    const result = await req.app.locals.services.metadata.incrementViews(req.params.id);
    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/videos/:id — Delete own video (cascade: media, comments, likes)
 */
router.delete('/videos/:id', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const { media, metadata } = req.app.locals.services;
    const video = await metadata.getVideo(req.params.id);

    if (!video) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Video not found' },
      });
    }

    // Only the owner can delete
    if (video.uploaderId !== req.user.id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You can only delete your own videos' },
      });
    }

    // Delete media file
    await media.delete(video.mediaKey);

    // Delete comments and likes
    await metadata.deleteCommentsAndLikes(video.id);

    // Delete video record
    await metadata.deleteVideo(video.id);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

