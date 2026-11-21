// src/utils/validation.js — Input validation helpers

/**
 * Validate and sanitise a video title
 * @param {string} title
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
function validateTitle(title) {
  if (!title || typeof title !== 'string') {
    return { valid: false, value: '', error: 'Title is required' };
  }
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return { valid: false, value: trimmed, error: 'Title must be 1-100 characters' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate and sanitise a video description
 * @param {string} description
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
function validateDescription(description) {
  if (description === undefined || description === null) {
    return { valid: true, value: '' };
  }
  if (typeof description !== 'string') {
    return { valid: false, value: '', error: 'Description must be a string' };
  }
  const trimmed = description.trim();
  if (trimmed.length > 500) {
    return { valid: false, value: trimmed, error: 'Description must be 0-500 characters' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate and sanitise a comment text
 * @param {string} text
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
function validateCommentText(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, value: '', error: 'Comment text is required' };
  }
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 300) {
    return { valid: false, value: trimmed, error: 'Comment must be 1-300 characters' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate and parse tags from a comma-separated string
 * Rules: lowercase, 2-20 chars, letters/digits/hyphens only, max 5, deduplicated
 * @param {string|string[]} input
 * @returns {{ valid: boolean, value: string[], error?: string }}
 */
function validateTags(input) {
  if (!input) {
    return { valid: true, value: [] };
  }

  let tags;
  if (typeof input === 'string') {
    tags = input.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  } else if (Array.isArray(input)) {
    tags = input.map(t => String(t).trim().toLowerCase()).filter(Boolean);
  } else {
    return { valid: false, value: [], error: 'Tags must be a string or array' };
  }

  // Validate each tag
  const tagPattern = /^[a-z0-9][a-z0-9-]*$/;
  for (const tag of tags) {
    if (tag.length < 2 || tag.length > 20) {
      return { valid: false, value: [], error: `Tag "${tag}" must be 2-20 characters` };
    }
    if (!tagPattern.test(tag)) {
      return { valid: false, value: [], error: `Tag "${tag}" must contain only letters, digits, and hyphens` };
    }
  }

  // Deduplicate and limit to 5
  const unique = [...new Set(tags)];
  if (unique.length > 5) {
    return { valid: false, value: [], error: 'Maximum 5 tags allowed' };
  }

  return { valid: true, value: unique };
}

/**
 * Validate pagination limit
 * @param {any} limit
 * @returns {number}
 */
function validateLimit(limit) {
  const num = parseInt(limit, 10);
  if (isNaN(num) || num < 1) return 10;
  if (num > 50) return 50;
  return num;
}

module.exports = {
  validateTitle,
  validateDescription,
  validateCommentText,
  validateTags,
  validateLimit,
};

