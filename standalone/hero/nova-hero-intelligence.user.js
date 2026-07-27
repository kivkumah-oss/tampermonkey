// ==UserScript==
// @name         Nova HERO Intelligence Console
// @namespace    https://github.com/kivkumah-oss/tampermonkey
// @version      1.4.2
// @author       Martins / Nova
// @description  Standalone Nova HERO Intelligence Console with Dark, Glass and fully custom Theme Studio.
// @match        https://hero.eu.picking.aft.a2z.com/*
// @require      https://drive.corp.amazon.com/view/LCY3repart/lib/jquery.min.js
// @require      https://drive.corp.amazon.com/view/LCY3repart/lib/waitForKeyElements.js
// @icon         https://hero.eu.picking.aft.a2z.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/standalone/hero/nova-hero-intelligence.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/standalone/hero/nova-hero-intelligence.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @connect      rodeo-dub.amazon.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__NOVA_HERO_STANDALONE_LOADER__) return;
  window.__NOVA_HERO_STANDALONE_LOADER__ = true;

  const BASE = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/standalone/hero/payload-gzip/';
  const PARTS = Array.from({ length: 4 }, (_, index) => `payload-${String(index + 1).padStart(2, '0')}.b64`);

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        onload(response) {
          if (response.status >= 200 && response.status < 300) resolve(response.responseText.trim());
          else reject(new Error(`HTTP ${response.status} while loading ${url}`));
        },
        onerror() {
          reject(new Error(`Network failure while loading ${url}`));
        },
        ontimeout() {
          reject(new Error(`Timed out while loading ${url}`));
        }
      });
    });
  }

  async function decodePayload(base64) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser does not support gzip payload decoding.');
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));

    return new Response(stream).text();
  }

  async function boot() {
    try {
      const chunks = [];
      for (const part of PARTS) chunks.push(await fetchText(BASE + part));

      const source = await decodePayload(chunks.join(''));

      // Keep the payload inside the userscript sandbox so @require globals
      // such as jQuery, $, and waitForKeyElements remain available.
      eval(`${source}\n//# sourceURL=nova-hero-intelligence.payload.js`);

      console.log('[Nova HERO] Standalone payload loaded', PARTS.length, 'compressed parts');
    } catch (error) {
      window.__NOVA_HERO_STANDALONE_LOADER__ = false;
      console.error('[Nova HERO] Failed to load standalone payload', error);
      alert(`Nova HERO failed to load from GitHub.\n\n${error.message}`);
    }
  }

  boot();
})();