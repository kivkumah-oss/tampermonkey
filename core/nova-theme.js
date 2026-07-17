// core/nova-theme.js

(function () {
  'use strict';

  if (window.NovaTheme) return;

  const VERSION = '1.6.1';
  const THEME_ID = 'nova-core-theme';
  const STORE_KEY = 'nova.theme.active';
  const LEGACY_STORE_KEY = 'nova-theme';

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

  const MODULE_THEMES = {
    default: {
      name: 'Violet Cyber',
      description: 'Classic Nova purple/cyan glow.',
      accent: '#a855f7',
      accent2: '#22d3ee',
      accent3: '#f472b6',
      border: 'rgba(168, 85, 247, 0.45)',
      glow: '0 0 18px rgba(168, 85, 247, 0.65)',
      bg: 'rgba(10, 10, 18, 0.96)',
      panel: 'rgba(20, 20, 35, 0.95)',
      text: '#ffffff',
      muted: '#9ca3af',
      palette: [264, 188, 322]
    },
    violet: {
      name: 'Violet Cyber',
      description: 'Same classic Nova style, explicit theme name.',
      accent: '#7c4dff',
      accent2: '#00e5ff',
      accent3: '#f472b6',
      border: 'rgba(124, 77, 255, 0.55)',
      glow: '0 0 22px rgba(124, 77, 255, 0.65)',
      bg: 'rgba(10, 10, 18, 0.96)',
      panel: 'rgba(20, 20, 35, 0.95)',
      text: '#ffffff',
      muted: '#9ca3af',
      palette: [264, 188, 322]
    },
    venom: {
      name: 'Venom Green',
      description: 'Black, green, and cyan gremlin terminal.',
      accent: '#39ff14',
      accent2: '#00e5ff',
      accent3: '#a7ff24',
      border: 'rgba(57, 255, 20, 0.55)',
      glow: '0 0 22px rgba(57, 255, 20, 0.65)',
      bg: 'rgba(3, 10, 8, 0.97)',
      panel: 'rgba(7, 18, 14, 0.96)',
      text: '#f4fff4',
      muted: '#9be7a0',
      palette: [116, 188, 78]
    },
    fire: {
      name: 'Fire Core',
      description: 'Orange/red/yellow warehouse energy.',
      accent: '#ff3d00',
      accent2: '#ffea00',
      accent3: '#ff8a20',
      border: 'rgba(255, 111, 0, 0.58)',
      glow: '0 0 22px rgba(255, 61, 0, 0.68)',
      bg: 'rgba(16, 9, 6, 0.97)',
      panel: 'rgba(28, 14, 9, 0.96)',
      text: '#fff7ed',
      muted: '#fed7aa',
      palette: [8, 32, 52]
    },
    ice: {
      name: 'Ice Terminal',
      description: 'Clean blue/cyan readable mode.',
      accent: '#38bdf8',
      accent2: '#e0f2fe',
      accent3: '#67e8f9',
      border: 'rgba(56, 189, 248, 0.58)',
      glow: '0 0 22px rgba(56, 189, 248, 0.58)',
      bg: 'rgba(5, 12, 20, 0.97)',
      panel: 'rgba(9, 22, 35, 0.96)',
      text: '#f8fbff',
      muted: '#bae6fd',
      palette: [188, 205, 222]
    },
    matrix: {
      name: 'Matrix',
      description: 'Dark green console mode.',
      accent: '#00ff66',
      accent2: '#00aa44',
      accent3: '#64ffda',
      border: 'rgba(0, 255, 102, 0.52)',
      glow: '0 0 22px rgba(0, 255, 102, 0.58)',
      bg: 'rgba(0, 6, 2, 0.98)',
      panel: 'rgba(0, 14, 5, 0.97)',
      text: '#eaffef',
      muted: '#8fffb5',
      palette: [142, 116, 174]
    },
    rose: {
      name: 'Rose Gold',
      description: 'Pink/gold softer creator mode.',
      accent: '#fb7185',
      accent2: '#fbbf24',
      accent3: '#ff2bd6',
      border: 'rgba(251, 113, 133, 0.55)',
      glow: '0 0 22px rgba(251, 113, 133, 0.58)',
      bg: 'rgba(20, 10, 15, 0.97)',
      panel: 'rgba(32, 16, 24, 0.96)',
      text: '#fff7f8',
      muted: '#fecdd3',
      palette: [344, 42, 322]
    },
    warehouse: {
      name: 'Warehouse Amber',
      description: 'Practical dark amber work mode.',
      accent: '#f59e0b',
      accent2: '#22d3ee',
      accent3: '#facc15',
      border: 'rgba(245, 158, 11, 0.55)',
      glow: '0 0 22px rgba(245, 158, 11, 0.55)',
      bg: 'rgba(12, 12, 10, 0.97)',
      panel: 'rgba(24, 21, 15, 0.96)',
      text: '#fffbea',
      muted: '#fde68a',
      palette: [38, 188, 52]
    },
    player: {
      name: 'Nova Player',
      description: 'The living Nova Player palette: cyan, violet, pink, and smooth full-spectrum drift.',
      accent: '#22d3ee',
      accent2: '#a78bfa',
      accent3: '#f472b6',
      border: 'rgba(56, 189, 248, 0.66)',
      glow: '0 0 26px rgba(34, 211, 238, 0.40), 0 0 44px rgba(124, 58, 237, 0.24)',
      bg: 'rgba(9, 11, 20, 0.97)',
      panel: 'rgba(15, 23, 42, 0.94)',
      text: '#f8fafc',
      muted: '#aab5c7',
      palette: [188, 264, 322],
      animated: true,
      audioReactive: true
    },
    amazon: {
      name: 'Amazon Orange',
      description: 'Orange/yellow work-tool style.',
      accent: '#f97316',
      accent2: '#facc15',
      accent3: '#22d3ee',
      border: 'rgba(249, 115, 22, 0.5)',
      glow: '0 0 18px rgba(249, 115, 22, 0.65)',
      palette: [24, 52, 188]
    },
    spp: {
      name: 'SPP Hotpick',
      description: 'Orange/red alert style.',
      accent: '#f97316',
      accent2: '#ef4444',
      accent3: '#facc15',
      border: 'rgba(249, 115, 22, 0.55)',
      glow: '0 0 18px rgba(249, 115, 22, 0.7)',
      palette: [24, 0, 52]
    },
    stealth: {
      name: 'Stealth',
      description: 'Low-noise grey mode.',
      accent: '#111827',
      accent2: '#374151',
      accent3: '#9ca3af',
      border: 'rgba(156, 163, 175, 0.35)',
      glow: '0 0 14px rgba(156, 163, 175, 0.35)',
      palette: [220, 220, 220]
    },
    neon: {
      name: 'Neon Pink',
      description: 'Cyan/pink neon mode.',
      accent: '#22d3ee',
      accent2: '#ec4899',
      accent3: '#a855f7',
      border: 'rgba(34, 211, 238, 0.55)',
      glow: '0 0 22px rgba(236, 72, 153, 0.55)',
      palette: [188, 322, 264]
    },
    rgb: {
      name: 'Nova Player RGB',
      description: 'The Nova Player living UI: smooth colour flow with optional audio-reactive bass glow.',
      accent: '#22d3ee',
      accent2: '#a78bfa',
      accent3: '#f472b6',
      border: 'rgba(56, 189, 248, 0.66)',
      glow: '0 0 26px rgba(34, 211, 238, 0.40), 0 0 44px rgba(124, 58, 237, 0.24)',
      bg: 'rgba(8, 8, 16, 0.97)',
      panel: 'rgba(14, 14, 28, 0.96)',
      text: '#ffffff',
      muted: '#d1d5db',
      palette: [188, 264, 322],
      animated: true,
      audioReactive: true
    }
  };

  function hasTheme(name) {
    return Boolean(MODULE_THEMES[String(name || '').trim().toLowerCase()]);
  }

  function safeName(name) {
    const id = String(name || '').trim().toLowerCase();
    return hasTheme(id) ? id : 'default';
  }

  function activeName() {
    try {
      const stored = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY) || 'default';
      return safeName(stored);
    } catch (_) {
      return 'default';
    }
  }

  function activeTheme() {
    return MODULE_THEMES[activeName()] || MODULE_THEMES.default;
  }

  function mergedTheme(theme) {
    const merged = { ...MODULE_THEMES.default, ...(theme || {}) };
    const palette = Array.isArray(merged.palette) && merged.palette.length >= 3
      ? merged.palette
      : MODULE_THEMES.default.palette;
    merged.palette = palette.slice(0, 3);
    return merged;
  }

  function cssVars(theme) {
    const merged = mergedTheme(theme);
    return `
      --nova-bg: ${merged.bg};
      --nova-panel: ${merged.panel};
      --nova-text: ${merged.text};
      --nova-muted: ${merged.muted};
      --nova-accent: ${merged.accent};
      --nova-accent-2: ${merged.accent2};
      --nova-accent-3: ${merged.accent3};
      --nova-border: ${merged.border};
      --nova-glow: ${merged.glow};
      --nova-h1: ${merged.palette[0]};
      --nova-h2: ${merged.palette[1]};
      --nova-h3: ${merged.palette[2]};
      --nova-audio-energy: 0;
      --nova-audio-bass: 0;
      --nova-audio-mid: 0;
      --nova-audio-high: 0;
      --nova-audio-react: 0;
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
    `;
  }

  function buildModuleThemeCss() {
    return Object.entries(MODULE_THEMES)
      .filter(([name]) => name !== 'default')
      .map(([name, theme]) => `
        .nova-module-${name},
        [data-nova-module="${name}"] { ${cssVars(theme)} }
      `)
      .join('\n');
  }

  function buildAnimatedCss() {
    const animated = activeName() === 'rgb' || activeName() === 'player';
    if (!animated) return '';

    return `
      #nova-modules-menu > div:first-child,
      #nova-memory-panel > div:first-child,
      #nova-suno-player .nsp-head,
      .nova-header,
      .nova-player-gradient {
        background:
          linear-gradient(
            100deg,
            #7c4dff,
            #3b82f6,
            #22d3ee,
            #14b8a6,
            #39ff14,
            #ff8a1f,
            #ff2bd6,
            #7c4dff
          ) !important;
        background-size: 700% 100% !important;
        animation: novaPlayerGradient 13s linear infinite;
      }

      #nova-modules-button,
      #nova-modules-menu,
      #nova-memory-panel,
      #nova-suno-player,
      .nova-window,
      .nova-player-glow {
        animation: novaPlayerGlow 12s linear infinite;
      }

      @keyframes novaPlayerGradient {
        0% { background-position: 0% 50%; }
        100% { background-position: 700% 50%; }
      }

      @keyframes novaPlayerGlow {
        0%, 100% {
          border-color: rgba(124, 77, 255, .72) !important;
          box-shadow: 0 0 24px rgba(124, 77, 255, .50), 0 0 44px rgba(34, 211, 238, .18) !important;
        }
        17% {
          border-color: rgba(59, 130, 246, .72) !important;
          box-shadow: 0 0 25px rgba(59, 130, 246, .48), 0 0 45px rgba(34, 211, 238, .20) !important;
        }
        34% {
          border-color: rgba(34, 211, 238, .76) !important;
          box-shadow: 0 0 27px rgba(34, 211, 238, .52), 0 0 47px rgba(20, 184, 166, .20) !important;
        }
        51% {
          border-color: rgba(57, 255, 20, .68) !important;
          box-shadow: 0 0 28px rgba(57, 255, 20, .42), 0 0 48px rgba(20, 184, 166, .18) !important;
        }
        68% {
          border-color: rgba(255, 138, 31, .74) !important;
          box-shadow: 0 0 27px rgba(255, 138, 31, .46), 0 0 47px rgba(244, 114, 182, .16) !important;
        }
        85% {
          border-color: rgba(255, 43, 214, .72) !important;
          box-shadow: 0 0 26px rgba(255, 43, 214, .48), 0 0 46px rgba(124, 77, 255, .18) !important;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #nova-modules-menu > div:first-child,
        #nova-memory-panel > div:first-child,
        #nova-suno-player .nsp-head,
        .nova-header,
        .nova-player-gradient,
        #nova-modules-button,
        #nova-modules-menu,
        #nova-memory-panel,
        #nova-suno-player,
        .nova-window,
        .nova-player-glow {
          animation: none !important;
        }
      }
    `;
  }

  function buildCss() {
    return `
      :root {
        ${cssVars(activeTheme())}
      }

      ${buildModuleThemeCss()}

      .nova-window {
        background: var(--nova-bg) !important;
        color: var(--nova-text) !important;
        border: 1px solid var(--nova-border) !important;
        box-shadow: var(--nova-glow) !important;
        border-radius: 14px;
        font-family: Arial, sans-serif;
        z-index: 999999;
      }

      .nova-header {
        background: linear-gradient(90deg, var(--nova-accent), var(--nova-accent-2), var(--nova-accent-3)) !important;
        padding: 10px 12px;
        font-weight: bold;
        border-radius: 14px 14px 0 0;
        cursor: move;
      }

      .nova-body { padding: 12px; }

      .nova-btn {
        background: rgba(255, 255, 255, 0.08) !important;
        color: var(--nova-text) !important;
        border: 1px solid var(--nova-border) !important;
        border-radius: 10px;
        padding: 8px 12px;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }

      .nova-btn:hover {
        box-shadow: var(--nova-glow);
        transform: translateY(-1px);
      }

      #nova-modules-button {
        background: var(--nova-bg) !important;
        color: var(--nova-text) !important;
        border-color: var(--nova-border) !important;
        box-shadow: var(--nova-glow) !important;
      }

      #nova-modules-menu,
      #nova-memory-panel,
      #nova-suno-player {
        background: var(--nova-bg) !important;
        color: var(--nova-text) !important;
        border-color: var(--nova-border) !important;
        box-shadow: var(--nova-glow) !important;
      }

      #nova-modules-menu > div:first-child,
      #nova-memory-panel > div:first-child,
      #nova-suno-player .nsp-head {
        background: linear-gradient(90deg, var(--nova-accent), var(--nova-accent-2), var(--nova-accent-3)) !important;
      }

      /* Reusable Nova Player visual language. Modules opt in with these classes. */
      .nova-audio-theme {
        color: var(--nova-text);
        border-color: hsl(var(--nova-h1) 96% 64%) !important;
        box-shadow:
          0 0 var(--nova-audio-glow-1) hsla(var(--nova-h1), 96%, 62%, var(--nova-audio-glow-a1)),
          0 0 var(--nova-audio-glow-2) hsla(var(--nova-h2), 96%, 62%, var(--nova-audio-glow-a2)),
          0 16px 55px rgba(0, 0, 0, .52) !important;
      }

      .nova-audio-theme.nova-audio-part-panel {
        background:
          radial-gradient(circle at 18% 4%, hsla(var(--nova-h1), 96%, 58%, var(--nova-audio-bg-a1)), transparent 34%),
          radial-gradient(circle at 92% 18%, hsla(var(--nova-h2), 96%, 58%, var(--nova-audio-bg-a2)), transparent 40%),
          linear-gradient(180deg, var(--nova-bg), rgba(5, 7, 19, .98)) !important;
      }

      .nova-audio-header,
      .nova-audio-theme.nova-audio-part-header .nova-header {
        background:
          linear-gradient(
            120deg,
            hsl(var(--nova-h1) 82% var(--nova-audio-head-l1)),
            hsl(var(--nova-h2) 78% var(--nova-audio-head-l2)) 52%,
            hsl(var(--nova-h3) 72% 16%)
          ) !important;
      }

      .nova-audio-button,
      .nova-audio-theme.nova-audio-part-buttons .nova-btn {
        border-color: hsl(var(--nova-h1) 96% 66%) !important;
        box-shadow:
          0 0 var(--nova-audio-button-blur)
          hsla(var(--nova-h1), 96%, 62%, var(--nova-audio-button-alpha)) !important;
      }

      .nova-audio-progress {
        background:
          linear-gradient(
            90deg,
            hsl(var(--nova-h1) 96% 62%),
            hsl(var(--nova-h2) 96% 65%),
            hsl(var(--nova-h3) 96% 62%)
          ) !important;
        box-shadow:
          0 0 var(--nova-audio-progress-blur)
          hsla(var(--nova-h2), 96%, 62%, .70) !important;
      }

      ${buildAnimatedCss()}
    `;
  }

  function injectThemeStyle() {
    const old = document.getElementById(THEME_ID);
    if (old) old.remove();

    const style = document.createElement('style');
    style.id = THEME_ID;
    style.textContent = buildCss();
    (document.head || document.documentElement).appendChild(style);

    const current = activeTheme();
    document.documentElement.dataset.novaTheme = activeName();
    document.documentElement.dataset.novaAudioTheme =
      current.audioReactive ? 'available' : 'off';

    console.log('[Nova Core] Theme injected:', activeName());
  }

  function copyThemes() {
    return Object.entries(MODULE_THEMES).reduce((acc, [name, theme]) => {
      acc[name] = {
        ...theme,
        palette: Array.isArray(theme.palette) ? theme.palette.slice() : undefined
      };
      return acc;
    }, {});
  }

  window.NovaTheme = {
    version: VERSION,
    themes: MODULE_THEMES,

    inject() {
      injectThemeStyle();
    },

    apply(element, moduleName = 'default') {
      if (!element) return null;
      this.inject();

      const safeModuleName = safeName(moduleName || 'default');
      element.classList.add('nova-window');
      element.dataset.novaModule = safeModuleName;

      Object.keys(MODULE_THEMES)
        .forEach((name) => element.classList.remove(`nova-module-${name}`));

      if (safeModuleName !== 'default') {
        element.classList.add(`nova-module-${safeModuleName}`);
      }

      return element;
    },

    current() {
      return { name: activeName(), theme: { ...activeTheme() } };
    },

    getCurrentThemeId() {
      return activeName();
    },

    getCurrentTheme() {
      return { ...activeTheme() };
    },

    getThemes() {
      return copyThemes();
    },

    getPalette(name = activeName()) {
      return mergedTheme(MODULE_THEMES[safeName(name)]).palette.slice();
    },

    setActive(name) {
      const requested = String(name || 'default').trim().toLowerCase();
      if (!MODULE_THEMES[requested]) return false;

      try {
        localStorage.setItem(STORE_KEY, requested);
        localStorage.setItem(LEGACY_STORE_KEY, requested);
      } catch (_) {}

      this.inject();
      emitNovaEvent('nova-theme-change', this.current());
      return true;
    },

    setTheme(name) {
      return this.setActive(name);
    },

    cycle() {
      const names = Object.keys(MODULE_THEMES);
      const current = activeName();
      const next = names[(names.indexOf(current) + 1) % names.length] || 'default';
      this.setActive(next);
      return this.current();
    },

    nextTheme() {
      return this.cycle();
    },

    register(name, theme) {
      if (!name || !theme) return false;

      const themeName = String(name).trim().toLowerCase();
      MODULE_THEMES[themeName] = {
        ...MODULE_THEMES.default,
        ...theme,
        palette: Array.isArray(theme.palette)
          ? theme.palette.slice(0, 3)
          : MODULE_THEMES.default.palette.slice()
      };

      this.inject();
      return true;
    }
  };

  console.log('[Nova Core] NovaTheme loaded', VERSION);
})();
