// modules/youtube-music/nova-youtube-music-remote.js

(function () {
  'use strict';

  if (window.NovaYouTubeMusicRemote) return;

  const VERSION = '0.1.0';
  const PANEL_ID = 'nova-youtube-music-remote';
  const STYLE_ID = 'nova-youtube-music-remote-style';
  const STATE_KEY = 'nova.ytm.state.v1';
  const COMMAND_KEY = 'nova.ytm.command.v1';
  const POSITION_KEY = 'nova.ytm.position.v1';
  const IS_YTM = location.hostname === 'music.youtube.com';

  const local = {
    visible: false,
    panel: null,
    lastCommandId: '',
    adapterTimer: null,
    remoteTimer: null,
    state: null
  };

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

  function esc(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function text(selector) {
    const node = document.querySelector(selector);
    return node ? String(node.textContent || '').trim() : '';
  }

  function attr(selector, name) {
    const node = document.querySelector(selector);
    return node ? String(node.getAttribute(name) || '') : '';
  }

  function media() {
    return document.querySelector('video') || document.querySelector('audio');
  }

  function playerButton(selectors) {
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) return button;
    }
    return null;
  }

  function readYtmState() {
    const m = media();
    const title = text('ytmusic-player-bar .title') || text('yt-formatted-string.title');
    const artist = text('ytmusic-player-bar .byline') || text('ytmusic-player-bar [class*="subtitle"]');
    const artwork = attr('ytmusic-player-bar img', 'src') || attr('ytmusic-player-bar img', 'data-thumb');
    const playButton = playerButton([
      'ytmusic-player-bar #play-pause-button',
      'ytmusic-player-bar [aria-label*="Pause"]',
      'ytmusic-player-bar [aria-label*="Play"]'
    ]);

    const paused = m ? m.paused : !(playButton && /pause/i.test(playButton.getAttribute('aria-label') || ''));
    return {
      connected: true,
      title: title || 'YouTube Music',
      artist: artist || 'Waiting for a song…',
      artwork,
      playing: !paused,
      currentTime: m && Number.isFinite(m.currentTime) ? m.currentTime : 0,
      duration: m && Number.isFinite(m.duration) ? m.duration : 0,
      volume: m && Number.isFinite(m.volume) ? m.volume : 1,
      muted: Boolean(m && m.muted),
      url: location.href,
      updatedAt: Date.now()
    };
  }

  function clickFirst(selectors) {
    const button = playerButton(selectors);
    if (!button) return false;
    button.click();
    return true;
  }

  function executeCommand(command) {
    if (!command || !command.id || command.id === local.lastCommandId) return;
    local.lastCommandId = command.id;

    const m = media();
    switch (command.action) {
      case 'play-pause':
        if (m) {
          if (m.paused) m.play().catch(() => clickFirst(['ytmusic-player-bar #play-pause-button']));
          else m.pause();
        } else {
          clickFirst(['ytmusic-player-bar #play-pause-button']);
        }
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
          m.currentTime = Math.max(0, Math.min(Number(command.value), Number.isFinite(m.duration) ? m.duration : Number(command.value)));
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
      case 'open':
        location.href = 'https://music.youtube.com/';
        break;
    }

    setTimeout(publishYtmState, 120);
  }

  function publishYtmState() {
    if (!IS_YTM) return;
    const next = readYtmState();
    local.state = next;
    gmSet(STATE_KEY, next);
  }

  function startAdapter() {
    if (!IS_YTM || local.adapterTimer) return;
    publishYtmState();
    local.adapterTimer = setInterval(() => {
      executeCommand(gmGet(COMMAND_KEY, null));
      publishYtmState();
    }, 500);
    console.log('[Nova] YouTube Music adapter active', VERSION);
  }

  function send(action, value) {
    const command = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      action,
      value,
      sentAt: Date.now()
    };
    gmSet(COMMAND_KEY, command);
    if (IS_YTM) executeCommand(command);
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const remainder = Math.floor(value % 60);
    return minutes + ':' + String(remainder).padStart(2, '0');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{position:fixed;z-index:2147483645;width:350px;right:24px;top:120px;background:rgba(8,10,20,.97);color:#fff;border:1px solid rgba(34,211,238,.75);border-radius:16px;box-shadow:0 0 28px rgba(34,211,238,.32);font:12px Arial,sans-serif;overflow:hidden;display:none}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .nym-head{padding:11px 12px;background:linear-gradient(90deg,#0891b2,#7c3aed);display:flex;justify-content:space-between;align-items:center;font-weight:900;cursor:move;user-select:none}
      #${PANEL_ID} .nym-body{padding:12px}
      #${PANEL_ID} .nym-now{display:grid;grid-template-columns:72px minmax(0,1fr);gap:11px;align-items:center}
      #${PANEL_ID} .nym-art{width:72px;height:72px;border-radius:11px;background:rgba(255,255,255,.07);object-fit:cover;border:1px solid rgba(255,255,255,.12)}
      #${PANEL_ID} .nym-title{font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .nym-artist{color:#aeb7c7;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .nym-row{display:flex;gap:7px;align-items:center;margin-top:10px}
      #${PANEL_ID} button{flex:1;background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(34,211,238,.55);border-radius:9px;padding:8px;cursor:pointer;font-weight:800}
      #${PANEL_ID} button:hover{background:rgba(34,211,238,.16)}
      #${PANEL_ID} input[type="range"]{width:100%;accent-color:#22d3ee}
      #${PANEL_ID} .nym-muted{color:#9ca3af;font-size:11px}
      #${PANEL_ID} .nym-close{flex:none;padding:4px 8px;background:rgba(0,0,0,.25)}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function restorePosition(panel) {
    try {
      const pos = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (!pos) return;
      panel.style.left = Math.max(4, Math.min(window.innerWidth - 354, Number(pos.x) || 24)) + 'px';
      panel.style.top = Math.max(4, Math.min(window.innerHeight - 90, Number(pos.y) || 120)) + 'px';
      panel.style.right = 'auto';
    } catch (_) {}
  }

  function bindDrag(panel) {
    const head = panel.querySelector('.nym-head');
    if (!head) return;
    let dragging = false;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let st = 0;

    head.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      sx = event.clientX;
      sy = event.clientY;
      sl = rect.left;
      st = rect.top;
      event.preventDefault();
    });

    document.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      panel.style.left = Math.max(4, Math.min(window.innerWidth - panel.offsetWidth - 4, sl + event.clientX - sx)) + 'px';
      panel.style.top = Math.max(4, Math.min(window.innerHeight - 50, st + event.clientY - sy)) + 'px';
      panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      const rect = panel.getBoundingClientRect();
      try { localStorage.setItem(POSITION_KEY, JSON.stringify({ x: rect.left, y: rect.top })); } catch (_) {}
    });
  }

  function createPanel() {
    injectStyle();
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="nym-head"><span>Nova YouTube Music</span><button class="nym-close" data-nym="close">×</button></div>
      <div class="nym-body"></div>`;
    document.body.appendChild(panel);
    restorePosition(panel);
    bindDrag(panel);
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    local.panel = panel;
    return panel;
  }

  function render() {
    const panel = createPanel();
    const body = panel.querySelector('.nym-body');
    const s = local.state || gmGet(STATE_KEY, null) || {};
    const online = s.connected && Date.now() - Number(s.updatedAt || 0) < 5000;
    const duration = Number(s.duration || 0);
    const current = Math.min(Number(s.currentTime || 0), duration || Number(s.currentTime || 0));

    body.innerHTML = `
      <div class="nym-now">
        ${s.artwork ? `<img class="nym-art" src="${esc(s.artwork)}" alt="">` : '<div class="nym-art"></div>'}
        <div style="min-width:0">
          <div class="nym-title">${esc(s.title || 'No YouTube Music tab connected')}</div>
          <div class="nym-artist">${esc(s.artist || 'Open music.youtube.com and play something')}</div>
          <div class="nym-muted" style="margin-top:7px;color:${online ? '#22c55e' : '#facc15'}">${online ? 'Connected' : 'Waiting for YouTube Music tab'}</div>
        </div>
      </div>
      <div class="nym-row">
        <button data-nym="previous">Prev</button>
        <button data-nym="play-pause">${s.playing ? 'Pause' : 'Play'}</button>
        <button data-nym="next">Next</button>
      </div>
      <div class="nym-row">
        <button data-nym="shuffle">Shuffle</button>
        <button data-nym="repeat">Repeat</button>
        <button data-nym="open">Open YTM</button>
      </div>
      <div style="margin-top:11px">
        <input type="range" data-nym-range="seek" min="0" max="${Math.max(1, duration)}" step="1" value="${current}">
        <div class="nym-muted" style="display:flex;justify-content:space-between"><span>${formatTime(current)}</span><span>${formatTime(duration)}</span></div>
      </div>
      <div class="nym-row">
        <button data-nym="mute">${s.muted ? 'Unmute' : 'Mute'}</button>
        <input type="range" data-nym-range="volume" min="0" max="1" step="0.01" value="${Number.isFinite(Number(s.volume)) ? Number(s.volume) : 1}">
      </div>`;
  }

  function onClick(event) {
    const button = event.target.closest('[data-nym]');
    if (!button) return;
    const action = button.dataset.nym;
    if (action === 'close') {
      hide();
      return;
    }
    if (action === 'open') {
      window.open('https://music.youtube.com/', 'novaYouTubeMusic');
      return;
    }
    send(action);
  }

  function onInput(event) {
    const input = event.target.closest('[data-nym-range]');
    if (!input) return;
    send(input.dataset.nymRange, Number(input.value));
  }

  function show() {
    local.visible = true;
    const panel = createPanel();
    panel.style.display = 'block';
    render();
    if (!local.remoteTimer) {
      local.remoteTimer = setInterval(() => {
        local.state = gmGet(STATE_KEY, null);
        if (local.visible) render();
      }, 750);
    }
  }

  function hide() {
    local.visible = false;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
  }

  function toggle() {
    if (local.visible) hide();
    else show();
  }

  window.NovaYouTubeMusicRemote = {
    version: VERSION,
    show,
    hide,
    toggle,
    send,
    getState: () => gmGet(STATE_KEY, null),
    isAdapter: IS_YTM
  };

  startAdapter();
  console.log('[Nova] YouTube Music Remote loaded', VERSION, IS_YTM ? '(adapter)' : '(remote)');
})();
