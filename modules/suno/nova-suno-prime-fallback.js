// modules/suno/nova-suno-prime-fallback.js

(function () {
  'use strict';

  if (window.NovaSunoPrimeFallback) return;

  const VERSION = '0.1.0';
  const API = 'https://studio-api-prod.suno.com';
  const PARAM = 'nova_suno_prime';
  const MODE = new URLSearchParams(location.search).get(PARAM) || '';
  const IS_SUNO = location.hostname === 'suno.com' || location.hostname.endsWith('.suno.com');
  const ACTIVE = IS_SUNO && Boolean(MODE);

  const STORAGE = {
    library: 'nova_suno_remote_library_v1',
    userId: 'nova_suno_remote_user_id_v1',
    lastPrimeAt: 'nova_suno_remote_last_prime_at_v1',
    primeStatus: 'nova_suno_remote_prime_status_v1'
  };

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

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function extract(data) {
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

  function mediaUrl(raw) {
    const urls = raw && raw.media_urls;
    if (!Array.isArray(urls)) return '';
    const direct = urls.find(item => typeof item === 'string' && /^https?:\/\//i.test(item));
    if (direct) return direct;
    const nested = urls.find(item => item && typeof item === 'object' && item.url);
    return nested ? nested.url : '';
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.content_item && typeof raw.content_item === 'object') raw = raw.content_item;
    if (raw.clip && typeof raw.clip === 'object') raw = raw.clip;

    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const id = clean(raw.id || raw.clip_id || raw.clipId || raw.song_id || raw.songId || raw.audio_url || raw.audioUrl);
    const audioUrl = clean(raw.audio_url || raw.audioUrl || raw.audio || mediaUrl(raw));
    if (!id || !audioUrl) return null;

    return {
      id,
      title: clean(raw.title || metadata.title || 'Untitled Suno'),
      audioUrl,
      imageUrl: clean(raw.image_large_url || raw.image_url || raw.imageUrl || ''),
      createdAt: clean(raw.created_at || raw.createdAt || ''),
      model: clean(raw.major_model_version || raw.model_name || metadata.model_name || ''),
      tags: clean(metadata.tags || raw.display_tags || raw.tags || ''),
      prompt: String(metadata.prompt || metadata.gpt_description_prompt || raw.prompt || raw.lyrics || '').trim(),
      duration: Number(metadata.duration || raw.duration || 0) || 0,
      liked: Boolean(raw.is_liked || raw.liked),
      public: Boolean(raw.is_public),
      source: 'prime-active-fallback'
    };
  }

  function merge(rawClips) {
    const existing = readJson(STORAGE.library, []);
    const byId = new Map();
    for (const clip of Array.isArray(existing) ? existing : []) {
      if (clip && clip.id && clip.audioUrl) byId.set(clip.id, clip);
    }

    let added = 0;
    for (const raw of rawClips || []) {
      const clip = normalize(raw);
      if (!clip) continue;
      if (!byId.has(clip.id)) added += 1;
      byId.set(clip.id, { ...(byId.get(clip.id) || {}), ...clip });

      const userId = clean(raw && (raw.user_id || raw.userId || raw.user && raw.user.id));
      if (/^[0-9a-f-]{32,}$/i.test(userId)) GM_setValue(STORAGE.userId, userId);
    }

    const library = [...byId.values()]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 400);

    writeJson(STORAGE.library, library);
    GM_setValue(STORAGE.lastPrimeAt, String(Date.now()));
    return { added, total: library.length };
  }

  function request(body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${API}/api/feed/v3`,
        anonymous: false,
        withCredentials: true,
        timeout: 20000,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          Origin: 'https://suno.com',
          Referer: 'https://suno.com/'
        },
        data: JSON.stringify(body),
        onload(response) {
          const status = Number(response && response.status || 0);
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status || 'ERR'}`));
            return;
          }
          try {
            resolve(JSON.parse(response.responseText || '{}'));
          } catch (_) {
            reject(new Error('Invalid JSON'));
          }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout'))
      });
    });
  }

  function bodies(cursor) {
    const userId = clean(GM_getValue(STORAGE.userId, ''));
    const base = {
      disliked: 'false',
      trashed: 'false',
      fromStudioProject: { presence: 'false' },
      stem: { presence: 'false' }
    };
    const out = [];
    if (userId) {
      out.push({ cursor: cursor || null, limit: 20, filters: { ...base, user: { presence: 'true', userId } } });
    }
    out.push({ cursor: cursor || null, limit: 20, filters: { ...base, user: { presence: 'false' } } });
    out.push({ cursor: cursor || null, limit: 20, filters: base });
    out.push({ cursor: cursor || null, limit: 20, filters: {} });
    return out;
  }

  function hud(text) {
    let node = document.getElementById('nova-suno-prime-hud');
    if (!node) {
      node = document.createElement('div');
      node.id = 'nova-suno-prime-hud';
      node.style.cssText = 'position:fixed!important;left:8px!important;top:8px!important;z-index:2147483647!important;max-width:340px;background:#08111f;color:#e0f2fe;border:1px solid #22d3ee;border-radius:12px;padding:9px 11px;font:700 12px Verdana;box-shadow:0 0 22px rgba(34,211,238,.35);pointer-events:auto;';
      (document.body || document.documentElement).appendChild(node);
    }
    node.textContent = text;
  }

  function status(state, extra = {}) {
    writeJson(STORAGE.primeStatus, {
      mode: MODE === 'full' ? 'full' : 'quick',
      state,
      savedCount: Number(extra.savedCount || 0),
      lastBatch: Number(extra.lastBatch || 0),
      done: Boolean(extra.done),
      reason: extra.reason || '',
      at: Date.now()
    });
  }

  async function run() {
    if (!ACTIVE) return false;

    hud('Prime active fallback starting...');
    status('active-fallback');

    let cursor = null;
    let pages = 0;
    let captured = 0;
    let lastError = null;
    const maxPages = MODE === 'full' ? 20 : 1;

    while (pages < maxPages) {
      let payload = null;
      for (const body of bodies(cursor)) {
        try {
          const candidate = await request(body);
          const clips = extract(candidate);
          if (clips.length) {
            payload = candidate;
            const result = merge(clips);
            captured += clips.length;
            hud(`Prime ${MODE === 'full' ? 'Full' : 'Quick'}: ${result.total} saved, batch ${clips.length}.`);
            status('capturing', { savedCount: result.total, lastBatch: clips.length });
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (!payload) break;
      pages += 1;
      cursor = payload.next_cursor || null;
      if (MODE !== 'full' || payload.has_more === false || !cursor) break;
    }

    const total = readJson(STORAGE.library, []).length;
    if (captured > 0) {
      status('done', { savedCount: total, lastBatch: captured, done: true, reason: 'Active Suno API fallback completed.' });
      hud(`Prime done. ${total} songs saved.`);
      setTimeout(() => { try { window.close(); } catch (_) {} }, 3200);
      return true;
    }

    const reason = lastError ? String(lastError.message || lastError) : 'No clips returned';
    status('failed', { savedCount: total, done: false, reason });
    hud(`Prime fallback failed: ${reason}`);
    console.warn('[Nova Suno Prime Fallback]', reason);
    return false;
  }

  window.NovaSunoPrimeFallback = {
    version: VERSION,
    active: ACTIVE,
    run
  };

  if (ACTIVE) {
    const start = () => setTimeout(run, 1200);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
