// modules/obps/nova-obps-risk-engine.js
// Nova OB PS Risk Engine v1.1.0 — full wall loader.
(function () {
  'use strict';

  const API = 'NovaOBPSRiskEngine';
  const VERSION = '1.1.0';
  const BASE = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/modules/obps/payload/';
  const PARTS = [
    'obps-full-wall-v1.1.0.part1.txt',
    'obps-full-wall-v1.1.0.part2.txt',
    'obps-full-wall-v1.1.0.part3.txt'
  ];

  if (window[API] && window[API].loaderVersion === VERSION) return;

  let realApi = null;
  let loadError = null;
  let wantVisible = true;
  let wantRefresh = false;

  const proxy = {
    id: 'nova-obps-risk-engine',
    version: VERSION,
    loaderVersion: VERSION,
    loaded: true,
    show() {
      wantVisible = true;
      if (realApi && typeof realApi.show === 'function') return realApi.show();
      return true;
    },
    hide() {
      wantVisible = false;
      if (realApi && typeof realApi.hide === 'function') return realApi.hide();
      return true;
    },
    refresh() {
      wantRefresh = true;
      if (realApi && typeof realApi.refresh === 'function') return realApi.refresh();
      return true;
    },
    getState() {
      if (realApi && typeof realApi.getState === 'function') return realApi.getState();
      return {
        loading: !loadError,
        error: loadError ? String(loadError) : null,
        fullWall: true,
        version: VERSION
      };
    }
  };

  window[API] = proxy;

  function gmText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        headers: { Accept: 'text/plain', 'Cache-Control': 'no-cache' },
        onload(r) {
          if (r.status >= 200 && r.status < 300) resolve(String(r.responseText || '').trim());
          else reject(new Error(`HTTP ${r.status} for ${url}`));
        },
        onerror: () => reject(new Error(`Network error for ${url}`)),
        ontimeout: () => reject(new Error(`Timeout for ${url}`))
      });
    });
  }

  async function inflate(base64) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('DecompressionStream unavailable');
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function loadFullWall() {
    try {
      const chunks = [];
      for (const file of PARTS) {
        chunks.push(await gmText(`${BASE}${file}?v=${VERSION}`));
      }

      const code = await inflate(chunks.join(''));
      const proxyRef = window[API];

      try {
        delete window[API];
      } catch (_) {
        window[API] = undefined;
      }

      const runner = new Function(
        'GM_xmlhttpRequest',
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_addValueChangeListener',
        'GM_registerMenuCommand',
        'unsafeWindow',
        code + '\n//# sourceURL=nova://module/nova-obps-risk-engine-full-wall.js'
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
      if (!realApi || realApi === proxyRef) {
        throw new Error('Full wall payload did not expose NovaOBPSRiskEngine');
      }

      window[API] = proxyRef;

      if (wantVisible) {
        if (typeof realApi.show === 'function') realApi.show();
      } else if (typeof realApi.hide === 'function') {
        realApi.hide();
      }
      if (wantRefresh && typeof realApi.refresh === 'function') realApi.refresh();

      console.log('[Nova OBPS] Full wall v1.1.0 loaded.');
    } catch (error) {
      loadError = error;
      window[API] = proxy;
      console.error('[Nova OBPS] Full wall load failed', error);
    }
  }

  void loadFullWall();
})();
