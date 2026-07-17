// ==UserScript==
// @name         Nova Suno Remote - Any Page v0.12
// @namespace    nova.suno.remote.anypage
// @version      0.1.152
// @description  Pocket Gremlin Edition: read-only Suno remote with full-library prime capture, lyrics reader, RGB Lab, and audio-reactive playback UI.
// @author       Cody / Codex + kivkumah + Nova
// @match        *://*/*
// @include      /^https?:\/\/.*/
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      studio-api-prod.suno.com
// @connect      suno.com
// @connect      *.suno.com
// @connect      *.cloudfront.net
// @connect      cdn1.suno.ai
// @connect      cdn-o.suno.com
// ==/UserScript==

// Nova Suno Remote - Pocket Gremlin Edition
// Lead build: Cody / Codex
// Product brain, testing, workflow direction: kivkumah
// Co-architect and earlier groundwork: Nova
//
// This is a read-only personal-library remote. It does not store Suno auth
// headers, cookies, passwords, or tokens. Prime capture lets Suno authenticate
// itself normally, then saves song metadata/audio URLs locally in Tampermonkey.

(function () {
  'use strict';

  if (window.top !== window.self) return;
  if (window.NovaSunoRemoteAnyPage) return;

  const VERSION = '0.1.152';
  const API = 'https://studio-api-prod.suno.com';
  const IS_SUNO = location.hostname === 'suno.com' || location.hostname.endsWith('.suno.com');
  const PRIME_PARAM = 'nova_suno_prime';
  const PRIME_VALUE = new URLSearchParams(location.search).get(PRIME_PARAM) || '';
  const PRIME_MODE = IS_SUNO && Boolean(PRIME_VALUE);
  const PRIME_FULL_MODE = PRIME_MODE && PRIME_VALUE === 'full';

  const STORAGE = {
    library: 'nova_suno_remote_library_v1',
    userId: 'nova_suno_remote_user_id_v1',
    feedRecipes: 'nova_suno_remote_feed_recipes_v1',
    lastPrimeAt: 'nova_suno_remote_last_prime_at_v1',
    primeStatus: 'nova_suno_remote_prime_status_v1',
    playOwner: 'nova_suno_remote_play_owner_v1',
    panelPos: 'nova_suno_remote_panel_pos_v1',
    orbPos: 'nova_suno_remote_orb_pos_v1',
    lyricsPos: 'nova_suno_remote_lyrics_pos_v1',
    fxPos: 'nova_suno_remote_fx_pos_v1',
    minimized: 'nova_suno_remote_minimized_v1',
    theme: 'nova_suno_remote_theme_v1',
    fxSettings: 'nova_suno_remote_fx_settings_v1'
  };
  const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const FX_DEFAULTS = {
    enabled: true,
    source: 'balanced',
    palette: 'nova',
    intensity: 'medium',
    parts: {
      panel: true,
      header: true,
      buttons: true,
      active: true,
      progress: true,
      equalizer: true,
      orb: true,
      lyrics: true
    }
  };

  const FX_OPTIONS = {
    source: [
      ['balanced', 'Balanced'],
      ['energy', 'Energy'],
      ['bass', 'Bass'],
      ['mid', 'Mids'],
      ['high', 'Highs']
    ],
    palette: [
      ['nova', 'Nova RGB'],
      ['fire', 'Fire'],
      ['cyber', 'Cyber'],
      ['violet', 'Violet'],
      ['ice', 'Ice'],
      ['toxic', 'Toxic']
    ],
    intensity: [
      ['soft', 'Soft'],
      ['medium', 'Medium'],
      ['gremlin', 'Gremlin']
    ]
  };

  const state = {
    ready: false,
    panel: null,
    orb: null,
    body: null,
    lyricsPanel: null,
    lyricsBody: null,
    lyricsOpen: false,
    fxPanel: null,
    fxBody: null,
    fxOpen: false,
    audio: null,
    library: readLibrary(),
    filtered: [],
    index: Number(GM_getValue('nova_suno_remote_index_v1', 0)) || 0,
    query: '',
    view: 'library',
    status: 'Ready. Load library or Prime Suno.',
    busy: false,
    open: PRIME_MODE ? false : !Boolean(GM_getValue(STORAGE.minimized, false)),
    theme: GM_getValue(STORAGE.theme, 'rgb'),
    fxSettings: readFxSettings(),
    dragging: null,
    directLastError: '',
    lastAudioError: '',
    lastPlayDebug: null,
    currentClipId: '',
    audioFx: null,
    audioFxRun: 0,
    holoRipple: { ripples: [], lastBass: 0, bassAverage: 0.18, lastSpawnAt: 0, lastFrameAt: 0 },
    bootstrap: { registered: false, host: '' },
    suppressOrbClick: false,
    blobUrls: new Map(),
    blobLoading: new Set()
  };

  let primeCloseTimer = null;
  let primeFullTimer = null;
  let primeFullStartedAt = 0;
  let primeFullLastCaptureAt = 0;
  let primeFullLastSavedCount = 0;
  let primeFullLastBatch = 0;
  let primeFullNoMore = false;
  let primeHud = null;
  let bootTimer = null;
  let bootstrapTimer = null;
  let bootstrapAttempts = 0;
  let survivalTimer = null;
  let survivalObserver = null;
  let observedBody = null;
  let survivalScheduled = false;
  let bootAttempts = 0;

  console.info(`[Nova Suno Remote] loaded v${VERSION} on ${location.href}`);
  setupCrossTabAudioLock();

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function readJson(key, fallback) {
    try {
      const raw = GM_getValue(key, '');
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    GM_setValue(key, JSON.stringify(value));
  }

  function setupCrossTabAudioLock() {
    if (typeof GM_addValueChangeListener !== 'function') return;
    GM_addValueChangeListener(STORAGE.playOwner, (_name, _oldValue, newValue) => {
      const owner = parseJsonValue(newValue, null);
      if (!owner || owner.tabId === TAB_ID) return;
      const audio = state.audio;
      if (!audio || audio.paused) return;

      audio.pause();
      setStatusOnly(`Paused: ${owner.title || 'another Nova tab'} is playing in another tab.`);
      updatePlaybackUi();
    });
  }

  function claimAudioOwnership(clip) {
    if (!clip) return;
    writeJson(STORAGE.playOwner, {
      tabId: TAB_ID,
      clipId: clip.id || '',
      title: clip.title || '',
      page: location.href,
      at: Date.now()
    });
  }

  function parseJsonValue(value, fallback) {
    try {
      if (!value) return fallback;
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (_) {
      return fallback;
    }
  }

  function readFxSettings() {
    const saved = readJson(STORAGE.fxSettings, {});
    const parts = Object.assign({}, FX_DEFAULTS.parts, saved && saved.parts ? saved.parts : {});
    return Object.assign({}, FX_DEFAULTS, saved || {}, { parts });
  }

  function saveFxSettings() {
    writeJson(STORAGE.fxSettings, state.fxSettings);
  }

  function fxPart(part) {
    return Boolean(state.fxSettings && state.fxSettings.parts && state.fxSettings.parts[part]);
  }

  function fxEnabled() {
    return state.theme === 'rgb' && state.fxSettings && state.fxSettings.enabled;
  }

  function readLibrary() {
    const clips = readJson(STORAGE.library, []);
    return Array.isArray(clips) ? clips.filter(clip => clip && clip.audioUrl) : [];
  }

  function saveLibrary(clips) {
    const unique = [];
    const seen = new Set();
    for (const clip of clips || []) {
      const normalized = normalizeClip(clip);
      if (!normalized || !normalized.audioUrl) continue;
      if (seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      unique.push(normalized);
    }
    unique.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    writeJson(STORAGE.library, unique.slice(0, 400));
    state.library = unique.slice(0, 400);
    applyFilter();
  }

  function mergeClips(clips, source) {
    const byId = new Map();
    for (const clip of state.library || []) byId.set(clip.id, clip);

    let added = 0;
    for (const raw of clips || []) {
      const clip = normalizeClip(raw, source);
      if (!clip || !clip.audioUrl) continue;
      if (!byId.has(clip.id)) added++;
      byId.set(clip.id, { ...(byId.get(clip.id) || {}), ...clip });
    }

    saveLibrary([...byId.values()]);
    if (clips && clips.length) {
      GM_setValue(STORAGE.lastPrimeAt, String(Date.now()));
      const userId = firstUserId(clips);
      if (userId) GM_setValue(STORAGE.userId, userId);
    }
    return added;
  }

  function firstUserId(clips) {
    for (const clip of clips || []) {
      const id = clean(clip && (clip.user_id || clip.userId || clip.user && clip.user.id));
      if (/^[0-9a-f-]{32,}$/i.test(id)) return id;
    }
    return '';
  }

  function normalizeClip(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.content_item && typeof raw.content_item === 'object') raw = raw.content_item;
    if (raw.clip && typeof raw.clip === 'object') raw = raw.clip;

    const id = clean(raw.id || raw.clip_id || raw.clipId || raw.song_id || raw.songId || raw.audio_url || raw.audioUrl);
    const audioUrl = clean(raw.audio_url || raw.audioUrl || raw.audio || firstMediaUrl(raw));
    if (!id || !audioUrl) return null;

    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const title = clean(raw.title || metadata.title || 'Untitled Suno');
    const tags = clean(metadata.tags || raw.display_tags || raw.tags || '');
    const prompt = keepPromptText(metadata.prompt || metadata.gpt_description_prompt || raw.prompt || raw.lyrics || '');
    const duration = Number(metadata.duration || raw.duration || 0) || 0;

    return {
      id,
      title,
      audioUrl,
      imageUrl: clean(raw.image_large_url || raw.image_url || raw.imageUrl || ''),
      createdAt: clean(raw.created_at || raw.createdAt || ''),
      model: clean(raw.major_model_version || raw.model_name || metadata.model_name || ''),
      tags,
      prompt,
      duration,
      liked: Boolean(raw.is_liked || raw.liked),
      public: Boolean(raw.is_public),
      source: source || raw.source || 'suno'
    };
  }

  function firstMediaUrl(raw) {
    const urls = raw && raw.media_urls;
    if (Array.isArray(urls)) {
      const found = urls.find(item => typeof item === 'string' && /^https?:\/\//i.test(item));
      if (found) return found;
      const nested = urls.find(item => item && typeof item === 'object' && item.url);
      if (nested) return nested.url;
    }
    return '';
  }

  function keepPromptText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim();
  }

  function setStatus(text) {
    state.status = text;
    render();
  }

  function setStatusOnly(text) {
    state.status = text;
    updateStatusUi();
  }

  function applyFilter() {
    const q = clean(state.query).toLowerCase();
    state.filtered = (state.library || []).filter(clip => {
      if (!q) return true;
      return [clip.title, clip.tags, clip.prompt, clip.model].join(' ').toLowerCase().includes(q);
    });
    if (state.index >= state.filtered.length) state.index = Math.max(0, state.filtered.length - 1);
  }

  function gmJson(method, url, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        anonymous: false,
        withCredentials: true,
        timeout: 20000,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json'
        },
        data: body == null ? undefined : JSON.stringify(body),
        onload: response => {
          const status = Number(response && response.status || 0);
          const text = response && response.responseText || '';
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status || 'ERR'}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (_) {
            reject(new Error('Invalid JSON response'));
          }
        },
        ontimeout: () => reject(new Error('Request timeout')),
        onerror: () => reject(new Error('Request failed'))
      });
    });
  }

  function readRecipes() {
    const recipes = readJson(STORAGE.feedRecipes, []);
    return Array.isArray(recipes) ? recipes.filter(recipe => recipe && recipe.url && recipe.body) : [];
  }

  function saveRecipe(url, body) {
    const safe = safeFeedRecipe(url, body);
    if (!safe) return;

    const recipes = readRecipes();
    const key = `${safe.method} ${safe.url} ${JSON.stringify(safe.body)}`;
    const existing = recipes.filter(recipe => `${recipe.method} ${recipe.url} ${JSON.stringify(recipe.body)}` !== key);
    existing.unshift(safe);
    writeJson(STORAGE.feedRecipes, existing.slice(0, 6));
  }

  function safeFeedRecipe(url, body) {
    const cleanUrl = String(url || '').split('?')[0];
    if (!/studio-api-prod\.suno\.com\/api\/(unified\/feed|feed\/v3)$/i.test(cleanUrl)) return null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

    const allowed = {};
    if (cleanUrl.includes('/api/unified/feed')) {
      if (typeof body.feed_id === 'string') allowed.feed_id = body.feed_id;
      if (typeof body.target_user_id === 'string') allowed.target_user_id = body.target_user_id;
      allowed.page_size = clampNumber(body.page_size, 1, 80, 20);
    } else {
      if (body.cursor == null || typeof body.cursor === 'string') allowed.cursor = body.cursor || null;
      allowed.limit = clampNumber(body.limit, 1, 80, 20);
      allowed.filters = safeFilters(body.filters);
    }

    return {
      method: 'POST',
      url: cleanUrl,
      body: allowed,
      savedAt: new Date().toISOString()
    };
  }

  function safeFilters(filters) {
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
    const out = {};
    for (const key of ['disliked', 'trashed']) {
      if (typeof filters[key] === 'string' || typeof filters[key] === 'boolean') out[key] = filters[key];
    }
    for (const key of ['fromStudioProject', 'stem', 'user', 'ids']) {
      if (!filters[key] || typeof filters[key] !== 'object' || Array.isArray(filters[key])) continue;
      out[key] = {};
      if (typeof filters[key].presence === 'string' || typeof filters[key].presence === 'boolean') {
        out[key].presence = filters[key].presence;
      }
      if (key === 'user' && typeof filters[key].userId === 'string') out[key].userId = filters[key].userId;
      if (key === 'ids' && Array.isArray(filters[key].clipIds)) {
        out[key].clipIds = filters[key].clipIds.filter(id => typeof id === 'string').slice(0, 100);
      }
    }
    return out;
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function extractClipsFromPayload(data) {
    if (!data || typeof data !== 'object') return [];
    let clips = [];
    if (Array.isArray(data.clips)) clips = clips.concat(data.clips);
    if (Array.isArray(data.project_clips)) clips = clips.concat(data.project_clips);
    if (Array.isArray(data.pinned_clips)) clips = clips.concat(data.pinned_clips);
    if (data.project && Array.isArray(data.project.clips)) clips = clips.concat(data.project.clips);
    if (data.feed && Array.isArray(data.feed.items)) {
      clips = clips.concat(data.feed.items.map(item => item && item.content_item).filter(Boolean));
    }
    return clips;
  }

  async function loadDirectFromRecipes() {
    const recipes = readRecipes();
    if (!recipes.length) return [];

    let all = [];
    for (const recipe of recipes) {
      try {
        const payload = await gmJson(recipe.method || 'POST', recipe.url, recipe.body);
        all = all.concat(extractClipsFromPayload(payload));
      } catch (error) {
        state.directLastError = error && error.message ? error.message : String(error);
      }
    }
    return all;
  }

  function feedBodies(cursor) {
    const userId = clean(GM_getValue(STORAGE.userId, ''));
    const baseFilters = {
      disliked: 'false',
      trashed: 'false',
      fromStudioProject: { presence: 'false' },
      stem: { presence: 'false' }
    };

    const bodies = [];
    if (userId) {
      bodies.push({
        cursor: cursor || null,
        limit: 20,
        filters: {
          ...baseFilters,
          user: { presence: 'true', userId }
        }
      });
    }

    bodies.push({
      cursor: cursor || null,
      limit: 20,
      filters: {
        ...baseFilters,
        user: { presence: 'false' }
      }
    });

    bodies.push({
      cursor: cursor || null,
      limit: 20,
      filters: baseFilters
    });

    bodies.push({
      cursor: cursor || null,
      limit: 20,
      filters: {}
    });

    return bodies;
  }

  async function loadDirect(maxPages = 2) {
    if (state.busy) return;
    state.busy = true;
    setStatus('Trying direct Suno API access...');

    try {
      let recipeClips = await loadDirectFromRecipes();
      if (recipeClips.length) {
        const addedFromRecipe = mergeClips(recipeClips, 'direct-replay');
        setStatus(`Direct replay loaded ${recipeClips.length} clips (${addedFromRecipe} new).`);
        return;
      }

      let cursor = null;
      let all = [];
      let lastError = null;
      let bodyThatWorks = null;

      for (let page = 0; page < maxPages; page++) {
        const candidates = bodyThatWorks ? [bodyThatWorks(cursor)] : feedBodies(cursor);
        let payload = null;

        for (const body of candidates) {
          try {
            payload = await gmJson('POST', `${API}/api/feed/v3`, body);
            if (payload && Array.isArray(payload.clips)) {
              bodyThatWorks = nextCursor => ({ ...body, cursor: nextCursor || null });
              break;
            }
          } catch (error) {
            lastError = error;
          }
        }

        if (!payload || !Array.isArray(payload.clips)) break;
        all = all.concat(extractClipsFromPayload(payload));
        cursor = payload.next_cursor || null;
        if (!payload.has_more || !cursor) break;
      }

      if (!all.length) {
        throw lastError || new Error('No clips returned');
      }

      const added = mergeClips(all, 'direct-api');
      setStatus(`Direct loaded ${all.length} clips (${added} new).`);
    } catch (error) {
      state.directLastError = error && error.message ? error.message : String(error);
      setStatus(`Direct failed: ${state.directLastError}. Use Prime Suno.`);
    } finally {
      state.busy = false;
      render();
    }
  }

  function openPrimeWindow(mode = 'quick') {
    const primeMode = mode === 'full' ? 'full' : 'quick';
    const before = Number(GM_getValue(STORAGE.lastPrimeAt, '0')) || 0;
    const beforeCount = state.library.length;
    const url = `https://suno.com/me?nova_suno_prime=${primeMode}`;
    const popup = window.open(url, 'novaSunoPrime', tinyPrimeWindowFeatures());
    if (!popup) {
      setStatus('Popup blocked. Open suno.com/me manually, then press Load Direct again.');
      return;
    }
    writeJson(STORAGE.primeStatus, {
      mode: primeMode,
      state: 'opened',
      savedCount: beforeCount,
      lastBatch: 0,
      done: false,
      at: Date.now()
    });
    setStatus(primeMode === 'full'
      ? 'Prime Full opened tiny Suno popup. Capturing all loaded pages...'
      : 'Prime Quick opened tiny Suno popup. Waiting for feed capture...');

    const started = Date.now();
    let lastShown = '';
    let lastCount = beforeCount;
    const maxWaitMs = primeMode === 'full' ? 240000 : 45000;
    const timer = setInterval(() => {
      const nowValue = Number(GM_getValue(STORAGE.lastPrimeAt, '0')) || 0;
      const primeStatus = readJson(STORAGE.primeStatus, {});
      state.library = readLibrary();
      applyFilter();

      const savedCount = state.library.length;
      const batch = Number(primeStatus.lastBatch || 0) || 0;
      const statusText = primeStatus.state === 'done'
        ? `Prime ${primeMode === 'full' ? 'Full' : 'Quick'} done. Songs saved: ${savedCount}.`
        : `Prime ${primeMode === 'full' ? 'Full' : 'Quick'} capturing... ${savedCount} saved${batch ? `, last batch ${batch}` : ''}.`;

      if (statusText !== lastShown || savedCount !== lastCount) {
        state.status = statusText;
        lastShown = statusText;
        lastCount = savedCount;
        render();
      }

      if (primeStatus.done || (popup.closed && nowValue > before)) {
        clearInterval(timer);
        state.status = `Prime ${primeMode === 'full' ? 'Full' : 'Quick'} captured library. Songs saved: ${state.library.length}.`;
        render();
        return;
      }

      if (Date.now() - started > maxWaitMs) {
        clearInterval(timer);
        setStatus(`Prime ${primeMode === 'full' ? 'Full' : 'Quick'} timed out. Songs saved: ${state.library.length}.`);
      }
    }, 1000);
  }

  function tinyPrimeWindowFeatures() {
    const width = 390;
    const height = 560;
    const left = Math.max(0, Number(window.screenX || 0));
    const top = Math.max(0, Number(window.screenY || 0));
    return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
  }

  function ensureAudio() {
    if (state.audio) return state.audio;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 1;
    audio.muted = false;
    audio.addEventListener('ended', () => playNext());
    audio.addEventListener('timeupdate', () => throttleRender());
    audio.addEventListener('canplay', () => updatePlaybackUi());
    audio.addEventListener('loadedmetadata', () => render());
    audio.addEventListener('play', () => {
      audio.volume = 1;
      audio.muted = false;
      state.lastAudioError = '';
      claimAudioOwnership(currentClip());
      startAudioReactive();
      render();
    });
    audio.addEventListener('pause', () => {
      setAudioReactiveVars(0, 0, 0, 0);
      render();
    });
    audio.addEventListener('error', () => {
      const clip = currentClip();
      state.lastAudioError = `Audio element error${audio.error ? ` code ${audio.error.code}` : ''}`;
      if (clip && clip.id && audio.src && !audio.src.startsWith('blob:') && !state.blobLoading.has(clip.id)) {
        playViaBlob(clip, 'Direct audio failed. Trying GM blob fallback...');
        return;
      }
      setStatus(`${state.lastAudioError}. The saved Suno audio URL may be blocked or expired.`);
    });
    state.audio = audio;
    return audio;
  }

  function currentClip() {
    applyFilter();
    return state.filtered[state.index] || state.library[state.index] || null;
  }

  async function playIndex(index) {
    applyFilter();
    const list = state.filtered.length ? state.filtered : state.library;
    if (!list.length) {
      setStatus('No songs loaded yet.');
      return;
    }
    state.index = Math.max(0, Math.min(index, list.length - 1));
    GM_setValue('nova_suno_remote_index_v1', state.index);

    const clip = list[state.index];
    state.currentClipId = clip.id || '';
    state.lastAudioError = '';
    state.lastPlayDebug = makePlayDebug(clip, 'selected');

    const blobOk = await playViaBlob(clip, `Loading audio: ${clip.title}`);
    if (blobOk) return;
    await playDirect(clip, 'Blob path failed. Trying direct audio URL...');
  }

  async function playDirect(clip, message) {
    if (!clip || !clip.audioUrl) {
      setStatus('No playable saved audio URL for this song.');
      return false;
    }
    const audio = ensureAudio();
    audio.volume = 1;
    audio.muted = false;
    state.lastPlayDebug = makePlayDebug(clip, 'direct');
    if (message) setStatusOnly(message);
    if (audio.src !== clip.audioUrl) {
      audio.src = clip.audioUrl;
      audio.load();
    }

    try {
      await audio.play();
      state.lastAudioError = '';
      setStatusOnly(`Playing: ${clip.title}`);
      updatePlaybackUi();
      return true;
    } catch (error) {
      const messageText = error && error.message ? error.message : String(error);
      state.directLastError = messageText;
      state.lastAudioError = `Direct play failed: ${messageText}`;
      setStatusOnly(state.lastAudioError);
      updatePlaybackUi();
      return false;
    }
  }

  async function playViaBlob(clip, message) {
    if (!clip || !clip.audioUrl || !clip.id) {
      setStatus('No playable saved audio URL for this song.');
      return false;
    }
    if (!isAllowedAudioUrl(clip.audioUrl)) {
      setStatus('Saved audio URL host is not allowed by Nova safety guard.');
      return false;
    }
    if (state.blobLoading.has(clip.id)) {
      setStatusOnly(`Already loading: ${clip.title}`);
      return false;
    }

    state.blobLoading.add(clip.id);
    setStatusOnly(message || 'Fetching audio with GM blob fallback...');

    try {
      const audio = ensureAudio();
      audio.volume = 1;
      audio.muted = false;
      let blobUrl = state.blobUrls.get(clip.id);
      const cacheHit = Boolean(blobUrl);
      let blobSize = 0;
      let blobType = '';
      if (!blobUrl) {
        const blob = await gmBlob(clip.audioUrl);
        blobSize = Number(blob && blob.size) || 0;
        blobType = clean(blob && blob.type);
        blobUrl = URL.createObjectURL(blob);
        state.blobUrls.set(clip.id, blobUrl);
      }
      state.lastPlayDebug = makePlayDebug(clip, 'blob', {
        blobCacheHit: cacheHit,
        blobSize,
        blobType
      });
      state.currentClipId = clip.id || '';
      audio.src = blobUrl;
      audio.load();
      await audio.play();
      state.lastAudioError = '';
      setStatusOnly(`Playing: ${clip.title}`);
      return true;
    } catch (error) {
      const messageText = error && error.message ? error.message : String(error);
      state.lastAudioError = `Blob playback failed: ${messageText}`;
      setStatusOnly(state.lastAudioError);
      return false;
    } finally {
      state.blobLoading.delete(clip.id);
      updatePlaybackUi();
    }
  }

  function gmBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        anonymous: false,
        withCredentials: true,
        headers: {
          Accept: 'audio/*,*/*;q=0.8'
        },
        responseType: 'blob',
        timeout: 45000,
        onload: response => {
          if (response.status >= 200 && response.status < 300 && response.response) {
            const blob = response.response;
            const size = Number(blob && blob.size) || 0;
            const type = clean(blob && blob.type).toLowerCase();
            if (size < 512) {
              reject(new Error(`audio blob too small (${size} bytes)`));
              return;
            }
            if (/^(text|application\/json)/i.test(type)) {
              reject(new Error(`unexpected audio content-type ${type}`));
              return;
            }
            resolve(blob);
            return;
          }
          reject(new Error(`HTTP ${response.status}`));
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  function makePlayDebug(clip, mode, extra) {
    return {
      mode,
      title: clip && clip.title || '',
      id: clip && clip.id || '',
      hasAudioUrl: Boolean(clip && clip.audioUrl),
      audioHost: audioHost(clip && clip.audioUrl),
      at: new Date().toISOString(),
      ...(extra || {})
    };
  }

  function audioHost(url) {
    try {
      return new URL(url || '').hostname;
    } catch (_) {
      return '';
    }
  }

  function isAllowedAudioUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:' && (
        host === 'suno.com' ||
        host.endsWith('.suno.com') ||
        host === 'cdn1.suno.ai' ||
        host === 'cdn-o.suno.com' ||
        host.endsWith('.cloudfront.net')
      );
    } catch (_) {
      return false;
    }
  }

  function togglePlay() {
    const audio = ensureAudio();
    if (!audio.src) {
      playIndex(state.index || 0);
      return;
    }
    if (audio.paused) {
      const clip = currentClip();
      audio.play().catch(error => {
        if (clip && clip.audioUrl && audio.src && !audio.src.startsWith('blob:')) {
          playViaBlob(clip, `Play blocked: ${error && error.message ? error.message : String(error)}. Trying GM blob fallback...`);
          return;
        }
        setStatusOnly(`Play blocked: ${error && error.message ? error.message : String(error)}`);
      });
    } else {
      audio.pause();
    }
    render();
  }

  function playNext() {
    const list = state.filtered.length ? state.filtered : state.library;
    if (!list.length) return;
    playIndex((state.index + 1) % list.length);
  }

  function playPrev() {
    const list = state.filtered.length ? state.filtered : state.library;
    if (!list.length) return;
    playIndex((state.index - 1 + list.length) % list.length);
  }

  function shufflePlay() {
    const list = state.filtered.length ? state.filtered : state.library;
    if (!list.length) return;
    playIndex(Math.floor(Math.random() * list.length));
  }

  function clearSaved() {
    if (!confirm('Clear saved Nova Suno library from this browser?')) return;
    saveLibrary([]);
    setStatus('Saved library cleared.');
  }

  function formatTime(value) {
    const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  let renderTimer = null;
  function throttleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      updatePlaybackUi();
    }, 500);
  }

  function updatePlaybackUi() {
    if (!state.ready || !state.panel || !state.body) return;
    const audio = state.audio;
    const clip = currentClip();
    const playing = audio && !audio.paused;
    const duration = audio && Number.isFinite(audio.duration) ? audio.duration : (clip && clip.duration) || 0;
    const currentTime = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const pct = duration ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

    const progress = state.body.querySelector('[data-nsr-progress]');
    const time = state.body.querySelector('[data-nsr-time]');
    const playButton = state.body.querySelector('[data-nsr-main-play]');

    if (progress) progress.style.width = `${pct}%`;
    if (time) {
      time.innerHTML = `${formatTime(currentTime)} / ${formatTime(duration)} ${playing ? '<span class="nsr-good">playing</span>' : '<span>paused</span>'}`;
    }
    if (playButton) playButton.textContent = playing ? 'Pause' : 'Play';
  }

  function updateStatusUi() {
    if (!state.body) return;
    const status = state.body.querySelector('[data-nsr-status]');
    if (status) status.textContent = state.status;
  }

  function rememberPanelScroll() {
    if (!state.body) return null;
    const list = state.body.querySelector('[data-nsr-list]');
    return {
      bodyTop: state.body.scrollTop,
      listTop: list ? list.scrollTop : 0
    };
  }

  function restorePanelScroll(saved) {
    if (!saved || !state.body) return;
    const list = state.body.querySelector('[data-nsr-list]');
    state.body.scrollTop = saved.bodyTop || 0;
    if (list) list.scrollTop = saved.listTop || 0;
  }

  function startAudioReactive() {
    const audio = state.audio;
    if (!audio) return;
    if (audio.src && !audio.src.startsWith('blob:') && !(state.audioFx && state.audioFx.mode === 'real')) {
      startSyntheticReactive();
      return;
    }
    try {
      const fx = ensureAudioFx(audio);
      if (!fx || fx.frame) return;
      const run = ++state.audioFxRun;
      if (fx.ctx && fx.ctx.state === 'suspended') fx.ctx.resume().catch(() => {});
      const tick = () => {
        if (run !== state.audioFxRun) return;
        fx.frame = 0;
        if (!state.audio || state.audio.paused || state.audio.ended) {
          setAudioReactiveVars(0, 0, 0, 0);
          return;
        }
        fx.analyser.getByteFrequencyData(fx.data);
        const bass = avgRange(fx.data, 0, 10) / 255;
        const mid = avgRange(fx.data, 10, 60) / 255;
        const high = avgRange(fx.data, 60, 128) / 255;
        const energy = Math.min(1, (bass * 0.55) + (mid * 0.32) + (high * 0.22));
        setAudioReactiveVars(energy, bass, mid, high);
        fx.frame = requestAnimationFrame(tick);
      };
      fx.frame = requestAnimationFrame(tick);
    } catch (error) {
      setStatus(`Audio RGB unavailable: ${error && error.message ? error.message : String(error)}`);
    }
  }

  function startSyntheticReactive() {
    if (state.audioFx && state.audioFx.mode === 'synthetic' && state.audioFx.frame) return;
    state.audioFx = state.audioFx && state.audioFx.mode === 'synthetic' ? state.audioFx : { mode: 'synthetic', frame: 0 };
    const run = ++state.audioFxRun;
    const tick = () => {
      const audio = state.audio;
      if (run !== state.audioFxRun) return;
      state.audioFx.frame = 0;
      if (!audio || audio.paused || audio.ended) {
        setAudioReactiveVars(0, 0, 0, 0);
        return;
      }
      const t = Number(audio.currentTime || 0);
      const bass = 0.45 + Math.max(0, Math.sin(t * 5.2)) * 0.35;
      const mid = 0.30 + Math.max(0, Math.sin(t * 8.1 + 1.4)) * 0.28;
      const high = 0.22 + Math.max(0, Math.sin(t * 13.7 + 0.7)) * 0.25;
      const energy = Math.min(1, (bass * 0.5) + (mid * 0.28) + (high * 0.18));
      setAudioReactiveVars(energy, bass, mid, high);
      state.audioFx.frame = requestAnimationFrame(tick);
    };
    state.audioFx.frame = requestAnimationFrame(tick);
  }

  function ensureAudioFx(audio) {
    if (state.audioFx && state.audioFx.audio === audio) return state.audioFx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext ||
      (typeof unsafeWindow !== 'undefined' && (unsafeWindow.AudioContext || unsafeWindow.webkitAudioContext));
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    state.audioFx = {
      mode: 'real',
      audio,
      ctx,
      source,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
      frame: 0
    };
    return state.audioFx;
  }

  function avgRange(data, start, end) {
    const safeEnd = Math.min(data.length, end);
    let total = 0;
    let count = 0;
    for (let i = start; i < safeEnd; i++) {
      total += data[i] || 0;
      count++;
    }
    return count ? total / count : 0;
  }

  function setAudioReactiveVars(energy, bass, mid, high) {
    const settings = state.fxSettings || FX_DEFAULTS;
    const signal = fxSignal(settings.source, energy, bass, mid, high);
    const scale = fxIntensityScale(settings.intensity);
    const react = fxEnabled() ? Math.max(0, Math.min(1, signal * scale)) : 0;
    const palette = fxPalette(settings.palette);
    const drift = settings.intensity === 'gremlin' ? performance.now() / 65 : performance.now() / 180;
    const hues = palette.map((hue, index) => Math.round((hue + drift + (index * react * 18)) % 360));
    const values = {
      '--nsr-energy': energy.toFixed(3),
      '--nsr-bass': bass.toFixed(3),
      '--nsr-mid': mid.toFixed(3),
      '--nsr-high': high.toFixed(3),
      '--nsr-react': react.toFixed(3),
      '--nsr-h1': String(hues[0]),
      '--nsr-h2': String(hues[1]),
      '--nsr-h3': String(hues[2]),
      '--nsr-bg-a1': (0.08 + react * 0.18).toFixed(3),
      '--nsr-bg-a2': (0.07 + react * 0.16).toFixed(3),
      '--nsr-head-l1': `${Math.round(14 + react * 14)}%`,
      '--nsr-head-l2': `${Math.round(16 + react * 16)}%`,
      '--nsr-btn-blur': `${Math.round(4 + react * 16)}px`,
      '--nsr-btn-a': (0.18 + react * 0.38).toFixed(3),
      '--nsr-active-a1': (0.08 + react * 0.16).toFixed(3),
      '--nsr-active-a2': (0.05 + react * 0.12).toFixed(3),
      '--nsr-active-outline-a': (0.55 + react * 0.35).toFixed(3),
      '--nsr-progress-blur': `${Math.round(6 + react * 16)}px`,
      '--nsr-eq-blur': `${Math.round(8 + react * 18)}px`,
      '--nsr-lyrics-border-a': (0.22 + react * 0.34).toFixed(3),
      '--nsr-lyrics-glow-a': (0.08 + react * 0.20).toFixed(3)
    };
    applyFxClasses();

    for (const node of [state.panel, state.orb, state.lyricsPanel, state.fxPanel].filter(Boolean)) {
      for (const [key, value] of Object.entries(values)) {
        node.style.setProperty(key, value);
      }
      applyReactiveGlow(node, react, hues);
    }

    updateHoloRipple(energy, bass, mid, high, hues, react);
  }

  function updateHoloRipple(energy, bass, mid, high, hues, react) {
    const canvas = state.body && state.body.querySelector('[data-nsr-holo-ripple]');
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const holo = state.holoRipple;
    const now = performance.now();
    const dt = Math.min(48, Math.max(8, now - (holo.lastFrameAt || now))) / 1000;
    holo.lastFrameAt = now;
    holo.bassAverage = (holo.bassAverage * 0.94) + (bass * 0.06);
    const bassJump = bass - holo.lastBass;
    const threshold = Math.max(0.13, holo.bassAverage * 1.16);
    const cooldown = state.fxSettings && state.fxSettings.intensity === 'gremlin' ? 95 : 135;
    if (fxPart('equalizer') && react > 0.025 && bass > threshold && bassJump > 0.018 && now - holo.lastSpawnAt > cooldown) {
      holo.lastSpawnAt = now;
      holo.ripples.push({
        age: 0,
        life: 0.72 + bass * 0.52,
        speed: width * (0.62 + bass * 0.32),
        strength: 0.42 + bass * 0.95,
        hueShift: (holo.ripples.length * 21 + high * 52) % 90,
        thickness: 1.1 + bass * 2.1
      });
      if (holo.ripples.length > 10) holo.ripples.splice(0, holo.ripples.length - 10);
    }
    holo.lastBass = bass;
    for (const ripple of holo.ripples) ripple.age += dt;
    holo.ripples = holo.ripples.filter(ripple => ripple.age < ripple.life);

    ctx.clearRect(0, 0, width, height);
    if (!fxPart('equalizer')) return;

    const centerX = width / 2;
    const surfaceY = height * 0.53;
    const live = Math.max(0.05, react);

    const bed = ctx.createLinearGradient(0, 0, width, 0);
    bed.addColorStop(0, `hsla(${hues[1]},96%,60%,0)`);
    bed.addColorStop(.5, `hsla(${hues[0]},96%,68%,${0.06 + live * 0.12})`);
    bed.addColorStop(1, `hsla(${hues[2]},96%,60%,0)`);
    ctx.fillStyle = bed;
    ctx.fillRect(0, surfaceY - 1, width, 2);

    // Central droplet/impact point: white-hot core with coloured holographic halo.
    const coreR = 1.8 + bass * 4.8;
    const core = ctx.createRadialGradient(centerX, surfaceY, 0, centerX, surfaceY, coreR * 3.4);
    core.addColorStop(0, `rgba(255,255,255,${0.42 + live * 0.48})`);
    core.addColorStop(.22, `hsla(${hues[0]},100%,72%,${0.30 + live * 0.48})`);
    core.addColorStop(1, `hsla(${hues[1]},100%,58%,0)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(centerX, surfaceY, coreR * 3.4, coreR * 1.55, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const ripple of holo.ripples) {
      const progress = ripple.age / ripple.life;
      const distance = Math.min(centerX + 18, ripple.age * ripple.speed);
      const fade = Math.pow(1 - progress, 1.25);
      const edgeRatio = Math.max(0, (distance - centerX * 0.78) / (centerX * 0.22));
      const amplitude = (3.2 + ripple.strength * 8.5) * fade;
      const halfSpan = 12 + ripple.strength * 22 + edgeRatio * 24;
      const baseHue = (hues[0] + ripple.hueShift) % 360;

      // Three vertically offset traces create the false 3D / hologram depth.
      for (let layer = 2; layer >= 0; layer--) {
        const depth = layer * 2.35;
        const alpha = fade * (layer === 0 ? 0.78 : 0.18 + layer * 0.08);
        const hue = layer === 0 ? baseHue : (layer === 1 ? hues[1] : hues[2]);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `hsla(${hue},100%,${66 + layer * 4}%,${alpha})`;
        ctx.lineWidth = Math.max(.65, ripple.thickness - layer * .25);
        ctx.shadowColor = `hsla(${hue},100%,62%,${Math.min(.9, alpha)})`;
        ctx.shadowBlur = 7 + ripple.strength * 11 + edgeRatio * 15;
        ctx.beginPath();
        for (let side of [-1, 1]) {
          const x0 = centerX + side * distance;
          for (let i = 0; i <= 24; i++) {
            const u = i / 24;
            const x = x0 + side * ((u - .5) * halfSpan * 2);
            const envelope = Math.pow(Math.max(0, 1 - Math.abs(u - .5) * 2), 1.7);
            const wave = Math.sin((u * Math.PI * 2.4) - progress * 8.5) * amplitude * envelope;
            const y = surfaceY - wave - depth + Math.abs(x - centerX) / centerX * (2.2 + layer * .8);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // When the ripple reaches either border, stretch it into a lingering colour trail and shadow.
      if (edgeRatio > 0) {
        const hit = Math.min(1, edgeRatio) * fade;
        const trailLength = 18 + hit * 54;
        for (const side of [-1, 1]) {
          const edgeX = side < 0 ? 0 : width;
          const innerX = edgeX - side * trailLength;
          const gradient = ctx.createLinearGradient(edgeX, 0, innerX, 0);
          gradient.addColorStop(0, `hsla(${baseHue},100%,72%,${hit * .92})`);
          gradient.addColorStop(.35, `hsla(${hues[1]},100%,64%,${hit * .48})`);
          gradient.addColorStop(1, `hsla(${hues[2]},100%,60%,0)`);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.4 + hit * 3.4;
          ctx.shadowColor = `hsla(${baseHue},100%,64%,${hit})`;
          ctx.shadowBlur = 12 + hit * 25;
          ctx.beginPath();
          ctx.moveTo(edgeX, surfaceY - 2.5 - hit * 4);
          ctx.quadraticCurveTo(edgeX - side * trailLength * .34, surfaceY - 8 - hit * 5, innerX, surfaceY + 1.5);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Fine shimmer from treble, kept subtle so the ripple remains readable.
    if (high > 0.16) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const seed = (now * .025 + i * 73) % width;
        const x = seed;
        const y = surfaceY - 2 - ((i * 7 + now * .01) % 12);
        ctx.fillStyle = `hsla(${hues[(i + 1) % 3]},100%,76%,${high * .20})`;
        ctx.fillRect(x, y, .7 + high, .7 + high);
      }
      ctx.restore();
    }
  }

  function fxSignal(source, energy, bass, mid, high) {
    if (source === 'energy') return energy;
    if (source === 'bass') return bass;
    if (source === 'mid') return mid;
    if (source === 'high') return high;
    return Math.min(1, (energy * 0.34) + (bass * 0.30) + (mid * 0.22) + (high * 0.14));
  }

  function fxIntensityScale(intensity) {
    if (intensity === 'soft') return 0.55;
    if (intensity === 'gremlin') return 1.35;
    return 0.88;
  }

  function fxPalette(name) {
    const palettes = {
      nova: [188, 264, 322],
      fire: [8, 32, 52],
      cyber: [174, 205, 112],
      violet: [264, 304, 224],
      ice: [188, 205, 222],
      toxic: [116, 78, 142]
    };
    return palettes[name] || palettes.nova;
  }

  function applyReactiveGlow(node, react, hues) {
    if (!node || react <= 0.02) {
      clearReactiveGlow(node);
      return;
    }
    const isPanel = node === state.panel;
    const isOrb = node === state.orb;
    const isLyrics = node === state.lyricsPanel;
    const isFx = node === state.fxPanel;
    if ((isPanel && !fxPart('panel')) || (isOrb && !fxPart('orb')) || (isLyrics && !fxPart('lyrics')) || (isFx && !fxPart('panel'))) {
      clearReactiveGlow(node);
      return;
    }
    const glow = Math.round(14 + react * 58);
    const alpha = Math.min(0.9, 0.20 + react * 0.58);
    node.style.borderColor = `hsl(${hues[0]} 96% ${Math.round(54 + react * 18)}%)`;
    node.style.boxShadow = `0 0 ${glow}px hsla(${hues[0]},96%,62%,${alpha}),0 0 ${Math.round(glow * 1.75)}px hsla(${hues[1]},96%,62%,${alpha * 0.45}),0 16px 55px rgba(0,0,0,.52)`;
  }

  function clearReactiveGlow(node) {
    if (!node) return;
    node.style.removeProperty('border-color');
    node.style.removeProperty('box-shadow');
  }

  function applyFxClasses() {
    const enabled = fxEnabled();
    const nodes = [state.panel, state.orb, state.lyricsPanel, state.fxPanel].filter(Boolean);
    const parts = Object.keys(FX_DEFAULTS.parts);
    for (const node of nodes) {
      node.classList.toggle('nsr-fx-on', enabled);
      for (const part of parts) {
        node.classList.toggle(`nsr-part-${part}`, fxPart(part));
      }
    }
  }

  function refreshFxVisuals() {
    applyFxClasses();
    if (!state.audio || state.audio.paused || !fxEnabled()) {
      setAudioReactiveVars(0, 0, 0, 0);
      return;
    }
    startAudioReactive();
  }

  function scheduleSurvivalCheck() {
    if (survivalScheduled) return;
    survivalScheduled = true;
    setTimeout(() => {
      survivalScheduled = false;
      keepUiOnTop();
    }, 120);
  }

  function installSurvivalWatchdog() {
    if (!survivalTimer) {
      survivalTimer = setInterval(() => {
        observeCurrentBody();
        keepUiOnTop();
      }, 1500);
    }
    observeCurrentBody();
  }

  function observeCurrentBody() {
    if (!document.body || observedBody === document.body) return;
    if (survivalObserver) survivalObserver.disconnect();
    observedBody = document.body;
    survivalObserver = new MutationObserver(scheduleSurvivalCheck);
    survivalObserver.observe(document.body, { childList: true });
  }

  function keepUiOnTop() {
    if (!document.body) return;
    installStyles();

    if (!state.ready) {
      initUi();
      return;
    }

    if (state.orb && state.orb.parentNode !== document.body) document.body.appendChild(state.orb);
    if (state.panel && state.panel.parentNode !== document.body) document.body.appendChild(state.panel);
    if (state.lyricsPanel && state.lyricsPanel.parentNode !== document.body) document.body.appendChild(state.lyricsPanel);
    if (state.fxPanel && state.fxPanel.parentNode !== document.body) document.body.appendChild(state.fxPanel);

    forceOverlayNode(state.orb, 2147483645);
    forceOverlayNode(state.panel, 2147483646);
    forceOverlayNode(state.lyricsPanel, 2147483647);
    forceOverlayNode(state.fxPanel, 2147483647);
  }

  function forceOverlayNode(node, zIndex) {
    if (!node) return;
    node.style.setProperty('position', 'fixed', 'important');
    node.style.setProperty('z-index', String(zIndex), 'important');
    node.style.setProperty('pointer-events', 'auto', 'important');
  }

  function installStyles() {
    if (document.getElementById('nova-suno-remote-style')) return;
    const style = document.createElement('style');
    style.id = 'nova-suno-remote-style';
    style.textContent = `
      #nova-suno-remote-orb,
      #nova-suno-remote-panel,
      #nova-suno-remote-panel *{box-sizing:border-box;font-family:Verdana, Geneva, sans-serif;}
      #nova-suno-remote-orb{--nsr-react:0;--nsr-h1:188;--nsr-h2:264;--nsr-h3:322;position:fixed!important;right:18px;bottom:88px;z-index:2147483645!important;pointer-events:auto!important;border:1px solid rgba(56,189,248,.75);background:#0b1020;color:#fff;border-radius:999px;padding:9px 12px;font-weight:900;font-size:12px;cursor:pointer;box-shadow:0 0 24px rgba(34,211,238,.45),0 0 42px rgba(124,58,237,.32);}
      #nova-suno-remote-panel{--nsr-react:0;--nsr-h1:188;--nsr-h2:264;--nsr-h3:322;position:fixed!important;right:18px;bottom:132px;width:390px;max-width:calc(100vw - 24px);max-height:calc(100vh - 40px);z-index:2147483646!important;pointer-events:auto!important;color:#f8fafc;background:#090b14;border:1px solid rgba(56,189,248,.55);border-radius:18px;box-shadow:0 0 30px rgba(56,189,248,.24),0 16px 55px rgba(0,0,0,.5);overflow:hidden;}
      #nova-suno-remote-panel.nsr-theme-rgb{animation:nsrRgbGlow 9s linear infinite;}
      @keyframes nsrRgbGlow{0%{border-color:#22d3ee;box-shadow:0 0 26px rgba(34,211,238,.34),0 14px 50px rgba(0,0,0,.48)}33%{border-color:#a78bfa;box-shadow:0 0 26px rgba(167,139,250,.34),0 14px 50px rgba(0,0,0,.48)}66%{border-color:#f472b6;box-shadow:0 0 26px rgba(244,114,182,.34),0 14px 50px rgba(0,0,0,.48)}100%{border-color:#22d3ee;box-shadow:0 0 26px rgba(34,211,238,.34),0 14px 50px rgba(0,0,0,.48)}}
      #nova-suno-remote-panel .nsr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;background:linear-gradient(120deg,#111827,#172554 42%,#083344);cursor:move;}
      #nova-suno-remote-panel .nsr-title{font-weight:900;letter-spacing:.2px;}
      #nova-suno-remote-panel .nsr-head button,
      #nova-suno-remote-panel .nsr-btn{border:1px solid rgba(56,189,248,.75);background:#151a29;color:#fff;border-radius:9px;padding:7px 9px;font-size:12px;font-weight:800;cursor:pointer;}
      #nova-suno-remote-panel .nsr-head button:hover,
      #nova-suno-remote-panel .nsr-btn:hover{background:#1f2a44;}
      #nova-suno-remote-panel .nsr-head button:disabled,
      #nova-suno-remote-panel .nsr-btn:disabled{opacity:.48;cursor:not-allowed;}
      #nova-suno-remote-panel .nsr-body{padding:12px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 110px);overflow:auto;}
      #nova-suno-remote-panel .nsr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      #nova-suno-remote-panel .nsr-card{background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.24);border-radius:14px;padding:10px;}
      #nova-suno-remote-panel .nsr-now{display:grid;grid-template-columns:58px 1fr;gap:10px;align-items:center;}
      #nova-suno-remote-panel .nsr-cover{width:58px;height:58px;border-radius:12px;background:#111827;object-fit:cover;border:1px solid rgba(148,163,184,.28);}
      #nova-suno-remote-panel .nsr-song-title{font-weight:900;font-size:14px;line-height:1.25;}
      #nova-suno-remote-panel .nsr-muted{font-size:11px;color:#aab5c7;line-height:1.35;}
      #nova-suno-remote-panel .nsr-status{font-size:11px;color:#67e8f9;line-height:1.35;}
      #nova-suno-remote-panel .nsr-progress{height:7px;width:100%;background:#263044;border-radius:999px;overflow:hidden;margin-top:8px;}
      #nova-suno-remote-panel .nsr-progress div{height:100%;width:0;background:linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6);}
      #nova-suno-remote-panel .nsr-viz{position:relative;height:42px;margin-top:7px;border-radius:10px;overflow:hidden;perspective:420px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(2,6,23,.24));box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 -10px 22px rgba(0,0,0,.22);}
      #nova-suno-remote-panel .nsr-viz::before{content:"";position:absolute;inset:52% 4% 3px;transform:rotateX(68deg);transform-origin:center top;background:repeating-linear-gradient(90deg,hsla(var(--nsr-h1),96%,62%,.10) 0 1px,transparent 1px 14px),repeating-linear-gradient(0deg,hsla(var(--nsr-h2),96%,62%,.08) 0 1px,transparent 1px 10px);mask-image:linear-gradient(to bottom,rgba(0,0,0,.75),transparent);pointer-events:none;}
      #nova-suno-remote-panel .nsr-holo-ripple{position:absolute;inset:0;width:100%;height:100%;display:block;filter:saturate(1.18) contrast(1.04);}
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-panel{background:
        radial-gradient(circle at 18% 4%,hsla(var(--nsr-h1),96%,58%,var(--nsr-bg-a1,.08)),transparent 34%),
        radial-gradient(circle at 92% 18%,hsla(var(--nsr-h2),96%,58%,var(--nsr-bg-a2,.07)),transparent 40%),
        linear-gradient(180deg,#090b14,#050713);}
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-header .nsr-head,
      #nova-suno-fx-panel.nsr-fx-on.nsr-part-header .nsr-head{background:
        linear-gradient(120deg,hsl(var(--nsr-h1) 82% var(--nsr-head-l1,14%)),hsl(var(--nsr-h2) 78% var(--nsr-head-l2,16%)) 52%,hsl(var(--nsr-h3) 72% 16%));}
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-buttons .nsr-btn,
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-buttons .nsr-head button,
      #nova-suno-fx-panel.nsr-fx-on.nsr-part-buttons .nsr-btn,
      #nova-suno-fx-panel.nsr-fx-on.nsr-part-buttons .nsr-head button{border-color:hsl(var(--nsr-h1) 96% 66%);box-shadow:0 0 var(--nsr-btn-blur,4px) hsla(var(--nsr-h1),96%,62%,var(--nsr-btn-a,.18));}
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-active .nsr-item.active{background:linear-gradient(115deg,hsla(var(--nsr-h1),90%,55%,var(--nsr-active-a1,.08)),hsla(var(--nsr-h2),90%,55%,var(--nsr-active-a2,.05)));outline-color:hsla(var(--nsr-h1),96%,65%,var(--nsr-active-outline-a,.55));}
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-progress .nsr-progress div{background:linear-gradient(90deg,hsl(var(--nsr-h1) 96% 62%),hsl(var(--nsr-h2) 96% 65%),hsl(var(--nsr-h3) 96% 62%));box-shadow:0 0 var(--nsr-progress-blur,6px) hsla(var(--nsr-h2),96%,62%,.7);}
      #nova-suno-remote-panel.nsr-fx-on.nsr-part-equalizer .nsr-viz{box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -10px 22px rgba(0,0,0,.22),0 0 calc(var(--nsr-eq-blur,8px) * .55) hsla(var(--nsr-h1),96%,62%,.28);}
      #nova-suno-remote-panel .nsr-tabs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}
      #nova-suno-remote-panel .nsr-tabs button.active{background:#0e7490;border-color:#67e8f9;}
      #nova-suno-remote-panel input.nsr-search{width:100%;padding:9px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:#0f172a;color:#fff;outline:none;}
      #nova-suno-remote-panel .nsr-list{display:flex;flex-direction:column;gap:7px;max-height:280px;overflow:auto;padding-right:2px;}
      #nova-suno-remote-panel .nsr-item{display:grid;grid-template-columns:42px 1fr auto;gap:9px;align-items:center;background:rgba(255,255,255,.045);border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:7px;}
      #nova-suno-remote-panel .nsr-item.active{outline:2px solid rgba(34,211,238,.55);}
      #nova-suno-remote-panel .nsr-thumb{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#111827;}
      #nova-suno-remote-panel .nsr-prompt{max-height:250px;overflow:auto;white-space:pre-wrap;font-size:12px;line-height:1.45;color:#dbeafe;}
      #nova-suno-remote-panel .nsr-danger{color:#fb7185;}
      #nova-suno-remote-panel .nsr-good{color:#86efac;}
      #nova-suno-remote-panel.nsr-hidden{display:none;}
      #nova-suno-remote-orb.nsr-fx-on.nsr-part-orb{background:linear-gradient(135deg,hsl(var(--nsr-h1) 80% 14%),hsl(var(--nsr-h2) 76% 16%));}
      #nova-suno-lyrics-panel,
      #nova-suno-lyrics-panel *{box-sizing:border-box;font-family:Verdana, Geneva, sans-serif;}
      #nova-suno-lyrics-panel{--nsr-react:0;--nsr-h1:188;--nsr-h2:264;--nsr-h3:322;position:fixed!important;right:430px;bottom:132px;width:520px;max-width:calc(100vw - 24px);max-height:calc(100vh - 40px);z-index:2147483647!important;pointer-events:auto!important;color:#f8fafc;background:#080a12;border:1px solid rgba(167,139,250,.65);border-radius:18px;box-shadow:0 0 30px rgba(167,139,250,.28),0 16px 55px rgba(0,0,0,.55);overflow:hidden;}
      #nova-suno-lyrics-panel .nsr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;background:linear-gradient(120deg,#111827,#312e81 48%,#082f49);cursor:move;}
      #nova-suno-lyrics-panel.nsr-fx-on.nsr-part-lyrics .nsr-head{background:linear-gradient(120deg,hsl(var(--nsr-h1) 82% var(--nsr-head-l1,14%)),hsl(var(--nsr-h2) 78% var(--nsr-head-l2,16%)) 52%,hsl(var(--nsr-h3) 72% 16%));}
      #nova-suno-lyrics-panel .nsr-title{font-weight:900;letter-spacing:.2px;}
      #nova-suno-lyrics-panel .nsr-body{padding:12px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 110px);overflow:auto;}
      #nova-suno-lyrics-panel .nsr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      #nova-suno-lyrics-panel .nsr-card{background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.24);border-radius:14px;padding:10px;}
      #nova-suno-lyrics-panel .nsr-song-title{font-weight:900;font-size:15px;line-height:1.25;}
      #nova-suno-lyrics-panel .nsr-muted{font-size:11px;color:#aab5c7;line-height:1.35;}
      #nova-suno-lyrics-panel .nsr-prompt{max-height:calc(100vh - 260px);overflow:auto;white-space:pre-wrap;font-size:13px;line-height:1.55;color:#dbeafe;background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:12px;}
      #nova-suno-lyrics-panel.nsr-fx-on.nsr-part-lyrics .nsr-card,
      #nova-suno-lyrics-panel.nsr-fx-on.nsr-part-lyrics .nsr-prompt{border-color:hsla(var(--nsr-h1),96%,65%,var(--nsr-lyrics-border-a,.22));box-shadow:0 0 var(--nsr-progress-blur,6px) hsla(var(--nsr-h2),96%,62%,var(--nsr-lyrics-glow-a,.08));}
      #nova-suno-lyrics-panel .nsr-btn,
      #nova-suno-lyrics-panel .nsr-head button{border:1px solid rgba(56,189,248,.75);background:#151a29;color:#fff;border-radius:9px;padding:7px 9px;font-size:12px;font-weight:800;cursor:pointer;}
      #nova-suno-lyrics-panel .nsr-btn:hover,
      #nova-suno-lyrics-panel .nsr-head button:hover{background:#1f2a44;}
      #nova-suno-fx-panel,
      #nova-suno-fx-panel *{box-sizing:border-box;font-family:Verdana, Geneva, sans-serif;}
      #nova-suno-fx-panel{--nsr-react:0;--nsr-h1:188;--nsr-h2:264;--nsr-h3:322;position:fixed!important;right:18px;top:18px;width:360px;max-width:calc(100vw - 24px);z-index:2147483647!important;pointer-events:auto!important;color:#f8fafc;background:#080a12;border:1px solid rgba(56,189,248,.65);border-radius:18px;box-shadow:0 0 30px rgba(56,189,248,.24),0 16px 55px rgba(0,0,0,.55);overflow:hidden;}
      #nova-suno-fx-panel .nsr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;background:linear-gradient(120deg,#111827,#172554 42%,#083344);cursor:move;}
      #nova-suno-fx-panel .nsr-title{font-weight:900;letter-spacing:.2px;}
      #nova-suno-fx-panel .nsr-body{padding:12px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 90px);overflow:auto;}
      #nova-suno-fx-panel .nsr-card{background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.24);border-radius:14px;padding:10px;}
      #nova-suno-fx-panel .nsr-muted{font-size:11px;color:#aab5c7;line-height:1.35;}
      #nova-suno-fx-panel .nsr-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;}
      #nova-suno-fx-panel .nsr-btn,
      #nova-suno-fx-panel .nsr-head button{border:1px solid rgba(56,189,248,.75);background:#151a29;color:#fff;border-radius:9px;padding:7px 9px;font-size:12px;font-weight:800;cursor:pointer;}
      #nova-suno-fx-panel .nsr-btn.active{background:#0e7490;border-color:#67e8f9;}
      #nova-suno-fx-panel .nsr-section-title{font-weight:900;font-size:12px;color:#e0f2fe;margin-bottom:6px;}
    `;
    document.documentElement.appendChild(style);
  }

  function restorePosition(panel, storageKey = STORAGE.panelPos) {
    const pos = readJson(storageKey, null);
    if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
    panel.style.left = `${Math.max(8, Math.min(pos.left, window.innerWidth - 80))}px`;
    panel.style.top = `${Math.max(8, Math.min(pos.top, window.innerHeight - 40))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function makeDraggable(panel, handle, storageKey = STORAGE.panelPos) {
    handle.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      const clickedButton = event.target && event.target.closest ? event.target.closest('button') : null;
      if (clickedButton && clickedButton !== handle && clickedButton !== panel) return;
      const rect = panel.getBoundingClientRect();
      state.dragging = {
        panel,
        storageKey,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
      event.preventDefault();
    });

    window.addEventListener('mousemove', event => {
      if (!state.dragging || state.dragging.panel !== panel) return;
      if (Math.abs(event.clientX - state.dragging.startX) > 4 || Math.abs(event.clientY - state.dragging.startY) > 4) {
        state.dragging.moved = true;
      }
      const left = Math.max(8, Math.min(event.clientX - state.dragging.dx, window.innerWidth - panel.offsetWidth - 8));
      const top = Math.max(8, Math.min(event.clientY - state.dragging.dy, window.innerHeight - panel.offsetHeight - 8));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      if (!state.dragging || state.dragging.panel !== panel) return;
      const activeDrag = state.dragging;
      state.dragging = null;
      const rect = panel.getBoundingClientRect();
      writeJson(activeDrag.storageKey, { left: rect.left, top: rect.top });
      if (activeDrag.panel === state.orb && activeDrag.moved) {
        state.suppressOrbClick = true;
        setTimeout(() => { state.suppressOrbClick = false; }, 0);
      }
    });
  }

  function initUi() {
    if (state.ready || !document.body) return;
    state.ready = true;
    installStyles();

    const orb = document.createElement('button');
    orb.id = 'nova-suno-remote-orb';
    orb.type = 'button';
    orb.textContent = 'Nova Music';
    if (PRIME_MODE) orb.style.display = 'none';
    orb.addEventListener('click', () => {
      if (state.suppressOrbClick) {
        state.suppressOrbClick = false;
        return;
      }
      state.open = !state.open;
      GM_setValue(STORAGE.minimized, !state.open);
      render();
    });
    document.body.appendChild(orb);
    state.orb = orb;
    restorePosition(orb, STORAGE.orbPos);
    makeDraggable(orb, orb, STORAGE.orbPos);

    const panel = document.createElement('div');
    panel.id = 'nova-suno-remote-panel';
    panel.className = state.theme === 'rgb' ? 'nsr-theme-rgb' : '';
    panel.innerHTML = `
      <div class="nsr-head" id="nova-suno-remote-drag">
        <div class="nsr-title">Nova Suno Remote</div>
        <div class="nsr-row">
          <button type="button" data-nsr="fx-lab">RGB</button>
          <button type="button" data-nsr="hide">x</button>
        </div>
      </div>
      <div class="nsr-body" id="nova-suno-remote-body"></div>
    `;
    document.body.appendChild(panel);
    state.panel = panel;
    state.body = panel.querySelector('#nova-suno-remote-body');
    restorePosition(panel);
    makeDraggable(panel, panel.querySelector('#nova-suno-remote-drag'));

    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('input', onPanelInput);
    render();
    installSurvivalWatchdog();
    keepUiOnTop();
  }

  function ensureLyricsPanel() {
    if (state.lyricsPanel && state.lyricsBody) return;

    const panel = document.createElement('div');
    panel.id = 'nova-suno-lyrics-panel';
    panel.className = state.theme === 'rgb' ? 'nsr-theme-rgb' : '';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="nsr-head" id="nova-suno-lyrics-drag">
        <div class="nsr-title">Nova Lyrics Reader</div>
        <div class="nsr-row">
          <button type="button" data-nsr-lyrics="copy">Copy</button>
          <button type="button" data-nsr-lyrics="close">x</button>
        </div>
      </div>
      <div class="nsr-body" id="nova-suno-lyrics-body"></div>
    `;
    document.body.appendChild(panel);
    state.lyricsPanel = panel;
    state.lyricsBody = panel.querySelector('#nova-suno-lyrics-body');
    restorePosition(panel, STORAGE.lyricsPos);
    makeDraggable(panel, panel.querySelector('#nova-suno-lyrics-drag'), STORAGE.lyricsPos);
    panel.addEventListener('click', onLyricsPanelClick);
  }

  function openLyricsPanel() {
    ensureLyricsPanel();
    state.lyricsOpen = true;
    state.lyricsPanel.style.display = 'block';
    renderLyricsPanel();
    refreshFxVisuals();
    setStatus('Lyrics reader opened.');
  }

  function closeLyricsPanel() {
    state.lyricsOpen = false;
    if (state.lyricsPanel) state.lyricsPanel.style.display = 'none';
    render();
  }

  function renderLyricsPanel() {
    if (!state.lyricsOpen || !state.lyricsPanel || !state.lyricsBody) return;
    const clip = currentClip();
    const text = clip && clip.prompt
      ? formatLyricsText(clip.prompt)
      : 'No lyrics/prompt saved for this clip yet. If Suno returns true lyrics in another endpoint, Scout can catch it later.';

    state.lyricsPanel.classList.toggle('nsr-theme-rgb', state.theme === 'rgb');
    applyFxClasses();
    state.lyricsBody.innerHTML = `
      <div class="nsr-card">
        <div class="nsr-song-title">${esc(clip ? clip.title : 'No song loaded')}</div>
        <div class="nsr-muted">${esc(clip ? shortText([clip.model, clip.tags].filter(Boolean).join(' | '), 220) : 'Load your Suno library first')}</div>
      </div>
      <div class="nsr-prompt">${esc(text)}</div>
    `;
  }

  function onLyricsPanelClick(event) {
    const action = event.target && event.target.getAttribute('data-nsr-lyrics');
    if (!action) return;
    if (action === 'close') closeLyricsPanel();
    if (action === 'copy') copyCurrentPrompt();
  }

  function ensureFxPanel() {
    if (state.fxPanel && state.fxBody) return;

    const panel = document.createElement('div');
    panel.id = 'nova-suno-fx-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="nsr-head" id="nova-suno-fx-drag">
        <div class="nsr-title">Nova RGB Lab</div>
        <div class="nsr-row">
          <button type="button" data-nsr-fx="close">x</button>
        </div>
      </div>
      <div class="nsr-body" id="nova-suno-fx-body"></div>
    `;
    document.body.appendChild(panel);
    state.fxPanel = panel;
    state.fxBody = panel.querySelector('#nova-suno-fx-body');
    restorePosition(panel, STORAGE.fxPos);
    makeDraggable(panel, panel.querySelector('#nova-suno-fx-drag'), STORAGE.fxPos);
    panel.addEventListener('click', onFxPanelClick);
    applyFxClasses();
  }

  function openFxPanel() {
    ensureFxPanel();
    state.fxOpen = true;
    state.fxPanel.style.display = 'block';
    renderFxPanel();
    setStatus('RGB Lab opened.');
  }

  function closeFxPanel() {
    state.fxOpen = false;
    if (state.fxPanel) state.fxPanel.style.display = 'none';
    render();
  }

  function renderFxPanel() {
    if (!state.fxOpen || !state.fxPanel || !state.fxBody) return;
    applyFxClasses();
    const settings = state.fxSettings;
    state.fxBody.innerHTML = `
      <div class="nsr-card">
        <div class="nsr-section-title">Power</div>
        <div class="nsr-row">
          <button class="nsr-btn ${settings.enabled ? 'active' : ''}" data-nsr-fx-toggle="enabled">${settings.enabled ? 'Reactive On' : 'Reactive Off'}</button>
          <button class="nsr-btn ${state.theme === 'rgb' ? 'active' : ''}" data-nsr-fx-toggle="theme">RGB Theme</button>
        </div>
        <div class="nsr-muted">RGB Theme enables colour mode. Reactive On makes it move with the song.</div>
      </div>
      ${renderFxOptionGroup('Reaction Source', 'source', FX_OPTIONS.source)}
      ${renderFxOptionGroup('Color Style', 'palette', FX_OPTIONS.palette)}
      ${renderFxOptionGroup('Intensity', 'intensity', FX_OPTIONS.intensity)}
      <div class="nsr-card">
        <div class="nsr-section-title">React Parts</div>
        <div class="nsr-row">
          ${Object.keys(FX_DEFAULTS.parts).map(part => `
            <button class="nsr-btn ${fxPart(part) ? 'active' : ''}" data-nsr-fx-part="${esc(part)}">${esc(fxPartLabel(part))}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderFxOptionGroup(title, key, options) {
    return `
      <div class="nsr-card">
        <div class="nsr-section-title">${esc(title)}</div>
        <div class="nsr-row">
          ${options.map(([value, label]) => `
            <button class="nsr-btn ${state.fxSettings[key] === value ? 'active' : ''}" data-nsr-fx-set="${esc(key)}:${esc(value)}">${esc(label)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function fxPartLabel(part) {
    const labels = {
      panel: 'Panel',
      header: 'Header',
      buttons: 'Buttons',
      active: 'Active Song',
      progress: 'Progress',
      equalizer: 'Equalizer',
      orb: 'Orb',
      lyrics: 'Lyrics Glow'
    };
    return labels[part] || part;
  }

  function onFxPanelClick(event) {
    const action = event.target && event.target.getAttribute('data-nsr-fx');
    const toggle = event.target && event.target.getAttribute('data-nsr-fx-toggle');
    const set = event.target && event.target.getAttribute('data-nsr-fx-set');
    const part = event.target && event.target.getAttribute('data-nsr-fx-part');

    if (action === 'close') {
      closeFxPanel();
      return;
    }
    if (toggle === 'enabled') {
      state.fxSettings.enabled = !state.fxSettings.enabled;
      saveFxSettings();
    }
    if (toggle === 'theme') {
      state.theme = state.theme === 'rgb' ? 'steady' : 'rgb';
      GM_setValue(STORAGE.theme, state.theme);
    }
    if (set) {
      const [key, value] = set.split(':');
      if (key && value && Object.prototype.hasOwnProperty.call(state.fxSettings, key)) {
        state.fxSettings[key] = value;
        saveFxSettings();
      }
    }
    if (part && Object.prototype.hasOwnProperty.call(state.fxSettings.parts, part)) {
      state.fxSettings.parts[part] = !state.fxSettings.parts[part];
      saveFxSettings();
    }
    refreshFxVisuals();
    renderFxPanel();
    render();
  }

  function render() {
    if (!state.ready || !state.panel || !state.body) return;
    const savedScroll = rememberPanelScroll();
    applyFilter();
    state.panel.classList.toggle('nsr-hidden', !state.open);
    state.panel.classList.toggle('nsr-theme-rgb', state.theme === 'rgb');
    applyFxClasses();

    const audio = state.audio;
    const clip = currentClip();
    const playing = audio && !audio.paused;
    const duration = audio && Number.isFinite(audio.duration) ? audio.duration : (clip && clip.duration) || 0;
    const currentTime = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const pct = duration ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

    state.body.innerHTML = `
      <div class="nsr-card nsr-now">
        ${clip && clip.imageUrl ? `<img class="nsr-cover" src="${esc(clip.imageUrl)}" alt="">` : '<div class="nsr-cover"></div>'}
        <div>
          <div class="nsr-song-title">${esc(clip ? clip.title : 'No song loaded')}</div>
          <div class="nsr-muted">${esc(clip ? shortText([clip.model, clip.tags].filter(Boolean).join(' | '), 180) : 'Load your Suno library first')}</div>
          <div class="nsr-progress"><div data-nsr-progress="1" style="width:${pct}%"></div></div>
          <div class="nsr-muted" data-nsr-time="1">${formatTime(currentTime)} / ${formatTime(duration)} ${playing ? '<span class="nsr-good">playing</span>' : '<span>paused</span>'}</div>
          <div class="nsr-viz" aria-hidden="true"><canvas class="nsr-holo-ripple" data-nsr-holo-ripple="1"></canvas></div>
        </div>
      </div>

      <div class="nsr-row">
        <button class="nsr-btn" data-nsr="prev">Prev</button>
        <button class="nsr-btn" data-nsr="play" data-nsr-main-play="1">${playing ? 'Pause' : 'Play'}</button>
        <button class="nsr-btn" data-nsr="next">Next</button>
        <button class="nsr-btn" data-nsr="shuffle">Shuffle</button>
      </div>

      <div class="nsr-row">
        <button class="nsr-btn" data-nsr="load-direct" ${state.busy ? 'disabled' : ''}>Load Direct</button>
        <button class="nsr-btn" data-nsr="prime">Prime Quick</button>
        <button class="nsr-btn" data-nsr="prime-full">Prime Full</button>
        <button class="nsr-btn" data-nsr="open-me">Open Me</button>
      </div>

      <div class="nsr-tabs">
        <button class="nsr-btn ${state.view === 'library' ? 'active' : ''}" data-nsr-view="library">Library</button>
        <button class="nsr-btn ${state.lyricsOpen ? 'active' : ''}" data-nsr="lyrics-window">Lyrics</button>
        <button class="nsr-btn ${state.view === 'debug' ? 'active' : ''}" data-nsr-view="debug">Debug</button>
      </div>

      <div class="nsr-status" data-nsr-status="1">${esc(state.status)}</div>
      ${renderView()}
    `;
    if (state.lyricsOpen) renderLyricsPanel();
    if (state.fxOpen) renderFxPanel();
    restorePanelScroll(savedScroll);
  }

  function renderView() {
    if (state.view === 'lyrics') return renderLyrics();
    if (state.view === 'debug') return renderDebug();
    return renderLibrary();
  }

  function renderLibrary() {
    const list = state.filtered.length ? state.filtered : state.library;
    const items = list.map((clip, idx) => `
      <div class="nsr-item ${idx === state.index ? 'active' : ''}">
        ${clip.imageUrl ? `<img class="nsr-thumb" src="${esc(clip.imageUrl)}" alt="">` : '<div class="nsr-thumb"></div>'}
        <div>
          <div class="nsr-song-title">${esc(clip.title)}</div>
          <div class="nsr-muted">${esc(shortText([clip.model, clip.tags].filter(Boolean).join(' | ') || clip.createdAt || clip.source, 120))}</div>
        </div>
        <button class="nsr-btn" data-nsr-play-index="${idx}">Play</button>
      </div>
    `).join('');

    return `
      <input class="nsr-search" data-nsr-search="1" value="${esc(state.query)}" placeholder="Search saved Suno songs...">
      <div class="nsr-muted">${state.library.length} saved | ${list.length} visible</div>
      <div class="nsr-list" data-nsr-list="1">${items || '<div class="nsr-muted">No songs saved yet. Try Load Direct. If that fails, Prime Suno.</div>'}</div>
    `;
  }

  function renderLyrics() {
    const clip = currentClip();
    const text = clip && clip.prompt ? clip.prompt : 'No lyrics/prompt saved for this clip yet. If Suno returns lyrics in another endpoint, Scout can catch it later.';
    return `
      <div class="nsr-card">
        <div class="nsr-row">
          <button class="nsr-btn" data-nsr="copy-prompt" ${clip && clip.prompt ? '' : 'disabled'}>Copy Text</button>
        </div>
        <div class="nsr-prompt">${esc(text)}</div>
      </div>
    `;
  }

  function renderDebug() {
    const userId = clean(GM_getValue(STORAGE.userId, ''));
    const lastPrime = Number(GM_getValue(STORAGE.lastPrimeAt, '0')) || 0;
    const recipes = readRecipes();
    const owner = readJson(STORAGE.playOwner, null);
    return `
      <div class="nsr-card">
        <div class="nsr-muted">Version: ${esc(VERSION)}</div>
        <div class="nsr-muted">Running on Suno: ${IS_SUNO ? 'yes' : 'no'}</div>
        <div class="nsr-muted">Prime mode: ${PRIME_MODE ? 'yes' : 'no'}</div>
        <div class="nsr-muted">Saved clips: ${state.library.length}</div>
        <div class="nsr-muted">Saved feed recipes: ${recipes.length}</div>
        <div class="nsr-muted">Blob cached tracks: ${state.blobUrls.size}</div>
        <div class="nsr-muted">Audio RGB: ${esc(state.audioFx ? state.audioFx.mode : 'off')}</div>
        <div class="nsr-muted">RGB Lab: ${esc(state.fxSettings.source)} / ${esc(state.fxSettings.palette)} / ${esc(state.fxSettings.intensity)}</div>
        <div class="nsr-muted">Saved user id: ${userId ? 'yes' : 'no'}</div>
        <div class="nsr-muted">Last prime: ${lastPrime ? new Date(lastPrime).toLocaleString() : 'never'}</div>
        <div class="nsr-muted">Direct last error: ${esc(state.directLastError || '-')}</div>
        <div class="nsr-muted">Audio last error: ${esc(state.lastAudioError || '-')}</div>
        <div class="nsr-muted">Last play mode: ${esc(state.lastPlayDebug && state.lastPlayDebug.mode || '-')}</div>
        <div class="nsr-muted">Last audio host: ${esc(state.lastPlayDebug && state.lastPlayDebug.audioHost || '-')}</div>
        <div class="nsr-muted">This tab owns audio: ${owner && owner.tabId === TAB_ID ? 'yes' : 'no'}</div>
        <div class="nsr-muted">Audio owner: ${esc(owner && owner.title || '-')}</div>
        <div class="nsr-muted">Bootstrap: ${state.bootstrap.registered ? `registered with ${esc(state.bootstrap.host)}` : 'standalone'}</div>
        <div class="nsr-row" style="margin-top:8px;">
          <button class="nsr-btn" data-nsr="copy-debug">Copy Debug</button>
          <button class="nsr-btn" data-nsr="clear">Clear Saved</button>
        </div>
      </div>
    `;
  }

  function onPanelClick(event) {
    const action = event.target && event.target.getAttribute('data-nsr');
    const view = event.target && event.target.getAttribute('data-nsr-view');
    const playIndexAttr = event.target && event.target.getAttribute('data-nsr-play-index');

    if (view) {
      state.view = view;
      render();
      return;
    }

    if (playIndexAttr != null) {
      playIndex(Number(playIndexAttr) || 0);
      return;
    }

    if (!action) return;

    if (action === 'hide') {
      state.open = false;
      GM_setValue(STORAGE.minimized, true);
      render();
    }
    if (action === 'fx-lab') openFxPanel();
    if (action === 'load-direct') loadDirect(2);
    if (action === 'prime') openPrimeWindow('quick');
    if (action === 'prime-full') openPrimeWindow('full');
    if (action === 'open-me') window.open('https://suno.com/me', '_blank', 'noopener,noreferrer');
    if (action === 'prev') playPrev();
    if (action === 'play') togglePlay();
    if (action === 'next') playNext();
    if (action === 'shuffle') shufflePlay();
    if (action === 'lyrics-window') openLyricsPanel();
    if (action === 'clear') clearSaved();
    if (action === 'copy-prompt') copyCurrentPrompt();
    if (action === 'copy-debug') copyDebug();
  }

  function onPanelInput(event) {
    if (event.target && event.target.hasAttribute('data-nsr-search')) {
      state.query = event.target.value || '';
      applyFilter();
      render();
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = String(text || '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function copyCurrentPrompt() {
    const clip = currentClip();
    copyText(clip && clip.prompt ? clip.prompt : '').then(() => setStatus('Copied text.'));
  }

  function shortText(value, limit) {
    const text = clean(value);
    if (!text || text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 3))}...`;
  }

  function formatLyricsText(value) {
    let text = String(value == null ? '' : value).replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    text = text.replace(/\s*(\[(?:Intro|Verse|Pre[- ]?Chorus|Chorus|Hook|Bridge|Breakdown|Outro|Post[- ]?Chorus)[^\]]*\])\s*/gi, '\n\n$1\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  function copyDebug() {
    const payload = {
      tool: 'Nova Suno Remote Any Page',
      version: VERSION,
      page: location.href,
      isSuno: IS_SUNO,
      primeMode: PRIME_MODE,
      savedClips: state.library.length,
      savedFeedRecipes: readRecipes().length,
      blobCachedTracks: state.blobUrls.size,
      audioRgbMode: state.audioFx ? state.audioFx.mode : 'off',
      rgbLab: state.fxSettings,
      hasUserId: Boolean(clean(GM_getValue(STORAGE.userId, ''))),
      lastPrimeAt: GM_getValue(STORAGE.lastPrimeAt, ''),
      directLastError: state.directLastError,
      lastAudioError: state.lastAudioError,
      lastPlayDebug: state.lastPlayDebug,
      audioElement: audioElementSnapshot(),
      tabId: TAB_ID,
      activeAudioOwner: readJson(STORAGE.playOwner, null),
      bootstrap: state.bootstrap,
      currentClip: currentClip() ? {
        title: currentClip().title,
        hasAudioUrl: Boolean(currentClip().audioUrl),
        hasPrompt: Boolean(currentClip().prompt),
        model: currentClip().model
      } : null
    };
    copyText(JSON.stringify(payload, null, 2)).then(() => setStatus('Debug copied.'));
  }

  function audioElementSnapshot() {
    const audio = state.audio;
    if (!audio) return null;
    return {
      srcKind: audio.src ? (audio.src.startsWith('blob:') ? 'blob' : 'direct') : 'none',
      paused: audio.paused,
      muted: audio.muted,
      volume: audio.volume,
      currentTime: Number.isFinite(audio.currentTime) ? Number(audio.currentTime.toFixed(2)) : null,
      duration: Number.isFinite(audio.duration) ? Number(audio.duration.toFixed(2)) : null,
      readyState: audio.readyState,
      networkState: audio.networkState,
      errorCode: audio.error ? audio.error.code : null
    };
  }

  function createPrimeHud() {
    if (!PRIME_MODE || primeHud || !document.body) return;
    primeHud = document.createElement('div');
    primeHud.id = 'nova-suno-prime-hud';
    primeHud.style.cssText = 'position:fixed!important;left:8px!important;top:8px!important;z-index:2147483647!important;max-width:330px;background:#08111f;color:#e0f2fe;border:1px solid #22d3ee;border-radius:12px;padding:9px 11px;font:700 12px Verdana;box-shadow:0 0 22px rgba(34,211,238,.35);pointer-events:auto;';
    document.body.appendChild(primeHud);
    updatePrimeHud(PRIME_FULL_MODE ? 'Prime Full starting...' : 'Prime Quick listening...');
  }

  function updatePrimeHud(text) {
    if (!primeHud) createPrimeHud();
    if (!primeHud) return;
    primeHud.textContent = text;
  }

  function writePrimeStatus(status) {
    writeJson(STORAGE.primeStatus, {
      mode: PRIME_FULL_MODE ? 'full' : 'quick',
      state: status.state || 'capture',
      savedCount: Number(status.savedCount || 0) || state.library.length,
      lastBatch: primeFullLastBatch,
      hasMore: !primeFullNoMore,
      done: Boolean(status.done),
      reason: status.reason || '',
      at: Date.now()
    });
  }

  function startPrimeFullCapture() {
    if (!PRIME_FULL_MODE || primeFullTimer) return;
    primeFullStartedAt = Date.now();
    primeFullLastCaptureAt = Date.now();
    primeFullLastSavedCount = state.library.length;
    primeFullLastBatch = 0;
    primeFullNoMore = false;
    writePrimeStatus({ state: 'scrolling' });
    updatePrimeHud(`Prime Full: scrolling. Saved ${state.library.length}.`);

    primeFullTimer = setInterval(() => {
      const savedCount = readLibrary().length;
      state.library = readLibrary();
      if (savedCount > primeFullLastSavedCount) {
        primeFullLastSavedCount = savedCount;
        primeFullLastCaptureAt = Date.now();
      }

      const moved = scrollSunoLibrary();
      const idleMs = Date.now() - primeFullLastCaptureAt;
      const elapsedMs = Date.now() - primeFullStartedAt;
      updatePrimeHud(`Prime Full: ${savedCount} saved | batch ${primeFullLastBatch || '-'} | ${moved ? 'scrolling' : 'waiting'}`);
      writePrimeStatus({ state: moved ? 'scrolling' : 'waiting', savedCount });

      if (primeFullNoMore && idleMs > 2500) {
        finishPrimeFullCapture('Suno says no more pages.');
        return;
      }
      if (elapsedMs > 15000 && idleMs > 12000) {
        finishPrimeFullCapture('No new songs after waiting.');
        return;
      }
      if (elapsedMs > 210000) {
        finishPrimeFullCapture('Safety timeout.');
      }
    }, 900);
  }

  function finishPrimeFullCapture(reason) {
    if (primeFullTimer) {
      clearInterval(primeFullTimer);
      primeFullTimer = null;
    }
    state.library = readLibrary();
    writePrimeStatus({ state: 'done', done: true, reason });
    updatePrimeHud(`Prime Full done. Saved ${state.library.length}. ${reason}`);
    GM_setValue(STORAGE.lastPrimeAt, String(Date.now()));
    clearTimeout(primeCloseTimer);
    primeCloseTimer = setTimeout(() => {
      try { window.close(); } catch (_) { /* ignored */ }
    }, 4500);
  }

  function scrollSunoLibrary() {
    let moved = false;
    const beforeY = window.scrollY || document.documentElement.scrollTop || 0;
    window.scrollBy(0, Math.max(360, Math.floor(window.innerHeight * 0.8)));
    const afterY = window.scrollY || document.documentElement.scrollTop || 0;
    if (afterY !== beforeY) moved = true;

    const nodes = Array.from(document.querySelectorAll('main, [role="main"], section, div'))
      .filter(node => node && node.scrollHeight > node.clientHeight + 120)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))
      .slice(0, 6);

    for (const node of nodes) {
      const before = node.scrollTop;
      node.scrollTop = Math.min(node.scrollHeight, node.scrollTop + Math.max(320, Math.floor(node.clientHeight * 0.8)));
      if (node.scrollTop !== before) moved = true;
    }

    return moved;
  }

  function setupSunoCapture() {
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!pageWindow || pageWindow.__novaSunoRemoteCaptureInstalled) return;
    pageWindow.__novaSunoRemoteCaptureInstalled = true;

    const maybeCapture = async (url, responsePromise, bodyPromise) => {
      const textUrl = String(url || '');
      if (!/studio-api-prod\.suno\.com\/api\/(unified\/feed|feed\/v3|project\/default|project\/default\/pinned-clips)/i.test(textUrl)) return;
      try {
        if (/studio-api-prod\.suno\.com\/api\/(unified\/feed|feed\/v3)/i.test(textUrl) && bodyPromise) {
          bodyPromise.then(body => saveRecipeFromText(textUrl, body)).catch(() => {});
        }

        const response = await responsePromise;
        const clone = response && response.clone ? response.clone() : null;
        if (!clone) return;
        const data = await clone.json();
        captureSunoPayload(textUrl, data);
      } catch (_) {
        // Keep capture silent. We do not want to break Suno if a response is not JSON.
      }
    };

    const originalFetch = pageWindow.fetch;
    if (typeof originalFetch === 'function') {
      pageWindow.fetch = function novaSunoRemoteFetch(input, init) {
        const url = typeof input === 'string' ? input : input && input.url;
        const result = originalFetch.apply(this, arguments);
        maybeCapture(url, result, fetchBodyText(input, init));
        return result;
      };
    }

    const originalOpen = pageWindow.XMLHttpRequest && pageWindow.XMLHttpRequest.prototype.open;
    const originalSend = pageWindow.XMLHttpRequest && pageWindow.XMLHttpRequest.prototype.send;
    if (originalOpen && originalSend) {
      pageWindow.XMLHttpRequest.prototype.open = function novaSunoRemoteXhrOpen(method, url) {
        this.__novaSunoRemoteUrl = url;
        return originalOpen.apply(this, arguments);
      };
      pageWindow.XMLHttpRequest.prototype.send = function novaSunoRemoteXhrSend() {
        const xhr = this;
        const url = xhr.__novaSunoRemoteUrl;
        const bodyText = xhrBodyText(arguments[0]);
        if (/studio-api-prod\.suno\.com\/api\/(unified\/feed|feed\/v3)/i.test(String(url || ''))) {
          saveRecipeFromText(String(url || ''), bodyText);
        }
        if (/studio-api-prod\.suno\.com\/api\/(unified\/feed|feed\/v3|project\/default|project\/default\/pinned-clips)/i.test(String(url || ''))) {
          xhr.addEventListener('load', () => {
            try {
              const data = JSON.parse(xhr.responseText || '{}');
              captureSunoPayload(String(url || ''), data);
            } catch (_) {
              // silent
            }
          });
        }
        return originalSend.apply(this, arguments);
      };
    }

    if (PRIME_MODE) {
      setTimeout(() => {
        if (document.body) {
          createPrimeHud();
          writePrimeStatus({ state: PRIME_FULL_MODE ? 'scrolling' : 'listening', savedCount: state.library.length });
          if (PRIME_FULL_MODE) startPrimeFullCapture();
        }
      }, 1000);
    }
  }

  async function fetchBodyText(input, init) {
    try {
      if (init && init.body != null) return bodyToText(init.body);
      if (input && typeof input.clone === 'function') return await input.clone().text();
    } catch (_) {
      return '';
    }
    return '';
  }

  function xhrBodyText(body) {
    try {
      return bodyToText(body);
    } catch (_) {
      return '';
    }
  }

  function bodyToText(body) {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) return '';
    if (body instanceof Blob) return '';
    if (typeof body === 'object') return JSON.stringify(body);
    return String(body || '');
  }

  function saveRecipeFromText(url, bodyText) {
    if (!bodyText || typeof bodyText !== 'string') return;
    try {
      const body = JSON.parse(bodyText);
      saveRecipe(url, body);
    } catch (_) {
      // Not JSON, not useful for Suno feed replay.
    }
  }

  function captureSunoPayload(url, data) {
    if (!data || typeof data !== 'object') return;
    const clips = extractClipsFromPayload(data);
    if (!clips.length) return;

    const added = mergeClips(clips, `capture:${url.replace(/^https?:\/\//i, '').split('?')[0]}`);
    if (PRIME_MODE) {
      primeFullLastBatch = clips.length;
      primeFullLastCaptureAt = Date.now();
      primeFullLastSavedCount = state.library.length;
      if (data.has_more === false) primeFullNoMore = true;
      GM_setValue(STORAGE.lastPrimeAt, String(Date.now()));
      writePrimeStatus({ state: PRIME_FULL_MODE ? 'capturing' : 'captured', savedCount: state.library.length });
      updatePrimeHud(`${PRIME_FULL_MODE ? 'Prime Full' : 'Prime Quick'}: saved ${state.library.length}, batch ${clips.length}${data.has_more === false ? ', final page' : ''}.`);
      if (PRIME_FULL_MODE) {
        if (data.has_more === false) {
          setTimeout(() => finishPrimeFullCapture('Final feed page captured.'), 1600);
        }
      } else {
        schedulePrimeClose(added);
      }
    }
  }

  function schedulePrimeClose() {
    clearTimeout(primeCloseTimer);
    primeCloseTimer = setTimeout(() => {
      try { window.close(); } catch (_) { /* ignored */ }
    }, 6500);
  }

  function boot() {
    if (IS_SUNO) setupSunoCapture();

    registerMenu();

    const ready = () => {
      if (document.body) initUi();
    };

    ready();
    document.addEventListener('DOMContentLoaded', ready, { once: true });
    window.addEventListener('load', ready, { once: true });

    bootTimer = setInterval(() => {
      bootAttempts++;
      ready();
      if (state.ready || bootAttempts >= 80) clearInterval(bootTimer);
    }, 250);
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    try {
      GM_registerMenuCommand('Nova Suno Remote: Show', () => {
        state.open = true;
        GM_setValue(STORAGE.minimized, false);
        initUi();
        keepUiOnTop();
        render();
      });
      GM_registerMenuCommand('Nova Suno Remote: Prime Full Capture', () => {
        openPrimeWindow('full');
      });
      GM_registerMenuCommand('Nova Suno Remote: Open RGB Lab', () => {
        initUi();
        openFxPanel();
      });
      GM_registerMenuCommand('Nova Suno Remote: Reset Position', () => {
        GM_setValue(STORAGE.panelPos, '');
        GM_setValue(STORAGE.orbPos, '');
        state.open = true;
        GM_setValue(STORAGE.minimized, false);
        if (state.panel) {
          state.panel.style.left = '';
          state.panel.style.top = '';
          state.panel.style.right = '18px';
          state.panel.style.bottom = '132px';
        }
        if (state.orb) {
          state.orb.style.left = '';
          state.orb.style.top = '';
          state.orb.style.right = '18px';
          state.orb.style.bottom = '88px';
        }
        initUi();
        keepUiOnTop();
        render();
      });
      GM_registerMenuCommand('Nova Suno Remote: Copy Debug', () => {
        initUi();
        copyDebug();
      });
    } catch (_) {
      // Menu registration is optional.
    }
  }

  function startBootstrapRegistration() {
    if (PRIME_MODE || document.documentElement?.hasAttribute('data-nova-manifest')) return;
    const attempt = () => {
      bootstrapAttempts++;
      if (registerWithBootstrap()) {
        clearInterval(bootstrapTimer);
        bootstrapTimer = null;
        return;
      }
      if (bootstrapAttempts >= 40) {
        clearInterval(bootstrapTimer);
        bootstrapTimer = null;
      }
    };
    attempt();
    if (!state.bootstrap.registered) bootstrapTimer = setInterval(attempt, 500);
  }

  function registerWithBootstrap() {
    const root = getUnsafeRoot();
    const api = window.NovaSunoRemoteAnyPage;
    if (!api) return false;

    const core = root.NovaCore || window.NovaCore || root.NovaWorkHub || window.NovaWorkHub;
    if (!core) return false;

    const moduleApi = {
      id: 'suno-remote',
      name: 'Nova Suno Remote',
      version: VERSION,
      category: 'Personal',
      kind: 'player',
      show: api.show,
      hide: api.hide,
      toggle: () => {
        if (state.open) api.hide();
        else api.show();
      },
      prime: api.prime,
      primeFull: api.primeFull,
      rgbLab: api.rgbLab,
      debug: api.debug
    };

    try {
      if (typeof core.registerModule === 'function') {
        core.registerModule(moduleApi.id, moduleApi);
      } else {
        core.modules = core.modules || {};
        core.modules[moduleApi.id] = moduleApi;
      }
      state.bootstrap = {
        registered: true,
        host: core.name || (core === root.NovaCore || core === window.NovaCore ? 'NovaCore' : 'NovaWorkHub')
      };
      return true;
    } catch (_) {
      return false;
    }
  }

  function getUnsafeRoot() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
    } catch (_) {
      // ignored
    }
    return window;
  }

  boot();

  window.NovaSunoRemoteAnyPage = {
    version: VERSION,
    loadDirect,
    prime: () => openPrimeWindow('quick'),
    primeFull: () => openPrimeWindow('full'),
    rgbLab: openFxPanel,
    rescue: keepUiOnTop,
    show: () => { state.open = true; GM_setValue(STORAGE.minimized, false); initUi(); keepUiOnTop(); render(); },
    hide: () => { state.open = false; GM_setValue(STORAGE.minimized, true); render(); },
    resetPosition: () => { GM_setValue(STORAGE.panelPos, ''); GM_setValue(STORAGE.orbPos, ''); location.reload(); },
    debug: () => ({
      version: VERSION,
      href: location.href,
      ready: state.ready,
      hasBody: Boolean(document.body),
      hasOrb: Boolean(document.getElementById('nova-suno-remote-orb')),
      hasPanel: Boolean(document.getElementById('nova-suno-remote-panel')),
      open: state.open,
      savedClips: state.library.length,
      rgbLab: state.fxSettings,
      bootAttempts
    })
  };

  try {
    if (typeof unsafeWindow !== 'undefined') {
      unsafeWindow.NovaSunoRemoteAnyPage = window.NovaSunoRemoteAnyPage;
    }
  } catch (_) {
    // ignored
  }

  startBootstrapRegistration();
})();
