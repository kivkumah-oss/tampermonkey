// core/nova-theme.js

(function () {
  'use strict';

  const THEME_ID = 'nova-core-theme';

  const MODULE_THEMES = {
    default: {
      accent: '#a855f7',
      accent2: '#22d3ee',
      border: 'rgba(168, 85, 247, 0.45)',
      glow: '0 0 18px rgba(168, 85, 247, 0.65)'
    },
    player: {
      accent: '#22d3ee',
      accent2: '#a855f7',
      border: 'rgba(34, 211, 238, 0.5)',
      glow: '0 0 18px rgba(34, 211, 238, 0.65)'
    },
    amazon: {
      accent: '#f97316',
      accent2: '#facc15',
      border: 'rgba(249, 115, 22, 0.5)',
      glow: '0 0 18px rgba(249, 115, 22, 0.65)'
    },
    spp: {
      accent: '#f97316',
      accent2: '#ef4444',
      border: 'rgba(249, 115, 22, 0.55)',
      glow: '0 0 18px rgba(249, 115, 22, 0.7)'
    }
  };

  function cssVars(theme) {
    return `
      --nova-accent: ${theme.accent};
      --nova-accent-2: ${theme.accent2};
      --nova-border: ${theme.border};
      --nova-glow: ${theme.glow};
    `;
  }

  function buildModuleThemeCss() {
    return Object.entries(MODULE_THEMES)
      .filter(([name]) => name !== 'default')
      .map(([name, theme]) => `
        .nova-module-${name},
        [data-nova-module="${name}"] {
          ${cssVars(theme)}
        }
      `)
      .join('\n');
  }

  window.NovaTheme = {
    themes: MODULE_THEMES,

    inject() {
      if (document.getElementById(THEME_ID)) return;

      const style = document.createElement('style');
      style.id = THEME_ID;

      style.textContent = `
        :root {
          --nova-bg: rgba(10, 10, 18, 0.96);
          --nova-panel: rgba(20, 20, 35, 0.95);
          --nova-text: #ffffff;
          --nova-muted: #9ca3af;
          ${cssVars(MODULE_THEMES.default)}
        }

        ${buildModuleThemeCss()}

        .nova-window {
          background: var(--nova-bg);
          color: var(--nova-text);
          border: 1px solid var(--nova-border);
          box-shadow: var(--nova-glow);
          border-radius: 14px;
          font-family: Arial, sans-serif;
          z-index: 999999;
        }

        .nova-header {
          background: linear-gradient(90deg, var(--nova-accent), var(--nova-accent-2));
          padding: 10px 12px;
          font-weight: bold;
          border-radius: 14px 14px 0 0;
          cursor: move;
        }

        .nova-body {
          padding: 12px;
        }

        .nova-btn {
          background: rgba(255, 255, 255, 0.08);
          color: var(--nova-text);
          border: 1px solid var(--nova-border);
          border-radius: 10px;
          padding: 8px 12px;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .nova-btn:hover {
          box-shadow: var(--nova-glow);
          transform: translateY(-1px);
        }
      `;

      document.head.appendChild(style);
      console.log('[Nova Core] Theme injected');
    },

    apply(element, moduleName = 'default') {
      if (!element) return null;

      this.inject();

      const safeModuleName = String(moduleName || 'default').trim().toLowerCase();
      element.classList.add('nova-window');
      element.dataset.novaModule = safeModuleName;

      Object.keys(MODULE_THEMES).forEach((name) => {
        element.classList.remove(`nova-module-${name}`);
      });

      if (safeModuleName !== 'default') {
        element.classList.add(`nova-module-${safeModuleName}`);
      }

      return element;
    },

    register(name, theme) {
      if (!name || !theme) return;

      const safeName = String(name).trim().toLowerCase();
      MODULE_THEMES[safeName] = {
        ...MODULE_THEMES.default,
        ...theme
      };

      const oldStyle = document.getElementById(THEME_ID);
      if (oldStyle) oldStyle.remove();
      this.inject();
    }
  };

  console.log('[Nova Core] NovaTheme loaded');
})();
