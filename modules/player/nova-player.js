// modules/player/nova-player.js

(function () {
  'use strict';
  if (window.NovaPlayer) return;

  const VERSION = '0.4.0';
  const PANEL_ID = 'nova-player';
  const LYRICS_ID = 'nova-ytm-lyrics';
  const RGB_LAB_ID = 'nova-player-rgb-lab';
  const STYLE_ID = 'nova-player-style';
  const STATE_KEY = 'nova.ytm.state.v1';
  const COMMAND_KEY = 'nova.ytm.command.v1';
  const POSITION_KEY = 'nova.player.position.v1';
  const LYRICS_POSITION_KEY = 'nova.player.lyrics.position.v1';
  const SOURCE_KEY = 'nova.player.source.v1';
  const RGB_KEY = 'nova.player.rgb.v1';
  const RGB_SETTINGS_KEY = 'nova.player.rgb.settings.v1';
  const RGB_DEFAULTS = { enabled: true, source: 'balanced', palette: 'nova', intensity: 'medium', parts: { panel: true, header: true, buttons: true, active: true, progress: true, equalizer: true, orb: true, lyrics: true } };
  const RGB_PALETTES = { nova: [188, 264, 322], fire: [12, 38, 0], cyber: [190, 280, 320], violet: [270, 310, 225], ice: [195, 210, 240], toxic: [126, 70, 180] };

  const state = {
    visible: false,
    panel: null,
    lyricsVisible: false,
    lyricsPanel: null,
    lyricsSignature: '',
    source: readLocal(SOURCE_KEY, 'youtube-music'),
    rgb: readLocal(RGB_KEY, 'true') === 'true',
    ytm: null,
    suno: null,
    sunoLoading: false,
    sunoQueryTimer: null,
    rgbLabVisible: false,
    rgbSettings: readJson(RGB_SETTINGS_KEY, RGB_DEFAULTS),
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

  function clamp(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function currentAudio() {
    const active = state.source === 'suno' ? (state.suno || {}) : currentYtmState();
    const audio = active.audio || {};
    return {
      energy: clamp(audio.energy),
      bass: clamp(audio.bass),
      mid: clamp(audio.mid),
      high: clamp(audio.high),
      react: clamp(audio.react),
      hues: Array.isArray(audio.hues) && audio.hues.length >= 3 ? audio.hues : [188, 264, 322]
    };
  }

  function applyReactiveVisuals() {
    const audio = currentAudio();
    const settings = state.rgbSettings;
    const source = settings.source === 'bass' ? audio.bass : settings.source === 'mid' ? audio.mid : settings.source === 'high' ? audio.high : settings.source === 'energy' ? audio.energy : audio.react;
    const scale = settings.intensity === 'soft' ? .6 : settings.intensity === 'gremlin' ? 1.35 : 1;
    const react = state.rgb && settings.enabled ? clamp(source * scale) : 0;
    const [h1, h2, h3] = (RGB_PALETTES[settings.palette] || audio.hues).map((value) => Number(value) || 0);
    for (const panel of [document.getElementById(PANEL_ID), document.getElementById(LYRICS_ID)]) {
      if (!panel) continue;
      panel.classList.toggle('np-rgb', state.rgb);
      panel.style.setProperty('--np-h1', String(h1));
      panel.style.setProperty('--np-h2', String(h2));
      panel.style.setProperty('--np-h3', String(h3));
      if (!state.rgb) {
        panel.style.removeProperty('border-color');
        panel.style.removeProperty('box-shadow');
        continue;
      }
      const glow = Math.round(16 + react * 52);
      const alpha = (0.24 + react * 0.58).toFixed(2);
      panel.style.borderColor = `hsla(${h1},96%,${Math.round(58 + react * 18)}%,.95)`;
      panel.style.boxShadow = `0 0 ${glow}px hsla(${h1},96%,62%,${alpha}),0 0 ${Math.round(glow * 1.6)}px hsla(${h2},96%,62%,${(alpha * 0.48).toFixed(2)}),0 18px 55px rgba(0,0,0,.5)`;
    }
  }

  function visualizer(audio) {
    const strengths = [audio.bass, audio.mid, audio.high, audio.energy, audio.bass, audio.mid, audio.high, audio.energy];
    return node('div', { className: 'np-viz', attrs: { 'aria-hidden': 'true' } }, strengths.map((strength, index) =>
      node('span', { style: `height:${Math.round(4 + clamp(strength) * (14 + (index % 3) * 2))}px` })
    ));
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
      #${PANEL_ID} .np-viz{height:26px;margin-top:9px;padding:5px 8px;display:flex;align-items:end;gap:4px;border-radius:9px;background:rgba(255,255,255,.025);overflow:hidden}
      #${PANEL_ID} .np-viz span{display:block;flex:1;min-height:3px;border-radius:999px;background:linear-gradient(180deg,#22d3ee,#8b5cf6,#ec4899);transform-origin:bottom;transition:height .16s ease,filter .16s ease}
      #${PANEL_ID} .np-suno-list{display:flex;flex-direction:column;gap:6px;max-height:205px;overflow:auto;margin-top:10px;padding-right:2px}
      #${PANEL_ID} .np-suno-item{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:rgba(255,255,255,.035)}
      #${PANEL_ID} .np-suno-item.active{outline:1px solid rgba(34,211,238,.75);background:rgba(34,211,238,.08)}
      #${PANEL_ID} .np-suno-thumb{width:36px;height:36px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.08)}
      #${PANEL_ID} .np-suno-search{width:100%;margin-top:10px;padding:9px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:#0f172a;color:#fff;outline:none}
      #${LYRICS_ID}{position:fixed;z-index:2147483644;width:min(470px,calc(100vw - 24px));height:min(78vh,800px);left:24px;top:110px;background:rgba(7,9,18,.98);color:#fff;border:1px solid rgba(34,211,238,.78);border-radius:18px;box-shadow:0 0 30px rgba(34,211,238,.34),0 18px 55px rgba(0,0,0,.5);font:13px Arial,sans-serif;overflow:hidden;display:none}
      #${LYRICS_ID} *{box-sizing:border-box}
      #${LYRICS_ID} .np-lyrics-head{padding:11px 12px;background:linear-gradient(90deg,#0891b2,#7c3aed,#db2777);display:flex;justify-content:space-between;align-items:center;font-weight:900;cursor:move;user-select:none}
      #${LYRICS_ID} .np-lyrics-actions{display:flex;gap:6px}
      #${LYRICS_ID} button{background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(34,211,238,.55);border-radius:9px;padding:7px 9px;cursor:pointer;font-weight:800}
      #${LYRICS_ID} button:hover{background:rgba(34,211,238,.16)}
      #${LYRICS_ID} .np-lyrics-now{margin:12px 12px 0;padding:10px;border:1px solid rgba(34,211,238,.25);border-radius:12px;background:rgba(255,255,255,.03)}
      #${LYRICS_ID} .np-lyrics-title{font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${LYRICS_ID} .np-lyrics-artist{margin-top:4px;color:#b8c2d5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${LYRICS_ID} .np-lyrics-body{margin:12px;height:calc(100% - 134px);padding:14px;border:1px solid rgba(34,211,238,.2);border-radius:12px;background:rgba(1,4,12,.65);overflow:auto;white-space:pre-wrap;line-height:1.58;color:#eef5ff}
      #${LYRICS_ID} .np-lyrics-empty{color:#b8c2d5;line-height:1.55}
      #${PANEL_ID}.np-rgb,#${LYRICS_ID}.np-rgb{background:radial-gradient(circle at 15% 0%,hsla(var(--np-h1,188),96%,58%,.14),transparent 34%),radial-gradient(circle at 94% 16%,hsla(var(--np-h2,264),96%,58%,.12),transparent 39%),rgba(7,9,18,.98)}
      #${PANEL_ID}.np-rgb .np-head,#${LYRICS_ID}.np-rgb .np-lyrics-head{background:linear-gradient(90deg,hsla(var(--np-h1,188),88%,45%,.95),hsla(var(--np-h2,264),82%,48%,.95),hsla(var(--np-h3,322),84%,48%,.95))}
      #${RGB_LAB_ID}{position:fixed;z-index:2147483646;width:min(365px,calc(100vw - 24px));right:24px;top:96px;background:rgba(7,9,18,.98);color:#fff;border:1px solid rgba(34,211,238,.78);border-radius:18px;box-shadow:0 0 30px rgba(34,211,238,.34),0 18px 55px rgba(0,0,0,.5);font:12px Arial,sans-serif;overflow:hidden;display:none}
      #${RGB_LAB_ID} *{box-sizing:border-box}#${RGB_LAB_ID} .np-rgb-head{padding:11px 12px;background:linear-gradient(90deg,#0891b2,#7c3aed,#db2777);display:flex;justify-content:space-between;align-items:center;font-weight:900;cursor:move;user-select:none}#${RGB_LAB_ID} .np-rgb-body{padding:10px;display:flex;flex-direction:column;gap:9px}#${RGB_LAB_ID} .np-rgb-card{padding:9px;border:1px solid rgba(148,163,184,.24);border-radius:12px;background:rgba(15,23,42,.92)}#${RGB_LAB_ID} .np-rgb-title{font-weight:900;margin-bottom:7px;color:#e0f2fe}#${RGB_LAB_ID} .np-rgb-row{display:flex;gap:6px;flex-wrap:wrap}#${RGB_LAB_ID} button{background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(34,211,238,.65);border-radius:9px;padding:7px 9px;cursor:pointer;font-weight:800}#${RGB_LAB_ID} button.active{background:#0e7490;border-color:#67e8f9}#${RGB_LAB_ID} .np-rgb-note{margin-top:6px;color:#aab5c7;line-height:1.35}
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
    body.appendChild(visualizer(s.audio || {}));

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
    const s = state.suno || {};
    const clip = s.currentClip || {};
    const duration = Number(s.duration || clip.duration || 0);
    const current = Math.min(Number(s.currentTime || 0), duration || Number(s.currentTime || 0));
    const artwork = clip.imageUrl ? node('img', { className: 'np-art', src: clip.imageUrl, alt: '' }) : node('div', { className: 'np-art' });
    body.appendChild(node('div', { className: 'np-now' }, [artwork, node('div', { style: 'min-width:0' }, [
      node('div', { className: 'np-title', text: clip.title || 'No Suno song loaded' }),
      node('div', { className: 'np-artist', text: clip.model || 'Load Direct or Prime your Suno library' }),
      node('div', { className: 'np-status', text: s.status || state.sunoMessage, style: 'color:#67e8f9' })
    ])]));
    body.appendChild(node('div', { className: 'np-row' }, [
      node('button', { text: 'Prev', type: 'button', dataset: { action: 'suno-prev' } }),
      node('button', { text: s.playing ? 'Pause' : 'Play', type: 'button', dataset: { action: 'suno-play' } }),
      node('button', { text: 'Next', type: 'button', dataset: { action: 'suno-next' } })
    ]));
    const seek = node('input', { type: 'range', attrs: { min: 0, max: Math.max(1, duration), step: 1, value: current, disabled: true } });
    body.append(node('div', { style: 'margin-top:11px' }, [seek, node('div', { className: 'np-times' }, [node('span', { text: formatTime(current) }), node('span', { text: formatTime(duration) })])]), visualizer(s.audio || {}));
    body.appendChild(node('div', { className: 'np-row' }, [
      node('button', { text: 'Load Direct', type: 'button', dataset: { action: 'suno-load' } }),
      node('button', { text: 'Prime Quick', type: 'button', dataset: { action: 'suno-prime' } }),
      node('button', { text: 'Prime Full', type: 'button', dataset: { action: 'suno-prime-full' } })
    ]));
    body.appendChild(node('div', { className: 'np-row' }, [
      node('button', { text: 'Shuffle', type: 'button', dataset: { action: 'suno-shuffle' } }),
      node('button', { text: 'Open Suno', type: 'button', dataset: { action: 'open-suno-site' } }),
      node('button', { text: 'Lyrics', type: 'button', dataset: { action: 'suno-lyrics' } })
    ]));
    const search = node('input', { className: 'np-suno-search', attrs: { placeholder: 'Search saved Suno songs...', value: s.query || '' }, dataset: { range: 'suno-query' } });
    body.appendChild(search);
    const list = node('div', { className: 'np-suno-list' });
    const library = Array.isArray(s.visibleLibrary) ? s.visibleLibrary : (Array.isArray(s.library) ? s.library : []);
    library.slice(0, 80).forEach((item, index) => {
      list.appendChild(node('div', { className: 'np-suno-item' + (item.id && item.id === clip.id ? ' active' : '') }, [
        item.imageUrl ? node('img', { className: 'np-suno-thumb', src: item.imageUrl, alt: '' }) : node('div', { className: 'np-suno-thumb' }),
        node('div', { style: 'min-width:0' }, [node('div', { className: 'np-title', text: item.title || 'Untitled' }), node('div', { className: 'np-artist', text: item.model || item.tags || '' })]),
        node('button', { text: 'Play', type: 'button', dataset: { action: 'suno-play-index', index } })
      ]));
    });
    body.appendChild(list);
  }

  function saveRgbSettings() {
    writeLocal(RGB_KEY, String(state.rgb));
    try { localStorage.setItem(RGB_SETTINGS_KEY, JSON.stringify(state.rgbSettings)); } catch (_) {}
    send('audio-settings', state.rgbSettings);
    const remote = window.NovaSunoRemoteAnyPage;
    if (remote && typeof remote.setFxSettings === 'function') {
      remote.setFxSettings({ ...state.rgbSettings, theme: state.rgb ? 'rgb' : 'steady' });
    }
    applyReactiveVisuals();
  }

  function rgbChoice(label, value, active, key) {
    return node('button', { text: label, type: 'button', className: active ? 'active' : '', dataset: { rgbKey: key, rgbValue: value } });
  }

  function rgbCard(title, children, note) {
    const card = node('div', { className: 'np-rgb-card' }, [node('div', { className: 'np-rgb-title', text: title }), node('div', { className: 'np-rgb-row' }, children)]);
    if (note) card.appendChild(node('div', { className: 'np-rgb-note', text: note }));
    return card;
  }

  function createRgbLab() {
    injectStyle();
    let panel = document.getElementById(RGB_LAB_ID);
    if (panel) return panel;
    panel = node('div', { id: RGB_LAB_ID });
    const head = node('div', { className: 'np-rgb-head' }, [node('span', { text: 'Nova RGB Lab' }), node('button', { text: 'x', type: 'button', dataset: { rgbAction: 'close' } })]);
    panel.append(head, node('div', { className: 'np-rgb-body' }));
    document.body.appendChild(panel);
    bindDrag(panel, head, 'nova.player.rgb.lab.position.v1');
    restorePosition(panel, 'nova.player.rgb.lab.position.v1');
    panel.addEventListener('click', onRgbLabClick);
    return panel;
  }

  function renderRgbLab() {
    const panel = createRgbLab();
    const body = panel.querySelector('.np-rgb-body');
    const s = state.rgbSettings;
    body.replaceChildren(
      rgbCard('Power', [rgbChoice(s.enabled ? 'Reactive On' : 'Reactive Off', 'enabled', s.enabled, 'toggle'), rgbChoice(state.rgb ? 'RGB Theme' : 'Steady Theme', 'theme', state.rgb, 'toggle')], 'Shared settings for Suno and YouTube Music.'),
      rgbCard('Reaction Source', [['balanced','Balanced'],['energy','Energy'],['bass','Bass'],['mid','Mids'],['high','Highs']].map(([v,l]) => rgbChoice(l, v, s.source === v, 'source'))),
      rgbCard('Color Style', [['nova','Nova RGB'],['fire','Fire'],['cyber','Cyber'],['violet','Violet'],['ice','Ice'],['toxic','Toxic']].map(([v,l]) => rgbChoice(l, v, s.palette === v, 'palette'))),
      rgbCard('Intensity', [['soft','Soft'],['medium','Medium'],['gremlin','Gremlin']].map(([v,l]) => rgbChoice(l, v, s.intensity === v, 'intensity'))),
      rgbCard('React Parts', [['panel','Panel'],['header','Header'],['buttons','Buttons'],['active','Active Song'],['progress','Progress'],['equalizer','Equalizer'],['lyrics','Lyrics Glow']].map(([v,l]) => rgbChoice(l, v, Boolean(s.parts[v]), 'part')))
    );
  }

  function openRgbLab() {
    state.rgbLabVisible = true;
    const panel = createRgbLab();
    panel.style.display = 'block';
    renderRgbLab();
  }

  function onRgbLabClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.rgbAction === 'close') { state.rgbLabVisible = false; document.getElementById(RGB_LAB_ID).style.display = 'none'; return; }
    const key = button.dataset.rgbKey;
    const value = button.dataset.rgbValue;
    if (!key) return;
    if (key === 'toggle' && value === 'enabled') state.rgbSettings.enabled = !state.rgbSettings.enabled;
    else if (key === 'toggle' && value === 'theme') state.rgb = !state.rgb;
    else if (key === 'part') state.rgbSettings.parts[value] = !state.rgbSettings.parts[value];
    else state.rgbSettings[key] = value;
    saveRgbSettings();
    renderRgbLab();
  }

  function readJson(key, fallback) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return saved && typeof saved === 'object' ? { ...fallback, ...saved, parts: { ...fallback.parts, ...(saved.parts || {}) } } : fallback;
    } catch (_) { return fallback; }
  }

  function render() {
    const panel = createPanel();
    const body = panel.querySelector('.np-body');
    body.replaceChildren(sourceButtons());
    if (state.source === 'suno') renderSuno(body);
    else renderYtm(body);
    applyReactiveVisuals();
  }

  function currentYtmState() {
    return state.ytm || gmGet(STATE_KEY, null) || {};
  }

  function lyricSignature(ytm) {
    const lyrics = ytm && ytm.lyrics ? ytm.lyrics : {};
    return [ytm.title || '', ytm.artist || '', lyrics.text || ''].join('\u0000');
  }

  function currentLyricsState() {
    if (state.source !== 'suno') return currentYtmState();
    const suno = state.suno || {};
    const clip = suno.currentClip || {};
    return { title: clip.title || 'Suno lyrics', artist: clip.model || 'Suno library', lyrics: { text: clip.prompt || '' } };
  }

  function createLyricsPanel() {
    injectStyle();
    let panel = document.getElementById(LYRICS_ID);
    if (panel) return panel;

    panel = node('div', { id: LYRICS_ID });
    const head = node('div', { className: 'np-lyrics-head' }, [
      node('span', { text: 'Nova Lyrics Reader' }),
      node('div', { className: 'np-lyrics-actions' }, [
        node('button', { text: 'Refresh', type: 'button', dataset: { lyricsAction: 'refresh' } }),
        node('button', { text: 'Copy', type: 'button', dataset: { lyricsAction: 'copy' } }),
        node('button', { text: 'x', type: 'button', dataset: { lyricsAction: 'close' } })
      ])
    ]);
    panel.append(head, node('div', { className: 'np-lyrics-now' }), node('div', { className: 'np-lyrics-body' }));
    document.body.appendChild(panel);
    restorePosition(panel, LYRICS_POSITION_KEY);
    bindDrag(panel, head, LYRICS_POSITION_KEY);
    panel.addEventListener('click', onLyricsClick);
    state.lyricsPanel = panel;
    return panel;
  }

  function renderLyrics(force = false) {
    const panel = createLyricsPanel();
    const ytm = currentLyricsState();
    const signature = lyricSignature(ytm);
    if (!force && signature === state.lyricsSignature) return;
    state.lyricsSignature = signature;

    const details = panel.querySelector('.np-lyrics-now');
    const body = panel.querySelector('.np-lyrics-body');
    details.replaceChildren(
      node('div', { className: 'np-lyrics-title', text: ytm.title || (state.source === 'suno' ? 'Suno lyrics' : 'YouTube Music lyrics') }),
      node('div', { className: 'np-lyrics-artist', text: ytm.artist || (state.source === 'suno' ? 'Load a Suno song' : 'Open a track in YouTube Music') })
    );

    const textValue = ytm.lyrics && ytm.lyrics.text ? ytm.lyrics.text : '';
    body.replaceChildren(textValue
      ? node('div', { text: textValue })
      : node('div', {
        className: 'np-lyrics-empty',
        text: state.source === 'suno' ? 'No Suno prompt or lyrics are saved for this song yet.' : 'No lyrics are visible yet. Nova asked YouTube Music to open its Lyrics tab. If this track has lyrics, give it a moment or press Refresh.'
      }));
  }

  function openLyrics() {
    state.lyricsVisible = true;
    const panel = createLyricsPanel();
    panel.style.display = 'block';
    renderLyrics(true);
    if (state.source === 'youtube-music') {
      send('lyrics');
      setTimeout(() => renderLyrics(true), 900);
      setTimeout(() => renderLyrics(true), 2000);
    }
  }

  function hideLyrics() {
    state.lyricsVisible = false;
    const panel = document.getElementById(LYRICS_ID);
    if (panel) panel.style.display = 'none';
  }

  async function onLyricsClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.lyricsAction;
    if (action === 'close') hideLyrics();
    else if (action === 'refresh') {
      if (state.source === 'youtube-music') send('lyrics');
      state.lyricsSignature = '';
      setTimeout(() => renderLyrics(true), 900);
    } else if (action === 'copy') {
      const ytm = currentLyricsState();
      const textValue = ytm.lyrics && ytm.lyrics.text ? ytm.lyrics.text : '';
      if (!textValue) return;
      try {
        await navigator.clipboard.writeText(textValue);
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy'; }, 1000);
      } catch (_) {}
    }
  }

  async function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.source) {
      state.source = button.dataset.source;
      writeLocal(SOURCE_KEY, state.source);
      if (state.source === 'suno') await activateSuno();
      render();
      return;
    }
    const action = button.dataset.np || button.dataset.action;
    if (action === 'close') hide();
    else if (action === 'rgb') openRgbLab();
    else if (['previous','play-pause','next','shuffle','repeat','mute'].includes(action)) send(action);
    else if (action === 'lyrics') openLyrics();
    else if (action === 'suno-lyrics') openLyrics();
    else if (/^suno-/.test(action)) runSuno(action, button.dataset.index);
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

  function syncSuno(remote) {
    const active = remote || window.NovaSunoRemoteAnyPage;
    if (!active || typeof active.getState !== 'function') return null;
    try {
      state.suno = active.getState();
      return state.suno;
    } catch (_) {
      return null;
    }
  }

  async function activateSuno() {
    if (state.sunoLoading) return;
    state.sunoLoading = true;
    refreshSuno('Loading the Suno library engine...');
    try {
      const remote = await getSunoRemote();
      if (!remote) throw new Error('Nova Suno Remote did not load.');
      if (typeof remote.embed === 'function') remote.embed();
      else if (typeof remote.hide === 'function') remote.hide();
      syncSuno(remote);
      refreshSuno('Suno library ready inside Nova Player.');
    } catch (error) {
      refreshSuno('Suno library could not start: ' + (error && error.message ? error.message : 'unknown error'));
    } finally {
      state.sunoLoading = false;
    }
  }

  function runSuno(action, value) {
    const remote = window.NovaSunoRemoteAnyPage;
    if (!remote) return activateSuno();
    const actions = {
      'suno-prev': () => remote.playPrev && remote.playPrev(),
      'suno-play': () => remote.togglePlay && remote.togglePlay(),
      'suno-next': () => remote.playNext && remote.playNext(),
      'suno-shuffle': () => remote.shuffle && remote.shuffle(),
      'suno-load': () => remote.loadDirect && remote.loadDirect(2),
      'suno-prime': () => remote.prime && remote.prime(),
      'suno-prime-full': () => remote.primeFull && remote.primeFull(),
      'suno-play-index': () => remote.playIndex && remote.playIndex(Number(value))
    };
    try { actions[action] && actions[action](); } catch (_) {}
    setTimeout(() => { syncSuno(remote); render(); }, 150);
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
    if (type === 'suno-query') {
      const remote = window.NovaSunoRemoteAnyPage;
      if (remote && typeof remote.setQuery === 'function') {
        remote.setQuery(event.target.value);
        syncSuno(remote);
        clearTimeout(state.sunoQueryTimer);
        state.sunoQueryTimer = setTimeout(render, 260);
      }
    }
  }

  function restorePosition(panel, storageKey = POSITION_KEY) {
    try {
      const pos = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!pos) return;
      panel.style.left = Math.max(4, Math.min(window.innerWidth - 394, Number(pos.x) || 24)) + 'px';
      panel.style.top = Math.max(4, Math.min(window.innerHeight - 90, Number(pos.y) || 110)) + 'px';
      panel.style.right = 'auto';
    } catch (_) {}
  }

  function bindDrag(panel, head, storageKey = POSITION_KEY) {
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
      try { localStorage.setItem(storageKey, JSON.stringify({ x: rect.left, y: rect.top })); } catch (_) {}
    });
  }

  function poll() {
    state.ytm = gmGet(STATE_KEY, null);
    if (state.source === 'suno') syncSuno();
    if (state.visible && state.source === 'youtube-music') render();
    if (state.lyricsVisible) renderLyrics();
    applyReactiveVisuals();
  }

  function show() {
    state.visible = true;
    const panel = createPanel();
    panel.style.display = 'block';
    render();
    if (state.source === 'suno') activateSuno();
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
    showLyrics: openLyrics,
    hideLyrics,
    toggle: () => state.visible ? hide() : show(),
    setSource(source) {
      state.source = source === 'suno' ? 'suno' : 'youtube-music';
      writeLocal(SOURCE_KEY, state.source);
      render();
    }
  };

  console.log('[Nova] Nova Player loaded', VERSION);
})();
