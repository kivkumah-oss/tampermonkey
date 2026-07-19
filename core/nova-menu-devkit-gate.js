// core/nova-menu-devkit-gate.js

(function () {
  'use strict';

  if (window.NovaMenuDevKitGate) return;

  const VERSION = '1.1.0';
  const MENU_ID = 'nova-modules-menu';
  const THEME_OPEN_KEY = 'nova.menu.themes.open';

  const state = {
    specialView: '',
    themeOpen: false,
    observer: null,
    applying: false
  };

  function readBool(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value === 'true';
    } catch (_) {
      return fallback;
    }
  }

  function writeBool(key, value) {
    try { localStorage.setItem(key, value ? 'true' : 'false'); } catch (_) {}
  }

  state.themeOpen = readBool(THEME_OPEN_KEY, false);

  function text(node) {
    return String(node && node.textContent || '').trim().toLowerCase();
  }

  function menu() {
    return document.getElementById(MENU_ID);
  }

  function cards(panel) {
    return Array.from(panel.querySelectorAll('.nova-menu-body > .nova-card'));
  }

  function cardNamed(panel, names) {
    return cards(panel).find((card) => {
      const heading = card.querySelector('b');
      const value = text(heading);
      return names.some((name) => value.includes(name));
    }) || null;
  }

  function collectHtml(panel, names) {
    return names.map((name) => cardNamed(panel, [name])).filter(Boolean).map((node) => node.outerHTML).join('');
  }

  function removeCards(panel, names) {
    names.forEach((name) => {
      const node = cardNamed(panel, [name]);
      if (node) node.remove();
    });
  }

  function decorateThemes(panel) {
    const card = cardNamed(panel, ['themes']);
    if (!card || card.dataset.novaCollapsedReady === '1') return;

    const heading = card.querySelector('b');
    if (!heading) return;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

    const title = heading.cloneNode(true);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.dataset.novaThemeToggle = '1';
    toggle.textContent = state.themeOpen ? '−' : '+';
    toggle.title = state.themeOpen ? 'Hide themes' : 'Show themes';
    toggle.style.cssText = 'min-width:30px;padding:3px 9px;font-size:17px;line-height:1;';

    const content = document.createElement('div');
    content.dataset.novaThemeContent = '1';
    content.style.display = state.themeOpen ? '' : 'none';

    Array.from(card.childNodes).forEach((node) => {
      if (node !== heading) content.appendChild(node);
    });

    heading.remove();
    header.append(title, toggle);
    card.replaceChildren(header, content);
    card.dataset.novaCollapsedReady = '1';
  }

  function ensureTab(panel, name, label) {
    const tabs = panel.querySelector('.nova-menu-tabs');
    if (!tabs) return null;

    let button = tabs.querySelector(`[data-nova-special-view="${name}"]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.novaSpecialView = name;
      button.textContent = label;
      tabs.appendChild(button);
    }

    button.style.borderColor = state.specialView === name
      ? (name === 'devkit' ? 'rgba(244,114,182,.95)' : 'rgba(34,211,238,.95)')
      : 'rgba(255,255,255,.18)';
    return button;
  }

  function ensureSpecialTabs(panel) {
    ensureTab(panel, 'devkit', 'DevKit');
    ensureTab(panel, 'info', 'Info');
  }

  function renderSpecial(panel, html, fallbackTitle, fallbackText) {
    const body = panel.querySelector('.nova-menu-body');
    if (!body) return;
    body.innerHTML = html || `<div class="nova-card"><b style="color:#f0abfc;">${fallbackTitle}</b><div class="nova-muted" style="margin-top:6px;">${fallbackText}</div></div>`;
  }

  function bind(panel) {
    if (panel.dataset.novaDevkitGateBound === '1') return;
    panel.dataset.novaDevkitGateBound = '1';

    panel.addEventListener('click', (event) => {
      const themeToggle = event.target.closest('[data-nova-theme-toggle]');
      if (themeToggle) {
        state.themeOpen = !state.themeOpen;
        writeBool(THEME_OPEN_KEY, state.themeOpen);
        const content = panel.querySelector('[data-nova-theme-content]');
        if (content) content.style.display = state.themeOpen ? '' : 'none';
        themeToggle.textContent = state.themeOpen ? '−' : '+';
        themeToggle.title = state.themeOpen ? 'Hide themes' : 'Show themes';
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const special = event.target.closest('[data-nova-special-view]');
      if (special) {
        state.specialView = special.dataset.novaSpecialView || '';
        apply();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const normalTab = event.target.closest('[data-nova-view]');
      if (normalTab) state.specialView = '';
    }, true);
  }

  function apply() {
    if (state.applying) return;
    const panel = menu();
    if (!panel) return;

    state.applying = true;
    try {
      bind(panel);

      const devkitNames = ['devkit / trace', 'devkit / dom inspector', 'investigation bundle'];
      const coreNames = ['core'];
      const devkitHtml = collectHtml(panel, devkitNames);
      const coreHtml = collectHtml(panel, coreNames);

      if (devkitHtml) panel.dataset.novaDevkitHtml = devkitHtml;
      if (coreHtml) panel.dataset.novaCoreHtml = coreHtml;

      removeCards(panel, devkitNames);
      removeCards(panel, coreNames);
      ensureSpecialTabs(panel);

      if (state.specialView === 'devkit') {
        renderSpecial(panel, panel.dataset.novaDevkitHtml || '', 'DevKit unavailable', 'The optional investigation APIs are not loaded on this page.');
      } else if (state.specialView === 'info') {
        renderSpecial(panel, panel.dataset.novaCoreHtml || '', 'Core information unavailable', 'Nova core registry information is not available on this page.');
      } else {
        decorateThemes(panel);
      }
    } finally {
      state.applying = false;
    }
  }

  function init() {
    apply();
    state.observer = new MutationObserver(() => queueMicrotask(apply));
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(apply, 750);
    console.log('[Nova Core] NovaMenuDevKitGate ' + VERSION + ' loaded');
  }

  window.NovaMenuDevKitGate = {
    version: VERSION,
    openDevKit() { state.specialView = 'devkit'; apply(); },
    openInfo() { state.specialView = 'info'; apply(); },
    refresh: apply
  };

  if (document.documentElement) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();