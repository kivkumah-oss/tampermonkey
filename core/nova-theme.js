// core/nova-theme.js

(function () {
  'use strict';

  const THEME_ID = 'nova-core-theme';
  const STORE_KEY = 'nova.theme.active';
  const LEGACY_STORE_KEY = 'nova-theme';

  const MODULE_THEMES = {
    default: {
      name: 'Violet Cyber',
      description: 'Classic Nova purple/cyan glow.',
      accent: '#a855f7',
      accent2: '#22d3ee',
      border: 'rgba(168, 85, 247, 0.45)',
      glow: '0 0 18px rgba(168, 85, 247, 0.65)',
      bg: 'rgba(10, 10, 18, 0.96)',
      panel: 'rgba(20, 20, 35, 0.95)',
      text: '#ffffff',
      muted: '#9ca3af'
    },
    violet: {
      name: 'Violet Cyber',
      description: 'Same classic Nova style, explicit theme name.',
      accent: '#7c4dff',
      accent2: '#00e5ff',
      border: 'rgba(124, 77, 255, 0.55)',
      glow: '0 0 22px rgba(124, 77, 255, 0.65)',
      bg: 'rgba(10, 10, 18, 0.96)',
      panel: 'rgba(20, 20, 35, 0.95)',
      text: '#ffffff',
      muted: '#9ca3af'
    },
    venom: {
      name: 'Venom Green',
      description: 'Black, green, and cyan gremlin terminal.',
      accent: '#39ff14',
      accent2: '#00e5ff',
      border: 'rgba(57, 255, 20, 0.55)',
      glow: '0 0 22px rgba(57, 255, 20, 0.65)',
      bg: 'rgba(3, 10, 8, 0.97)',
      panel: 'rgba(7, 18, 14, 0.96)',
      text: '#f4fff4',
      muted: '#9be7a0'
    },
    fire: {
      name: 'Fire Core',
      description: 'Orange/red/yellow warehouse energy.',
      accent: '#ff3d00',
      accent2: '#ffea00',
      border: 'rgba(255, 111, 0, 0.58)',
      glow: '0 0 22px rgba(255, 61, 0, 0.68)',
      bg: 'rgba(16, 9, 6, 0.97)',
      panel: 'rgba(28, 14, 9, 0.96)',
      text: '#fff7ed',
      muted: '#fed7aa'
    },
    ice: {
      name: 'Ice Terminal',
      description: 'Clean blue/cyan readable mode.',
      accent: '#38bdf8',
      accent2: '#e0f2fe',
      border: 'rgba(56, 189, 248, 0.58)',
      glow: '0 0 22px rgba(56, 189, 248, 0.58)',
      bg: 'rgba(5, 12, 20, 0.97)',
      panel: 'rgba(9, 22, 35, 0.96)',
      text: '#f8fbff',
      muted: '#bae6fd'
    },
    matrix: {
      name: 'Matrix',
      description: 'Dark green console mode.',
      accent: '#00ff66',
      accent2: '#00aa44',
      border: 'rgba(0, 255, 102, 0.52)',
      glow: '0 0 22px rgba(0, 255, 102, 0.58)',
      bg: 'rgba(0, 6, 2, 0.98)',
      panel: 'rgba(0, 14, 5, 0.97)',
      text: '#eaffef',
      muted: '#8fffb5'
    },
    rose: {
      name: 'Rose Gold',
      description: 'Pink/gold softer creator mode.',
      accent: '#fb7185',
      accent2: '#fbbf24',
      border: 'rgba(251, 113, 133, 0.55)',
      glow: '0 0 22px rgba(251, 113, 133, 0.58)',
      bg: 'rgba(20, 10, 15, 0.97)',
      panel: 'rgba(32, 16, 24, 0.96)',
      text: '#fff7f8',
      muted: '#fecdd3'
    },
    warehouse: {
      name: 'Warehouse Amber',
      description: 'Practical dark amber work mode.',
      accent: '#f59e0b',
      accent2: '#22d3ee',
      border: 'rgba(245, 158, 11, 0.55)',
      glow: '0 0 22px rgba(245, 158, 11, 0.55)',
      bg: 'rgba(12, 12, 10, 0.97)',
      panel: 'rgba(24, 21, 15, 0.96)',
      text: '#fffbea',
      muted: '#fde68a'
    },
    player: {
      name: 'Player Cyan',
      description: 'Cyan/purple music module style.',
      accent: '#22d3ee',
      accent2: '#a855f7',
      border: 'rgba(34, 211, 238, 0.5)',
      glow: '0 0 18px rgba(34, 211, 238, 0.65)'
    },
    amazon: {
      name: 'Amazon Orange',
      description: 'Orange/yellow work-tool style.',
      accent: '#f97316',
      accent2: '#facc15',
      border: 'rgba(249, 115, 22, 0.5)',
      glow: '0 0 18px rgba(249, 115, 22, 0.65)'
    },
    spp: {
      name: 'SPP Hotpick',
      description: 'Orange/red alert style.',
      accent: '#f97316',
      accent2: '#ef4444',
      border: 'rgba(249, 115, 22, 0.55)',
      glow: '0 0 18px rgba(249, 115, 22, 0.7)'
    },
    stealth: {
      name: 'Stealth',
      description: 'Low-noise grey mode.',
      accent: '#111827',
      accent2: '#374151',
      border: 'rgba(156, 163, 175, 0.35)',
      glow: '0 0 14px rgba(156, 163, 175, 0.35)'
    },
    neon: {
      name: 'Neon Pink',
      description: 'Cyan/pink neon mode.',
      accent: '#22d3ee',
      accent2: '#ec4899',
      border: 'rgba(34, 211, 238, 0.55)',
      glow: '0 0 22px rgba(236, 72, 153, 0.55)'
    },
    rgb: {
      name: 'RGB Party',
      description: 'Gaming keyboard rave mode. HR may have questions.',
      accent: '#ff004c',
      accent2: '#00e5ff',
      border: 'rgba(255, 0, 120, 0.62)',
      glow: '0 0 24px rgba(255, 0, 120, 0.66)',
      bg: 'rgba(8, 8, 16, 0.97)',
      panel: 'rgba(14, 14, 28, 0.96)',
      text: '#ffffff',
      muted: '#d1d5db',
      animated: true
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
    } catch (e) {
      return 'default';
    }
  }

  function activeTheme() {
    return MODULE_THEMES[activeName()] || MODULE_THEMES.default;
  }

  function cssVars(theme) {
    const base = MODULE_THEMES.default;
    const merged = { ...base, ...theme };
    return `
      --nova-bg: ${merged.bg};
      --nova-panel: ${merged.panel};
      --nova-text: ${merged.text};
      --nova-muted: ${merged.muted};
      --nova-accent: ${merged.accent};
      --nova-accent-2: ${merged.accent2};
      --nova-border: ${merged.border};
      --nova-glow: ${merged.glow};
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

  function buildCss() {
    const isRgb = activeName() === 'rgb';
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
        background: linear-gradient(90deg, var(--nova-accent), var(--nova-accent-2)) !important;
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

      .nova-btn:hover { box-shadow: var(--nova-glow); transform: translateY(-1px); }

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
        background: linear-gradient(90deg, var(--nova-accent), var(--nova-accent-2)) !important;
      }

      ${isRgb ? `
      #nova-modules-menu > div:first-child,
      #nova-memory-panel > div:first-child,
      #nova-suno-player .nsp-head {
        background: linear-gradient(90deg, #ff004c, #ffb000, #39ff14, #00e5ff, #7c4dff, #ff004c) !important;
        background-size: 500% 100% !important;
        animation: novaRgbGradient 8s linear infinite;
      }

      #nova-modules-button,
      #nova-modules-menu,
      #nova-memory-panel,
      #nova-suno-player,
      .nova-window {
        animation: novaRgbGlow 7s linear infinite;
      }

      @keyframes novaRgbGradient {
        0% { background-position: 0% 50%; }
        100% { background-position: 500% 50%; }
      }

      @keyframes novaRgbGlow {
        0% { box-shadow: 0 0 20px rgba(255, 0, 76, 0.62) !important; border-color: rgba(255, 0, 76, 0.62) !important; }
        20% { box-shadow: 0 0 22px rgba(255, 176, 0, 0.62) !important; border-color: rgba(255, 176, 0, 0.62) !important; }
        40% { box-shadow: 0 0 22px rgba(57, 255, 20, 0.58) !important; border-color: rgba(57, 255, 20, 0.58) !important; }
        60% { box-shadow: 0 0 22px rgba(0, 229, 255, 0.62) !important; border-color: rgba(0, 229, 255, 0.62) !important; }
        80% { box-shadow: 0 0 22px rgba(124, 77, 255, 0.62) !important; border-color: rgba(124, 77, 255, 0.62) !important; }
        100% { box-shadow: 0 0 20px rgba(255, 0, 76, 0.62) !important; border-color: rgba(255, 0, 76, 0.62) !important; }
      }

      @media (prefers-reduced-motion: reduce) {
        #nova-modules-menu > div:first-child,
        #nova-memory-panel > div:first-child,
        #nova-suno-player .nsp-head,
        #nova-modules-button,
        #nova-modules-menu,
        #nova-memory-panel,
        #nova-suno-player,
        .nova-window {
          animation: none !important;
        }
      }
      ` : ''}
    `;
  }

  function injectThemeStyle() {
    const old = document.getElementById(THEME_ID);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = THEME_ID;
    style.textContent = buildCss();
    (document.head || document.documentElement).appendChild(style);
    console.log('[Nova Core] Theme injected');
  }

  function copyThemes() {
    return Object.entries(MODULE_THEMES).reduce((acc, [name, theme]) => {
      acc[name] = { ...theme };
      return acc;
    }, {});
  }

  window.NovaTheme = {
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
      Object.keys(MODULE_THEMES).forEach((name) => element.classList.remove(`nova-module-${name}`));
      if (safeModuleName !== 'default') element.classList.add(`nova-module-${safeModuleName}`);
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

    setActive(name) {
      const requested = String(name || 'default').trim().toLowerCase();
      if (!MODULE_THEMES[requested]) return false;
      try {
        localStorage.setItem(STORE_KEY, requested);
        localStorage.setItem(LEGACY_STORE_KEY, requested);
      } catch (e) {}
      this.inject();
      window.dispatchEvent(new CustomEvent('nova-theme-change', { detail: this.current() }));
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
      if (!name || !theme) return;
      const themeName = String(name).trim().toLowerCase();
      MODULE_THEMES[themeName] = { ...MODULE_THEMES.default, ...theme };
      this.inject();
    }
  };

  console.log('[Nova Core] NovaTheme loaded');
})();
