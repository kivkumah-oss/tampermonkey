// core/nova-site-render-gate.js
(function () {
  'use strict';

  if (window.NovaSiteRenderGate) return;

  const VERSION = '1.0.0';
  const FETCH_FLAG = '__novaSiteRenderGateFetch';
  const READY_EVENT = 'nova-site-render-ready';

  const host = String(location.hostname || '').toLowerCase();
  const site =
    host === 'aft-pops-dub.aka.amazon.com' ||
    host === 'aft-pops.eu.aft.amazonoperations.app'
      ? 'pops'
      : /^hero\.[^.]+\.picking\.aft\.a2z\.com$/i.test(host)
        ? 'hero'
        : null;

  let ready = false;
  let pendingHeroRequests = 0;
  let heroRequestSeen = false;
  let lastHeroRequestFinishedAt = 0;
  let readyTimer = null;
  let pollTimer = null;
  let observer = null;

  function dispatchReady(reason) {
    if (ready || !site) return false;
    ready = true;

    const detail = {
      site,
      reason,
      version: VERSION,
      pendingHeroRequests,
      at: new Date().toISOString()
    };

    try {
      document.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
    } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
    } catch (_) {}

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

  function scheduleHeroReadyCheck(reason = 'request-finished') {
    clearTimeout(readyTimer);

    readyTimer = setTimeout(() => {
      readyTimer = null;
      if (ready || site !== 'hero') return;

      const panel = document.getElementById('hero-tooltips-top-panel');
      const hasShipmentRoute = /customer-shipment\/[^/?#]+/i.test(location.pathname);

      if (!panel || panel.hidden || panel.classList.contains('is-loading')) {
        return;
      }

      if (pendingHeroRequests > 0) return;
      if (hasShipmentRoute && !heroRequestSeen) return;

      if (heroRequestSeen && Date.now() - lastHeroRequestFinishedAt < 110) {
        scheduleHeroReadyCheck('quiet-window');
        return;
      }

      dispatchReady(reason);
    }, 120);
  }

  function installHeroFetchTracker() {
    if (site !== 'hero') return false;

    const currentFetch = globalThis.fetch;
    if (typeof currentFetch !== 'function') return false;
    if (currentFetch[FETCH_FLAG] === true) return true;

    const trackedFetch = function novaSiteRenderTrackedFetch(input, init) {
      const tracked = isHeroApiUrl(input);

      if (tracked) {
        heroRequestSeen = true;
        pendingHeroRequests += 1;
      }

      let result;
      try {
        result = currentFetch.call(this, input, init);
      } catch (error) {
        if (tracked) {
          pendingHeroRequests = Math.max(0, pendingHeroRequests - 1);
          lastHeroRequestFinishedAt = Date.now();
          scheduleHeroReadyCheck('hero-request-error');
        }
        throw error;
      }

      if (!tracked) return result;

      return Promise.resolve(result).finally(() => {
        pendingHeroRequests = Math.max(0, pendingHeroRequests - 1);
        lastHeroRequestFinishedAt = Date.now();
        scheduleHeroReadyCheck('hero-data-settled');
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

    const styled =
      Number(status?.styledActions || 0) +
      Number(status?.styledCards || 0);

    if (status?.active === true && status?.visible === true && styled > 0) {
      dispatchReady('pops-modern-ui-applied');
    }
  }

  function checkHeroReady() {
    if (ready || site !== 'hero') return;
    scheduleHeroReadyCheck('hero-panel-stable');
  }

  function checkReady() {
    if (site === 'pops') checkPopsReady();
    if (site === 'hero') checkHeroReady();
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
    if (!site) return false;

    installHeroFetchTracker();
    installObserver();

    pollTimer = setInterval(checkReady, 40);
    checkReady();

    setTimeout(() => {
      if (!ready) dispatchReady('render-gate-timeout');
    }, site === 'hero' ? 4700 : 3200);

    return true;
  }

  function getStatus() {
    return {
      version: VERSION,
      site,
      ready,
      heroRequestSeen,
      pendingHeroRequests,
      lastHeroRequestFinishedAt: lastHeroRequestFinishedAt || null
    };
  }

  window.NovaSiteRenderGate = {
    version: VERSION,
    install,
    checkReady,
    dispatchReady,
    getStatus
  };

  install();
})();
