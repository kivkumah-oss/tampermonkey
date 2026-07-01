// modules/suno/nova-suno-player.js

(function () {
  'use strict';

  if (window.NovaSunoPlayer) return;

  const VERSION = '0.5.0';
  const PANEL_ID = 'nova-suno-player';
  const STYLE_ID = 'nova-suno-player-style';
  const POS_KEY = 'nova.suno.player.position';
  const LIBRARY_KEY = 'nova.suno.library.v1';
  const VIEW_KEY = 'nova.suno.view';
  const MAX_LIBRARY = 120;

  const state = {
    panel: null,
    visible: true,
    minimized: false,
    view: readStored(VIEW_KEY, 'player'),
    audio: null,
    lastTitle: '',
    status: 'Waiting for Suno audio...',
    timer: null,
    karaoke: false,
    lyrics: [],
    library: loadLibrary()
  };

  function onSuno() {
    return location.hostname.includes('suno.com');
  }

  function emit(type, summary, data) {
    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({ module: 'suno-player', type, summary, data: data || {} });
    }
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
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {}
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
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(state.library.slice(0, MAX_LIBRARY)));
    } catch (error) {}
  }

  function writeClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return Boolean((rect.width || rect.height) && style.visibility !== 'hidden' && style.display !== 'none');
  }

  function findAudio() {
    const active = document.getElementById('active-audio-play');
    if (active && active.tagName && active.tagName.toLowerCase() === 'audio') return active;
    const audios = Array.from(document.querySelectorAll('audio'));
    return audios.find((audio) => !audio.paused) || audios[0] || null;
  }

  function getButtonName(button) {
    return safeText([
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-testid'),
      button.textContent
    ].filter(Boolean).join(' '));
  }

  function scoreButton(button, labels) {
    const combined = getButtonName(button).toLowerCase();
    let score = 0;
    labels.forEach((label) => {
      const wanted = String(label).toLowerCase();
      if (combined === wanted) score += 100;
      if (combined.includes(wanted)) score += 50;
      if (combined.startsWith(wanted)) score += 20;
    });
    return score;
  }

  function findButton(labels) {
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).filter((button) => visible(button) && !button.disabled);
    return buttons
      .map((button) => ({ button, score: scoreButton(button, labels) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.button || null;
  }

  function clickButton(name, labels) {
    const button = findButton(labels);
    if (!button) {
      setStatus('Missing control: ' + name);
      emit('control-missing', 'Suno control missing: ' + name, { name, labels });
      return false;
    }
    button.click();
    setStatus('Clicked: ' + name);
    emit('control-click', 'Suno control clicked: ' + name, { name });
    setTimeout(refresh, 350);
    return true;
  }

  function playPause() {
    const audio = findAudio();
    if (audio) {
      state.audio = audio;
      if (audio.paused) {
        const btn = findButton(['play', 'resume']);
        if (btn) return clickButton('Play', ['play', 'resume']);
        audio.play().catch(() => clickButton('Play', ['play', 'resume']));
        setStatus('Audio play requested');
        return true;
      }
      const btn = findButton(['pause']);
      if (btn) return clickButton('Pause', ['pause']);
      audio.pause();
      setStatus('Audio paused');
      return true;
    }
    return clickButton('Play/Pause', ['play', 'pause', 'resume']);
  }

  function next() { return clickButton('Next', ['next', 'skip forward', 'forward']); }
  function previous() { return clickButton('Previous', ['previous', 'prev', 'skip back', 'back']); }
  function shuffle() { return clickButton('Shuffle', ['shuffle']); }
  function lyricsButton() { return clickButton('Lyrics', ['lyrics', 'show lyrics']); }

  function openLibrary() {
    if (clickButton('Library', ['library', 'my library', 'songs'])) return true;
    location.href = 'https://suno.com/library';
    return true;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function findTitle() {
    const audio = findAudio();
    const candidates = [];

    if (audio) {
      let current = audio.parentElement;
      for (let i = 0; current && i < 6; i += 1, current = current.parentElement) {
        const text = cleanSongTitle(current.innerText || current.textContent || '');
        if (text) candidates.push(text);
      }
    }

    const meta = document.querySelector('meta[property="og:title"],meta[name="twitter:title"]');
    if (meta) candidates.push(cleanSongTitle(meta.getAttribute('content') || ''));

    Array.from(document.querySelectorAll('h1,h2,h3,[data-testid*="title" i],[class*="title" i]')).slice(0, 30).forEach((el) => {
      if (!visible(el)) return;
      const text = cleanSongTitle(el.innerText || el.textContent || '');
      if (text) candidates.push(text);
    });

    candidates.push(cleanSongTitle(document.title || ''));
    return candidates.find(Boolean) || 'Suno';
  }

  function cleanSongTitle(value) {
    const lines = String(value || '')
      .split(/[\n\r]+/)
      .map((line) => safeText(line))
      .filter(Boolean)
      .filter((line) => line.length >= 2 && line.length <= 90)
      .filter((line) => !/^(play|pause|next|previous|prev|shuffle|create|library|home|search|download|share|more|lyrics)$/i.test(line))
      .filter((line) => !/suno|create music|make a song/i.test(line));
    return lines[0] || '';
  }

  function addLibraryItem(item) {
    if (!item || !item.href || !item.title) return false;
    const href = new URL(item.href, location.href).href.split('?')[0];
    const title = safeText(item.title).slice(0, 120);
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
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    anchors.forEach((anchor) => {
      const href = anchor.href || anchor.getAttribute('href') || '';
      if (!/suno\.com\/(song|playlist|clip)\//i.test(href) && !/\/(song|playlist|clip)\//i.test(href)) return;
      const card = anchor.closest('article,li,[role="listitem"],[data-testid],[class*="card" i],[class*="song" i]') || anchor;
      const title = cleanSongTitle(card.innerText || card.textContent || anchor.textContent || href);
      if (addLibraryItem({ title, href })) added += 1;
    });

    const currentTitle = findTitle();
    if (/\/song\//i.test(location.pathname) && currentTitle && currentTitle !== 'Suno') {
      if (addLibraryItem({ title: currentTitle, href: location.href })) added += 1;
    }

    saveLibrary();
    setStatus('Library scan: ' + added + ' new, ' + state.library.length + ' saved.');
    emit('library-scan', 'Suno library scanned from visible page', { added, total: state.library.length });
    if (state.view === 'library') renderBody();
    return state.library;
  }

  function readTextCandidates(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (error) {
      return [];
    }
  }

  function splitLyrics(text) {
    const blocked = /^(play|pause|next|previous|share|download|copy|remix|extend|create|library|home|search|public|private|follow|like|lyrics|show lyrics|more)$/i;
    return String(text || '')
      .split(/[\n\r]+/)
      .map((line) => safeText(line))
      .filter((line) => line.length > 0 && line.length <= 140)
      .filter((line) => !blocked.test(line))
      .filter((line) => !/^\d+:\d{2}$/.test(line));
  }

  function extractLyrics() {
    const candidates = [];
    const selectors = [
      '[data-testid*="lyric" i]',
      '[class*="lyric" i]',
      '[aria-label*="lyric" i]',
      '[data-testid*="transcript" i]',
      '[class*="transcript" i]'
    ];

    selectors.forEach((selector) => {
      readTextCandidates(selector).forEach((el) => {
        if (!visible(el)) return;
        const lines = splitLyrics(el.innerText || el.textContent || '');
        if (lines.length >= 2) candidates.push(lines);
      });
    });

    if (!candidates.length) {
      Array.from(document.querySelectorAll('section,article,main,div')).slice(0, 500).forEach((el) => {
        if (!visible(el)) return;
        const raw = el.innerText || el.textContent || '';
        if (!raw || raw.length < 80 || raw.length > 6000) return;
        const lines = splitLyrics(raw);
        if (lines.length >= 5 && lines.length <= 120) candidates.push(lines);
      });
    }

    const best = candidates.sort((a, b) => b.length - a.length)[0] || [];
    const unique = [];
    best.forEach((line) => {
      if (unique[unique.length - 1] !== line) unique.push(line);
    });
    return unique.slice(0, 180);
  }

  function scanLyrics(options = {}) {
    if (options.openFirst) lyricsButton();
    setTimeout(() => {
      const lines = extractLyrics();
      state.lyrics = lines;
      setStatus(lines.length ? 'Lyrics captured: ' + lines.length + ' lines.' : 'No visible lyrics found yet. Open song lyrics, then scan again.');
      emit('lyrics-scan', 'Suno lyrics scanned from visible page', { lines: lines.length });
      if (state.view === 'lyrics') renderBody();
      updateKaraoke();
    }, options.openFirst ? 650 : 0);
  }

  function copyLyrics() {
    const title = state.lastTitle || findTitle();
    const text = ['# ' + title, '', ...state.lyrics].join('\n');
    writeClipboard(text).then(() => setStatus('Lyrics copied.')).catch(() => setStatus('Copy failed.'));
  }

  function currentLyricIndex() {
    const audio = state.audio || findAudio();
    if (!audio || !state.lyrics.length || !Number.isFinite(audio.duration) || audio.duration <= 0) return -1;
    return Math.max(0, Math.min(state.lyrics.length - 1, Math.floor((audio.currentTime / audio.duration) * state.lyrics.length)));
  }

  function toggleKaraoke() {
    state.karaoke = !state.karaoke;
    setStatus(state.karaoke ? 'Karaoke mode on.' : 'Karaoke mode off.');
    if (state.view !== 'lyrics') setView('lyrics');
    else renderBody();
    updateKaraoke();
  }

  function updateKaraoke() {
    if (!state.panel || state.view !== 'lyrics') return;
    const index = state.karaoke ? currentLyricIndex() : -1;
    state.panel.querySelectorAll('[data-nsp-lyric]').forEach((line) => {
      const active = Number(line.dataset.nspLyric) === index;
      line.classList.toggle('active', active);
      if (active && !line.dataset.nspSeen) {
        line.dataset.nspSeen = '1';
        line.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (!active) delete line.dataset.nspSeen;
    });
  }

  function styles() {
    return `
      #${PANEL_ID}{position:fixed;right:18px;bottom:118px;width:min(420px,calc(100vw - 24px));z-index:2147483645;background:rgba(10,10,18,.96);color:#fff;border:1px solid rgba(34,211,238,.55);box-shadow:0 0 24px rgba(34,211,238,.35);border-radius:16px;font:12px Arial,sans-serif;overflow:hidden;}
      #${PANEL_ID} *{box-sizing:border-box;}
      #${PANEL_ID} .nsp-head{padding:10px 12px;background:linear-gradient(90deg,rgba(34,211,238,.9),rgba(168,85,247,.9));display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:.03em;cursor:move;}
      #${PANEL_ID} .nsp-body{padding:10px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01));}
      #${PANEL_ID} .nsp-title{font-weight:900;color:#f9fafb;line-height:1.28;min-height:34px;margin-bottom:8px;font-size:14px;}
      #${PANEL_ID} .nsp-status{color:#9ca3af;font-size:11px;margin-top:8px;line-height:1.35;}
      #${PANEL_ID} .nsp-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
      #${PANEL_ID} button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:9px;padding:7px 9px;cursor:pointer;font:700 12px Arial,sans-serif;}
      #${PANEL_ID} button:hover{background:rgba(34,211,238,.18);}
      #${PANEL_ID} .nsp-small{font-size:11px;padding:5px 7px;border-color:rgba(255,255,255,.25);}
      #${PANEL_ID} .nsp-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:9px 0;}
      #${PANEL_ID} .nsp-tabs button.active{border-color:rgba(34,197,94,.75);box-shadow:0 0 12px rgba(34,197,94,.25);}
      #${PANEL_ID} .nsp-progress{height:7px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden;margin:8px 0 6px;}
      #${PANEL_ID} .nsp-progress > div{height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#a855f7);transition:width .25s linear;}
      #${PANEL_ID} .nsp-time{display:flex;justify-content:space-between;color:#9ca3af;font-size:10px;margin-bottom:8px;}
      #${PANEL_ID} .nsp-section{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:9px;margin-top:8px;}
      #${PANEL_ID} .nsp-list{max-height:250px;overflow:auto;display:grid;gap:6px;}
      #${PANEL_ID} .nsp-song{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;}
      #${PANEL_ID} .nsp-song-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;color:#f9fafb;}
      #${PANEL_ID} .nsp-song-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ca3af;font-size:10px;margin-top:3px;}
      #${PANEL_ID} .nsp-lyrics{max-height:310px;overflow:auto;padding-right:4px;scroll-behavior:smooth;}
      #${PANEL_ID} .nsp-lyric{padding:6px 8px;margin:3px 0;border-radius:10px;color:#d1d5db;line-height:1.35;border:1px solid transparent;}
      #${PANEL_ID} .nsp-lyric.active{color:#fff;background:linear-gradient(90deg,rgba(34,211,238,.28),rgba(168,85,247,.22));border-color:rgba(34,211,238,.5);box-shadow:0 0 12px rgba(34,211,238,.22);font-weight:900;transform:scale(1.01);}
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
    if (state.panel) return state.panel;
    injectStyles();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="nsp-head">
        <span>Nova Suno Player</span>
        <span>
          <button class="nsp-small" data-nsp-action="refresh">Refresh</button>
          <button class="nsp-small" data-nsp-action="min">-</button>
          <button class="nsp-small" data-nsp-action="hide">x</button>
        </span>
      </div>
      <div class="nsp-body" data-nsp-body></div>`;
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

    const title = esc(state.lastTitle || findTitle());
    body.innerHTML = `
      <div class="nsp-title" data-nsp-title>${title}</div>
      <div class="nsp-progress"><div data-nsp-bar></div></div>
      <div class="nsp-time"><span data-nsp-current>--:--</span><span data-nsp-duration>--:--</span></div>
      <div class="nsp-row">
        <button data-nsp-action="prev">Prev</button>
        <button data-nsp-action="play">Play/Pause</button>
        <button data-nsp-action="next">Next</button>
        <button data-nsp-action="shuffle">Shuffle</button>
      </div>
      <div class="nsp-tabs">
        <button data-nsp-view="player" class="${state.view === 'player' ? 'active' : ''}">Player</button>
        <button data-nsp-view="library" class="${state.view === 'library' ? 'active' : ''}">Library</button>
        <button data-nsp-view="lyrics" class="${state.view === 'lyrics' ? 'active' : ''}">Lyrics</button>
      </div>
      ${state.view === 'library' ? renderLibraryView() : state.view === 'lyrics' ? renderLyricsView() : renderPlayerView()}
      <div class="nsp-status" data-nsp-status>${esc(state.status)}</div>`;
    bindPanel();
    refresh();
  }

  function renderPlayerView() {
    return `
      <div class="nsp-section">
        <div class="nsp-row">
          <button data-nsp-action="open-library">Open Suno Library</button>
          <button data-nsp-action="scan-songs">Scan Visible Songs</button>
          <button data-nsp-action="scan-lyrics-open">Open/Scan Lyrics</button>
          <button data-nsp-action="karaoke">${state.karaoke ? 'Karaoke On' : 'Karaoke Off'}</button>
        </div>
        <div style="color:#9ca3af;font-size:11px;line-height:1.4;margin-top:8px;">Library scan reads songs visible on the current Suno page and stores them locally in this browser.</div>
      </div>`;
  }

  function renderLibraryView() {
    const songs = state.library.slice(0, MAX_LIBRARY);
    const list = songs.length ? songs.map((song, index) => `
      <div class="nsp-song">
        <div style="min-width:0;">
          <div class="nsp-song-title">${esc(song.title)}</div>
          <div class="nsp-song-url">${esc(song.href)}</div>
        </div>
        <button data-nsp-song="${index}">Open</button>
      </div>`).join('') : '<div style="color:#9ca3af;line-height:1.45;">No songs saved yet. Open your Suno Library, then press Scan Visible Songs.</div>';

    return `
      <div class="nsp-section">
        <div class="nsp-row" style="margin-bottom:8px;">
          <button data-nsp-action="open-library">Open Library</button>
          <button data-nsp-action="scan-songs">Scan Page</button>
          <button data-nsp-action="clear-library">Clear Saved</button>
        </div>
        <div class="nsp-list">${list}</div>
      </div>`;
  }

  function renderLyricsView() {
    const lines = state.lyrics.length ? state.lyrics.map((line, index) => `<div class="nsp-lyric" data-nsp-lyric="${index}">${esc(line)}</div>`).join('') : '<div style="color:#9ca3af;line-height:1.45;">No lyrics captured yet. Open a song, press Open/Scan Lyrics, or manually open lyrics on Suno and press Scan Lyrics.</div>';
    return `
      <div class="nsp-section">
        <div class="nsp-row" style="margin-bottom:8px;">
          <button data-nsp-action="scan-lyrics">Scan Lyrics</button>
          <button data-nsp-action="scan-lyrics-open">Open/Scan</button>
          <button data-nsp-action="karaoke">${state.karaoke ? 'Karaoke On' : 'Karaoke Off'}</button>
          <button data-nsp-action="copy-lyrics">Copy Lyrics</button>
        </div>
        <div class="nsp-lyrics">${lines}</div>
      </div>`;
  }

  function bindPanel() {
    if (!state.panel) return;
    state.panel.querySelectorAll('[data-nsp-action]').forEach((button) => {
      button.onclick = () => runAction(button.dataset.nspAction);
    });
    state.panel.querySelectorAll('[data-nsp-view]').forEach((button) => {
      button.onclick = () => setView(button.dataset.nspView);
    });
    state.panel.querySelectorAll('[data-nsp-song]').forEach((button) => {
      button.onclick = () => openSavedSong(Number(button.dataset.nspSong));
    });
  }

  function runAction(action) {
    if (action === 'refresh') refresh(true);
    if (action === 'min') toggleMin();
    if (action === 'hide') hide();
    if (action === 'play') playPause();
    if (action === 'next') next();
    if (action === 'prev') previous();
    if (action === 'shuffle') shuffle();
    if (action === 'open-library') openLibrary();
    if (action === 'scan-songs') scanSongs();
    if (action === 'clear-library') clearLibrary();
    if (action === 'scan-lyrics') scanLyrics();
    if (action === 'scan-lyrics-open') scanLyrics({ openFirst: true });
    if (action === 'copy-lyrics') copyLyrics();
    if (action === 'karaoke') toggleKaraoke();
  }

  function setView(view) {
    state.view = ['player', 'library', 'lyrics'].includes(view) ? view : 'player';
    writeStored(VIEW_KEY, state.view);
    renderBody();
  }

  function openSavedSong(index) {
    const song = state.library[index];
    if (!song || !song.href) return;
    location.href = song.href;
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
    if (!state.timer) state.timer = setInterval(refresh, 1000);
    return true;
  }

  function hide() {
    if (state.panel) state.panel.style.display = 'none';
    state.visible = false;
    return true;
  }

  function setStatus(text) {
    state.status = text;
    const el = state.panel && state.panel.querySelector('[data-nsp-status]');
    if (el) el.textContent = text;
  }

  function refresh(force) {
    if (!state.panel || !state.visible) return;
    const audio = findAudio();
    state.audio = audio;
    const title = findTitle();
    state.lastTitle = title;
    const titleEl = state.panel.querySelector('[data-nsp-title]');
    if (titleEl) titleEl.textContent = title;

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
      if (force) setStatus('No audio element found yet. Start a Suno track first.');
    }

    updateKaraoke();
  }

  function makeDraggable(panel) {
    let active = false, sx = 0, sy = 0, sl = 0, st = 0;
    const head = panel.querySelector('.nsp-head');
    if (!head) return;
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved) {
        panel.style.left = saved.x + 'px';
        panel.style.top = saved.y + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } catch (e) {}

    head.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      active = true;
      sx = e.clientX;
      sy = e.clientY;
      sl = rect.left;
      st = rect.top;
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      e.preventDefault();
    }, true);

    function move(e) {
      if (!active) return;
      const x = Math.max(4, Math.min(window.innerWidth - panel.offsetWidth - 4, sl + e.clientX - sx));
      const y = Math.max(4, Math.min(window.innerHeight - panel.offsetHeight - 4, st + e.clientY - sy));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }

    function up() {
      if (!active) return;
      active = false;
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
    }
  }

  function init() {
    if (!onSuno()) return;
    show();
    console.log('[Nova Module] Suno Player loaded');
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
    lyrics: lyricsButton,
    scanSongs,
    scanLyrics,
    copyLyrics,
    toggleKaraoke,
    openLibrary
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
