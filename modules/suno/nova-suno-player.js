// modules/suno/nova-suno-player.js

(function () {
  'use strict';

  if (window.NovaSunoPlayer) return;

  const VERSION = '0.6.1-safe-transport';
  const PANEL_ID = 'nova-suno-player';
  const STYLE_ID = 'nova-suno-player-style';
  const POS_KEY = 'nova.suno.player.position';
  const LIBRARY_KEY = 'nova.suno.library.v2';
  const VIEW_KEY = 'nova.suno.view';
  const MAX_LIBRARY = 150;

  const state = {
    panel: null,
    visible: true,
    minimized: false,
    view: readStored(VIEW_KEY, 'player'),
    audio: null,
    lastTitle: '',
    status: 'Ready. This version avoids random page play buttons.',
    timer: null,
    lyrics: [],
    library: loadLibrary(),
    lastDebug: null
  };

  function onSuno() {
    return location.hostname === 'suno.com' || location.hostname.endsWith('.suno.com');
  }

  function safeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readStored(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (error) { return fallback; }
  }

  function writeStored(key, value) {
    try { localStorage.setItem(key, value); }
    catch (error) {}
  }

  function loadLibrary() {
    try {
      const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  function saveLibrary() {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(state.library.slice(0, MAX_LIBRARY))); }
    catch (error) {}
  }

  function emit(type, summary, data) {
    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({ module: 'suno-player', type, summary, data: data || {} });
    }
  }

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return Boolean((rect.width || rect.height) && style.visibility !== 'hidden' && style.display !== 'none');
  }

  function writeClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function findAudio() {
    const audios = Array.from(document.querySelectorAll('audio')).filter((audio) => audio && typeof audio.play === 'function');
    if (!audios.length) return null;
    return audios.find((audio) => !audio.paused && (audio.currentSrc || audio.src)) ||
      audios.find((audio) => Number.isFinite(audio.duration) && audio.duration > 0) ||
      audios.find((audio) => audio.currentSrc || audio.src) ||
      audios[0] || null;
  }

  function buttonName(button) {
    return safeText([
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-testid'),
      button.textContent
    ].filter(Boolean).join(' '));
  }

  function bottomButtons() {
    const minTop = Math.max(0, window.innerHeight - 150);
    return Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter((button) => visible(button) && !button.disabled)
      .map((button) => ({ button, rect: button.getBoundingClientRect(), name: buttonName(button).toLowerCase() }))
      .filter((item) => item.rect.top >= minTop || item.rect.bottom >= window.innerHeight - 110);
  }

  function scoreTransport(item, action) {
    const centerX = item.rect.left + item.rect.width / 2;
    const centerY = item.rect.top + item.rect.height / 2;
    const playerY = window.innerHeight - 42;
    const pageCenter = window.innerWidth / 2;
    const nearBottom = Math.max(0, 120 - Math.abs(centerY - playerY));
    let targetX = pageCenter;

    if (action === 'previous') targetX = pageCenter - 42;
    if (action === 'next') targetX = pageCenter + 42;
    if (action === 'shuffle') targetX = pageCenter - 112;

    const nearX = Math.max(0, 160 - Math.abs(centerX - targetX));
    let label = 0;
    if (action === 'play' && /(play|pause|resume)/i.test(item.name)) label += 300;
    if (action === 'previous' && /(previous|prev|back|skip back)/i.test(item.name)) label += 300;
    if (action === 'next' && /(next|forward|skip forward)/i.test(item.name)) label += 300;
    if (action === 'shuffle' && /shuffle/i.test(item.name)) label += 300;
    if (action === 'play' && item.rect.width >= 28 && item.rect.height >= 28) label += 45;
    return label + nearBottom + nearX;
  }

  function findTransport(action) {
    const candidates = bottomButtons()
      .map((item) => ({ ...item, score: scoreTransport(item, action) }))
      .filter((item) => item.score > 110)
      .sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function clickTransport(action) {
    const item = findTransport(action);
    if (!item) {
      setStatus('Could not find bottom ' + action + ' control. Copy Debug Map and send it to Cody.');
      emit('transport-missing', 'Suno bottom transport missing: ' + action, { action });
      return false;
    }
    item.button.click();
    setStatus('Clicked bottom player: ' + action + (item.name ? ' (' + item.name.slice(0, 50) + ')' : ''));
    emit('transport-click', 'Suno bottom transport clicked: ' + action, { action, name: item.name, score: item.score });
    setTimeout(refresh, 400);
    return true;
  }

  function playPause() {
    const audio = findAudio();
    state.audio = audio;
    if (audio) {
      if (audio.paused) {
        audio.play()
          .then(() => setStatus('Playing through audio element.'))
          .catch(() => clickTransport('play'));
      } else {
        audio.pause();
        setStatus('Paused through audio element.');
      }
      setTimeout(refresh, 250);
      return true;
    }
    return clickTransport('play');
  }

  function previous() { return clickTransport('previous'); }
  function next() { return clickTransport('next'); }
  function shuffle() { return clickTransport('shuffle'); }

  function mediaSessionMeta() {
    try {
      const meta = navigator.mediaSession && navigator.mediaSession.metadata;
      if (!meta) return null;
      return { title: safeText(meta.title || ''), artist: safeText(meta.artist || ''), album: safeText(meta.album || '') };
    } catch (error) {
      return null;
    }
  }

  function cleanTitle(value) {
    const blocked = /^(play|pause|next|previous|prev|shuffle|create|library|home|search|download|share|more|lyrics|extend|remix|edit|public|private)$/i;
    const lines = String(value || '')
      .split(/[\n\r|]+/)
      .map((line) => safeText(line))
      .filter((line) => line.length >= 2 && line.length <= 140)
      .filter((line) => !blocked.test(line))
      .filter((line) => !/suno|create music|make a song/i.test(line));
    return lines[0] || '';
  }

  function findTitle() {
    const media = mediaSessionMeta();
    if (media && media.title) return media.artist ? media.title + ' - ' + media.artist : media.title;

    const h1 = document.querySelector('h1');
    if (h1 && visible(h1)) {
      const title = cleanTitle(h1.innerText || h1.textContent || '');
      if (title) return title;
    }

    const meta = document.querySelector('meta[property="og:title"],meta[name="twitter:title"]');
    if (meta) {
      const title = cleanTitle(meta.getAttribute('content') || '');
      if (title) return title;
    }

    const headings = Array.from(document.querySelectorAll('h2,h3,[data-testid*="title" i],[class*="title" i]')).slice(0, 40);
    for (const heading of headings) {
      if (!visible(heading)) continue;
      const title = cleanTitle(heading.innerText || heading.textContent || '');
      if (title) return title;
    }

    return cleanTitle(document.title || '') || 'Suno';
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function setStatus(text) {
    state.status = text;
    const el = state.panel && state.panel.querySelector('[data-nsp-status]');
    if (el) el.textContent = text;
  }

  function addLibraryItem(item) {
    if (!item || !item.href || !item.title) return false;
    const href = new URL(item.href, location.href).href.split('?')[0].split('#')[0];
    const title = safeText(item.title).slice(0, 140);
    const existing = state.library.find((song) => song.href === href);
    if (existing) {
      existing.title = title || existing.title;
      existing.lastSeenAt = new Date().toISOString();
      return false;
    }
    state.library.unshift({ title, href, seenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
    state.library = state.library.slice(0, MAX_LIBRARY);
    return true;
  }

  function scanSongs() {
    let added = 0;
    Array.from(document.querySelectorAll('a[href]')).forEach((anchor) => {
      const href = anchor.href || anchor.getAttribute('href') || '';
      if (!/\/(song|playlist|clip)\//i.test(href)) return;
      const card = anchor.closest('article,li,[role="listitem"],[data-testid],[class*="card" i],[class*="song" i]') || anchor;
      const title = cleanTitle(card.innerText || card.textContent || anchor.textContent || href);
      if (addLibraryItem({ title: title || href, href })) added += 1;
    });

    const currentTitle = findTitle();
    if (/\/(song|clip)\//i.test(location.pathname) && currentTitle && currentTitle !== 'Suno') {
      if (addLibraryItem({ title: currentTitle, href: location.href })) added += 1;
    }

    saveLibrary();
    setStatus('Library scan: ' + added + ' new, ' + state.library.length + ' saved.');
    emit('library-scan', 'Suno visible songs scanned', { added, total: state.library.length });
    if (state.view === 'library') renderBody();
    return state.library;
  }

  function splitLyrics(text) {
    const blocked = /^(play|pause|next|previous|share|download|copy|remix|extend|create|library|home|search|public|private|follow|like|lyrics|show lyrics|more|edit|reply|comment|sort by)$/i;
    return String(text || '')
      .split(/[\n\r]+/)
      .map((line) => safeText(line))
      .filter((line) => line.length > 0 && line.length <= 180)
      .filter((line) => !blocked.test(line))
      .filter((line) => !/^\d+:\d{2}$/.test(line));
  }

  function scoreLyrics(lines) {
    let score = lines.length;
    if (lines.some((line) => /^\[(verse|chorus|pre-chorus|bridge|intro|outro)/i.test(line))) score += 80;
    if (lines.some((line) => /\b(chorus|verse|bridge)\b/i.test(line))) score += 20;
    return score;
  }

  function extractLyrics() {
    const candidates = [];
    const selectors = [
      '[data-testid*="lyric" i]',
      '[class*="lyric" i]',
      '[aria-label*="lyric" i]',
      '[data-testid*="transcript" i]',
      '[class*="transcript" i]',
      'main section',
      'main article',
      'main div'
    ];

    selectors.forEach((selector) => {
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(selector)).slice(0, 300); }
      catch (error) { nodes = []; }
      nodes.forEach((el) => {
        if (!visible(el)) return;
        const text = el.innerText || el.textContent || '';
        if (text.length < 25 || text.length > 10000) return;
        const lines = splitLyrics(text);
        if (lines.length >= 2) candidates.push(lines);
      });
    });

    const best = candidates
      .map((lines) => {
        const unique = [];
        lines.forEach((line) => { if (unique[unique.length - 1] !== line) unique.push(line); });
        return unique;
      })
      .filter((lines) => lines.length >= 2)
      .sort((a, b) => scoreLyrics(b) - scoreLyrics(a))[0] || [];

    return best.slice(0, 240);
  }

  function scanLyrics() {
    state.lyrics = extractLyrics();
    setStatus(state.lyrics.length ? 'Visible lyrics captured: ' + state.lyrics.length + ' lines.' : 'No visible lyrics found. Open the song lyrics, then scan again.');
    emit('lyrics-scan', 'Suno visible lyrics scanned', { lines: state.lyrics.length });
    if (state.view === 'lyrics') renderBody();
    return state.lyrics;
  }

  function copyLyrics() {
    if (!state.lyrics.length) scanLyrics();
    const title = state.lastTitle || findTitle();
    const text = ['# ' + title, '', ...state.lyrics].join('\n');
    writeClipboard(text).then(() => setStatus('Lyrics copied.')).catch(() => setStatus('Copy failed.'));
  }

  function cssPath(element) {
    const parts = [];
    let current = element;
    for (let depth = 0; current && current.nodeType === 1 && depth < 5; depth += 1, current = current.parentElement) {
      let part = current.tagName.toLowerCase();
      if (current.id) part += '#' + current.id;
      const testId = current.getAttribute('data-testid');
      if (testId) part += '[data-testid="' + testId + '"]';
      const classes = String(current.className || '').split(/\s+/).filter(Boolean).slice(0, 3);
      if (classes.length) part += '.' + classes.join('.');
      parts.unshift(part);
    }
    return parts.join(' > ');
  }

  function buildDebugReport() {
    const audios = Array.from(document.querySelectorAll('audio')).map((audio, index) => ({
      index,
      id: audio.id || '',
      className: String(audio.className || '').slice(0, 180),
      paused: Boolean(audio.paused),
      currentTime: Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime * 100) / 100 : null,
      duration: Number.isFinite(audio.duration) ? Math.round(audio.duration * 100) / 100 : null,
      currentSrc: audio.currentSrc || audio.src || '',
      readyState: audio.readyState
    }));

    const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter(visible)
      .slice(0, 160)
      .map((button, index) => {
        const rect = button.getBoundingClientRect();
        return { index, name: buttonName(button).slice(0, 180), x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height), path: cssPath(button).slice(0, 300) };
      });

    return {
      tool: 'Nova Suno Player diagnostics',
      version: VERSION,
      capturedAt: new Date().toISOString(),
      url: location.origin + location.pathname,
      title: findTitle(),
      documentTitle: document.title,
      mediaSession: mediaSessionMeta(),
      audioCount: audios.length,
      audios,
      bottomButtonGuess: bottomButtons().map((item) => ({ name: item.name, x: Math.round(item.rect.left), y: Math.round(item.rect.top), w: Math.round(item.rect.width), h: Math.round(item.rect.height) })).slice(0, 30),
      visibleButtonCount: buttons.length,
      buttons
    };
  }

  function copyDebugReport() {
    state.lastDebug = buildDebugReport();
    writeClipboard(JSON.stringify(state.lastDebug, null, 2))
      .then(() => setStatus('Debug map copied. Paste it here and we can lock selectors properly.'))
      .catch(() => setStatus('Debug copy failed.'));
    if (state.view === 'debug') renderBody();
    return state.lastDebug;
  }

  function styles() {
    return `
      #${PANEL_ID}{position:fixed;right:18px;bottom:118px;width:min(420px,calc(100vw - 24px));z-index:2147483645;background:rgba(10,10,18,.96);color:#fff;border:1px solid rgba(34,211,238,.55);box-shadow:0 0 24px rgba(34,211,238,.35);border-radius:16px;font:12px Arial,sans-serif;overflow:hidden;}
      #${PANEL_ID} *{box-sizing:border-box;}
      #${PANEL_ID} .nsp-head{padding:10px 12px;background:linear-gradient(90deg,rgba(34,211,238,.9),rgba(20,184,166,.9));display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:.03em;cursor:move;}
      #${PANEL_ID} .nsp-body{padding:10px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01));}
      #${PANEL_ID} .nsp-title{font-weight:900;color:#f9fafb;line-height:1.28;min-height:34px;margin-bottom:8px;font-size:14px;}
      #${PANEL_ID} .nsp-status{color:#9ca3af;font-size:11px;margin-top:8px;line-height:1.35;}
      #${PANEL_ID} .nsp-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
      #${PANEL_ID} button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:9px;padding:7px 9px;cursor:pointer;font:700 12px Arial,sans-serif;}
      #${PANEL_ID} button:hover{background:rgba(34,211,238,.18);}
      #${PANEL_ID} .nsp-small{font-size:11px;padding:5px 7px;border-color:rgba(255,255,255,.25);}
      #${PANEL_ID} .nsp-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:9px 0;}
      #${PANEL_ID} .nsp-tabs button.active{border-color:rgba(34,197,94,.75);box-shadow:0 0 12px rgba(34,197,94,.25);}
      #${PANEL_ID} .nsp-progress{height:7px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden;margin:8px 0 6px;}
      #${PANEL_ID} .nsp-progress > div{height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#14b8a6);transition:width .25s linear;}
      #${PANEL_ID} .nsp-time{display:flex;justify-content:space-between;color:#9ca3af;font-size:10px;margin-bottom:8px;}
      #${PANEL_ID} .nsp-section{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:9px;margin-top:8px;}
      #${PANEL_ID} .nsp-list{max-height:250px;overflow:auto;display:grid;gap:6px;}
      #${PANEL_ID} .nsp-song{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;}
      #${PANEL_ID} .nsp-song-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;color:#f9fafb;}
      #${PANEL_ID} .nsp-song-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ca3af;font-size:10px;margin-top:3px;}
      #${PANEL_ID} .nsp-lyrics{max-height:310px;overflow:auto;padding-right:4px;scroll-behavior:smooth;}
      #${PANEL_ID} .nsp-lyric{padding:6px 8px;margin:3px 0;border-radius:10px;color:#d1d5db;line-height:1.35;border:1px solid transparent;}
      #${PANEL_ID} .nsp-code{white-space:pre-wrap;max-height:260px;overflow:auto;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;color:#d1d5db;font:11px Consolas,monospace;}
      #${PANEL_ID}.min .nsp-body{display:none;}
    `;
  }

  function injectStyles() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styles();
    document.head.appendChild(style);
  }

  function createPanel() {
    if (state.panel && state.panel.isConnected) return state.panel;
    state.panel = null;
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    injectStyles();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `<div class="nsp-head"><span>Nova Suno Player</span><span><button class="nsp-small" data-nsp-action="refresh">Refresh</button><button class="nsp-small" data-nsp-action="min">-</button><button class="nsp-small" data-nsp-action="hide">x</button></span></div><div class="nsp-body" data-nsp-body></div>`;
    document.body.appendChild(panel);
    state.panel = panel;
    makeDraggable(panel);
    renderBody();
    bindPanel();
    emit('load', 'Nova Suno Player loaded', { version: VERSION });
    return panel;
  }

  function renderBody() {
    const body = state.panel && state.panel.querySelector('[data-nsp-body]');
    if (!body) return;
    body.innerHTML = `
      <div class="nsp-title" data-nsp-title>${esc(state.lastTitle || findTitle())}</div>
      <div class="nsp-progress"><div data-nsp-bar></div></div>
      <div class="nsp-time"><span data-nsp-current>--:--</span><span data-nsp-duration>--:--</span></div>
      <div class="nsp-row"><button data-nsp-action="prev">Prev</button><button data-nsp-action="play">Play/Pause</button><button data-nsp-action="next">Next</button><button data-nsp-action="shuffle">Shuffle</button></div>
      <div class="nsp-tabs"><button data-nsp-view="player" class="${state.view === 'player' ? 'active' : ''}">Player</button><button data-nsp-view="library" class="${state.view === 'library' ? 'active' : ''}">Library</button><button data-nsp-view="lyrics" class="${state.view === 'lyrics' ? 'active' : ''}">Lyrics</button><button data-nsp-view="debug" class="${state.view === 'debug' ? 'active' : ''}">Debug</button></div>
      ${state.view === 'library' ? renderLibraryView() : state.view === 'lyrics' ? renderLyricsView() : state.view === 'debug' ? renderDebugView() : renderPlayerView()}
      <div class="nsp-status" data-nsp-status>${esc(state.status)}</div>`;
    bindPanel();
    refresh();
  }

  function renderPlayerView() {
    return `<div class="nsp-section"><div class="nsp-row"><button data-nsp-action="open-library">Open Library</button><button data-nsp-action="scan-songs">Scan Visible Songs</button><button data-nsp-action="scan-lyrics">Scan Visible Lyrics</button><button data-nsp-action="copy-debug">Copy Debug Map</button></div><div style="color:#9ca3af;font-size:11px;line-height:1.4;margin-top:8px;">Play controls target the fixed bottom player only. If it misses, copy Debug Map so we can lock exact selectors.</div></div>`;
  }

  function renderLibraryView() {
    const songs = state.library.slice(0, MAX_LIBRARY);
    const list = songs.length ? songs.map((song, index) => `<div class="nsp-song"><div style="min-width:0;"><div class="nsp-song-title">${esc(song.title)}</div><div class="nsp-song-url">${esc(song.href)}</div></div><button data-nsp-song="${index}">Open</button></div>`).join('') : '<div style="color:#9ca3af;line-height:1.45;">No songs saved yet. Open your Suno Library, then press Scan Visible Songs.</div>';
    return `<div class="nsp-section"><div class="nsp-row" style="margin-bottom:8px;"><button data-nsp-action="open-library">Open Library</button><button data-nsp-action="scan-songs">Scan Page</button><button data-nsp-action="clear-library">Clear Saved</button></div><div class="nsp-list">${list}</div></div>`;
  }

  function renderLyricsView() {
    const lines = state.lyrics.length ? state.lyrics.map((line) => `<div class="nsp-lyric">${esc(line)}</div>`).join('') : '<div style="color:#9ca3af;line-height:1.45;">No lyrics captured yet. Open a song page, then press Scan Visible Lyrics.</div>';
    return `<div class="nsp-section"><div class="nsp-row" style="margin-bottom:8px;"><button data-nsp-action="scan-lyrics">Scan Visible Lyrics</button><button data-nsp-action="copy-lyrics">Copy Lyrics</button></div><div class="nsp-lyrics">${lines}</div></div>`;
  }

  function renderDebugView() {
    const report = state.lastDebug || buildDebugReport();
    return `<div class="nsp-section"><div class="nsp-row" style="margin-bottom:8px;"><button data-nsp-action="copy-debug">Copy Debug Map</button><button data-nsp-action="refresh-debug">Refresh Debug</button></div><div style="color:#9ca3af;line-height:1.45;margin-bottom:8px;">This copies button positions, audio metadata, and labels. No cookies or tokens.</div><div class="nsp-code">${esc(JSON.stringify({ version: report.version, title: report.title, audioCount: report.audioCount, bottomButtons: report.bottomButtonGuess && report.bottomButtonGuess.length, visibleButtonCount: report.visibleButtonCount }, null, 2))}</div></div>`;
  }

  function bindPanel() {
    if (!state.panel) return;
    state.panel.querySelectorAll('[data-nsp-action]').forEach((button) => { button.onclick = () => runAction(button.dataset.nspAction); });
    state.panel.querySelectorAll('[data-nsp-view]').forEach((button) => { button.onclick = () => setView(button.dataset.nspView); });
    state.panel.querySelectorAll('[data-nsp-song]').forEach((button) => { button.onclick = () => openSavedSong(Number(button.dataset.nspSong)); });
  }

  function runAction(action) {
    if (action === 'refresh') refresh(true);
    if (action === 'min') toggleMin();
    if (action === 'hide') hide();
    if (action === 'play') playPause();
    if (action === 'next') next();
    if (action === 'prev') previous();
    if (action === 'shuffle') shuffle();
    if (action === 'open-library') location.href = 'https://suno.com/library';
    if (action === 'scan-songs') scanSongs();
    if (action === 'clear-library') clearLibrary();
    if (action === 'scan-lyrics') scanLyrics();
    if (action === 'copy-lyrics') copyLyrics();
    if (action === 'copy-debug') copyDebugReport();
    if (action === 'refresh-debug') { state.lastDebug = buildDebugReport(); renderBody(); }
  }

  function setView(view) {
    state.view = ['player', 'library', 'lyrics', 'debug'].includes(view) ? view : 'player';
    writeStored(VIEW_KEY, state.view);
    renderBody();
  }

  function openSavedSong(index) {
    const song = state.library[index];
    if (song && song.href) location.href = song.href;
  }

  function clearLibrary() {
    if (!confirm('Clear Nova Suno saved song list from this browser?')) return;
    state.library = [];
    saveLibrary();
    setStatus('Saved song list cleared.');
    renderBody();
  }

  function toggleMin() {
    state.minimized = !state.minimized;
    if (state.panel) state.panel.classList.toggle('min', state.minimized);
  }

  function show() {
    if (!onSuno()) return false;
    const panel = createPanel();
    panel.style.display = 'block';
    state.visible = true;
    refresh();
    if (!state.timer) state.timer = setInterval(() => { if (state.visible && state.panel && !state.panel.isConnected) createPanel(); refresh(); }, 1000);
    return true;
  }

  function hide() {
    if (state.panel) state.panel.style.display = 'none';
    state.visible = false;
    return true;
  }

  function refresh(force) {
    if (!state.panel || !state.panel.isConnected || !state.visible) return;
    const audio = findAudio();
    state.audio = audio;
    state.lastTitle = findTitle();
    const titleEl = state.panel.querySelector('[data-nsp-title]');
    if (titleEl) titleEl.textContent = state.lastTitle;
    const bar = state.panel.querySelector('[data-nsp-bar]');
    const current = state.panel.querySelector('[data-nsp-current]');
    const duration = state.panel.querySelector('[data-nsp-duration]');

    if (audio) {
      const pct = audio.duration ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
      if (bar) bar.style.width = pct + '%';
      if (current) current.textContent = formatTime(audio.currentTime);
      if (duration) duration.textContent = formatTime(audio.duration);
      if (force) setStatus((audio.paused ? 'Paused' : 'Playing') + ' - ' + formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration));
    } else {
      if (bar) bar.style.width = '0%';
      if (current) current.textContent = '--:--';
      if (duration) duration.textContent = '--:--';
      if (force) setStatus('No audio element found. Bottom-player button fallback is active.');
    }
  }

  function makeDraggable(panel) {
    let active = false, sx = 0, sy = 0, sl = 0, st = 0;
    const head = panel.querySelector('.nsp-head');
    if (!head) return;
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved) { panel.style.left = saved.x + 'px'; panel.style.top = saved.y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; }
    } catch (error) {}
    head.addEventListener('mousedown', (event) => {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      active = true; sx = event.clientX; sy = event.clientY; sl = rect.left; st = rect.top;
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      event.preventDefault();
    }, true);
    function move(event) {
      if (!active) return;
      const x = Math.max(4, Math.min(window.innerWidth - panel.offsetWidth - 4, sl + event.clientX - sx));
      const y = Math.max(4, Math.min(window.innerHeight - panel.offsetHeight - 4, st + event.clientY - sy));
      panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
    }
    function up() {
      if (!active) return;
      active = false;
      const rect = panel.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) })); } catch (error) {}
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
    }
  }

  function init() {
    if (!onSuno()) return;
    console.log('[Nova Module] Suno Player loaded', VERSION);
  }

  window.NovaSunoPlayer = {
    version: VERSION,
    init,
    show,
    hide,
    refresh,
    playPause,
    next,
    previous,
    shuffle,
    scanSongs,
    scanLyrics,
    copyLyrics,
    buildDebugReport,
    copyDebugReport
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
