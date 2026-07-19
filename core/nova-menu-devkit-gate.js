// core/nova-menu-devkit-gate.js

(function () {
  'use strict';

  if (window.NovaMenuDevKitGate) return;

  const VERSION = '1.0.0';
  const MENU_ID = 'nova-modules-menu';
  const OWNER_KEY = 'nova.owner.devkit.enabled';
  const THEME_OPEN_KEY = 'nova.menu.themes.open';

  const state = {
    owner: false,
    devkitView: false,
    themeOpen: false,
    observer: null,
    applying: false,
    titleClicks: []
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

  state.owner = readBool(OWNER_KEY, false);
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

  function isAdvanced(panel) {
    const advanced = panel.querySelector('[data-nova-view="advanced"]');
    return Boolean(advanced && /168,85,247|c084fc|8b5cf6/i.test(advanced.getAttribute('style') || ''));
  }

  function collectDevKitHtml(panel) {
    const names = ['devkit / trace', 'devkit / dom inspector', 'investigation bundle'];
    const found = names.map((name) => cardNamed(panel, [name])).filter(Boolean);
    return found.map((node) => node.outerHTML).join('');
  }

  function removeDevKitCards(panel) {
    ['devkit / trace', 'devkit / dom inspector', 'investigation bundle'].forEach((name) => {
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

  function ensureDevKitTab(panel) {
    const tabs = panel.querySelector('.nova-menu-tabs');
    if (!tabs) return;

    let button = tabs.querySelector('[data-nova-private-devkit]');
    if (!state.owner) {
      if (button) button.remove();
      return;
    }

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.novaPrivateDevkit = '1';
      button.textContent = 'DevKit';
      tabs.appendChild(button);
    }

    button.style.borderColor = state.devkitView
      ? 'rgba(244,114,182,.95)'
      : 'rgba(255,255,255,.18)';
  }

  function renderDevKit(panel, html) {
    const body = panel.querySelector('.nova-menu-body');
    if (!body) return;
    body.innerHTML = html || '<div class="nova-card"><b style="color:#f0abfc;">DevKit unavailable</b><div class="nova-muted" style="margin-top:6px;">The optional investigation APIs are not loaded on this page.</div></div>';
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

      const devkit = event.target.closest('[data-nova-private-devkit]');
      if (devkit && state.owner) {
        state.devkitView = true;
        apply();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const normalTab = event.target.closest('[data-nova-view]');
      if (normalTab) state.devkitView = false;

      const title = event.target.closest('.nova-menu-head span');
      if (title) {
        const now = Date.now();
        state.titleClicks = state.titleClicks.filter((time) => now - time < 3000);
        state.titleClicks.push(now);
        if (state.titleClicks.length >= 5) {
          state.titleClicks = [];
          state.owner = !state.owner;
          state.devkitView = false;
          writeBool(OWNER_KEY, state.owner);
          apply();
          console.log('[Nova Core] Private DevKit access ' + (state.owner ? 'enabled' : 'disabled'));
        }
      }
    }, true);
  }

  function apply() {
    if (state.applying) return;
    const panel = menu();
    if (!panel) return;

    state.applying = true;
    try {
      bind(panel);
      const devkitHtml = collectDevKitHtml(panel);
      removeDevKitCards(panel);
      ensureDevKitTab(panel);

      if (state.devkitView && state.owner) {
        renderDevKit(panel, devkitHtml || panel.dataset.novaDevkitHtml || '');
      } else if (isAdvanced(panel)) {
        decorateThemes(panel);
      }

      if (devkitHtml) panel.dataset.novaDevkitHtml = devkitHtml;
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
    isOwner: () => state.owner,
    enableOwner() { state.owner = true; writeBool(OWNER_KEY, true); apply(); },
    disableOwner() { state.owner = false; state.devkitView = false; writeBool(OWNER_KEY, false); apply(); },
    refresh: apply
  };

  if (document.documentElement) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
