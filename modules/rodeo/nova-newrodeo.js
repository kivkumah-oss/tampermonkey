// modules/rodeo/nova-newrodeo.js
(function () {
  'use strict';

  const MODULE_ID = 'nova-rodeo-newrodeo';
  const MODULE_VERSION = '20231120-nova.2';
  const SOURCE_VERSION = '20231120';
  const LOG = '[Nova NewRodeo]';
  const SOURCE_URL = 'https://drive.corp.amazon.com/view/ORY1Scripts/NewRodeo.user.js';
  const JQUERY_URL = 'https://drive.corp.amazon.com/view/ORY1Scripts/libs/jquery/3.2.1/jquery.min.js';

  if (window.NovaNewRodeo) {
    window.NovaNewRodeo.show?.();
    return;
  }

  let started = false;
  let loading = null;
  let lastError = '';
  let sourceVersion = '';
  const styles = [];

  function matchesPage() {
    return /^https:\/\/rodeo-[^.]+\.amazon\.com\/[^/]+\/(?:ItemList|Search|ExSD)\?/i.test(location.href);
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

  function forceBoxRecOff(value) {
    if (typeof value !== 'string') return value;
    try {
      const settings = JSON.parse(value || '{}');
      if (settings && typeof settings === 'object') {
        settings.AddBoxRec = false;
        return JSON.stringify(settings);
      }
    } catch (_) {}
    return value;
  }

  function novaGetValue(key, fallback) {
    if (typeof GM_getValue !== 'function') return fallback;
    const value = GM_getValue(key, fallback);
    return key === 'newrodeosettings' ? forceBoxRecOff(value) : value;
  }

  function novaSetValue(key, value) {
    if (typeof GM_setValue !== 'function') return undefined;
    const next = key === 'newrodeosettings' ? forceBoxRecOff(value) : value;
    return GM_setValue(key, next);
  }

  function readVersion(source) {
    const match = String(source || '').match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/mi);
    return match?.[1] || '';
  }

  function prepareLegacySource(source) {
    let code = String(source || '');
    if (!code.trim()) throw new Error('NewRodeo source is empty');

    // In a userscript sandbox, assigning this.$ creates the sandbox-global $.
    // Nova executes modules through a Function scope, so make $ explicitly local.
    const original = 'this.$ = this.jQuery = jQuery.noConflict(true);';
    const replacement = 'var $ = jQuery.noConflict(true); jQuery = $;';
    if (code.includes(original)) code = code.replace(original, replacement);

    return code;
  }

  async function executeLegacy() {
    const [jquerySource, rawSource] = await Promise.all([
      requestText(JQUERY_URL, 'jQuery'),
      requestText(SOURCE_URL, 'NewRodeo')
    ]);

    sourceVersion = readVersion(rawSource);
    if (sourceVersion && sourceVersion !== SOURCE_VERSION) {
      console.warn(LOG, `Corporate source is v${sourceVersion}; adapter was validated against v${SOURCE_VERSION}. Continuing with Nova compatibility guards.`);
    }

    const jqHost = {};
    const jqRunner = new Function(
      'window',
      'document',
      'navigator',
      'location',
      `${jquerySource}\nreturn window.jQuery;\n//# sourceURL=nova://dependency/newrodeo-jquery.js`
    );

    // jQuery needs a real window. It may temporarily publish globals; noConflict below restores them.
    const jq = jqRunner(window, document, navigator, location);
    if (typeof jq !== 'function') throw new Error('NewRodeo jQuery dependency did not initialise');

    const code = prepareLegacySource(rawSource);
    const runner = new Function(
      'jQuery',
      'GM_getValue',
      'GM_setValue',
      'GM_addStyle',
      'GM_xmlhttpRequest',
      `${code}\n//# sourceURL=nova://legacy/NewRodeo-${sourceVersion || SOURCE_VERSION}.user.js`
    );

    runner.call(
      jqHost,
      jq,
      novaGetValue,
      novaSetValue,
      addStyle,
      GM_xmlhttpRequest
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
        console.log(LOG, `adapter v${MODULE_VERSION} active; source v${sourceVersion || SOURCE_VERSION}; BoxRec delegated to NovaRodeoBoxRecommendation`);
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

  window.NovaNewRodeo = {
    id: MODULE_ID,
    version: MODULE_VERSION,
    sourceUrl: SOURCE_URL,
    show: start,
    refresh: start,
    hide() {
      console.info(LOG, 'Disabled for future loads. Existing NewRodeo DOM changes clear on refresh.');
      return true;
    },
    getStatus() {
      return {
        started,
        loading: Boolean(loading),
        lastError,
        sourceVersion: sourceVersion || null,
        expectedSourceVersion: SOURCE_VERSION,
        matchesPage: matchesPage(),
        boxRecommendationOwner: 'NovaRodeoBoxRecommendation'
      };
    }
  };

  start();
})();
