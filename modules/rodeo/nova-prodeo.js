// modules/rodeo/nova-prodeo.js
(function () {
  'use strict';

  const MODULE_ID = 'nova-rodeo-prodeo';
  const MODULE_VERSION = '1.4-nova.2';
  const SOURCE_VERSION = '1.4';
  const LOG = '[Nova Prodeo]';
  const SOURCE_URL = 'https://drive-render.corp.amazon.com/view/BHX2Scripts/prodeo.user.js';

  if (window.NovaProdeo) {
    window.NovaProdeo.show?.();
    return;
  }

  let started = false;
  let loading = null;
  let lastError = '';
  let sourceVersion = '';
  let blockedTelemetry = 0;
  const styles = [];

  function matchesPage() {
    return /^https:\/\/rodeo-dub\.amazon\.com\/[^/]+\/[^?]+\?/i.test(location.href);
  }

  function requestText(url, label) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest is unavailable'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        headers: {
          Accept: 'text/javascript, text/plain, */*',
          'Cache-Control': 'no-cache'
        },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(String(response.responseText || ''));
          } else {
            reject(new Error(`${label || 'request'} HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error(`${label || 'request'} network error`)),
        ontimeout: () => reject(new Error(`${label || 'request'} timed out`))
      });
    });
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = String(css || '');
    (document.head || document.documentElement).appendChild(style);
    styles.push(style);
    return style;
  }

  function openInTab(url) {
    return window.open(String(url || ''), '_blank');
  }

  function clipboardFallback(text) {
    const area = document.createElement('textarea');
    area.value = String(text || '');
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (_) {}
    area.remove();
  }

  function setClipboard(value) {
    const text = String(value ?? '');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => clipboardFallback(text));
    } else {
      clipboardFallback(text);
    }
    return true;
  }

  function safeGmRequest(options) {
    const request = options && typeof options === 'object' ? options : {};
    const url = String(request.url || '');

    // The original Prodeo contains two hard-coded Chime incoming-webhook calls.
    // Nova never sends those. Return a harmless success so legacy UI does not hang.
    if (/^https:\/\/hooks\.chime\.aws\//i.test(url)) {
      blockedTelemetry += 1;
      console.info(LOG, 'Blocked legacy Chime webhook request');
      queueMicrotask(() => request.onload?.({ status: 204, responseText: '', finalUrl: url }));
      return { abort() {} };
    }

    return GM_xmlhttpRequest(request);
  }

  function readVersion(source) {
    const match = String(source || '').match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/mi);
    return match?.[1] || '';
  }

  async function executeLegacy() {
    const source = await requestText(SOURCE_URL, 'Prodeo');
    if (!source.trim()) throw new Error('Prodeo source is empty');

    sourceVersion = readVersion(source);
    if (sourceVersion && sourceVersion !== SOURCE_VERSION) {
      console.warn(LOG, `Corporate source is v${sourceVersion}; adapter was validated against v${SOURCE_VERSION}. Continuing with Nova compatibility guards.`);
    }

    // Prodeo has its own 20-hour self-update check. Nova's manifest owns updates now,
    // so refresh this timestamp before execution and the legacy updater remains dormant.
    try { GM_setValue('lastUpdateCheck', Date.now()); } catch (_) {}

    const gmInfo = {
      script: {
        name: 'prodeo (Nova)',
        version: SOURCE_VERSION
      },
      scriptUpdateURL: SOURCE_URL
    };

    const runner = new Function(
      'GM_xmlhttpRequest',
      'GM_addStyle',
      'GM_openInTab',
      'GM_getValue',
      'GM_setValue',
      'GM_deleteValue',
      'GM_info',
      'GM_setClipboard',
      `${source}\n//# sourceURL=nova://legacy/prodeo-${sourceVersion || SOURCE_VERSION}.user.js`
    );

    runner.call(
      window,
      safeGmRequest,
      addStyle,
      openInTab,
      GM_getValue,
      GM_setValue,
      GM_deleteValue,
      gmInfo,
      setClipboard
    );
  }

  async function start() {
    if (!matchesPage()) return false;
    if (started) return true;
    if (loading) return loading;

    loading = (async () => {
      try {
        await executeLegacy();
        started = true;
        lastError = '';
        console.log(LOG, `adapter v${MODULE_VERSION} active; source v${sourceVersion || SOURCE_VERSION}; telemetry blocked; updates managed by Nova`);
        return true;
      } catch (error) {
        lastError = String(error?.message || error);
        console.error(LOG, 'Failed to start', error);
        return false;
      } finally {
        loading = null;
      }
    })();

    return loading;
  }

  window.NovaProdeo = {
    id: MODULE_ID,
    version: MODULE_VERSION,
    sourceUrl: SOURCE_URL,
    show: start,
    refresh: start,
    hide() {
      console.info(LOG, 'Disabled for future loads. Existing Prodeo DOM changes clear on refresh.');
      return true;
    },
    getStatus() {
      return {
        started,
        loading: Boolean(loading),
        lastError,
        sourceVersion: sourceVersion || null,
        expectedSourceVersion: SOURCE_VERSION,
        blockedTelemetry,
        matchesPage: matchesPage(),
        updates: 'Nova manifest'
      };
    }
  };

  start();
})();
