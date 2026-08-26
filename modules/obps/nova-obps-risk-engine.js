// modules/obps/nova-obps-risk-engine.js
// Nova OB PS Risk Engine v1.3.0 — hardened full-wall loader.
(function () {
  'use strict';

  const API = 'NovaOBPSRiskEngine';
  const VERSION = '1.3.0';
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
  let statusNode = null;

  function showStatus(text, error = false) {
    try {
      if (!statusNode || !statusNode.isConnected) {
        statusNode = document.createElement('div');
        statusNode.id = 'nova-obps-loader-status';
        statusNode.style.cssText = 'position:fixed;left:18px;top:18px;z-index:2147483646;padding:10px 13px;border-radius:10px;background:#07110d;color:#8fffc2;border:1px solid #1d8055;box-shadow:0 8px 30px rgba(0,0,0,.28);font:700 12px/1.35 Arial,sans-serif;max-width:620px';
        (document.body || document.documentElement).appendChild(statusNode);
      }
      statusNode.style.color = error ? '#ff9a9a' : '#8fffc2';
      statusNode.style.borderColor = error ? '#8b3030' : '#1d8055';
      statusNode.textContent = text;
    } catch (_) {}
  }

  function clearStatus() {
    try { statusNode?.remove(); } catch (_) {}
    statusNode = null;
  }

  const proxy = {
    id: 'nova-obps-risk-engine',
    version: VERSION,
    loaderVersion: VERSION,
    loaded: true,
    show() {
      wantVisible = true;
      if (realApi && typeof realApi.show === 'function') return realApi.show();
      showStatus(loadError ? `OB PS wall failed: ${loadError.message || loadError}` : 'Loading full OB PS wall…', Boolean(loadError));
      return true;
    },
    hide() {
      wantVisible = false;
      clearStatus();
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
      return { loading: !loadError, error: loadError ? String(loadError) : null, fullWall: true, version: VERSION };
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
          if (r.status >= 200 && r.status < 300) resolve(String(r.responseText || ''));
          else reject(new Error(`HTTP ${r.status} for ${url}`));
        },
        onerror: () => reject(new Error(`Network error for ${url}`)),
        ontimeout: () => reject(new Error(`Timeout for ${url}`))
      });
    });
  }

  function normalizeBase64(value) {
    let clean = String(value || '')
      .replace(/\s+/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/[^A-Za-z0-9+/=]/g, '');

    const firstPad = clean.indexOf('=');
    if (firstPad !== -1 && firstPad < clean.length - 2) {
      clean = clean.replace(/=/g, '');
    }
    while (clean.length % 4) clean += '=';
    return clean;
  }

  function base64Bytes(value) {
    const clean = normalizeBase64(value);
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function gunzip(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Browser gzip decoder unavailable');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  async function loadFullWall() {
    try {
      const chunks = [];
      for (let i = 0; i < PARTS.length; i += 1) {
        showStatus(`Loading full OB PS wall… ${i + 1}/${PARTS.length}`);
        chunks.push(await gmText(`${BASE}${PARTS[i]}?v=${VERSION}&ts=${Date.now()}`));
      }

      showStatus('Decoding full OB PS wall…');
      let code = await gunzip(base64Bytes(chunks.join('')));
      code = code.replace("const MODULE_VERSION = '1.1.0';", "const MODULE_VERSION = '1.3.0';");

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

      try { delete window[API]; } catch (_) { window[API] = undefined; }

      try {
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
      } catch (error) {
        window[API] = proxy;
        throw error;
      }

      realApi = window[API];
      if (!realApi || realApi === proxy || typeof realApi.show !== 'function') {
        window[API] = proxy;
        throw new Error('Full wall executed but did not expose NovaOBPSRiskEngine');
      }

      clearStatus();
      if (wantVisible) realApi.show();
      else if (typeof realApi.hide === 'function') realApi.hide();
      if (wantRefresh && typeof realApi.refresh === 'function') realApi.refresh();
      console.log('[Nova OBPS] Full wall v1.3.0 loaded.');
    } catch (error) {
      loadError = error;
      window[API] = proxy;
      showStatus(`OB PS wall failed: ${error?.message || String(error)}`, true);
      console.error('[Nova OBPS] Full wall load failed', error);
    }
  }

  void loadFullWall();
})();
