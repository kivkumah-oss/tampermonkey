// modules/watch/nova-watch.js

(function () {
  'use strict';

  const VERSION = '1.0.1';
  const MODULE_ID = 'nova-watch';
  const STORAGE_KEY = 'nova.watch.integrated.v1';
  const LEGACY_STORAGE_KEY = 'novaWatch.v2';
  const WATCH_ID = 'nova-watch';
  const SETTINGS_ID = 'nova-watch-settings';
  const STYLE_ID = 'nova-watch-integrated-style';

  function emitNovaEvent(type, detail = {}) {
    try {
      if (window.NovaEvents && typeof window.NovaEvents.emit === 'function') {
        return window.NovaEvents.emit(type, detail);
      }
    } catch (_) {}

    try {
      const event = new CustomEvent(type, { detail });
      if (typeof window.dispatchEvent === 'function') return window.dispatchEvent(event);
      if (document && typeof document.dispatchEvent === 'function') return document.dispatchEvent(event);
    } catch (_) {}

    return false;
  }

  if (window.NovaWatch) return;

  const missingCore = [
    ['Nova', window.Nova],
    ['NovaBootstrap', window.NovaBootstrap],
    ['NovaTheme', window.NovaTheme],
    ['NovaAudioTheme', window.NovaAudioTheme],
    ['NovaModuleLoader', window.NovaModuleLoader]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missingCore.length) {
    console.error('[Nova Watch] Core dependency missing:', missingCore.join(', '));
    return;
  }

  const DEFAULTS = {
    x: null,
    y: 52,
    visible: true,
    collapsed: false,
    width: 560,
    height: 100,
    fontWeight: 700,
    neonPower: 145,
    flowSpeed: 7,
    showSeconds: false,
    use24Hour: true,
    audioReactive: true,
    messages: true
  };

  const PRESETS = {
    S: [340, 72],
    M: [560, 100],
    L: [820, 138]
  };

  const MESSAGES = [
    'You survived CPT. Ready for next?',
    "Nice. Let's gooooooooooooo.",
    'One CPT down. Chaos is preparing the next one.',
    'Pink levels stable. Operations questionable.',
    'Another crisis successfully made aesthetic.',
    'Green means operational. Pink means fabulous.',
    'One Bootstrap. Zero adult supervision.',
    'Console full of warnings. Confidence unreasonable.',
    'Manifest says stable. Gremlin says otherwise.',
    'Nova Core online. Probably.'
  ];

  const runtime = {
    watch: null,
    settings: null,
    time: null,
    date: null,
    message: null,
    toggle: null,
    settingsButton: null,
    settingsOpen: false,
    mode: 'normal',
    clockTimer: 0,
    messageTimer: 0,
    messageHideTimer: 0,
    survivalTimer: 0,
    resizeObserver: null,
    detachAudio: null,
    listeners: []
  };

  function storageGet(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        const value = GM_getValue(key, fallback);
        return value === undefined ? fallback : value;
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return true;
      }
    } catch (_) {}

    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  const saved = storageGet(STORAGE_KEY, null) || storageGet(LEGACY_STORAGE_KEY, null) || {};
  const state = { ...DEFAULTS, ...saved };
  if (!Number.isFinite(state.width) && Number.isFinite(saved.expandedWidth)) state.width = saved.expandedWidth;
  if (!Number.isFinite(state.height) && Number.isFinite(saved.expandedHeight)) state.height = saved.expandedHeight;

  function save() {
    storageSet(STORAGE_KEY, { ...state });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    runtime.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  function emit(type, detail = {}) {
    emitNovaEvent(type, { module: MODULE_ID, version: VERSION, ...detail });
  }

  function sessionEvent(type, summary, data = {}) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({ module: MODULE_ID, type, summary, data });
  }

  function removeLegacy() {
    document.querySelectorAll(`#${WATCH_ID},#${SETTINGS_ID}`).forEach((node) => {
      if (node.dataset.novaIntegrated !== 'true') node.remove();
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${WATCH_ID},#${WATCH_ID} *,#${SETTINGS_ID},#${SETTINGS_ID} *{box-sizing:border-box}
      #${WATCH_ID}{
        --nw-speed:7s;--nw-react:var(--nova-audio-react,0);
        position:fixed!important;z-index:2147483645!important;width:560px;height:100px;
        min-width:230px;min-height:54px;max-width:min(94vw,1250px);max-height:min(34vh,280px);
        border:0!important;border-radius:999px!important;overflow:hidden;resize:both;isolation:isolate;
        user-select:none;cursor:grab;color:var(--nova-text,#fff);
        background:radial-gradient(circle at 18% 50%,rgba(255,255,255,.08),transparent 36%),
          radial-gradient(circle at 82% 50%,rgba(255,255,255,.05),transparent 38%),
          var(--nova-bg,rgba(8,3,10,.82))!important;
        backdrop-filter:blur(14px) saturate(calc(1.35 + var(--nw-react)*.65));
        box-shadow:var(--nova-glow,0 0 22px rgba(34,211,238,.42))!important;
        transition:width .28s ease,height .28s ease,filter .1s linear,opacity .18s ease!important
      }
      #${WATCH_ID}[hidden],#${SETTINGS_ID}[hidden]{display:none!important}
      #${WATCH_ID}:active{cursor:grabbing}
      #${WATCH_ID}::before{content:"";position:absolute;inset:0;padding:2px;border-radius:inherit;pointer-events:none;
        background:linear-gradient(100deg,var(--nova-accent,#ff19b7),var(--nova-accent-3,#ff8a20),var(--nova-accent-2,#39ff14),var(--nova-accent,#22d3ee),var(--nova-accent-3,#f472b6),var(--nova-accent,#ff19b7));
        background-size:360% 100%;animation:nwFlow var(--nw-speed) linear infinite;
        -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
      #${WATCH_ID}::after{content:"";position:absolute;inset:-18px;z-index:-1;border-radius:inherit;pointer-events:none;
        background:linear-gradient(100deg,var(--nova-accent,#ff19b7),var(--nova-accent-3,#ff8a20),var(--nova-accent-2,#39ff14),var(--nova-accent,#22d3ee));
        background-size:360% 100%;filter:blur(calc(18px + var(--nw-react)*24px));opacity:calc(.42 + var(--nw-react)*.5);animation:nwFlow var(--nw-speed) linear infinite}
      #${WATCH_ID}.nova-audio-live::before{background:linear-gradient(100deg,hsl(var(--nova-h1,188) 96% 62%),hsl(var(--nova-h2,264) 96% 64%),hsl(var(--nova-h3,322) 96% 62%),hsl(var(--nova-h1,188) 96% 68%));background-size:360% 100%}
      @keyframes nwFlow{from{background-position:0 50%}to{background-position:360% 50%}}
      @keyframes nwAlert{from{filter:brightness(1) saturate(1.15)}to{filter:brightness(1.24) saturate(1.55)}}
      #${WATCH_ID}.nova-watch-alert{--nova-accent:#ff2020;--nova-accent-2:#ff5555;--nova-accent-3:#a80000;animation:nwAlert 1.2s ease-in-out infinite alternate}
      #${WATCH_ID}.nova-watch-acknowledged{--nova-accent:#35ff88;--nova-accent-2:#22d3ee;--nova-accent-3:#a7ff24}
      #${WATCH_ID}.nova-pulse{filter:brightness(1.16) saturate(1.22)}
      #${WATCH_ID}.nova-collapsed{width:176px!important;height:48px!important;min-width:176px;min-height:48px;max-width:176px;max-height:48px;resize:none}
      #nova-watch-inner{position:absolute;inset:0;display:grid;place-items:center;padding:8px 76px 10px 26px}
      #${WATCH_ID}.nova-collapsed #nova-watch-inner{padding:5px 40px 5px 16px}
      #nova-watch-time{font-family:"Arial Rounded MT Bold",Inter,system-ui,sans-serif;font-weight:700;letter-spacing:.045em;line-height:.95;white-space:nowrap;
        background:linear-gradient(90deg,var(--nova-accent,#ff61d2),var(--nova-accent-3,#ff9b35),var(--nova-accent-2,#35ff88),var(--nova-accent,#22d3ee),var(--nova-accent-3,#f472b6));
        background-size:300% 100%;animation:nwFlow var(--nw-speed) linear infinite;-webkit-background-clip:text;background-clip:text;color:transparent;
        -webkit-text-stroke:.35px rgba(255,255,255,.12);transition:opacity .24s ease,transform .24s ease}
      #${WATCH_ID}.nova-audio-live #nova-watch-time{background:linear-gradient(90deg,hsl(var(--nova-h1,188) 96% 68%),hsl(var(--nova-h2,264) 96% 70%),hsl(var(--nova-h3,322) 96% 68%));background-size:300% 100%;-webkit-background-clip:text;background-clip:text}
      #nova-watch-date,#nova-watch-message{position:absolute;left:7%;right:13%;bottom:9%;text-align:center;font:650 12px Inter,system-ui,sans-serif;letter-spacing:.035em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--nova-muted,#d1d5db);transition:opacity .3s ease,transform .3s ease;pointer-events:none}
      #nova-watch-message{opacity:0;transform:translateY(8px);color:var(--nova-accent-2,#a7ff24)}
      #${WATCH_ID}.nova-message #nova-watch-date{opacity:0;transform:translateY(-8px)}
      #${WATCH_ID}.nova-message #nova-watch-message{opacity:1;transform:translateY(0)}
      #${WATCH_ID}.nova-message #nova-watch-time{opacity:.74;transform:translateY(-5%)}
      #${WATCH_ID}.nova-collapsed #nova-watch-date,#${WATCH_ID}.nova-collapsed #nova-watch-message{display:none}
      #nova-watch-controls{position:absolute;right:11px;top:50%;z-index:5;display:flex;gap:4px;transform:translateY(-50%);opacity:0;transition:opacity .16s ease}
      #${WATCH_ID}:hover #nova-watch-controls,#${WATCH_ID}.nova-settings-open #nova-watch-controls{opacity:1}
      #nova-watch-controls button{width:26px;height:26px;padding:0;border:1px solid var(--nova-border,rgba(255,255,255,.25));border-radius:999px;background:rgba(0,0,0,.52);color:var(--nova-text,#fff);font:750 10px/1 system-ui,sans-serif;cursor:pointer}
      #nova-watch-controls button:hover{transform:scale(1.12);box-shadow:var(--nova-glow)}
      #nova-settings-button{font-size:13px!important}
      #${WATCH_ID}.nova-collapsed #nova-size-s,#${WATCH_ID}.nova-collapsed #nova-size-m,#${WATCH_ID}.nova-collapsed #nova-size-l,#${WATCH_ID}.nova-collapsed #nova-settings-button{display:none}
      #${SETTINGS_ID}{position:fixed!important;z-index:2147483647!important;width:360px;padding:15px;border:1px solid var(--nova-border)!important;border-radius:18px!important;
        background:var(--nova-bg,rgba(8,4,11,.96))!important;box-shadow:var(--nova-glow)!important;color:var(--nova-text,#fff);font-family:Inter,system-ui,sans-serif;
        opacity:0;visibility:hidden;transform:translateY(-8px) scale(.98);transform-origin:top right;transition:opacity .16s ease,transform .16s ease,visibility .16s ease;user-select:none}
      #${SETTINGS_ID}.open{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
      #nova-settings-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:12px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;color:var(--nova-accent-2)}
      .nw-range{display:grid;grid-template-columns:128px 1fr 52px;align-items:center;gap:10px;min-height:36px;font-size:12px}.nw-range input{width:100%;accent-color:var(--nova-accent-2)}.nw-value{text-align:right;color:var(--nova-accent-3);font-variant-numeric:tabular-nums}
      .nw-toggle{display:flex;justify-content:space-between;align-items:center;min-height:36px;font-size:12px}.nw-toggle input{accent-color:var(--nova-accent-2);width:18px;height:18px}
      #nova-watch-theme-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:8px;padding-top:10px;border-top:1px solid var(--nova-border)}
      #nova-watch-theme-name{font-size:11px;line-height:1.35;color:var(--nova-accent-2)}
      #nova-next-theme,#nova-reset-settings{padding:8px 10px;border:1px solid var(--nova-border);border-radius:10px;background:rgba(255,255,255,.07);color:var(--nova-text,#fff);font:750 11px/1 system-ui,sans-serif;cursor:pointer}
      #nova-reset-settings{width:100%;margin-top:11px}
      @media(max-width:520px){#${SETTINGS_ID}{width:min(360px,calc(100vw - 16px))}}
      @media(prefers-reduced-motion:reduce){#${WATCH_ID}::before,#${WATCH_ID}::after,#nova-watch-time,#${WATCH_ID}.nova-watch-alert{animation:none!important}}
    `;

    document.documentElement.appendChild(style);
  }

  function createUi() {
    removeLegacy();
    injectStyle();

    const watch = document.createElement('div');
    watch.id = WATCH_ID;
    watch.dataset.novaIntegrated = 'true';
    watch.dataset.novaModule = MODULE_ID;
    watch.innerHTML = `
      <div id="nova-watch-inner">
        <div id="nova-watch-time">00:00</div>
        <div id="nova-watch-date"></div>
        <div id="nova-watch-message"></div>
      </div>
      <div id="nova-watch-controls">
        <button id="nova-size-s" title="Small">S</button>
        <button id="nova-size-m" title="Medium">M</button>
        <button id="nova-size-l" title="Large">L</button>
        <button id="nova-settings-button" title="Nova settings">⚙</button>
        <button id="nova-toggle-size" title="Collapse / expand">−</button>
      </div>`;

    const settings = document.createElement('div');
    settings.id = SETTINGS_ID;
    settings.dataset.novaIntegrated = 'true';
    settings.dataset.novaModule = MODULE_ID;
    settings.innerHTML = `
      <div id="nova-settings-title"><span>Nova Watch</span><span>Core v${VERSION}</span></div>
      <label class="nw-range"><span>Clock thickness</span><input id="nw-weight" type="range" min="300" max="900" step="100"><span id="nw-weight-value" class="nw-value"></span></label>
      <label class="nw-range"><span>Neon power</span><input id="nw-neon" type="range" min="60" max="220" step="5"><span id="nw-neon-value" class="nw-value"></span></label>
      <label class="nw-range"><span>Flow speed</span><input id="nw-speed" type="range" min="3" max="18" step="1"><span id="nw-speed-value" class="nw-value"></span></label>
      <label class="nw-toggle"><span>Show seconds</span><input id="nw-seconds" type="checkbox"></label>
      <label class="nw-toggle"><span>24-hour clock</span><input id="nw-24" type="checkbox"></label>
      <label class="nw-toggle"><span>Audio reaction</span><input id="nw-audio" type="checkbox"></label>
      <label class="nw-toggle"><span>Gremlin messages</span><input id="nw-messages" type="checkbox"></label>
      <div id="nova-watch-theme-row"><div id="nova-watch-theme-name">Theme: loading…</div><button id="nova-next-theme">NEXT THEME</button></div>
      <button id="nova-reset-settings">RESET WATCH SETTINGS</button>`;

    document.documentElement.append(watch, settings);

    runtime.watch = watch;
    runtime.settings = settings;
    runtime.time = watch.querySelector('#nova-watch-time');
    runtime.date = watch.querySelector('#nova-watch-date');
    runtime.message = watch.querySelector('#nova-watch-message');
    runtime.toggle = watch.querySelector('#nova-toggle-size');
    runtime.settingsButton = watch.querySelector('#nova-settings-button');

    window.NovaTheme.inject();
    attachAudio();
    bindUi();
    applyInitialState();
    refreshThemeLabel();
    startTimers();
    startSurvival();
  }

  function attachAudio() {
    if (runtime.detachAudio) {
      runtime.detachAudio();
      runtime.detachAudio = null;
    }

    if (!state.audioReactive) return;

    runtime.detachAudio = window.NovaAudioTheme.attach(runtime.watch, {
      parts: { panel: true, buttons: true, header: false, active: false, progress: false, equalizer: false, orb: false, lyrics: false }
    });

    window.NovaAudioTheme.autoStart({ selector: 'audio,video', interval: 900, syntheticFallback: true });
  }

  function applyPosition() {
    const width = runtime.watch.offsetWidth || state.width;
    const height = runtime.watch.offsetHeight || state.height;
    if (state.x === null) state.x = Math.round((window.innerWidth - width) / 2);
    state.x = clamp(state.x, 8, Math.max(8, window.innerWidth - width - 8));
    state.y = clamp(state.y, 8, Math.max(8, window.innerHeight - height - 8));
    runtime.watch.style.left = `${state.x}px`;
    runtime.watch.style.top = `${state.y}px`;
    positionSettings();
  }

  function positionSettings() {
    if (!runtime.settingsOpen) return;
    const rect = runtime.watch.getBoundingClientRect();
    const width = runtime.settings.offsetWidth || 360;
    const height = runtime.settings.offsetHeight || 320;
    const left = clamp(rect.right - width, 8, Math.max(8, window.innerWidth - width - 8));
    let top = rect.bottom + 10;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 10;
    runtime.settings.style.left = `${left}px`;
    runtime.settings.style.top = `${clamp(top, 8, Math.max(8, window.innerHeight - height - 8))}px`;
  }

  function applyScale() {
    const width = runtime.watch.offsetWidth;
    const height = runtime.watch.offsetHeight;
    const timeSize = state.collapsed ? clamp(height * .48, 18, 24) : clamp(Math.min(width * .14, height * .58), 24, 90);
    const detailSize = clamp(height * .145, 10, 20);
    runtime.time.style.fontSize = `${timeSize}px`;
    runtime.date.style.fontSize = `${detailSize}px`;
    runtime.message.style.fontSize = `${detailSize}px`;
  }

  function applySettings() {
    const power = state.neonPower / 100;
    runtime.watch.style.setProperty('--nw-speed', `${state.flowSpeed}s`);
    runtime.time.style.fontWeight = String(state.fontWeight);
    runtime.time.style.textShadow = `0 0 ${Math.round(14 * power)}px var(--nova-accent),0 0 ${Math.round(20 * power)}px var(--nova-accent-2)`;
    runtime.settings.querySelector('#nw-weight').value = state.fontWeight;
    runtime.settings.querySelector('#nw-neon').value = state.neonPower;
    runtime.settings.querySelector('#nw-speed').value = state.flowSpeed;
    runtime.settings.querySelector('#nw-seconds').checked = state.showSeconds;
    runtime.settings.querySelector('#nw-24').checked = state.use24Hour;
    runtime.settings.querySelector('#nw-audio').checked = state.audioReactive;
    runtime.settings.querySelector('#nw-messages').checked = state.messages;
    runtime.settings.querySelector('#nw-weight-value').textContent = state.fontWeight;
    runtime.settings.querySelector('#nw-neon-value').textContent = `${state.neonPower}%`;
    runtime.settings.querySelector('#nw-speed-value').textContent = `${state.flowSpeed}s`;
    updateClock();
  }

  function updateClock() {
    const now = new Date();
    runtime.time.textContent = now.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: state.showSeconds ? '2-digit' : undefined, hour12: !state.use24Hour
    });
    runtime.date.textContent = now.toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'short' });
  }

  function setCollapsed(value) {
    if (value === state.collapsed) return;
    if (value) {
      state.width = runtime.watch.offsetWidth;
      state.height = runtime.watch.offsetHeight;
      state.collapsed = true;
      runtime.watch.classList.add('nova-collapsed');
      runtime.toggle.textContent = '+';
      closeSettings();
    } else {
      state.collapsed = false;
      runtime.watch.classList.remove('nova-collapsed');
      runtime.watch.style.width = `${state.width}px`;
      runtime.watch.style.height = `${state.height}px`;
      runtime.toggle.textContent = '−';
    }
    requestAnimationFrame(() => { applyPosition(); applyScale(); save(); });
  }

  function setPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.collapsed = false;
    runtime.watch.classList.remove('nova-collapsed');
    runtime.toggle.textContent = '−';
    [state.width, state.height] = preset;
    runtime.watch.style.width = `${state.width}px`;
    runtime.watch.style.height = `${state.height}px`;
    requestAnimationFrame(() => { applyPosition(); applyScale(); save(); });
  }

  function openSettings() {
    if (state.collapsed) return;
    runtime.settingsOpen = true;
    runtime.watch.classList.add('nova-settings-open');
    runtime.settings.classList.add('open');
    refreshThemeLabel();
    requestAnimationFrame(positionSettings);
  }

  function closeSettings() {
    runtime.settingsOpen = false;
    runtime.watch.classList.remove('nova-settings-open');
    runtime.settings.classList.remove('open');
  }

  function refreshThemeLabel() {
    const current = window.NovaTheme.current();
    const label = runtime.settings.querySelector('#nova-watch-theme-name');
    label.textContent = `Theme: ${current.theme.name} · Core ${window.Nova.version}`;
  }

  function setMode(mode, message) {
    const value = ['normal', 'alert', 'acknowledged'].includes(String(mode).toLowerCase()) ? String(mode).toLowerCase() : 'normal';
    runtime.mode = value;
    runtime.watch.classList.toggle('nova-watch-alert', value === 'alert');
    runtime.watch.classList.toggle('nova-watch-acknowledged', value === 'acknowledged');
    if (message || value !== 'normal') {
      runtime.message.textContent = message || (value === 'alert' ? 'PS RED ALERT' : 'ALERT ACKNOWLEDGED');
      runtime.watch.classList.add('nova-message');
    } else {
      runtime.watch.classList.remove('nova-message');
    }
    emit('nova-watch-mode-change', { mode: value, message: message || '' });
  }

  function showMessage() {
    if (!state.messages || state.collapsed || runtime.mode !== 'normal') return;
    runtime.message.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    runtime.watch.classList.add('nova-message', 'nova-pulse');
    clearTimeout(runtime.messageHideTimer);
    runtime.messageHideTimer = setTimeout(() => runtime.watch.classList.remove('nova-message', 'nova-pulse'), 7200);
  }

  function scheduleMessage(first = false) {
    clearTimeout(runtime.messageTimer);
    if (!state.messages) return;
    runtime.messageTimer = setTimeout(() => {
      showMessage();
      scheduleMessage(false);
    }, first ? 9000 : 90000 + Math.floor(Math.random() * 90000));
  }

  function show() {
    state.visible = true;
    runtime.watch.hidden = false;
    runtime.settings.hidden = false;
    applyPosition();
    save();
    return true;
  }

  function hide() {
    state.visible = false;
    closeSettings();
    runtime.watch.hidden = true;
    runtime.settings.hidden = true;
    save();
    return true;
  }

  function applyInitialState() {
    if (state.collapsed) {
      runtime.watch.classList.add('nova-collapsed');
      runtime.toggle.textContent = '+';
    } else {
      runtime.watch.style.width = `${state.width}px`;
      runtime.watch.style.height = `${state.height}px`;
    }
    runtime.watch.hidden = !state.visible;
    runtime.settings.hidden = !state.visible;
    requestAnimationFrame(() => { applyPosition(); applyScale(); applySettings(); });
  }

  function bindUi() {
    const watch = runtime.watch;
    const settings = runtime.settings;

    ['S', 'M', 'L'].forEach((name) => listen(watch.querySelector(`#nova-size-${name.toLowerCase()}`), 'click', (event) => {
      event.stopPropagation();
      setPreset(name);
    }));

    listen(runtime.settingsButton, 'click', (event) => { event.stopPropagation(); runtime.settingsOpen ? closeSettings() : openSettings(); });
    listen(runtime.toggle, 'click', (event) => { event.stopPropagation(); setCollapsed(!state.collapsed); });
    listen(watch, 'dblclick', (event) => { if (!event.target.closest('button')) setCollapsed(!state.collapsed); });

    const bindRange = (id, key) => listen(settings.querySelector(id), 'input', (event) => {
      state[key] = Number(event.target.value);
      applySettings();
      save();
    });

    bindRange('#nw-weight', 'fontWeight');
    bindRange('#nw-neon', 'neonPower');
    bindRange('#nw-speed', 'flowSpeed');

    listen(settings.querySelector('#nw-seconds'), 'change', (event) => { state.showSeconds = event.target.checked; applySettings(); save(); });
    listen(settings.querySelector('#nw-24'), 'change', (event) => { state.use24Hour = event.target.checked; applySettings(); save(); });
    listen(settings.querySelector('#nw-audio'), 'change', (event) => { state.audioReactive = event.target.checked; attachAudio(); save(); });
    listen(settings.querySelector('#nw-messages'), 'change', (event) => { state.messages = event.target.checked; scheduleMessage(false); save(); });
    listen(settings.querySelector('#nova-next-theme'), 'click', () => { window.NovaTheme.cycle(); refreshThemeLabel(); });
    listen(settings.querySelector('#nova-reset-settings'), 'click', () => {
      Object.assign(state, { ...DEFAULTS, x: state.x, y: state.y, visible: state.visible, collapsed: state.collapsed, width: state.width, height: state.height });
      attachAudio();
      scheduleMessage(false);
      applySettings();
      save();
    });

    listen(document, 'mousedown', (event) => {
      if (runtime.settingsOpen && !settings.contains(event.target) && !runtime.settingsButton.contains(event.target)) closeSettings();
    }, true);

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    listen(watch, 'mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = watch.getBoundingClientRect();
      if (!state.collapsed && event.clientX > rect.right - 26 && event.clientY > rect.bottom - 26) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      event.preventDefault();
    });

    listen(window, 'mousemove', (event) => {
      if (!dragging) return;
      state.x = clamp(startLeft + event.clientX - startX, 8, Math.max(8, window.innerWidth - watch.offsetWidth - 8));
      state.y = clamp(startTop + event.clientY - startY, 8, Math.max(8, window.innerHeight - watch.offsetHeight - 8));
      watch.style.left = `${state.x}px`;
      watch.style.top = `${state.y}px`;
      positionSettings();
    });

    listen(window, 'mouseup', () => { if (dragging) { dragging = false; save(); } });
    listen(window, 'resize', () => { applyPosition(); save(); });
    listen(window, 'nova-theme-change', () => { refreshThemeLabel(); applySettings(); });
    listen(window, 'nova-watch-set-mode', (event) => setMode(event.detail?.mode || event.detail, event.detail?.message));

    runtime.resizeObserver = new ResizeObserver(() => {
      applyScale();
      if (!state.collapsed) {
        state.width = watch.offsetWidth;
        state.height = watch.offsetHeight;
        save();
      }
      positionSettings();
    });
    runtime.resizeObserver.observe(watch);
  }

  function startTimers() {
    runtime.clockTimer = setInterval(updateClock, 1000);
    updateClock();
    scheduleMessage(true);
  }

  function ensureMounted() {
    document.querySelectorAll(`#${WATCH_ID}`).forEach((node) => { if (node !== runtime.watch) node.remove(); });
    document.querySelectorAll(`#${SETTINGS_ID}`).forEach((node) => { if (node !== runtime.settings) node.remove(); });
    if (!runtime.watch.isConnected) document.documentElement.appendChild(runtime.watch);
    if (!runtime.settings.isConnected) document.documentElement.appendChild(runtime.settings);
  }

  function startSurvival() {
    runtime.survivalTimer = setInterval(ensureMounted, 1500);
  }

  function destroy() {
    clearInterval(runtime.clockTimer);
    clearInterval(runtime.survivalTimer);
    clearTimeout(runtime.messageTimer);
    clearTimeout(runtime.messageHideTimer);
    runtime.listeners.splice(0).forEach((remove) => { try { remove(); } catch (_) {} });
    runtime.resizeObserver?.disconnect();
    runtime.detachAudio?.();
    runtime.watch?.remove();
    runtime.settings?.remove();
    delete window.NovaWatch;
    emit('nova-watch-destroyed');
  }

  window.NovaWatch = {
    version: VERSION,
    moduleId: MODULE_ID,
    requiresCore: true,
    show,
    hide,
    toggle: () => state.visible ? hide() : show(),
    destroy,
    openSettings,
    closeSettings,
    setCollapsed,
    setPreset,
    setMode,
    getState: () => ({ ...state, mode: runtime.mode }),
    getElement: () => runtime.watch,
    getRequirements: () => ({
      bootstrap: window.NovaBootstrap.version,
      core: window.Nova.version,
      theme: window.NovaTheme.version,
      audioTheme: window.NovaAudioTheme.version,
      moduleLoader: window.NovaModuleLoader.version
    })
  };

  createUi();
  sessionEvent('load', 'Nova Watch integrated module loaded', window.NovaWatch.getRequirements());
  emit('nova-watch-ready', { state: window.NovaWatch.getState(), requirements: window.NovaWatch.getRequirements() });
  console.log('[Nova Watch] Integrated module loaded', VERSION);
})();
