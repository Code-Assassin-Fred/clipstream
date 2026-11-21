// ClipStream — Frontend Application
// Plain JavaScript, no frameworks. Uses textContent (never innerHTML) for user data.

(function () {
  'use strict';

  // =========================================
  // State
  // =========================================
  let currentUser = null;
  let nextCursor = null;
  let currentSort = 'new';
  let currentSearch = '';
  let currentTag = '';
  let isLoading = false;
  const viewedVideos = new Set(); // Track views per page load

  // =========================================
  // DOM References
  // =========================================
  const $ = (sel) => document.querySelector(sel);
  const feed = $('#feed');
  const loadMoreBtn = $('#loadMore');
  const feedLoading = $('#feedLoading');
  const feedEmpty = $('#feedEmpty');
  const searchInput = $('#searchInput');
  const searchBtn = $('#searchBtn');
  const newBtn = $('#newBtn');
  const trendingBtn = $('#trendingBtn');
  const myVideosLink = $('#myVideosLink');
  const userName = $('#userName');
  const signInLink = $('#signInLink');
  const signOutLink = $('#signOutLink');
  const uploadForm = $('#uploadForm');
  const toggleUpload = $('#toggleUpload');
  const uploadProgress = $('#uploadProgress');
  const progressFill = $('#progressFill');
  const progressText = $('#progressText');
  const uploadError = $('#uploadError');
  const uploadSubmit = $('#uploadSubmit');
  const activeFilters = $('#activeFilters');
  const footerInstance = $('#footerInstance');
  const footerMode = $('#footerMode');
  const footerVersion = $('#footerVersion');

  // =========================================
  // API Helpers
  // =========================================
  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message || `Request failed: ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // =========================================
  // Relative Time
  // =========================================
  function relativeTime(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    const months = Math.floor(days / 30);
    return months + 'mo ago';
  }

  // =========================================
  // User / Auth
  // =========================================
  async function loadUser() {
    try {
      currentUser = await api('/me');
      if (currentUser) {
        userName.textContent = currentUser.name || '';
        signInLink.style.display = 'none';
        if (signOutLink) signOutLink.style.display = '';
        myVideosLink.style.display = '';
        toggleUpload.style.display = '';
      } else {
        userName.textContent = '';
        signInLink.style.display = '';
        if (signOutLink) signOutLink.style.display = 'none';
        myVideosLink.style.display = 'none';
        toggleUpload.style.display = 'none';
      }
    } catch (e) {
      console.error('Failed to load user:', e);
    }
  }

  // =========================================
  // Active Filters Display
  // =========================================
  function updateFilterDisplay() {
    activeFilters.innerHTML = '';
    let hasFilters = false;

    if (currentSearch) {
      hasFilters = true;
      const chip = createFilterChip('Search: ' + currentSearch, () => {
        currentSearch = '';
        searchInput.value = '';
        refreshFeed();
      });
      activeFilters.appendChild(chip);
    }

    if (currentTag) {
      hasFilters = true;
      const chip = createFilterChip('Tag: ' + currentTag, () => {
        currentTag = '';
        refreshFeed();
      });
      activeFilters.appendChild(chip);
    }

    if (currentSort === 'trending') {
      hasFilters = true;
      const chip = createFilterChip('Sort: Trending', () => {
        currentSort = 'new';
        newBtn.classList.add('active');
        trendingBtn.classList.remove('active');
        refreshFeed();
      });
      activeFilters.appendChild(chip);
    }

    activeFilters.style.display = hasFilters ? 'flex' : 'none';
  }

  function createFilterChip(text, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    const label = document.createElement('span');
    label.textContent = text;
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.setAttribute('aria-label', 'Remove filter');
    btn.addEventListener('click', onRemove);
    chip.appendChild(label);
    chip.appendChild(btn);
    return chip;
  }

  // =========================================
  // Video Feed
  // =========================================
  async function loadFeed(append = false) {
    if (isLoading) return;
    isLoading = true;

    if (!append) {
      feed.innerHTML = '';
      nextCursor = null;
    }

    feedLoading.style.display = 'block';
    feedEmpty.style.display = 'none';
    loadMoreBtn.style.display = 'none';

    try {
      let url = `/videos?limit=10&sort=${currentSort}`;
      if (nextCursor) url += '&cursor=' + encodeURIComponent(nextCursor);
      if (currentSearch) url += '&q=' + encodeURIComponent(currentSearch);
      if (currentTag) url += '&tag=' + encodeURIComponent(currentTag);

      const data = await api(url);
      nextCursor = data.nextCursor;

      if (data.items.length === 0 && !append) {
        feedEmpty.style.display = 'block';
      }

      for (const video of data.items) {
        feed.appendChild(createVideoCard(video));
      }

      loadMoreBtn.style.display = nextCursor ? '' : 'none';
    } catch (e) {
      console.error('Failed to load feed:', e);
    } finally {
      feedLoading.style.display = 'none';
      isLoading = false;
    }

    updateFilterDisplay();
  }

  function refreshFeed() {
    nextCursor = null;
    loadFeed(false);
  }

  // =========================================
  // Video Card
  // =========================================
  function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = video.id;

    // Video player
    const player = document.createElement('video');
    player.className = 'video-player';
    player.controls = true;
    player.preload = 'metadata';
    player.src = video.mediaUrl;
    player.setAttribute('aria-label', video.title);

    // Track view on play
    player.addEventListener('play', () => {
      if (!viewedVideos.has(video.id)) {
        viewedVideos.add(video.id);
        fetch('/api/videos/' + video.id + '/view', { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            const viewEl = card.querySelector('.view-count');
            if (viewEl) viewEl.textContent = data.viewCount + ' views';
          })
          .catch(() => { });
      }
    });

    card.appendChild(player);

    // Info section
    const info = document.createElement('div');
    info.className = 'video-info';

    // Title
    const title = document.createElement('h3');
    title.className = 'video-title';
    title.textContent = video.title;
    info.appendChild(title);

    // Meta (uploader, time, views)
    const meta = document.createElement('div');
    meta.className = 'video-meta';
    const uploaderSpan = document.createElement('span');
    uploaderSpan.textContent = video.uploaderName || 'Unknown';
    meta.appendChild(uploaderSpan);
    const timeSpan = document.createElement('span');
    timeSpan.textContent = '• ' + relativeTime(video.createdAt);
    meta.appendChild(timeSpan);
    const viewSpan = document.createElement('span');
    viewSpan.className = 'view-count';
    viewSpan.textContent = (video.viewCount || 0) + ' views';
    meta.appendChild(viewSpan);
    info.appendChild(meta);

    // Description
    if (video.description) {
      const desc = document.createElement('p');
      desc.className = 'video-description';
      desc.textContent = video.description;
      info.appendChild(desc);
    }

    // Tags
    if (video.tags && video.tags.length > 0) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'video-tags';
      for (const tag of video.tags) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = '#' + tag;
        chip.setAttribute('role', 'button');
        chip.setAttribute('aria-label', 'Filter by tag: ' + tag);
        chip.addEventListener('click', () => {
          currentTag = tag;
          refreshFeed();
        });
        tagsDiv.appendChild(chip);
      }
      info.appendChild(tagsDiv);
    }

    // Actions (like, comment toggle, delete)
    const actions = document.createElement('div');
    actions.className = 'video-actions';

    // Like button
    const likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn';
    likeBtn.textContent = '❤️ ' + (video.likeCount || 0);
    likeBtn.setAttribute('aria-label', 'Like this video');
    likeBtn.addEventListener('click', async () => {
      if (!currentUser) return;
      try {
        const result = await api('/videos/' + video.id + '/like', { method: 'POST' });
        likeBtn.textContent = (result.liked ? '❤️ ' : '🤍 ') + result.likeCount;
        likeBtn.classList.toggle('liked', result.liked);
      } catch (e) {
        console.error('Like failed:', e);
      }
    });
    actions.appendChild(likeBtn);

    // Comment toggle button
    const commentBtn = document.createElement('button');
    commentBtn.className = 'action-btn';
    commentBtn.textContent = '💬 ' + (video.commentCount || 0);
    commentBtn.setAttribute('aria-label', 'Toggle comments');
    commentBtn.addEventListener('click', () => {
      const section = card.querySelector('.comments-section');
      const isVisible = section.classList.toggle('visible');
      if (isVisible) loadComments(video.id, card);
    });
    actions.appendChild(commentBtn);

    // Delete button (only for owner)
    if (currentUser && video.uploaderId === currentUser.id) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-btn delete-btn';
      deleteBtn.textContent = '🗑️ Delete';
      deleteBtn.setAttribute('aria-label', 'Delete this video');
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this video?')) return;
        try {
          await api('/videos/' + video.id, { method: 'DELETE' });
          card.remove();
        } catch (e) {
          alert('Failed to delete: ' + e.message);
        }
      });
      actions.appendChild(deleteBtn);
    }

    info.appendChild(actions);

    // Transcript section
    const transcriptSection = document.createElement('div');
    transcriptSection.className = 'transcript-section';

    const transcriptToggle = document.createElement('button');
    transcriptToggle.className = 'transcript-toggle';

    if (video.transcriptStatus === 'done') {
      transcriptToggle.textContent = '📝 Show Transcript';
    } else if (video.transcriptStatus === 'pending') {
      transcriptToggle.textContent = '📝 Transcript (pending...)';
    } else {
      transcriptToggle.textContent = '📝 Transcript (unavailable)';
    }

    const transcriptContent = document.createElement('div');
    transcriptContent.className = 'transcript-content';
    if (video.transcript) {
      transcriptContent.textContent = video.transcript;
    } else {
      const status = document.createElement('span');
      status.className = 'transcript-status';
      status.textContent = video.transcriptStatus === 'pending'
        ? 'Transcription in progress...'
        : 'No transcript available';
      transcriptContent.appendChild(status);
    }

    transcriptToggle.addEventListener('click', () => {
      transcriptContent.classList.toggle('visible');
      if (transcriptContent.classList.contains('visible') && video.transcriptStatus === 'done') {
        transcriptToggle.textContent = '📝 Hide Transcript';
      } else if (video.transcriptStatus === 'done') {
        transcriptToggle.textContent = '📝 Show Transcript';
      }
    });

    transcriptSection.appendChild(transcriptToggle);
    transcriptSection.appendChild(transcriptContent);
    info.appendChild(transcriptSection);

    card.appendChild(info);

    // Comments section (hidden by default)
    const commentsSection = document.createElement('div');
    commentsSection.className = 'comments-section';

    const commentsList = document.createElement('div');
    commentsList.className = 'comments-list';
    commentsSection.appendChild(commentsList);

    // Comment form
    const commentForm = document.createElement('form');
    commentForm.className = 'comment-form';
    const commentInput = document.createElement('input');
    commentInput.type = 'text';
    commentInput.placeholder = currentUser ? 'Add a comment...' : 'Sign in to comment';
    commentInput.disabled = !currentUser;
    commentInput.maxLength = 300;
    commentInput.setAttribute('aria-label', 'Write a comment');
    const commentSubmitBtn = document.createElement('button');
    commentSubmitBtn.type = 'submit';
    commentSubmitBtn.textContent = 'Post';
    commentSubmitBtn.disabled = !currentUser;
    commentForm.appendChild(commentInput);
    commentForm.appendChild(commentSubmitBtn);

    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = commentInput.value.trim();
      if (!text) return;
      commentSubmitBtn.disabled = true;
      try {
        const comment = await api('/videos/' + video.id + '/comments', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        commentInput.value = '';
        prependComment(commentsList, comment);
        // Update comment count
        video.commentCount = (video.commentCount || 0) + 1;
        commentBtn.textContent = '💬 ' + video.commentCount;
      } catch (err) {
        alert('Failed to post comment: ' + err.message);
      } finally {
        commentSubmitBtn.disabled = !currentUser;
      }
    });

    commentsSection.appendChild(commentForm);
    card.appendChild(commentsSection);

    return card;
  }

  // =========================================
  // Comments
  // =========================================
  async function loadComments(videoId, card) {
    const list = card.querySelector('.comments-list');
    list.innerHTML = '';
    try {
      const data = await api('/videos/' + videoId + '/comments?limit=20');
      for (const comment of data.items) {
        appendComment(list, comment);
      }
      if (data.items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'comment-text';
        empty.textContent = 'No comments yet';
        list.appendChild(empty);
      }
    } catch (e) {
      console.error('Failed to load comments:', e);
    }
  }

  function appendComment(list, comment) {
    const el = createCommentElement(comment);
    list.appendChild(el);
  }

  function prependComment(list, comment) {
    const el = createCommentElement(comment);
    // Remove "No comments yet" if present
    const empty = list.querySelector('.comment-text');
    if (empty && empty.textContent === 'No comments yet') {
      empty.remove();
    }
    list.prepend(el);
  }

  function createCommentElement(comment) {
    const el = document.createElement('div');
    el.className = 'comment';

    const header = document.createElement('div');
    header.className = 'comment-header';

    const badge = document.createElement('span');
    badge.className = 'sentiment-badge ' + (comment.sentiment || 'neutral');
    badge.setAttribute('aria-label', 'Sentiment: ' + (comment.sentiment || 'neutral'));
    header.appendChild(badge);

    const user = document.createElement('span');
    user.className = 'comment-user';
    user.textContent = comment.userName || 'Unknown';
    header.appendChild(user);

    const time = document.createElement('span');
    time.className = 'comment-time';
    time.textContent = relativeTime(comment.createdAt);
    header.appendChild(time);

    el.appendChild(header);

    // Flagged comments are collapsed
    if (comment.flagged) {
      const flaggedEl = document.createElement('p');
      flaggedEl.className = 'comment-flagged';
      flaggedEl.textContent = 'This comment may contain negative content. ';
      const showBtn = document.createElement('button');
      showBtn.className = 'show-anyway';
      showBtn.textContent = 'Show anyway';
      showBtn.addEventListener('click', () => {
        flaggedEl.style.display = 'none';
        textEl.style.display = 'block';
      });
      flaggedEl.appendChild(showBtn);
      el.appendChild(flaggedEl);

      var textEl = document.createElement('p');
      textEl.className = 'comment-text';
      textEl.textContent = comment.text;
      textEl.style.display = 'none';
      el.appendChild(textEl);
    } else {
      const textEl = document.createElement('p');
      textEl.className = 'comment-text';
      textEl.textContent = comment.text;
      el.appendChild(textEl);
    }

    return el;
  }

  // =========================================
  // Upload
  // =========================================
  toggleUpload.addEventListener('click', () => {
    const form = uploadForm;
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    uploadError.style.display = 'none';

    const title = document.getElementById('uploadTitle').value.trim();
    const description = document.getElementById('uploadDesc').value.trim();
    const tags = document.getElementById('uploadTags').value.trim();
    const file = document.getElementById('uploadFile').files[0];

    if (!title) {
      showUploadError('Title is required');
      return;
    }
    if (!file) {
      showUploadError('Please select a video file');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if (tags) formData.append('tags', tags);
    formData.append('file', file);

    uploadSubmit.disabled = true;
    uploadProgress.style.display = 'block';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
      }
    });

    xhr.addEventListener('load', () => {
      uploadSubmit.disabled = false;
      uploadProgress.style.display = 'none';
      progressFill.style.width = '0%';
      progressText.textContent = '0%';

      if (xhr.status === 201) {
        // Reset form
        uploadForm.reset();
        uploadForm.style.display = 'none';
        // Refresh feed to show new video
        refreshFeed();
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          showUploadError(data.error?.message || 'Upload failed');
        } catch (_e) {
          showUploadError('Upload failed');
        }
      }
    });

    xhr.addEventListener('error', () => {
      uploadSubmit.disabled = false;
      uploadProgress.style.display = 'none';
      showUploadError('Upload failed — network error');
    });

    xhr.send(formData);
  });

  function showUploadError(msg) {
    uploadError.textContent = msg;
    uploadError.style.display = 'block';
  }

  // =========================================
  // Search
  // =========================================
  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      refreshFeed();
    }, 500);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounce);
      currentSearch = searchInput.value.trim();
      refreshFeed();
    }
  });

  searchBtn.addEventListener('click', () => {
    clearTimeout(searchDebounce);
    currentSearch = searchInput.value.trim();
    refreshFeed();
  });

  // =========================================
  // Sort Toggle
  // =========================================
  newBtn.addEventListener('click', () => {
    if (currentSort === 'new') return;
    currentSort = 'new';
    newBtn.classList.add('active');
    trendingBtn.classList.remove('active');
    refreshFeed();
  });

  trendingBtn.addEventListener('click', () => {
    if (currentSort === 'trending') return;
    currentSort = 'trending';
    trendingBtn.classList.add('active');
    newBtn.classList.remove('active');
    refreshFeed();
  });

  // =========================================
  // My Videos
  // =========================================
  myVideosLink.addEventListener('click', (e) => {
    e.preventDefault();
    currentSearch = '';
    currentTag = '';
    searchInput.value = '';
    // Load only the user's videos
    loadMyVideos();
  });

  async function loadMyVideos() {
    if (isLoading) return;
    isLoading = true;
    feed.innerHTML = '';
    feedLoading.style.display = 'block';
    feedEmpty.style.display = 'none';
    loadMoreBtn.style.display = 'none';

    try {
      const data = await api('/videos?uploaderId=me&limit=50');
      if (data.items.length === 0) {
        feedEmpty.textContent = 'You haven\'t uploaded any videos yet';
        feedEmpty.style.display = 'block';
      }
      for (const video of data.items) {
        feed.appendChild(createVideoCard(video));
      }
    } catch (e) {
      console.error('Failed to load my videos:', e);
    } finally {
      feedLoading.style.display = 'none';
      isLoading = false;
    }

    updateFilterDisplay();
  }

  // =========================================
  // Load More
  // =========================================
  loadMoreBtn.addEventListener('click', () => {
    loadFeed(true);
  });

  // =========================================
  // Footer — Instance Info (refresh every 5s)
  // =========================================
  async function updateFooter() {
    try {
      const info = await api('/info');
      const shortId = info.instanceId ? String(info.instanceId).slice(-6) : 'unknown';
      footerInstance.textContent = 'Instance: ' + shortId;
      footerMode.textContent = 'Mode: ' + info.mode;
      if (footerVersion && info.version) {
        footerVersion.textContent = 'ClipStream ' + info.version;
      }
    } catch (_e) {
      // Silently fail footer updates
    }
  }

  // =========================================
  // Initialization
  // =========================================
  async function init() {
    await loadUser();
    loadFeed();
    updateFooter();
    setInterval(updateFooter, 5000);
  }

  init();
})();

