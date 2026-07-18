// core/nova-youtube-music-adapter.js

(function () {
  'use strict';

  if (window.NovaYouTubeMusicAdapter) return;

  const VERSION = '1.0.0';
  const STATE_KEY = 'nova.ytm.state.v1';
  const COMMAND_KEY = 'nova.ytm.command.v1';
  const IS_YTM = location.hostname === 'music.youtube.com';

  let lastCommandId = '';
  let timer = null;

  function gmGet(key, fallback) {
    try {
      return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function media() {
    return document.querySelector('video') || document.querySelector('audio');
  }

  function text(selector) {
    const node = document.querySelector(selector);
    return node ? String(node.textContent || '').trim() : '';
  }

  function attr(selector, name) {
    const node = document.querySelector(selector);
    return node ? String(node.getAttribute(name) || '') : '';
  }

  function first(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function clickFirst(selectors) {
    const node = first(selectors);
    if (!node) return false;
    node.click();
    return true;
  }

  function readState() {
    const m = media();
    const playButton = first([
      'ytmusic-player-bar #play-pause-button',
      'ytmusic-player-bar [aria-label*="Pause"]',
      'ytmusic-player-bar [aria-label*="Play"]'
    ]);
    const paused = m ? m.paused : !(playButton && /pause/i.test(playButton.getAttribute('aria-label') || ''));

    return {
      connected: true,
      title: text('ytmusic-player-bar .title') || text('ytmusic-player-bar yt-formatted-string.title') || 'YouTube Music',
      artist: text('ytmusic-player-bar .byline') || text('ytmusic-player-bar [class*="subtitle"]') || 'Waiting for a song…',
      artwork: attr('ytmusic-player-bar img', 'src') || attr('ytmusic-player-bar img', 'data-thumb'),
      playing: !paused,
      currentTime: m && Number.isFinite(m.currentTime) ? m.currentTime : 0,
      duration: m && Number.isFinite(m.duration) ? m.duration : 0,
      volume: m && Number.isFinite(m.volume) ? m.volume : 1,
      muted: Boolean(m && m.muted),
      url: location.href,
      updatedAt: Date.now(),
      adapterVersion: VERSION
    };
  }

  function publish() {
    if (!IS_YTM) return;
    gmSet(STATE_KEY, readState());
  }

  function execute(command) {
    if (!command || !command.id || command.id === lastCommandId) return;
    lastCommandId = command.id;
    const m = media();

    switch (command.action) {
      case 'play-pause':
        if (m) {
          if (m.paused) m.play().catch(() => clickFirst(['ytmusic-player-bar #play-pause-button']));
          else m.pause();
        } else clickFirst(['ytmusic-player-bar #play-pause-button']);
        break;
      case 'play':
        if (m) m.play().catch(() => clickFirst(['ytmusic-player-bar [aria-label*="Play"]']));
        break;
      case 'pause':
        if (m) m.pause();
        break;
      case 'next':
        clickFirst(['ytmusic-player-bar .next-button', 'ytmusic-player-bar [aria-label*="Next"]']);
        break;
      case 'previous':
        clickFirst(['ytmusic-player-bar .previous-button', 'ytmusic-player-bar [aria-label*="Previous"]']);
        break;
      case 'shuffle':
        clickFirst(['ytmusic-player-bar .shuffle', 'ytmusic-player-bar [aria-label*="Shuffle"]']);
        break;
      case 'repeat':
        clickFirst(['ytmusic-player-bar .repeat', 'ytmusic-player-bar [aria-label*="Repeat"]']);
        break;
      case 'seek':
        if (m && Number.isFinite(Number(command.value))) {
          const value = Number(command.value);
          m.currentTime = Math.max(0, Math.min(value, Number.isFinite(m.duration) ? m.duration : value));
        }
        break;
      case 'volume':
        if (m && Number.isFinite(Number(command.value))) {
          m.volume = Math.max(0, Math.min(1, Number(command.value)));
          m.muted = false;
        }
        break;
      case 'mute':
        if (m) m.muted = !m.muted;
        break;
    }

    setTimeout(publish, 100);
  }

  function start() {
    if (!IS_YTM || timer) return;
    publish();
    timer = setInterval(() => {
      execute(gmGet(COMMAND_KEY, null));
      publish();
    }, 500);
    console.log('[Nova Core] YouTube Music adapter active', VERSION);
  }

  window.NovaYouTubeMusicAdapter = {
    version: VERSION,
    active: IS_YTM,
    publish,
    getState: () => gmGet(STATE_KEY, null)
  };

  // Prevent the UI module from starting a second adapter in the YouTube Music tab.
  if (IS_YTM && !window.NovaYouTubeMusicRemote) {
    window.NovaYouTubeMusicRemote = {
      version: VERSION,
      isAdapter: true,
      show() {},
      hide() {},
      toggle() {},
      send() {},
      getState: () => gmGet(STATE_KEY, null)
    };
  }

  start();
})();
