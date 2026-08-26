// modules/obps/nova-obps-risk-engine.js
// Nova OB PS Control Center v2.0.0 — plain-source bootstrap loader
(function () {
  'use strict';

  const API = 'NovaOBPSRiskEngine';
  const VERSION = '2.0.0';
  const BASE = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/modules/obps/source/v2.0.0/';
  const PARTS = Array.from({ length: 9 }, (_, i) => `part${String(i).padStart(2, '0')}.txt`);

  if (window[API]?.directModule === true) {
    try { window[API].show?.(); } catch (_) {}
    return;
  }
  if (window[API]?.loaderVersion === VERSION) return;

  let realApi = null;
  let loadError = null;
  let wantVisible = true;
  let wantRefresh = false;
  let badge = null;

  function status(text, isError = false) {
    try {
      if (!badge?.isConnected) {
        badge = document.createElement('div');
        badge.id = 'nova-obps-loader-status';
        badge.style.cssText = 'position:fixed;left:16px;top:16px;z-index:2147483646;padding:9px 12px;border-radius:10px;background:#0b1324;color:#b9d2ff;border:1px solid #315ca8;box-shadow:0 10px 30px rgba(0,0,0,.32);font:800 11px/1.35 Arial,sans-serif;max-width:560px';
        (document.body || document.documentElement).appendChild(badge);
      }
      badge.style.color = isError ? '#ffb2b2' : '#b9d2ff';
      badge.style.borderColor = isError ? '#a43d3d' : '#315ca8';
      badge.textContent = text;
    } catch (_) {}
  }

  function clearStatus() {
    try { badge?.remove(); } catch (_) {}
    badge = null;
  }

  const proxy = {
    id: 'nova-obps-risk-engine',
    version: VERSION,
    loaderVersion: VERSION,
    loaded: true,
    show() {
      wantVisible = true;
      if (realApi?.show) return realApi.show();
      status(loadError ? `OB PS wall failed: ${loadError.message || loadError}` : 'Loading OB PS Control Center…', Boolean(loadError));
      return true;
    },
    hide() {
      wantVisible = false;
      clearStatus();
      if (realApi?.hide) return realApi.hide();
      return true;
    },
    refresh() {
      wantRefresh = true;
      if (realApi?.refresh) return realApi.refresh();
      return true;
    },
    getState() {
      if (realApi?.getState) return realApi.getState();
      return { loading: !loadError, error: loadError ? String(loadError) : null, version: VERSION };
    }
  };

  window[API] = proxy;

  function gmText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest unavailable'));
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        headers: { Accept: 'text/plain', 'Cache-Control': 'no-cache' },
        onload(r) {
          if (r.status >= 200 && r.status < 300) resolve(String(r.responseText || ''));
          else reject(new Error(`HTTP ${r.status} loading ${url}`));
        },
        onerror: () => reject(new Error(`Network error loading ${url}`)),
        ontimeout: () => reject(new Error(`Timeout loading ${url}`))
      });
    });
  }

  async function load() {
    try {
      const chunks = [];
      for (let i = 0; i < PARTS.length; i += 1) {
        status(`Loading OB PS Control Center… ${i + 1}/${PARTS.length}`);
        chunks.push(await gmText(`${BASE}${PARTS[i]}?v=${VERSION}`));
      }

      const code = chunks.join('');
      if (!code.includes("const VERSION = '2.0.0'")) throw new Error('Joined source failed version check');
      if (!code.includes('window[API]={id:MODULE_ID')) throw new Error('Joined source is incomplete');

      status('Starting OB PS Control Center…');
      const runner = new Function(
        'GM_xmlhttpRequest',
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_addValueChangeListener',
        'GM_registerMenuCommand',
        'unsafeWindow',
        code + '\n//# sourceURL=nova://module/nova-obps-control-center-v2.js'
      );

      runner.call(
        window,
        typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
        typeof GM_getValue === 'function' ? GM_getValue : undefined,
        typeof GM_setValue === 'function' ? GM_setValue : undefined,
        typeof GM_deleteValue === 'function' ? GM_deleteValue : undefined,
        typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : undefined,
        typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined,
        typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      );

      realApi = window[API];
      if (!realApi || realApi === proxy || realApi.directModule !== true) {
        throw new Error('Direct OB PS module did not expose its API');
      }

      clearStatus();
      if (wantVisible) realApi.show?.(); else realApi.hide?.();
      if (wantRefresh) realApi.refresh?.();
      console.log('[Nova OBPS] v2.0.0 direct source loaded');
    } catch (error) {
      loadError = error;
      window[API] = proxy;
      status(`OB PS wall failed: ${error?.message || String(error)}`, true);
      console.error('[Nova OBPS] v2 load failed', error);
    }
  }

  void load();
})();
