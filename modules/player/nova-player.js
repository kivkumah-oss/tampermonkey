// modules/player/nova-player.js

(function () {
  'use strict';
  if (window.NovaPlayer) return;

  const VERSION = '0.1.1';
  const PANEL_ID = 'nova-player';
  const STYLE_ID = 'nova-player-style';
  const STATE_KEY = 'nova.ytm.state.v1';
  const COMMAND_KEY = 'nova.ytm.command.v1';
  const POSITION_KEY = 'nova.player.position.v1';
  const SOURCE_KEY = 'nova.player.source.v1';

  const state = {
    visible: false,
    panel: null,
    source: readLocal(SOURCE_KEY, 'youtube-music'),
    ytm: null,
    sunoMessage: 'Prime Library opens a small authenticated Suno window and captures your saved songs.',
    timer: null
  };

  function gmGet(key, fallback) {
    try { return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback; }
    catch (_) { return fallback; }
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

  function readLocal(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (_) { return fallback; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function node(tag, options = {}, children = []) {
    const el = document.createElement(tag);
    if (options.id) el.id = options.id;
    if (options.className) el.className = options.className;
    if (options.text !== undefined) el.textContent = String(options.text);
    if (options.type) el.type = options.type;
    if (options.src) el.src = options.src;
    if (options.alt !== undefined) el.alt = options.alt;
    if (options.title) el.title = options.title;
    if (options.style) el.style.cssText = options.style;
    for (const [key, value] of Object.entries(options.dataset || {})) el.dataset[key] = String(value);
    for (const [key, value] of Object.entries(options.attrs || {})) el.setAttribute(key, String(value));
    for (const child of Array.isArray(children) ? children : [children]) if (child) el.appendChild(child);
    return el;
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    return Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');
  }

  function send(action, value) {
    gmSet(COMMAND_KEY, {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      action,
      value,
      sentAt: Date.now()
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{position:fixed;z-index:2147483645;width:390px;right:24px;top:110px;background:rgba(7,9,18,.98);color:#fff;border:1px solid rgba(34,211,238,.78);border-radius:18px;box-shadow:0 0 30px rgba(34,211,238,.34),0 18px 55px rgba(0,0,0,.5);font:12px Arial,sans-serif;overflow:hidden;display:none}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .np-head{padding:11px 12px;background:linear-gradient(90deg,#0891b2,#7c3aed,#db2777);display:flex;justify-content:space-between;align-items:center;font-weight:900;cursor:move;user-select:none}
      #${PANEL_ID} .np-head-actions{display:flex;gap:6px}
      #${PANEL_ID} button{background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(34,211,238,.55);border-radius:9px;padding:8px;cursor:pointer;font-weight:800}
      #${PANEL_ID} button:hover{background:rgba(34,211,238,.16)}
      #${PANEL_ID} .np-small{padding:4px 8px;background:rgba(0,0,0,.25)}
      #${PANEL_ID} .np-body{padding:12px}
      #${PANEL_ID} .np-sources{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px}
      #${PANEL_ID} .np-sources button.active{background:linear-gradient(90deg,rgba(8,145,178,.55),rgba(124,58,237,.55));box-shadow:0 0 14px rgba(34,211,238,.25)}
      #${PANEL_ID} .np-now{display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;align-items:center;padding:10px;border:1px solid rgba(34,211,238,.2);border-radius:13px;background:rgba(255,255,255,.025)}
      #${PANEL_ID} .np-art{width:84px;height:84px;border-radius:12px;background:rgba(255,255,255,.07);object-fit:cover;border:1px solid rgba(255,255,255,.12)}
      #${PANEL_ID} .np-title{font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .np-artist{color:#aeb7c7;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .np-status{font-size:11px;margin-top:7px}
      #${PANEL_ID} .np-row{display:flex;gap:7px;align-items:center;margin-top:10px}
      #${PANEL_ID} .np-row button{flex:1}
      #${PANEL_ID} input[type=range]{width:100%;accent-color:#22d3ee}
      #${PANEL_ID} .np-times{display:flex;justify-content:space-between;color:#9ca3af;font-size:10px;margin-top:3px}
      #${PANEL_ID} .np-footer{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:11px}
      #${PANEL_ID} .np-placeholder{padding:15px;border:1px dashed rgba(168,85,247,.45);border-radius:13px;color:#c4b5fd;line-height:1.45;background:rgba(124,58,237,.08)}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createPanel() {
    injectStyle();
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = node('div', { id: PANEL_ID });
    const head = node('div', { className: 'np-head' }, [
      node('span', { text: 'Nova Player' }),
      node('div', { className: 'np-head-actions' }, [
        node('button', { className: 'np-small', text: 'RGB', type: 'button', dataset: { np: 'rgb' } }),
        node('button', { className: 'np-small', text: '×', type: 'button', dataset: { np: 'close' } })
      ])
    ]);
    panel.append(head, node('div', { className: 'np-body' }));
    document.body.appendChild(panel);
    restorePosition(panel);
    bindDrag(panel, head);
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    state.panel = panel;
    return panel;
  }

  function sourceButtons() {
    return node('div', { className: 'np-sources' }, [
      node('button', { text: 'Suno', type: 'button', className: state.source === 'suno' ? 'active' : '', dataset: { source: 'suno' } }),
      node('button', { text: 'YouTube Music', type: 'button', className: state.source === 'youtube-music' ? 'active' : '', dataset: { source: 'youtube-music' } })
    ]);
  }

  function renderYtm(body) {
    const s = state.ytm || gmGet(STATE_KEY, null) || {};
    const online = Boolean(s.connected && Date.now() - Number(s.updatedAt || 0) < 5000);
    const duration = Number(s.duration || 0);
    const current = Math.min(Number(s.currentTime || 0), duration || Number(s.currentTime || 0));

    const artwork = s.artwork ? node('img', { className: 'np-art', src: s.artwork, alt: '' }) : node('div', { className: 'np-art' });
    const info = node('div', { style: 'min-width:0' }, [
      node('div', { className: 'np-title', text: s.title || 'No YouTube Music player connected' }),
      node('div', { className: 'np-artist', text: s.artist || 'Open YouTube Music and play something' }),
      node('div', { className: 'np-status', text: online ? 'Connected' : 'Waiting for YouTube Music tab', style: `color:${online ? '#22c55e' : '#facc15'}` })
    ]);
    body.appendChild(node('div', { className: 'np-now' }, [artwork, info]));

    body.appendChild(node('div', { className: 'np-row' }, [
      node('button', { text: 'Prev', type: 'button', dataset: { action: 'previous' } }),
      node('button', { text: s.playing ? 'Pause' : 'Play', type: 'button', dataset: { action: 'play-pause' } }),
      node('button', { text: 'Next', type: 'button', dataset: { action: 'next' } })
    ]));

    const seek = node('input', { type: 'range', attrs: { min: 0, max: Math.max(1, duration), step: 1, value: current }, dataset: { range: 'seek' } });
    body.append(node('div', { style: 'margin-top:11px' }, [seek, node('div', { className: 'np-times' }, [node('span', { text: formatTime(current) }), node('span', { text: formatTime(duration) })])]));

    body.appendChild(node('div', { className: 'np-row' }, [
      node('button', { text: 'Shuffle', type: 'button', dataset: { action: 'shuffle' } }),
      node('button', { text: 'Repeat', type: 'button', dataset: { action: 'repeat' } }),
      node('button', { text: 'Open YTM', type: 'button', dataset: { action: 'open-ytm' } })
    ]));

    const volume = node('input', { type: 'range', attrs: { min: 0, max: 1, step: 0.01, value: Number.isFinite(Number(s.volume)) ? Number(s.volume) : 1 }, dataset: { range: 'volume' } });
    body.appendChild(node('div', { className: 'np-row' }, [node('button', { text: s.muted ? 'Unmute' : 'Mute', type: 'button', dataset: { action: 'mute' } }), volume]));
    body.appendChild(node('div', { className: 'np-footer' }, [
      node('button', { text: 'Queue', type: 'button', dataset: { action: 'queue' } }),
      node('button', { text: 'Lyrics', type: 'button', dataset: { action: 'lyrics' } }),
      node('button', { text: 'Settings', type: 'button', dataset: { action: 'settings' } })
    ]));
  }

  function renderSuno(body) {
    body.appendChild(node('div', { className: 'np-placeholder' }, [
      node('b', { text: 'Suno library remote' }),
      node('div', { text: state.sunoMessage, style: 'margin-top:7px' })
    ]));
    body.appendChild(node('div', { className: 'np-row' }, [
      node('button', { text: 'Open Remote', type: 'button', dataset: { action: 'open-suno' } }),
      node('button', { text: 'Prime Library', type: 'button', dataset: { action: 'prime-suno' } }),
      node('button', { text: 'Open Suno.com', type: 'button', dataset: { action: 'open-suno-site' } })
    ]));
  }

  function render() {
    const panel = createPanel();
    const body = panel.querySelector('.np-body');
    body.replaceChildren(sourceButtons());
    if (state.source === 'suno') renderSuno(body);
    else renderYtm(body);
  }

  async function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.source) {
      state.source = button.dataset.source;
      writeLocal(SOURCE_KEY, state.source);
      render();
      return;
    }
    const action = button.dataset.np || button.dataset.action;
    if (action === 'close') hide();
    else if (action === 'rgb') document.body.classList.toggle('nova-player-rgb');
    else if (['previous','play-pause','next','shuffle','repeat','mute'].includes(action)) send(action);
    else if (action === 'open-ytm') window.open('https://music.youtube.com/', '_blank');
    else if (action === 'open-suno-site') window.open('https://suno.com/me', '_blank');
    else if (action === 'open-suno') await openSunoRemote(false);
    else if (action === 'prime-suno') await openSunoRemote(true);
  }

  function sunoRemoteModule() {
    try {
      const loader = window.NovaModuleLoader;
      const registry = loader && typeof loader.getRegistry === 'function'
        ? loader.getRegistry()
        : window.Nova && Array.isArray(window.Nova.modulesRegistry)
          ? window.Nova.modulesRegistry
          : [];
      return registry.find((item) => item && item.id === 'nova-suno-remote-any-page') || null;
    } catch (_) {
      return null;
    }
  }

  function refreshSuno(message) {
    state.sunoMessage = message;
    if (state.visible && state.source === 'suno') render();
  }

  async function getSunoRemote() {
    if (window.NovaSunoRemoteAnyPage) return window.NovaSunoRemoteAnyPage;

    const loader = window.NovaModuleLoader;
    const module = sunoRemoteModule();
    if (loader && module && typeof loader.loadScript === 'function') {
      await loader.loadScript(module, { manual: true });
      if (window.NovaSunoRemoteAnyPage) return window.NovaSunoRemoteAnyPage;
    }

    // Keep the document-event bridge as a fallback for Firefox userscript sandboxes.
    try {
      document.dispatchEvent(new CustomEvent('nova-module-command', {
        detail: { action: 'launch', id: 'nova-suno-remote-any-page' }
      }));
    } catch (_) {}

    return new Promise((resolve) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (window.NovaSunoRemoteAnyPage || attempts >= 12) {
          clearInterval(timer);
          resolve(window.NovaSunoRemoteAnyPage || null);
        }
      }, 100);
    });
  }

  async function openSunoRemote(prime) {
    refreshSuno(prime ? 'Preparing your authenticated Suno library capture...' : 'Loading the Suno Remote...');
    try {
      const remote = await getSunoRemote();
      if (!remote) throw new Error('Nova Suno Remote did not load.');
      if (prime) {
        if (typeof remote.prime !== 'function') throw new Error('Prime Library is unavailable.');
        remote.prime();
        refreshSuno('Prime Library opened. The tiny Suno window will capture your library, then this remote can play it anywhere.');
      } else {
        if (typeof remote.show !== 'function') throw new Error('Open Remote is unavailable.');
        remote.show();
        refreshSuno('Suno Remote opened with your saved library, lyrics reader, and RGB Lab.');
      }
    } catch (error) {
      console.warn('[Nova Player] Suno hand-off failed', error);
      refreshSuno('Suno Remote could not start: ' + (error && error.message ? error.message : 'unknown error'));
    }
  }

  function onInput(event) {
    const type = event.target && event.target.dataset ? event.target.dataset.range : '';
    if (type === 'seek') send('seek', Number(event.target.value));
    if (type === 'volume') send('volume', Number(event.target.value));
  }

  function restorePosition(panel) {
    try {
      const pos = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (!pos) return;
      panel.style.left = Math.max(4, Math.min(window.innerWidth - 394, Number(pos.x) || 24)) + 'px';
      panel.style.top = Math.max(4, Math.min(window.innerHeight - 90, Number(pos.y) || 110)) + 'px';
      panel.style.right = 'auto';
    } catch (_) {}
  }

  function bindDrag(panel, head) {
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    head.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      dragging = true; sx = event.clientX; sy = event.clientY; sl = rect.left; st = rect.top;
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

  function poll() {
    state.ytm = gmGet(STATE_KEY, null);
    if (state.visible && state.source === 'youtube-music') render();
  }

  function show() {
    state.visible = true;
    const panel = createPanel();
    panel.style.display = 'block';
    render();
    if (!state.timer) state.timer = setInterval(poll, 700);
  }

  function hide() {
    state.visible = false;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
  }

  window.NovaPlayer = {
    version: VERSION,
    show,
    hide,
    toggle: () => state.visible ? hide() : show(),
    setSource(source) {
      state.source = source === 'suno' ? 'suno' : 'youtube-music';
      writeLocal(SOURCE_KEY, state.source);
      render();
    }
  };

  console.log('[Nova] Nova Player loaded', VERSION);
})();
