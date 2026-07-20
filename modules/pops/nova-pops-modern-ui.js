// modules/pops/nova-pops-modern-ui.js
(function () {
  'use strict';

  const MODULE_ID = 'nova-pops-modern-ui';
  const MODULE_VERSION = '1.0.0';
  const STYLE_ID = 'ncl1-modern-ui-style';
  const THEME_KEY = 'ncl1-pops-modern-theme-v1';
  const TOGGLE_ID = 'ncl1-theme-toggle';
  const PANEL_ID = 'ncl1-theme-panel';
  const USER_ALIAS = 'kivkumah';

  const DEFAULT_THEME = Object.freeze({
    pageBg: '#f8fafc',
    headerBg: '#001e38',
    buttonStart: '#6a11cb',
    buttonEnd: '#2575fc',
    buttonText: '#ffffff',
    readyBg: '#ff9900',
    readyText: '#111111',
    statusText: '#d7dde3'
  });

  const state = {
    visible: false,
    applying: false,
    observer: null,
    debounce: null,
    healthTimer: null,
    moved: new Map(),
    lastRun: null
  };

  if (window.NovaPopsModernUI) {
    window.NovaPopsModernUI.show?.();
    return;
  }

  function isPopsHost() {
    return location.hostname === 'aft-pops-dub.aka.amazon.com' ||
      location.hostname === 'aft-pops.eu.aft.amazonoperations.app';
  }

  if (!isPopsHost()) return;

  function text(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function readTheme() {
    try {
      return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(THEME_KEY) || '{}') };
    } catch (error) {
      return { ...DEFAULT_THEME };
    }
  }

  function writeTheme(theme) {
    localStorage.setItem(THEME_KEY, JSON.stringify({ ...DEFAULT_THEME, ...(theme || {}) }));
  }

  function applyTheme(theme = readTheme()) {
    const root = document.documentElement;
    root.style.setProperty('--ncl1-page-bg', theme.pageBg);
    root.style.setProperty('--ncl1-header-bg', theme.headerBg);
    root.style.setProperty('--ncl1-button-start', theme.buttonStart);
    root.style.setProperty('--ncl1-button-end', theme.buttonEnd);
    root.style.setProperty('--ncl1-button-text', theme.buttonText);
    root.style.setProperty('--ncl1-ready-bg', theme.readyBg);
    root.style.setProperty('--ncl1-ready-text', theme.readyText);
    root.style.setProperty('--ncl1-status-text', theme.statusText);
    return theme;
  }

  function removeThemeVariables() {
    [
      '--ncl1-page-bg', '--ncl1-header-bg', '--ncl1-button-start',
      '--ncl1-button-end', '--ncl1-button-text', '--ncl1-ready-bg',
      '--ncl1-ready-text', '--ncl1-status-text'
    ].forEach((name) => document.documentElement.style.removeProperty(name));
  }

  function addStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `
      body {
        background-color: var(--ncl1-page-bg, #f8fafc) !important;
        font-family: 'Amazon Ember', sans-serif !important;
      }
      header.ncl1-pops-modern-header,
      .awsui-top-navigation.ncl1-pops-modern-header {
        background: var(--ncl1-header-bg, #001e38) !important;
        min-height: 85px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 10px 0 !important;
        border-bottom: 1px solid rgba(255,255,255,.1) !important;
        position: relative !important;
      }
      header.ncl1-pops-modern-header > div:first-child:not(.header-center-stack),
      .awsui-top-navigation.ncl1-pops-modern-header > div:first-child:not(.header-center-stack) {
        position: absolute !important;
        left: 20px !important;
        opacity: .35 !important;
        font-size: 10px !important;
        max-width: 240px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      .header-center-stack {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        z-index: 5 !important;
        width: auto !important;
        margin: 0 auto !important;
      }
      .header-center-stack .nav-row,
      .header-center-stack .status-row {
        display: flex !important;
        gap: 12px !important;
        align-items: center !important;
        justify-content: center !important;
        flex-wrap: wrap !important;
      }
      .header-center-stack .nav-pill {
        background: rgba(255,255,255,.10) !important;
        backdrop-filter: blur(10px) !important;
        border: 1px solid rgba(255,255,255,.20) !important;
        color: #fff !important;
        border-radius: 20px !important;
        padding: 5px 15px !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        text-decoration: none !important;
        transition: .2s ease !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 30px !important;
        line-height: 1 !important;
        box-shadow: none !important;
      }
      .header-center-stack .nav-pill:hover {
        background: rgba(255,255,255,.20) !important;
        transform: translateY(-1px) !important;
      }
      .header-center-stack .status-badge {
        background: rgba(255,255,255,.05) !important;
        border: 1px solid rgba(255,255,255,.10) !important;
        color: var(--ncl1-status-text, #d7dde3) !important;
        border-radius: 8px !important;
        padding: 3px 10px !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        letter-spacing: .5px !important;
        white-space: nowrap !important;
        display: inline-flex !important;
        align-items: center !important;
      }
      .header-center-stack .user-online-dot::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        background: #2ecc71;
        border-radius: 50%;
        margin-right: 6px;
        box-shadow: 0 0 8px #2ecc71;
      }
      .ncl1-pops-modern-action,
      .ncl1-pops-modern-card {
        background: linear-gradient(135deg, var(--ncl1-button-start, #6a11cb), var(--ncl1-button-end, #2575fc)) !important;
        color: var(--ncl1-button-text, #fff) !important;
        border-radius: 12px !important;
        border: none !important;
        box-shadow: 0 6px 15px rgba(37,117,252,.3) !important;
        min-height: 80px !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        transition: .3s !important;
        text-align: center !important;
      }
      .ncl1-pops-modern-action:hover {
        transform: translateY(-3px) !important;
        filter: brightness(1.1) !important;
      }
      .ncl1-pops-modern-card.ncl1-ready-card {
        background: var(--ncl1-ready-bg, #ff9900) !important;
        min-height: 40px !important;
        border-radius: 5px !important;
        box-shadow: 0 2px 5px rgba(0,0,0,.2) !important;
        color: var(--ncl1-ready-text, #111) !important;
      }
      #${TOGGLE_ID} {
        position: fixed !important;
        top: 96px !important;
        right: 18px !important;
        z-index: 2147483646 !important;
        width: 42px !important;
        height: 42px !important;
        min-height: 42px !important;
        padding: 0 !important;
        border-radius: 50% !important;
        background: linear-gradient(135deg, var(--ncl1-button-start), var(--ncl1-button-end)) !important;
        color: var(--ncl1-button-text) !important;
        border: 1px solid rgba(255,255,255,.35) !important;
        box-shadow: 0 8px 22px rgba(0,0,0,.28) !important;
        cursor: pointer !important;
        font-size: 20px !important;
        text-transform: none !important;
      }
      #${PANEL_ID} {
        position: fixed !important;
        top: 146px !important;
        right: 18px !important;
        z-index: 2147483647 !important;
        width: 285px !important;
        padding: 14px !important;
        border-radius: 14px !important;
        background: rgba(10,18,28,.97) !important;
        color: #fff !important;
        border: 1px solid rgba(255,255,255,.18) !important;
        box-shadow: 0 14px 40px rgba(0,0,0,.38) !important;
        backdrop-filter: blur(14px) !important;
        display: none;
        font-family: 'Amazon Ember', sans-serif !important;
        box-sizing: border-box !important;
      }
      #${PANEL_ID}.open { display: block !important; }
      #${PANEL_ID}, #${PANEL_ID} * { box-sizing: border-box !important; }
      #${PANEL_ID} h3 {
        margin: 0 0 4px !important;
        font-size: 15px !important;
        text-align: center !important;
      }
      #${PANEL_ID} .ncl1-theme-module-badge {
        margin: 0 0 12px !important;
        color: #72f1b8 !important;
        font-size: 9px !important;
        font-weight: 900 !important;
        letter-spacing: .8px !important;
        text-align: center !important;
      }
      #${PANEL_ID} .ncl1-theme-grid {
        display: grid !important;
        grid-template-columns: 1fr auto !important;
        gap: 9px 12px !important;
        align-items: center !important;
      }
      #${PANEL_ID} .ncl1-theme-grid label {
        font-size: 12px !important;
        font-weight: 700 !important;
      }
      #${PANEL_ID} .ncl1-theme-grid input[type='color'] {
        width: 42px !important;
        height: 30px !important;
        padding: 1px !important;
        border: 1px solid rgba(255,255,255,.25) !important;
        border-radius: 7px !important;
        background: transparent !important;
        cursor: pointer !important;
      }
      #${PANEL_ID} .ncl1-theme-actions {
        display: flex !important;
        gap: 8px !important;
        margin-top: 14px !important;
      }
      #${PANEL_ID} .ncl1-theme-actions button {
        min-height: 34px !important;
        flex: 1 !important;
        border-radius: 8px !important;
        border: 1px solid rgba(255,255,255,.16) !important;
        background: linear-gradient(135deg, var(--ncl1-button-start), var(--ncl1-button-end)) !important;
        color: var(--ncl1-button-text) !important;
        box-shadow: none !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        padding: 6px 8px !important;
        text-transform: uppercase !important;
        cursor: pointer !important;
      }
    `;
  }

  function isNovaElement(element) {
    if (!(element instanceof Element)) return false;
    return Boolean(element.closest(
      '#nova-bootstrap, #nova-menu, #nova-orb, #nova-root, ' +
      '[id^="nova-"], [class^="nova-"], [class*=" nova-"]'
    ));
  }

  function rememberMove(element) {
    if (state.moved.has(element)) return;
    state.moved.set(element, { parent: element.parentNode, next: element.nextSibling });
  }

  function restoreMoves() {
    for (const [element, origin] of state.moved.entries()) {
      if (!origin?.parent?.isConnected) continue;
      try {
        if (origin.next && origin.next.parentNode === origin.parent) {
          origin.parent.insertBefore(element, origin.next);
        } else {
          origin.parent.appendChild(element);
        }
      } catch (error) {
        console.warn('[Nova POPS] Restore failed', error);
      }
    }
    state.moved.clear();
  }

  function navText(value) {
    const normal = text(value).toLowerCase();
    return normal === 'home' || normal === 'fc menu' || normal === 'log out';
  }

  function stationText(value) {
    const normal = text(value);
    return normal.includes('psPOPS') || normal.includes('psPOPS_AFE') || normal.includes('wsAFE');
  }

  function userText(value) {
    return text(value).toLowerCase() === USER_ALIAS.toLowerCase();
  }

  function ensureHeader() {
    const header = document.querySelector('header, .awsui-top-navigation');
    if (!header || isNovaElement(header)) return null;
    header.classList.add('ncl1-pops-modern-header');

    let shell = header.querySelector(':scope > .header-center-stack');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'header-center-stack';
      const nav = document.createElement('div');
      nav.className = 'nav-row';
      const status = document.createElement('div');
      status.className = 'status-row';
      shell.append(nav, status);
      header.appendChild(shell);
    }
    return shell;
  }

  function modernizeHeader() {
    const shell = ensureHeader();
    if (!shell) return;
    const nav = shell.querySelector('.nav-row');
    const status = shell.querySelector('.status-row');

    document.querySelectorAll('a, button, [role="button"], span, div').forEach((element) => {
      if (isNovaElement(element) || element.closest(`#${PANEL_ID}, #${TOGGLE_ID}, .header-center-stack`)) return;
      const value = text(element.textContent);
      if (!navText(value)) return;
      if (element.children.length && !element.matches('a, button, [role="button"]')) return;
      rememberMove(element);
      element.classList.add('nav-pill');
      nav.appendChild(element);
    });

    document.querySelectorAll('span, div, a').forEach((element) => {
      if (isNovaElement(element) || element.closest(`#${PANEL_ID}, #${TOGGLE_ID}, .header-center-stack`)) return;
      if (element.children.length) return;
      const value = text(element.textContent);
      if (stationText(value)) {
        rememberMove(element);
        element.classList.add('status-badge');
        status.appendChild(element);
      } else if (userText(value)) {
        rememberMove(element);
        element.classList.add('status-badge', 'user-online-dot');
        status.appendChild(element);
      }
    });
  }

  function markControls() {
    document.querySelectorAll('button, [role="button"], .awsui-cards-card').forEach((element) => {
      if (isNovaElement(element) || element.closest(`#${PANEL_ID}, #${TOGGLE_ID}`)) return;
      if (element.classList.contains('nav-pill') || navText(element.textContent)) return;
      element.classList.add(
        element.classList.contains('awsui-cards-card')
          ? 'ncl1-pops-modern-card'
          : 'ncl1-pops-modern-action'
      );
    });

    document.querySelectorAll('.awsui-cards-card').forEach((card) => {
      if (!isNovaElement(card)) {
        card.classList.toggle('ncl1-ready-card', text(card.textContent).toLowerCase().includes('ready'));
      }
    });
  }

  function syncInputs(panel, theme = readTheme()) {
    panel.querySelectorAll('[data-theme-key]').forEach((input) => {
      input.value = theme[input.dataset.themeKey];
    });
  }

  function addThemeField(grid, key, labelValue) {
    const label = document.createElement('label');
    label.htmlFor = `ncl1-${key}`;
    label.textContent = labelValue;
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `ncl1-${key}`;
    input.dataset.themeKey = key;
    grid.append(label, input);
  }

  function ensureThemeControls() {
    if (!document.body) return;
    if (document.getElementById(TOGGLE_ID) && document.getElementById(PANEL_ID)) return;

    document.getElementById(TOGGLE_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();

    const toggle = document.createElement('button');
    toggle.id = TOGGLE_ID;
    toggle.type = 'button';
    toggle.title = 'POPS colour settings · Nova module';
    toggle.textContent = '🎨';

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    const title = document.createElement('h3');
    title.textContent = '🎨 POPS Theme';
    const badge = document.createElement('div');
    badge.className = 'ncl1-theme-module-badge';
    badge.textContent = 'NOVA BOOTSTRAP MODULE';
    const grid = document.createElement('div');
    grid.className = 'ncl1-theme-grid';

    [
      ['pageBg', 'Page background'], ['headerBg', 'Header'],
      ['buttonStart', 'Button gradient 1'], ['buttonEnd', 'Button gradient 2'],
      ['buttonText', 'Button text'], ['readyBg', 'Ready card'],
      ['readyText', 'Ready text'], ['statusText', 'Status text']
    ].forEach(([key, label]) => addThemeField(grid, key, label));

    const actions = document.createElement('div');
    actions.className = 'ncl1-theme-actions';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    actions.append(reset, close);
    panel.append(title, badge, grid, actions);
    document.body.append(toggle, panel);
    syncInputs(panel);

    toggle.addEventListener('click', () => {
      panel.classList.toggle('open');
      syncInputs(panel);
    });
    panel.addEventListener('input', (event) => {
      const input = event.target.closest?.('[data-theme-key]');
      if (!input) return;
      const theme = readTheme();
      theme[input.dataset.themeKey] = input.value;
      writeTheme(theme);
      applyTheme(theme);
    });
    reset.addEventListener('click', () => {
      writeTheme(DEFAULT_THEME);
      applyTheme(DEFAULT_THEME);
      syncInputs(panel, DEFAULT_THEME);
    });
    close.addEventListener('click', () => panel.classList.remove('open'));
  }

  function modernize() {
    if (!state.visible || state.applying) return false;
    state.applying = true;
    try {
      applyTheme();
      addStyles();
      ensureThemeControls();
      modernizeHeader();
      markControls();
      state.lastRun = new Date().toISOString();
      return true;
    } finally {
      state.applying = false;
    }
  }

  function schedule() {
    if (!state.visible || state.applying) return;
    clearTimeout(state.debounce);
    state.debounce = setTimeout(modernize, 90);
  }

  function startWatchers() {
    if (!state.observer && document.body) {
      state.observer = new MutationObserver((mutations) => {
        if (state.applying) return;
        const external = mutations.some((mutation) =>
          !(mutation.target instanceof Element) ||
          !mutation.target.closest(`#${PANEL_ID}, #${TOGGLE_ID}`)
        );
        if (external) schedule();
      });
      state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (!state.healthTimer) {
      state.healthTimer = setInterval(() => state.visible && modernize(), 1500);
    }
  }

  function stopWatchers() {
    state.observer?.disconnect();
    state.observer = null;
    clearTimeout(state.debounce);
    state.debounce = null;
    clearInterval(state.healthTimer);
    state.healthTimer = null;
  }

  function clean() {
    stopWatchers();
    restoreMoves();
    document.querySelectorAll('.header-center-stack').forEach((node) => node.remove());
    document.querySelectorAll('.ncl1-pops-modern-action').forEach((node) => node.classList.remove('ncl1-pops-modern-action'));
    document.querySelectorAll('.ncl1-pops-modern-card').forEach((node) => node.classList.remove('ncl1-pops-modern-card', 'ncl1-ready-card'));
    document.querySelectorAll('.nav-pill').forEach((node) => node.classList.remove('nav-pill'));
    document.querySelectorAll('.status-badge').forEach((node) => node.classList.remove('status-badge', 'user-online-dot'));
    document.querySelectorAll('.ncl1-pops-modern-header').forEach((node) => node.classList.remove('ncl1-pops-modern-header'));
    document.getElementById(TOGGLE_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    removeThemeVariables();
  }

  function show() {
    state.visible = true;
    const start = () => {
      modernize();
      startWatchers();
    };
    if (document.readyState === 'loading' || !document.body) {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
    return true;
  }

  function hide() {
    state.visible = false;
    clean();
    return true;
  }

  function destroy() {
    return hide();
  }

  function refresh() {
    if (!state.visible) state.visible = true;
    return modernize();
  }

  function setTheme(theme) {
    const next = { ...readTheme(), ...(theme || {}) };
    writeTheme(next);
    applyTheme(next);
    const panel = document.getElementById(PANEL_ID);
    if (panel) syncInputs(panel, next);
    return next;
  }

  function resetTheme() {
    return setTheme(DEFAULT_THEME);
  }

  function getStatus() {
    return {
      id: MODULE_ID,
      version: MODULE_VERSION,
      active: state.visible && Boolean(document.getElementById(STYLE_ID)),
      visible: state.visible,
      host: location.hostname,
      movedHeaderItems: state.moved.size,
      styledActions: document.querySelectorAll('.ncl1-pops-modern-action').length,
      styledCards: document.querySelectorAll('.ncl1-pops-modern-card').length,
      lastModernizedAt: state.lastRun
    };
  }

  window.NovaPopsModernUI = {
    id: MODULE_ID,
    version: MODULE_VERSION,
    show,
    hide,
    destroy,
    refresh,
    getTheme: readTheme,
    setTheme,
    resetTheme,
    getStatus
  };

  show();
  console.log('[Nova POPS] Bootstrap module loaded', MODULE_VERSION);
})();
