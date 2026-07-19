// core/nova-audio-theme.js

(function () {
  'use strict';

  if (window.NovaAudioTheme) return;

  const VERSION = '0.1.2';
  const STYLE_ID = 'nova-audio-theme-core-style';
  const STORE_KEY = 'nova.audioTheme.settings';

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

  const DEFAULT_SETTINGS = {
    enabled: true,
    source: 'balanced',
    palette: 'nova',
    intensity: 'medium',
    syntheticFallback: true,
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

  const PALETTES = {
    nova: {
      name: 'Nova RGB',
      hues: [188, 264, 322]
    },
    fire: {
      name: 'Fire',
      hues: [8, 32, 52]
    },
    cyber: {
      name: 'Cyber',
      hues: [174, 205, 112]
    },
    violet: {
      name: 'Violet',
      hues: [264, 304, 224]
    },
    ice: {
      name: 'Ice',
      hues: [188, 205, 222]
    },
    toxic: {
      name: 'Toxic',
      hues: [116, 78, 142]
    }
  };

  const state = {
    settings: readSettings(),
    context: null,
    analyser: null,
    analyserConnected: false,
    sourceNodes: new WeakMap(),
    boundAudio: new WeakSet(),
    source: null,
    audio: null,
    data: null,
    frame: 0,
    run: 0,
    mode: 'idle',
    targets: new Map(),
    autoTimer: null,
    lastMetrics: {
      energy: 0,
      bass: 0,
      mid: 0,
      high: 0,
      react: 0,
      hues: PALETTES.nova.hues.slice(),
      mode: 'idle'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeSettings(value) {
    const saved = value && typeof value === 'object' ? value : {};
    const parts = {
      ...DEFAULT_SETTINGS.parts,
      ...(saved.parts && typeof saved.parts === 'object' ? saved.parts : {})
    };

    const source = ['balanced', 'energy', 'bass', 'mid', 'high'].includes(saved.source)
      ? saved.source
      : DEFAULT_SETTINGS.source;

    const palette = PALETTES[saved.palette]
      ? saved.palette
      : DEFAULT_SETTINGS.palette;

    const intensity = ['soft', 'medium', 'gremlin'].includes(saved.intensity)
      ? saved.intensity
      : DEFAULT_SETTINGS.intensity;

    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      enabled: saved.enabled !== false,
      syntheticFallback: saved.syntheticFallback !== false,
      source,
      palette,
      intensity,
      parts
    };
  }

  function readSettings() {
    return normalizeSettings(readJson(STORE_KEY, {}));
  }

  function saveSettings() {
    writeJson(STORE_KEY, state.settings);
    emitNovaEvent('nova-audio-theme-settings-change', clone(state.settings));
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .nova-audio-theme {
        --nova-audio-energy: 0;
        --nova-audio-bass: 0;
        --nova-audio-mid: 0;
        --nova-audio-high: 0;
        --nova-audio-react: 0;
        --nova-h1: 188;
        --nova-h2: 264;
        --nova-h3: 322;
        --nova-audio-bg-a1: .08;
        --nova-audio-bg-a2: .07;
        --nova-audio-head-l1: 14%;
        --nova-audio-head-l2: 16%;
        --nova-audio-button-blur: 4px;
        --nova-audio-button-alpha: .18;
        --nova-audio-progress-blur: 6px;
        --nova-audio-glow-1: 14px;
        --nova-audio-glow-2: 24px;
        --nova-audio-glow-a1: .20;
        --nova-audio-glow-a2: .09;
        --nova-audio-saturate: 1;
        --nova-audio-brightness: 1;
        transition:
          border-color 90ms linear,
          box-shadow 90ms linear,
          filter 90ms linear;
      }

      .nova-audio-theme.nova-audio-live {
        filter:
          saturate(var(--nova-audio-saturate))
          brightness(var(--nova-audio-brightness));
      }

      @media (prefers-reduced-motion: reduce) {
        .nova-audio-theme {
          transition: none !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function intensityScale(name) {
    if (name === 'soft') return 0.55;
    if (name === 'gremlin') return 1.35;
    return 0.88;
  }

  function signalFor(source, energy, bass, mid, high) {
    if (source === 'energy') return energy;
    if (source === 'bass') return bass;
    if (source === 'mid') return mid;
    if (source === 'high') return high;

    return Math.min(
      1,
      (energy * 0.34) +
      (bass * 0.30) +
      (mid * 0.22) +
      (high * 0.14)
    );
  }

  function currentPalette() {
    const selected = PALETTES[state.settings.palette] || PALETTES.nova;
    return selected.hues.slice();
  }

  function averageRange(data, start, end) {
    const safeEnd = Math.min(data.length, end);
    let total = 0;
    let count = 0;

    for (let i = start; i < safeEnd; i += 1) {
      total += data[i] || 0;
      count += 1;
    }

    return count ? total / count : 0;
  }

  function metricsToVars(energy, bass, mid, high) {
    const signal = signalFor(
      state.settings.source,
      energy,
      bass,
      mid,
      high
    );

    const react = state.settings.enabled
      ? Math.max(0, Math.min(1, signal * intensityScale(state.settings.intensity)))
      : 0;

    const palette = currentPalette();
    const driftSpeed = state.settings.intensity === 'gremlin' ? 65 : 180;
    const drift = performance.now() / driftSpeed;

    const hues = palette.map((hue, index) =>
      Math.round((hue + drift + (index * react * 18)) % 360)
    );

    return {
      metrics: {
        energy,
        bass,
        mid,
        high,
        react,
        hues,
        mode: state.mode
      },
      vars: {
        '--nova-audio-energy': energy.toFixed(3),
        '--nova-audio-bass': bass.toFixed(3),
        '--nova-audio-mid': mid.toFixed(3),
        '--nova-audio-high': high.toFixed(3),
        '--nova-audio-react': react.toFixed(3),
        '--nova-h1': String(hues[0]),
        '--nova-h2': String(hues[1]),
        '--nova-h3': String(hues[2]),
        '--nova-audio-bg-a1': (0.08 + react * 0.18).toFixed(3),
        '--nova-audio-bg-a2': (0.07 + react * 0.16).toFixed(3),
        '--nova-audio-head-l1': `${Math.round(14 + react * 14)}%`,
        '--nova-audio-head-l2': `${Math.round(16 + react * 16)}%`,
        '--nova-audio-button-blur': `${Math.round(4 + react * 16)}px`,
        '--nova-audio-button-alpha': (0.18 + react * 0.38).toFixed(3),
        '--nova-audio-progress-blur': `${Math.round(6 + react * 16)}px`,
        '--nova-audio-glow-1': `${Math.round(14 + react * 58)}px`,
        '--nova-audio-glow-2': `${Math.round(24 + react * 82)}px`,
        '--nova-audio-glow-a1': Math.min(0.90, 0.20 + react * 0.58).toFixed(3),
        '--nova-audio-glow-a2': Math.min(0.44, 0.09 + react * 0.26).toFixed(3),
        '--nova-audio-saturate': (1 + react * 0.22).toFixed(3),
        '--nova-audio-brightness': (1 + react * 0.08).toFixed(3)
      }
    };
  }

  function targetIsAlive(element) {
    return Boolean(element && element.isConnected);
  }

  function applyPartClasses(element, parts) {
    const knownParts = Object.keys(DEFAULT_SETTINGS.parts);
    const selected = {
      ...state.settings.parts,
      ...(parts && typeof parts === 'object' ? parts : {})
    };

    for (const part of knownParts) {
      element.classList.toggle(
        `nova-audio-part-${part}`,
        Boolean(selected[part])
      );
    }
  }

  function applyFrame(energy, bass, mid, high) {
    const result = metricsToVars(energy, bass, mid, high);
    state.lastMetrics = result.metrics;

    const nodes = [document.documentElement];

    for (const [element, options] of state.targets.entries()) {
      if (!targetIsAlive(element)) {
        state.targets.delete(element);
        continue;
      }

      applyPartClasses(element, options.parts);
      element.classList.toggle(
        'nova-audio-live',
        state.settings.enabled && result.metrics.react > 0.02
      );
      nodes.push(element);
    }

    for (const node of nodes) {
      for (const [key, value] of Object.entries(result.vars)) {
        node.style.setProperty(key, value);
      }
    }

    emitNovaEvent('nova-audio-theme-frame', clone(result.metrics));
  }

  function resetFrame() {
    state.mode = 'idle';
    applyFrame(0, 0, 0, 0);

    for (const element of state.targets.keys()) {
      if (targetIsAlive(element)) {
        element.classList.remove('nova-audio-live');
      }
    }
  }

  function sourceLooksCrossOrigin(audio) {
    const src = String(audio.currentSrc || audio.src || '').trim();
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return false;

    try {
      const url = new URL(src, location.href);
      return url.origin !== location.origin && !audio.crossOrigin;
    } catch (_) {
      return false;
    }
  }

  function ensureGraph(audio) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!state.context || state.context.state === 'closed') {
      state.context = new AudioCtx();
      state.analyser = state.context.createAnalyser();
      state.analyser.fftSize = 256;
      state.analyser.smoothingTimeConstant = 0.82;
      state.data = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.connect(state.context.destination);
      state.analyserConnected = true;
    }

    let source = state.sourceNodes.get(audio);

    if (!source) {
      source = state.context.createMediaElementSource(audio);
      state.sourceNodes.set(audio, source);
    }

    if (state.source !== source) {
      if (state.source) {
        try {
          state.source.disconnect(state.analyser);
        } catch (_) {}
      }

      source.connect(state.analyser);
      state.source = source;
    }
    state.audio = audio;
    return {
      context: state.context,
      analyser: state.analyser,
      data: state.data,
      source
    };
  }

  function startReal(audio) {
    const graph = ensureGraph(audio);
    if (!graph) return false;

    state.mode = 'real';
    const run = ++state.run;

    if (graph.context.state === 'suspended') {
      graph.context.resume().catch(() => {});
    }

    const tick = () => {
      if (run !== state.run) return;
      state.frame = 0;

      if (!state.audio || state.audio.paused || state.audio.ended) {
        resetFrame();
        return;
      }

      graph.analyser.getByteFrequencyData(graph.data);

      const bass = averageRange(graph.data, 0, 10) / 255;
      const mid = averageRange(graph.data, 10, 60) / 255;
      const high = averageRange(graph.data, 60, 128) / 255;
      const energy = Math.min(
        1,
        (bass * 0.55) +
        (mid * 0.32) +
        (high * 0.22)
      );

      applyFrame(energy, bass, mid, high);
      state.frame = requestAnimationFrame(tick);
    };

    state.frame = requestAnimationFrame(tick);
    return true;
  }

  function startSynthetic(audio) {
    state.audio = audio;
    state.mode = 'synthetic';
    const run = ++state.run;

    const tick = () => {
      if (run !== state.run) return;
      state.frame = 0;

      if (!state.audio || state.audio.paused || state.audio.ended) {
        resetFrame();
        return;
      }

      const t = Number(state.audio.currentTime || 0);
      const bass = 0.45 + Math.max(0, Math.sin(t * 5.2)) * 0.35;
      const mid = 0.30 + Math.max(0, Math.sin(t * 8.1 + 1.4)) * 0.28;
      const high = 0.22 + Math.max(0, Math.sin(t * 13.7 + 0.7)) * 0.25;
      const energy = Math.min(
        1,
        (bass * 0.50) +
        (mid * 0.28) +
        (high * 0.18)
      );

      applyFrame(energy, bass, mid, high);
      state.frame = requestAnimationFrame(tick);
    };

    state.frame = requestAnimationFrame(tick);
    return true;
  }

  function stop(reset = true) {
    state.run += 1;

    if (state.frame) {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    }

    if (reset) resetFrame();
    return true;
  }

  function bindAudioEvents(audio, options) {
    if (state.boundAudio.has(audio)) return;

    state.boundAudio.add(audio);

    audio.addEventListener('play', () => {
      if (state.audio === audio && !state.frame) {
        start(audio, options);
      }
    });

    audio.addEventListener('pause', () => {
      if (state.audio === audio) resetFrame();
    });

    audio.addEventListener('ended', () => {
      if (state.audio === audio) resetFrame();
    });
  }

  function start(audio, options = {}) {
    if (!(audio instanceof HTMLMediaElement)) {
      throw new TypeError('NovaAudioTheme.start requires an HTMLMediaElement.');
    }

    stop(false);
    state.audio = audio;
    bindAudioEvents(audio, options);

    const allowSynthetic = options.syntheticFallback !== undefined
      ? Boolean(options.syntheticFallback)
      : state.settings.syntheticFallback;

    if (sourceLooksCrossOrigin(audio) && allowSynthetic && !options.tryReal) {
      return startSynthetic(audio);
    }

    try {
      return startReal(audio);
    } catch (error) {
      console.warn('[Nova Core] Real audio analysis unavailable', error);

      if (allowSynthetic) {
        return startSynthetic(audio);
      }

      resetFrame();
      return false;
    }
  }

  function findPlayingAudio(selector = 'audio,video') {
    const media = Array.from(document.querySelectorAll(selector))
      .filter((node) => node instanceof HTMLMediaElement);

    return media.find((node) => !node.paused && !node.ended) ||
      media.find((node) => Boolean(node.currentSrc || node.src)) ||
      null;
  }

  function autoStart(options = {}) {
    autoStop();

    const selector = options.selector || 'audio,video';
    const interval = Math.max(350, Number(options.interval) || 1000);

    const scan = () => {
      const audio = typeof options.resolve === 'function'
        ? options.resolve()
        : findPlayingAudio(selector);

      if (!audio) return;

      if (state.audio !== audio || state.mode === 'idle') {
        start(audio, options);
      } else if (!audio.paused && !state.frame) {
        start(audio, options);
      }
    };

    scan();
    state.autoTimer = window.setInterval(scan, interval);
    return true;
  }

  function autoStop() {
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
  }

  function registerTarget(element, options = {}) {
    if (!(element instanceof Element)) {
      throw new TypeError('NovaAudioTheme.registerTarget requires a DOM Element.');
    }

    injectStyle();
    element.classList.add('nova-audio-theme');
    state.targets.set(element, {
      parts: {
        ...state.settings.parts,
        ...(options.parts && typeof options.parts === 'object'
          ? options.parts
          : {})
      }
    });

    applyPartClasses(element, state.targets.get(element).parts);

    const metrics = state.lastMetrics;
    applyFrame(
      metrics.energy || 0,
      metrics.bass || 0,
      metrics.mid || 0,
      metrics.high || 0
    );

    return () => unregisterTarget(element);
  }

  function unregisterTarget(element) {
    if (!element) return false;

    state.targets.delete(element);
    element.classList.remove('nova-audio-theme', 'nova-audio-live');

    for (const part of Object.keys(DEFAULT_SETTINGS.parts)) {
      element.classList.remove(`nova-audio-part-${part}`);
    }

    return true;
  }

  function setSettings(patch = {}) {
    const next = {
      ...state.settings,
      ...(patch && typeof patch === 'object' ? patch : {}),
      parts: {
        ...state.settings.parts,
        ...(patch.parts && typeof patch.parts === 'object'
          ? patch.parts
          : {})
      }
    };

    state.settings = normalizeSettings(next);
    saveSettings();

    const metrics = state.lastMetrics;
    applyFrame(
      metrics.energy || 0,
      metrics.bass || 0,
      metrics.mid || 0,
      metrics.high || 0
    );

    return clone(state.settings);
  }

  function setEnabled(enabled) {
    return setSettings({ enabled: Boolean(enabled) });
  }

  function resetSettings() {
    state.settings = normalizeSettings(DEFAULT_SETTINGS);
    saveSettings();
    resetFrame();
    return clone(state.settings);
  }

  function init() {
    injectStyle();

    const palette = window.NovaTheme &&
      typeof window.NovaTheme.getPalette === 'function'
      ? window.NovaTheme.getPalette()
      : null;

    if (Array.isArray(palette) && palette.length >= 3) {
      document.documentElement.style.setProperty('--nova-h1', palette[0]);
      document.documentElement.style.setProperty('--nova-h2', palette[1]);
      document.documentElement.style.setProperty('--nova-h3', palette[2]);
    }

    applyFrame(0, 0, 0, 0);
    return window.NovaAudioTheme;
  }

  window.addEventListener('nova-theme-change', () => {
    const current = window.NovaTheme &&
      typeof window.NovaTheme.getCurrentTheme === 'function'
      ? window.NovaTheme.getCurrentTheme()
      : null;

    if (
      current &&
      Array.isArray(current.palette) &&
      current.palette.length >= 3 &&
      state.mode === 'idle'
    ) {
      document.documentElement.style.setProperty('--nova-h1', current.palette[0]);
      document.documentElement.style.setProperty('--nova-h2', current.palette[1]);
      document.documentElement.style.setProperty('--nova-h3', current.palette[2]);
    }
  });

  window.NovaAudioTheme = {
    version: VERSION,
    palettes: clone(PALETTES),
    defaults: clone(DEFAULT_SETTINGS),

    init,
    start,
    capture: start,
    stop,
    autoStart,
    autoStop,
    findPlayingAudio,
    registerTarget,
    attach: registerTarget,
    unregisterTarget,

    getSettings() {
      return clone(state.settings);
    },

    setSettings,
    setEnabled,
    resetSettings,

    getPalettes() {
      return clone(PALETTES);
    },

    getMetrics() {
      return clone(state.lastMetrics);
    },

    isRunning() {
      return Boolean(state.frame && state.audio && !state.audio.paused);
    },

    getMode() {
      return state.mode;
    }
  };

  init();
  console.log('[Nova Core] NovaAudioTheme loaded', VERSION);
})();
