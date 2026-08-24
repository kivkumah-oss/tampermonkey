// core/nova-site-render-gate.js
(function () {
  'use strict';

  if (window.NovaSiteRenderGate) return;

  const VERSION = '1.1.0';
  const FETCH_FLAG = '__novaSiteRenderGateFetch';
  const READY_EVENT = 'nova-site-render-ready';
  const SCREEN_ID = 'nova-site-render-screen';
  const STYLE_ID = 'nova-site-render-style';

  const host = String(location.hostname || '').toLowerCase();
  const site =
    host === 'aft-pops-dub.aka.amazon.com' ||
    host === 'aft-pops.eu.aft.amazonoperations.app'
      ? 'pops'
      : /^hero\.[^.]+\.picking\.aft\.a2z\.com$/i.test(host)
        ? 'hero'
        : null;

  const siteLabel = site === 'hero' ? 'HERO INTELLIGENCE' : site === 'pops' ? 'POPS WORKSPACE' : 'WORKSPACE';

  let ready = false;
  let cycle = 0;
  let cycleHref = location.href;
  let pendingHeroRequests = 0;
  let heroRequestSeen = false;
  let lastHeroRequestFinishedAt = 0;
  let readyTimer = null;
  let safetyTimer = null;
  let pollTimer = null;
  let observer = null;
  let installed = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID) || !document.documentElement) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${SCREEN_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background:
          radial-gradient(circle at 50% 42%, rgba(57,255,20,.10), transparent 28%),
          radial-gradient(circle at 88% 10%, rgba(92,168,255,.08), transparent 25%),
          linear-gradient(145deg, rgba(1,7,6,.998), rgba(2,12,10,.992) 58%, rgba(1,5,8,.998));
        color: #effff1;
        font-family: "Amazon Ember", Inter, "Segoe UI", Arial, sans-serif;
        opacity: 1;
        visibility: visible;
        transition: opacity .22s ease, visibility .22s ease;
        pointer-events: all;
      }

      #${SCREEN_ID}.novaSiteRenderScreen--leave {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      #${SCREEN_ID}::before {
        content: '';
        position: absolute;
        inset: -35%;
        background: repeating-linear-gradient(
          180deg,
          rgba(255,255,255,.014) 0,
          rgba(255,255,255,.014) 1px,
          transparent 1px,
          transparent 5px
        );
        animation: novaSiteRenderScan 8s linear infinite;
        pointer-events: none;
      }

      #${SCREEN_ID} .novaSiteRenderCard {
        position: relative;
        width: min(560px, calc(100vw - 42px));
        padding: 30px 34px 28px;
        border: 1px solid rgba(57,255,20,.30);
        border-radius: 18px;
        background: rgba(3,12,9,.82);
        box-shadow:
          0 30px 90px rgba(0,0,0,.55),
          0 0 45px rgba(57,255,20,.08),
          inset 0 1px rgba(255,255,255,.035);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        text-align: center;
      }

      #${SCREEN_ID} .novaSiteRenderLogo {
        width: 64px;
        height: 64px;
        margin: 0 auto 18px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(57,255,20,.56);
        border-radius: 16px;
        color: #39ff14;
        background: rgba(57,255,20,.055);
        box-shadow: 0 0 28px rgba(57,255,20,.16), inset 0 0 22px rgba(57,255,20,.05);
        font-size: 31px;
        font-weight: 900;
        letter-spacing: -2px;
        animation: novaSiteRenderPulse 1.7s ease-in-out infinite;
      }

      #${SCREEN_ID} .novaSiteRenderBrand {
        color: #dfffe5;
        font-size: 14px;
        font-weight: 850;
        letter-spacing: .18em;
      }

      #${SCREEN_ID} .novaSiteRenderTitle {
        margin-top: 12px;
        color: #fff;
        font-size: 23px;
        font-weight: 900;
        letter-spacing: .035em;
      }

      #${SCREEN_ID} .novaSiteRenderStatus {
        min-height: 20px;
        margin-top: 8px;
        color: #8edca0;
        font-size: 12px;
        font-weight: 750;
        letter-spacing: .08em;
      }

      #${SCREEN_ID} .novaSiteRenderTrack {
        position: relative;
        height: 3px;
        margin-top: 22px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255,255,255,.07);
      }

      #${SCREEN_ID} .novaSiteRenderTrack::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: -40%;
        width: 38%;
        border-radius: inherit;
        background: linear-gradient(90deg, transparent, #39ff14, #00e5ff, transparent);
        filter: drop-shadow(0 0 6px rgba(57,255,20,.5));
        animation: novaSiteRenderBar 1.15s ease-in-out infinite;
      }

      #${SCREEN_ID} .novaSiteRenderHint {
        margin-top: 13px;
        color: rgba(225,255,231,.46);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .11em;
        text-transform: uppercase;
      }

      @keyframes novaSiteRenderPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 24px rgba(57,255,20,.12), inset 0 0 18px rgba(57,255,20,.04); }
        50% { transform: scale(1.035); box-shadow: 0 0 38px rgba(57,255,20,.24), inset 0 0 24px rgba(57,255,20,.08); }
      }

      @keyframes novaSiteRenderBar {
        0% { left: -40%; }
        100% { left: 108%; }
      }

      @keyframes novaSiteRenderScan {
        from { transform: translateY(-4%); }
        to { transform: translateY(4%); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${SCREEN_ID} .novaSiteRenderLogo,
        #${SCREEN_ID} .novaSiteRenderTrack::after,
        #${SCREEN_ID}::before { animation: none !important; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureScreen() {
    if (!site || !document.documentElement) return null;
    ensureStyle();

    let screen = document.getElementById(SCREEN_ID);
    if (screen) return screen;

    screen = document.createElement('div');
    screen.id = SCREEN_ID;
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.innerHTML = `
      <div class="novaSiteRenderCard">
        <div class="novaSiteRenderLogo">N</div>
        <div class="novaSiteRenderBrand">NOVA // ${siteLabel}</div>
        <div class="novaSiteRenderTitle">LOADING ${site === 'hero' ? 'HERO' : 'POPS'} WORKSPACE</div>
        <div class="novaSiteRenderStatus">INITIALISING NOVA…</div>
        <div class="novaSiteRenderTrack"></div>
        <div class="novaSiteRenderHint">Holding the interface until Nova has finished rendering</div>
      </div>
    `;

    // Mount directly under <html>. Bootstrap hides <body> during prepaint.
    document.documentElement.appendChild(screen);
    return screen;
  }

  function setStatus(message) {
    const status = document.querySelector(`#${SCREEN_ID} .novaSiteRenderStatus`);
    if (status && message) status.textContent = String(message).toUpperCase();
  }

  function showScreen(message = 'INITIALISING NOVA…') {
    const screen = ensureScreen();
    if (!screen) return;
    screen.classList.remove('novaSiteRenderScreen--leave');
    screen.setAttribute('aria-hidden', 'false');
    setStatus(message);
  }

  function hideScreen() {
    const screen = document.getElementById(SCREEN_ID);
    if (!screen) return;

    screen.classList.add('novaSiteRenderScreen--leave');
    screen.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (ready && screen.parentNode) screen.remove();
    }, 260);
  }

  function beginCycle(reason = 'navigation') {
    if (!site) return 0;

    cycle += 1;
    cycleHref = location.href;
    ready = false;
    pendingHeroRequests = 0;
    heroRequestSeen = false;
    lastHeroRequestFinishedAt = 0;

    clearTimeout(readyTimer);
    clearTimeout(safetyTimer);

    const currentCycle = cycle;
    const status = reason === 'startup'
      ? `STARTING ${site === 'hero' ? 'HERO' : 'POPS'}…`
      : `NAVIGATING ${site === 'hero' ? 'HERO' : 'POPS'}…`;
    showScreen(status);

    safetyTimer = setTimeout(() => {
      if (currentCycle !== cycle || ready) return;
      dispatchReady('render-gate-safety-timeout', currentCycle);
    }, 12000);

    return currentCycle;
  }

  function dispatchReady(reason, targetCycle = cycle) {
    if (!site || ready || targetCycle !== cycle) return false;
    ready = true;

    clearTimeout(readyTimer);
    clearTimeout(safetyTimer);

    setStatus(`${site === 'hero' ? 'HERO' : 'POPS'} READY — OPENING INTERFACE`);

    const detail = {
      site,
      reason,
      version: VERSION,
      cycle,
      href: cycleHref,
      pendingHeroRequests,
      at: new Date().toISOString()
    };

    try {
      document.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
    } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
    } catch (_) {}

    setTimeout(() => {
      if (ready && targetCycle === cycle) hideScreen();
    }, 90);

    console.log('[Nova Core] Site render ready', detail);
    return true;
  }

  function isHeroApiUrl(input) {
    let url = '';

    try {
      if (typeof input === 'string') {
        url = new URL(input, location.href).href;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input && typeof input.url === 'string') {
        url = new URL(input.url, location.href).href;
      }
    } catch (_) {
      return false;
    }

    if (!/^https:\/\/hero\.[^.]+\.picking\.aft\.a2z\.com\//i.test(url)) {
      return false;
    }

    return /\/api\/fcs\/[^/]+\/entities\/type\/CUSTOMER_SHIPMENT\/id\/[^/]+\/events(?:\/|$)/i.test(url);
  }

  function scheduleHeroReadyCheck(reason = 'request-finished', targetCycle = cycle) {
    clearTimeout(readyTimer);

    readyTimer = setTimeout(() => {
      readyTimer = null;
      if (ready || site !== 'hero' || targetCycle !== cycle) return;

      const panel = document.getElementById('hero-tooltips-top-panel');
      const hasShipmentRoute = /customer-shipment\/[^/?#]+/i.test(location.pathname);

      if (!panel || panel.hidden || panel.classList.contains('is-loading')) return;
      if (pendingHeroRequests > 0) return;
      if (hasShipmentRoute && !heroRequestSeen) return;

      if (heroRequestSeen && Date.now() - lastHeroRequestFinishedAt < 110) {
        scheduleHeroReadyCheck('quiet-window', targetCycle);
        return;
      }

      dispatchReady(reason, targetCycle);
    }, 120);
  }

  function installHeroFetchTracker() {
    if (site !== 'hero') return false;

    const currentFetch = globalThis.fetch;
    if (typeof currentFetch !== 'function') return false;
    if (currentFetch[FETCH_FLAG] === true) return true;

    const trackedFetch = function novaSiteRenderTrackedFetch(input, init) {
      const tracked = isHeroApiUrl(input);
      const requestCycle = cycle;

      if (tracked && requestCycle === cycle) {
        heroRequestSeen = true;
        pendingHeroRequests += 1;
        setStatus(`READING HERO INTELLIGENCE // ${pendingHeroRequests} REQUEST${pendingHeroRequests === 1 ? '' : 'S'}`);
      }

      let result;
      try {
        result = currentFetch.call(this, input, init);
      } catch (error) {
        if (tracked && requestCycle === cycle) {
          pendingHeroRequests = Math.max(0, pendingHeroRequests - 1);
          lastHeroRequestFinishedAt = Date.now();
          scheduleHeroReadyCheck('hero-request-error', requestCycle);
        }
        throw error;
      }

      if (!tracked) return result;

      return Promise.resolve(result).finally(() => {
        if (requestCycle !== cycle) return;
        pendingHeroRequests = Math.max(0, pendingHeroRequests - 1);
        lastHeroRequestFinishedAt = Date.now();
        setStatus(
          pendingHeroRequests > 0
            ? `READING HERO INTELLIGENCE // ${pendingHeroRequests} REQUEST${pendingHeroRequests === 1 ? '' : 'S'}`
            : 'FINALISING HERO WORKSPACE…'
        );
        scheduleHeroReadyCheck('hero-data-settled', requestCycle);
      });
    };

    try {
      Object.defineProperty(trackedFetch, FETCH_FLAG, {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false
      });
    } catch (_) {
      trackedFetch[FETCH_FLAG] = true;
    }

    try {
      globalThis.fetch = trackedFetch;
    } catch (_) {
      try {
        Object.defineProperty(globalThis, 'fetch', {
          value: trackedFetch,
          configurable: true,
          writable: true
        });
      } catch (error) {
        console.warn('[Nova Core] HERO render gate fetch tracker failed', error);
        return false;
      }
    }

    return true;
  }

  function checkPopsReady() {
    if (ready || site !== 'pops') return;

    const api = window.NovaPopsModernUI;
    if (!api || typeof api.getStatus !== 'function') return;

    let status = null;
    try {
      status = api.getStatus();
    } catch (_) {
      return;
    }

    const styled = Number(status?.styledActions || 0) + Number(status?.styledCards || 0);

    if (status?.active === true && status?.visible === true && styled > 0) {
      dispatchReady('pops-modern-ui-applied');
    }
  }

  function checkHeroReady() {
    if (ready || site !== 'hero') return;
    scheduleHeroReadyCheck('hero-panel-stable');
  }

  function checkNavigation() {
    if (!site || location.href === cycleHref) return;
    beginCycle('navigation');
  }

  function checkReady() {
    checkNavigation();
    if (site === 'pops') checkPopsReady();
    if (site === 'hero') checkHeroReady();
  }

  function installNavigationWatcher() {
    if (!site || history.__novaSiteRenderGateWrapped) return;

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const detectNavigation = () => {
      queueMicrotask(() => {
        if (location.href !== cycleHref) beginCycle('navigation');
      });
    };

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      detectNavigation();
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      detectNavigation();
      return result;
    };

    try {
      Object.defineProperty(history, '__novaSiteRenderGateWrapped', {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false
      });
    } catch (_) {
      history.__novaSiteRenderGateWrapped = true;
    }

    window.addEventListener('popstate', detectNavigation);
    window.addEventListener('hashchange', detectNavigation);
  }

  function installObserver() {
    if (!site || observer || !document.documentElement) return;

    observer = new MutationObserver(checkReady);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden']
    });
  }

  function install() {
    if (!site || installed) return Boolean(site);
    installed = true;

    beginCycle('startup');
    installHeroFetchTracker();
    installNavigationWatcher();
    installObserver();

    pollTimer = setInterval(checkReady, 40);
    checkReady();
    return true;
  }

  function getStatus() {
    return {
      version: VERSION,
      site,
      ready,
      cycle,
      href: cycleHref,
      heroRequestSeen,
      pendingHeroRequests,
      lastHeroRequestFinishedAt: lastHeroRequestFinishedAt || null,
      overlayVisible: Boolean(document.getElementById(SCREEN_ID))
    };
  }

  window.NovaSiteRenderGate = {
    version: VERSION,
    install,
    beginCycle,
    checkReady,
    dispatchReady,
    setStatus,
    getStatus
  };

  install();
})();
