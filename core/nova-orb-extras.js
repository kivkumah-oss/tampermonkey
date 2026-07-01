// core/nova-orb-extras.js

(function () {
  'use strict';

  if (window.NovaOrbExtras) return;

  const VERSION = '0.1.0';
  const ORB_ID = 'nova-modules-button';
  const MODE_KEY = 'nova.orb.mode';
  const STYLE_ID = 'nova-orb-extras-style';

  const state = {
    mode: readMode(),
    clockTimer: null,
    rgbTimer: null,
    orb: null
  };

  function readMode() {
    try {
      return localStorage.getItem(MODE_KEY) || 'nova';
    } catch (error) {
      return 'nova';
    }
  }

  function writeMode(mode) {
    state.mode = mode === 'clock' ? 'clock' : 'nova';
    try {
      localStorage.setItem(MODE_KEY, state.mode);
    } catch (error) {}
    updateOrb();
  }

  function currentTheme() {
    if (window.NovaTheme && typeof window.NovaTheme.getCurrentThemeId === 'function') {
      return window.NovaTheme.getCurrentThemeId();
    }
    try {
      return localStorage.getItem('nova.theme.active') || localStorage.getItem('nova-theme') || 'default';
    } catch (error) {
      return 'default';
    }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ORB_ID}.nova-orb-clock {
        width: 76px !important;
        font-variant-numeric: tabular-nums;
        letter-spacing: .02em;
      }

      #${ORB_ID}.nova-rgb-smooth,
      #nova-modules-menu.nova-rgb-smooth,
      #nova-memory-panel.nova-rgb-smooth,
      #nova-suno-player.nova-rgb-smooth,
      .nova-window.nova-rgb-smooth {
        transition: border-color .25s linear, box-shadow .25s linear, background .25s linear;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function findOrb() {
    const orb = document.getElementById(ORB_ID);
    if (!orb || state.orb === orb) return orb;

    state.orb = orb;
    orb.title = 'Nova - right click to toggle clock';
    orb.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      toggleMode();
    }, true);
    orb.addEventListener('dblclick', (event) => {
      event.preventDefault();
      toggleMode();
    }, true);
    updateOrb();
    return orb;
  }

  function timeText() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function updateOrb() {
    const orb = findOrb();
    if (!orb) return;

    if (state.mode === 'clock') {
      orb.textContent = timeText();
      orb.classList.add('nova-orb-clock');
      orb.title = 'Nova clock - right click to show Nova';
    } else {
      orb.textContent = 'Nova';
      orb.classList.remove('nova-orb-clock');
      orb.title = 'Nova - right click to show clock';
    }
  }

  function toggleMode() {
    writeMode(state.mode === 'clock' ? 'nova' : 'clock');
  }

  function applyRgbToElement(element) {
    if (!element) return;
    element.classList.add('nova-rgb-smooth');
  }

  function removeRgbFromElement(element) {
    if (!element) return;
    element.classList.remove('nova-rgb-smooth');
  }

  function setRgbVars() {
    const hue = (Date.now() / 45) % 360;
    const accent = `hsl(${hue}, 100%, 62%)`;
    const accent2 = `hsl(${(hue + 115) % 360}, 100%, 62%)`;
    const border = `hsla(${hue}, 100%, 62%, .62)`;
    const glow = `0 0 24px hsla(${hue}, 100%, 62%, .62)`;
    const root = document.documentElement;

    root.style.setProperty('--nova-accent', accent);
    root.style.setProperty('--nova-accent-2', accent2);
    root.style.setProperty('--nova-border', border);
    root.style.setProperty('--nova-glow', glow);

    [
      document.getElementById(ORB_ID),
      document.getElementById('nova-modules-menu'),
      document.getElementById('nova-memory-panel'),
      document.getElementById('nova-suno-player')
    ].forEach(applyRgbToElement);
  }

  function clearRgbClasses() {
    [
      document.getElementById(ORB_ID),
      document.getElementById('nova-modules-menu'),
      document.getElementById('nova-memory-panel'),
      document.getElementById('nova-suno-player')
    ].forEach(removeRgbFromElement);
  }

  function syncRgb() {
    const enabled = currentTheme() === 'rgb';
    if (enabled && !state.rgbTimer) {
      setRgbVars();
      state.rgbTimer = setInterval(setRgbVars, 80);
    }
    if (!enabled && state.rgbTimer) {
      clearInterval(state.rgbTimer);
      state.rgbTimer = null;
      clearRgbClasses();
      if (window.NovaTheme && typeof window.NovaTheme.inject === 'function') window.NovaTheme.inject();
    }
  }

  function scan() {
    injectStyle();
    findOrb();
    updateOrb();
    syncRgb();
  }

  function init() {
    injectStyle();
    scan();
    state.clockTimer = setInterval(scan, 1000);
    window.addEventListener('nova-theme-change', () => setTimeout(syncRgb, 0));
    console.log('[Nova Core] NovaOrbExtras loaded');
  }

  window.NovaOrbExtras = {
    version: VERSION,
    init,
    scan,
    setMode: writeMode,
    toggleMode,
    getMode() {
      return state.mode;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
