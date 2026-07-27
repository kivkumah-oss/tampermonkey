// ==UserScript==
// @name         Nova HERO Intelligence Console
// @namespace    https://github.com/kivkumah-oss/tampermonkey
// @version      1.4.0
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

  const BASE = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/standalone/hero/payload/';
  const PARTS = Array.from({ length: 13 }, (_, index) => `part-${String(index + 1).padStart(2, '0')}.txt`);

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        onload(response) {
          if (response.status >= 200 && response.status < 300) resolve(response.responseText);
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

  async function boot() {
    try {
      const chunks = [];
      for (const part of PARTS) chunks.push(await fetchText(BASE + part));
      const source = `${chunks.join('')}\n//# sourceURL=nova-hero-intelligence.payload.js`;
      Function(source)();
      console.log('[Nova HERO] Standalone payload loaded', PARTS.length, 'parts');
    } catch (error) {
      console.error('[Nova HERO] Failed to load standalone payload', error);
      alert(`Nova HERO failed to load from GitHub.\n\n${error.message}`);
    }
  }

  boot();
})();
