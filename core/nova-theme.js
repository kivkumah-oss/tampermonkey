// core/nova-theme.js

(function () {
  'use strict';

  window.NovaTheme = {
    inject() {
      if (document.getElementById('nova-core-theme')) return;

      const style = document.createElement('style');
      style.id = 'nova-core-theme';

      style.textContent = `
        :root {
          --nova-bg: rgba(10, 10, 18, 0.96);
          --nova-panel: rgba(20, 20, 35, 0.95);
          --nova-text: #ffffff;
          --nova-muted: #9ca3af;
          --nova-accent: #a855f7;
          --nova-accent-2: #22d3ee;
          --nova-border: rgba(168, 85, 247, 0.45);
          --nova-glow: 0 0 18px rgba(168, 85, 247, 0.65);
        }

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
        }

        .nova-btn:hover {
          box-shadow: var(--nova-glow);
          transform: translateY(-1px);
        }
      `;

      document.head.appendChild(style);
      console.log('[Nova Core] Theme injected');
    }
  };

  console.log('[Nova Core] NovaTheme loaded');
})();
