// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      2.3.0
// @description  Install once. Nova Core, modules, updates, cache, recovery, and flicker-free site startup are managed automatically from GitHub.
// @author       Martins + Nova
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      studio-api-prod.suno.com
// @connect      suno.com
// @connect      *.suno.com
// @connect      *.cloudfront.net
// @connect      cdn1.suno.ai
// @connect      cdn-o.suno.com
// @sandbox      JavaScript
// @run-at       document-start
// @noframes
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__NOVA_BOOTSTRAP_RUNNING__) return;
  window.__NOVA_BOOTSTRAP_RUNNING__ = true;

  const VERSION = '2.3.0';
  const MANIFEST_URL = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/nova.manifest.json';
  const TRUSTED_PREFIX = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/';
  const PREFIX = 'nova.bootstrap.v2.';
  const ACTIVE_MANIFEST_KEY = PREFIX + 'manifest.active';
  const PREVIOUS_MANIFEST_KEY = PREFIX + 'manifest.previous';
  const CACHE_INDEX_KEY = PREFIX + 'cache.index';
  const LAST_CHECK_KEY = PREFIX + 'lastCheckAt';
  const VISIBILITY_STATE_KEY = 'nova.modules.visibility.v1';
  const HUD_ID = 'nova-bootstrap-status';
  const PREPAINT_STYLE_ID = 'nova-prepaint-style';
  const PREPAINT_SCREEN_ID = 'nova-prepaint-screen';
  const UPDATE_CHECK_MS = 15 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 80;

  const state = {
    phase: 'starting',
    online: false,
    manifest: null,
    manifestSource: 'none',
    fastBoot: false,
    prepaint: null,
    loadedCore: [],
    failedCore: [],
    updateReady: false,
    lastError: null,
    startedAt: new Date().toISOString()
  };

  const log = (...args) => console.log('[Nova Bootstrap]', ...args);
  const warn = (...args) => console.warn('[Nova Bootstrap]', ...args);

  function storageGet(key, fallback = null) {
    try {
      const value = GM_getValue(key, fallback);
      return value === undefined ? fallback : value;
    } catch (error) {
      warn('Storage read failed:', key, error);
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      GM_setValue(key, value);
      return true;
    } catch (error) {
      warn('Storage write failed:', key, error);
      return false;
    }
  }

  function storageDelete(key) {
    try {
      GM_deleteValue(key);
      return true;
    } catch (error) {
      warn('Storage delete failed:', key, error);
      return false;
    }
  }

  function moduleExplicitlyDisabled(moduleId) {
    const visibility = storageGet(VISIBILITY_STATE_KEY, {});
    return Boolean(
      visibility &&
      typeof visibility === 'object' &&
      !Array.isArray(visibility) &&
      visibility[moduleId] === false
    );
  }

  function detectCriticalSite() {
    const host = String(location.hostname || '').toLowerCase();

    if (
      (host === 'aft-pops-dub.aka.amazon.com' ||
        host === 'aft-pops.eu.aft.amazonoperations.app') &&
      !moduleExplicitlyDisabled('nova-pops-modern-ui')
    ) {
      return { id: 'pops', label: 'POPS', moduleId: 'nova-pops-modern-ui' };
    }

    if (
      /^hero\.[^.]+\.picking\.aft\.a2z\.com$/i.test(host) &&
      !moduleExplicitlyDisabled('nova-hero-intelligence')
    ) {
      return { id: 'hero', label: 'HERO', moduleId: 'nova-hero-intelligence' };
    }

    return null;
  }

  let prepaintFallbackTimer = null;

  function installPrepaintGate() {
    const site = detectCriticalSite();
    if (!site || !document.documentElement) return null;

    state.prepaint = site.id;
    document.documentElement.setAttribute('data-nova-prepaint', site.id);

    const style = document.createElement('style');
    style.id = PREPAINT_STYLE_ID;
    style.textContent = `
      html[data-nova-prepaint] body {
        visibility: hidden !important;
      }
      #${PREPAINT_SCREEN_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 20% 10%, rgba(89,255,177,.14), transparent 34%),
          radial-gradient(circle at 88% 12%, rgba(92,168,255,.13), transparent 30%),
          linear-gradient(145deg, #03070c, #07121c 58%, #050b12);
        color: #eef8f4;
        font: 800 12px/1.45 "Amazon Ember", Inter, "Segoe UI", Arial, sans-serif;
        letter-spacing: .12em;
        transition: opacity .12s ease;
      }
      #${PREPAINT_SCREEN_ID} .nova-prepaint-inner {
        display: grid;
        justify-items: center;
        gap: 11px;
      }
      #${PREPAINT_SCREEN_ID} .nova-prepaint-core {
        font-size: 18px;
        letter-spacing: .18em;
        color: #59ffb1;
        text-shadow: 0 0 20px rgba(89,255,177,.42);
      }
      #${PREPAINT_SCREEN_ID} .nova-prepaint-site {
        color: #8ea8a0;
        font-size: 9px;
      }
      #${PREPAINT_SCREEN_ID} .nova-prepaint-bar {
        width: 150px;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255,255,255,.09);
      }
      #${PREPAINT_SCREEN_ID} .nova-prepaint-bar::after {
        content: "";
        display: block;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #59ffb1, #5ca8ff, #b18cff);
        animation: novaPrepaintMove .75s ease-in-out infinite alternate;
      }
      @keyframes novaPrepaintMove {
        from { transform: translateX(-10%); }
        to { transform: translateX(150%); }
      }
    `;
    document.documentElement.appendChild(style);

    const screen = document.createElement('div');
    screen.id = PREPAINT_SCREEN_ID;

    const inner = document.createElement('div');
    inner.className = 'nova-prepaint-inner';

    const core = document.createElement('div');
    core.className = 'nova-prepaint-core';
    core.textContent = 'NOVA';

    const siteText = document.createElement('div');
    siteText.className = 'nova-prepaint-site';
    siteText.textContent = `PREPARING ${site.label}`;

    const bar = document.createElement('div');
    bar.className = 'nova-prepaint-bar';

    inner.append(core, siteText, bar);
    screen.appendChild(inner);
    document.documentElement.appendChild(screen);

    prepaintFallbackTimer = setTimeout(
      () => releasePrepaintGate('safety-timeout'),
      site.id === 'hero' ? 5000 : 3500
    );

    return site;
  }

  function releasePrepaintGate(reason = 'ready') {
    if (!state.prepaint) return false;

    clearTimeout(prepaintFallbackTimer);
    prepaintFallbackTimer = null;

    const screen = document.getElementById(PREPAINT_SCREEN_ID);
    const finish = () => {
      document.documentElement?.removeAttribute('data-nova-prepaint');
      document.getElementById(PREPAINT_SCREEN_ID)?.remove();
      document.getElementById(PREPAINT_STYLE_ID)?.remove();
      state.prepaint = null;
    };

    if (screen) {
      screen.style.opacity = '0';
      setTimeout(finish, 130);
    } else {
      finish();
    }

    log('Prepaint released:', reason);
    return true;
  }

  const criticalSite = installPrepaintGate();

  document.addEventListener('nova-site-render-ready', (event) => {
    const site = String(event?.detail?.site || '');
    if (!state.prepaint || site !== state.prepaint) return;
    releasePrepaintGate(event?.detail?.reason || `${site}-ready`);
  });

  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.id) node.id = options.id;
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.title) node.title = options.title;
    if (options.type) node.type = options.type;
    if (options.style) node.style.cssText = options.style;
    for (const [name, value] of Object.entries(options.attrs || {})) {
      if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child) node.appendChild(child);
    }
    return node;
  }

  function mountHud() {
    let hud = document.getElementById(HUD_ID);
    if (hud) return hud;

    hud = el('div', {
      id: HUD_ID,
      style: 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:min(370px,calc(100vw - 28px));padding:11px 12px;box-sizing:border-box;border:1px solid rgba(34,211,238,.62);border-radius:14px;background:rgba(7,9,18,.97);color:#fff;box-shadow:0 0 24px rgba(34,211,238,.28),0 14px 45px rgba(0,0,0,.48);font:12px/1.4 Arial,sans-serif;pointer-events:auto'
    });

    (document.body || document.documentElement).appendChild(hud);
    return hud;
  }

  function updateHud(title, detail, progress, mode = 'loading', retry = false) {
    if (state.fastBoot && mode === 'loading') return null;

    const hud = mountHud();
    const pct = Math.max(0, Math.min(100, Number(progress) || 0));
    const colour =
      mode === 'error' ? '#ff7070' :
      mode === 'ready' ? '#79ff91' :
      mode === 'offline' ? '#ffd166' :
      '#67e8f9';

    hud.style.borderColor =
      mode === 'error' ? 'rgba(255,70,70,.78)' :
      mode === 'ready' ? 'rgba(80,255,112,.66)' :
      mode === 'offline' ? 'rgba(255,193,60,.66)' :
      'rgba(34,211,238,.62)';

    const header = el('div', {
      style: 'display:flex;justify-content:space-between;gap:10px;align-items:center'
    }, [
      el('b', { text: title, style: `color:${colour};letter-spacing:.04em` }),
      el('span', { text: `v${VERSION}`, style: 'color:#9ca3af;font-size:10px' })
    ]);

    const description = el('div', {
      text: detail,
      style: 'margin-top:5px;color:#d1d5db;word-break:break-word'
    });

    const bar = el('div', {
      style: 'height:5px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden'
    }, el('div', {
      style: `height:100%;width:${pct}%;background:linear-gradient(90deg,#7c4dff,#22d3ee,#39ff14,#ff8a1f,#ff2bd6);transition:width .18s ease`
    }));

    const children = [header, description, bar];

    if (retry) {
      const button = el('button', {
        id: 'nova-bootstrap-retry',
        type: 'button',
        text: 'Retry Nova',
        style: 'width:100%;margin-top:9px;padding:8px;border:1px solid rgba(255,95,95,.72);border-radius:10px;background:rgba(125,10,24,.82);color:#fff;font-weight:800;cursor:pointer'
      });
      button.addEventListener('click', () => location.reload());
      children.push(button);
    }

    hud.replaceChildren(...children);
    return hud;
  }

  function hideHudSoon(delay = 800) {
    setTimeout(() => {
      const hud = document.getElementById(HUD_ID);
      if (!hud) return;
      hud.style.transition = 'opacity .25s ease,transform .25s ease';
      hud.style.opacity = '0';
      hud.style.transform = 'translateY(8px)';
      setTimeout(() => hud.remove(), 280);
    }, delay);
  }

  const safeId = (value) =>
    String(value || 'unknown').replace(/[^a-z0-9._-]+/gi, '_');

  const trustedUrl = (url) =>
    typeof url === 'string' && url.startsWith(TRUSTED_PREFIX);

  function emitNovaEvent(type, detail = {}) {
    let event;
    try {
      event = new CustomEvent(type, { detail });
    } catch (_) {
      return false;
    }

    try {
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(event);
        return true;
      }
    } catch (_) {}

    try {
      if (document && typeof document.dispatchEvent === 'function') {
        document.dispatchEvent(event);
        return true;
      }
    } catch (_) {}

    return false;
  }

  window.NovaEvents = window.NovaEvents || {};
  window.NovaEvents.emit = emitNovaEvent;

  function addQuery(url, key, value) {
    return url +
      (url.includes('?') ? '&' : '?') +
      encodeURIComponent(key) +
      '=' +
      encodeURIComponent(value);
  }

  function requestText(url, timeout = 18000) {
    if (!trustedUrl(url)) {
      return Promise.reject(new Error('Blocked untrusted Nova URL: ' + url));
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout,
        headers: {
          Accept: 'text/plain, application/json;q=0.9, */*;q=0.8',
          'Cache-Control': 'no-cache'
        },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            state.online = true;
            resolve(String(response.responseText || ''));
          } else {
            reject(new Error('HTTP ' + response.status + ' for ' + url));
          }
        },
        onerror: () => reject(new Error('Network error for ' + url)),
        ontimeout: () => reject(new Error('Timed out loading ' + url))
      });
    });
  }

  function validateComponent(component, kind) {
    if (!component || typeof component !== 'object') {
      throw new Error('Invalid ' + kind + ' component');
    }
    if (!component.id || !component.url) {
      throw new Error('Missing id/url in ' + kind + ' component');
    }
    if (!trustedUrl(component.url)) {
      throw new Error('Untrusted component URL: ' + component.url);
    }
    return component;
  }

  function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest is not an object');
    }
    if (!manifest.version) {
      throw new Error('Manifest version is missing');
    }
    if (!Array.isArray(manifest.core) || !manifest.core.length) {
      throw new Error('Manifest core list is empty');
    }

    manifest.core.forEach((item) => validateComponent(item, 'core'));
    (manifest.modules || []).forEach((item) => validateComponent(item, 'module'));
    return manifest;
  }

  function fingerprint(manifest) {
    return JSON.stringify({
      version: manifest?.version,
      core: (manifest?.core || []).map((item) => [
        item.id,
        item.version,
        item.url,
        item.enabled !== false,
        Number(item.order) || 0
      ]),
      modules: (manifest?.modules || []).map((item) => [
        item.id,
        item.version,
        item.url,
        item.enabled !== false,
        item.autoload === true
      ])
    });
  }

  const cacheKey = (component, kind) =>
    PREFIX +
    'code.' +
    safeId(kind) +
    '.' +
    safeId(component.id) +
    '.' +
    safeId(component.version || 'latest');

  function readCacheIndex() {
    const index = storageGet(CACHE_INDEX_KEY, []);
    return Array.isArray(index) ? index : [];
  }

  function touchCache(key) {
    const index = readCacheIndex().filter((entry) => entry && entry.key !== key);
    index.unshift({ key, touchedAt: Date.now() });

    while (index.length > MAX_CACHE_ENTRIES) {
      const removed = index.pop();
      if (removed?.key) storageDelete(removed.key);
    }

    storageSet(CACHE_INDEX_KEY, index);
  }

  function readComponentCache(component, kind) {
    const key = cacheKey(component, kind);
    const cached = storageGet(key, null);

    if (!cached || typeof cached.code !== 'string' || !cached.code.trim()) {
      return null;
    }

    touchCache(key);
    return cached;
  }

  function writeComponentCache(component, kind, code) {
    const key = cacheKey(component, kind);
    const cached = {
      id: component.id,
      version: component.version || 'latest',
      url: component.url,
      kind,
      code,
      savedAt: new Date().toISOString()
    };

    storageSet(key, cached);
    touchCache(key);
    return cached;
  }

  async function fetchComponent(component, options = {}) {
    const kind = options.kind || (component.core ? 'core' : 'module');
    const preferCache = options.preferCache !== false;
    const force = options.force === true;

    validateComponent(component, kind);

    if (preferCache && !force) {
      const cached = readComponentCache(component, kind);
      if (cached) return cached.code;
    }

    const versioned = addQuery(
      component.url,
      'v',
      component.version || 'latest'
    );
    const url = force
      ? addQuery(versioned, 'ts', Date.now())
      : versioned;

    try {
      const code = await requestText(
        url,
        Number(options.timeout) || 20000
      );

      if (!code.trim()) {
        throw new Error('Empty source for ' + component.id);
      }

      writeComponentCache(component, kind, code);
      return code;
    } catch (error) {
      const cached = readComponentCache(component, kind);
      if (cached) {
        warn(
          'Using cached',
          kind,
          component.id,
          'after download failure:',
          error
        );
        return cached.code;
      }
      throw error;
    }
  }

  async function clearComponentCache(component, kind) {
    const id = safeId(component?.id);
    const kinds = kind ? [kind] : ['core', 'module', 'component'];
    const index = readCacheIndex();
    const targets = new Set();

    for (const entry of index) {
      if (!entry?.key) continue;
      if (
        kinds.some((itemKind) =>
          entry.key.startsWith(
            PREFIX + 'code.' + safeId(itemKind) + '.' + id + '.'
          )
        )
      ) {
        targets.add(entry.key);
      }
    }

    targets.forEach(storageDelete);
    storageSet(
      CACHE_INDEX_KEY,
      index.filter((entry) => !entry || !targets.has(entry.key))
    );
    return targets.size;
  }

  async function clearAllCaches() {
    readCacheIndex().forEach((entry) => {
      if (entry?.key) storageDelete(entry.key);
    });

    [
      CACHE_INDEX_KEY,
      ACTIVE_MANIFEST_KEY,
      PREVIOUS_MANIFEST_KEY,
      LAST_CHECK_KEY
    ].forEach(storageDelete);

    return true;
  }

  async function downloadManifest() {
    const text = await requestText(
      addQuery(MANIFEST_URL, 'ts', Date.now()),
      15000
    );
    return validateManifest(JSON.parse(text));
  }

  async function stageManifest(manifest) {
    const core = manifest.core
      .filter((item) => item && item.enabled !== false)
      .slice()
      .sort((a, b) =>
        (Number(a.order) || 0) - (Number(b.order) || 0)
      );

    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];

      updateHud(
        'Preparing Nova update',
        `${index + 1}/${core.length} · ${component.name || component.id}`,
        8 + ((index + 1) / core.length) * 45
      );

      try {
        await fetchComponent(component, {
          kind: 'core',
          preferCache: true
        });
      } catch (error) {
        if (component.required === false) {
          warn('Optional Core failed to stage:', component.id, error);
          continue;
        }
        throw new Error(
          'Could not stage required Core ' +
          component.id +
          ': ' +
          (error.message || error)
        );
      }
    }

    return manifest;
  }

  function readCachedManifest() {
    for (const [key, source] of [
      [ACTIVE_MANIFEST_KEY, 'cache-fast'],
      [PREVIOUS_MANIFEST_KEY, 'previous-cache-fast']
    ]) {
      const manifest = storageGet(key, null);
      if (!manifest) continue;

      try {
        state.manifestSource = source;
        state.fastBoot = true;
        return validateManifest(manifest);
      } catch (error) {
        warn('Ignoring invalid cached manifest:', source, error);
      }
    }

    return null;
  }

  async function resolveManifestForBoot() {
    const cached = readCachedManifest();
    if (cached) return cached;

    state.fastBoot = false;
    state.manifestSource = 'first-install';

    const remote = await downloadManifest();
    await stageManifest(remote);
    storageSet(ACTIVE_MANIFEST_KEY, remote);
    storageSet(LAST_CHECK_KEY, Date.now());
    return remote;
  }

  function executeCode(component, code, kind = 'core') {
    const sourceName =
      safeId(component.id || 'nova-component') + '.js';

    const runner = new Function(
      'GM_xmlhttpRequest',
      'GM_getValue',
      'GM_setValue',
      'GM_deleteValue',
      'GM_addValueChangeListener',
      'GM_registerMenuCommand',
      'unsafeWindow',
      code +
        '\n//# sourceURL=nova://' +
        kind +
        '/' +
        sourceName
    );

    runner.call(
      window,
      typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : undefined,
      typeof GM_getValue === 'function'
        ? GM_getValue
        : undefined,
      typeof GM_setValue === 'function'
        ? GM_setValue
        : undefined,
      typeof GM_deleteValue === 'function'
        ? GM_deleteValue
        : undefined,
      typeof GM_addValueChangeListener === 'function'
        ? GM_addValueChangeListener
        : undefined,
      typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : undefined,
      typeof unsafeWindow !== 'undefined'
        ? unsafeWindow
        : window
    );
  }

  function createNovaShell(manifest) {
    window.Nova = window.Nova || {};

    const registry = [
      ...manifest.core.map((item) => ({ ...item, core: true })),
      ...(manifest.modules || []).map((item) => ({
        ...item,
        core: false
      }))
    ];

    Object.assign(window.Nova, {
      version: manifest.version,
      bootstrapVersion: VERSION,
      build: manifest.build || 'manifest-' + manifest.version,
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL,
      registryUrl: MANIFEST_URL,
      manifest,
      registry: {
        version: manifest.version,
        updatedAt: manifest.updatedAt || null,
        modules: registry
      },
      modulesRegistry: registry,
      core: window.Nova.core || {}
    });

    window.Nova.getModules = () =>
      window.Nova.modulesRegistry.slice();

    window.Nova.getEnabledModules = () =>
      window.Nova.modulesRegistry.filter(
        (item) => item && item.enabled !== false
      );

    window.Nova.loadRegistry = async () =>
      checkForUpdates({ force: true });

    try {
      document.documentElement?.setAttribute(
        'data-nova-manifest',
        JSON.stringify(manifest)
      );
    } catch (error) {
      warn('Could not publish the Nova manifest bridge:', error);
    }
  }

  function isSunoPrimeWindow() {
    try {
      const host = String(location.hostname || '').toLowerCase();
      return (
        (host === 'suno.com' || host.endsWith('.suno.com')) &&
        new URLSearchParams(location.search).has('nova_suno_prime')
      );
    } catch (_) {
      return false;
    }
  }

  function startPrimeCaptureFromCache() {
    if (!isSunoPrimeWindow()) return;

    const manifest = storageGet(ACTIVE_MANIFEST_KEY, null);
    const component =
      manifest &&
      Array.isArray(manifest.modules) &&
      manifest.modules.find(
        (item) =>
          item &&
          item.id === 'nova-suno-remote-any-page'
      );

    const cached =
      component &&
      readComponentCache(component, 'module');

    if (!component || !cached) {
      warn(
        'Prime popup opened before the Suno module cache was available.'
      );
      return;
    }

    try {
      executeCode(component, cached.code, 'module');
      log('Started cached Suno Prime capture at document-start.');
    } catch (error) {
      warn('Could not start cached Suno Prime capture:', error);
    }
  }

  async function loadCore(manifest) {
    const core = manifest.core
      .filter((item) => item && item.enabled !== false)
      .slice()
      .sort((a, b) =>
        (Number(a.order) || 0) - (Number(b.order) || 0)
      );

    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];

      updateHud(
        'Loading Nova Core',
        `${index + 1}/${core.length} · ${component.name || component.id}`,
        18 + ((index + 1) / core.length) * 68
      );

      try {
        const code = await fetchComponent(component, {
          kind: 'core',
          preferCache: true
        });

        executeCode(component, code, 'core');
        state.loadedCore.push(component.id);

        if (component.api) {
          window.Nova.core[component.id] =
            window[component.api] || null;
        }

        log('Loaded', component.id, component.version || 'latest');
      } catch (error) {
        state.failedCore.push({
          id: component.id,
          error: String(error)
        });

        if (component.required === false) {
          warn('Optional Core failed:', component.id, error);
          continue;
        }

        throw new Error(
          'Required Core failed: ' +
          component.id +
          ' — ' +
          (error.message || error)
        );
      }
    }
  }

  function bindAliases() {
    Object.assign(window.Nova.core, {
      theme: window.NovaTheme || null,
      audioTheme: window.NovaAudioTheme || null,
      session: window.NovaSession || null,
      memory: window.NovaMemory || null,
      memoryAutoLearn: window.NovaMemoryAutoLearn || null,
      brain: window.NovaBrain || null,
      traceNetwork: window.NovaTraceNetwork || null,
      apiCatcher:
        window.NovaApiCatcher ||
        window.NovaTraceNetwork ||
        null,
      apiBodyCatcher: window.NovaApiBodyCatcher || null,
      domInspector: window.NovaDOMInspector || null,
      investigationExport:
        window.NovaInvestigationExport || null,
      menu: window.NovaMenu || null,
      orbExtras: window.NovaOrbExtras || null,
      memoryPanel: window.NovaMemoryPanel || null,
      windowManager: window.NovaWindowManager || null,
      moduleLoader: window.NovaModuleLoader || null,
      siteRenderGate: window.NovaSiteRenderGate || null,
      youtubeMusicAdapter:
        window.NovaYouTubeMusicAdapter || null
    });

    window.Nova.theme = window.NovaTheme || null;
    window.Nova.audioTheme = window.NovaAudioTheme || null;
  }

  function startServices() {
    if (
      window.NovaTheme &&
      typeof window.NovaTheme.inject === 'function'
    ) {
      window.NovaTheme.inject();
    }

    if (
      window.NovaAudioTheme &&
      typeof window.NovaAudioTheme.init === 'function'
    ) {
      window.NovaAudioTheme.init();
    }

    if (
      window.NovaMenu &&
      typeof window.NovaMenu.repair === 'function'
    ) {
      window.NovaMenu.repair();
    }

    if (
      window.NovaOrbExtras &&
      typeof window.NovaOrbExtras.scan === 'function'
    ) {
      window.NovaOrbExtras.scan();
    }

    if (
      window.NovaWindowManager &&
      typeof window.NovaWindowManager.scan === 'function'
    ) {
      window.NovaWindowManager.scan();
    }

    if (
      window.NovaModuleLoader &&
      typeof window.NovaModuleLoader.loadMatching === 'function'
    ) {
      window.NovaModuleLoader.loadMatching();
    }
  }

  async function checkForUpdates(options = {}) {
    const force = options.force === true;
    const lastCheck =
      Number(storageGet(LAST_CHECK_KEY, 0)) || 0;

    if (
      !force &&
      Date.now() - lastCheck < UPDATE_CHECK_MS
    ) {
      return null;
    }

    try {
      const current = storageGet(
        ACTIVE_MANIFEST_KEY,
        state.manifest
      );

      const remote = await downloadManifest();
      storageSet(LAST_CHECK_KEY, Date.now());

      if (
        current &&
        fingerprint(remote) === fingerprint(current)
      ) {
        return null;
      }

      await stageManifest(remote);

      if (current) {
        storageSet(PREVIOUS_MANIFEST_KEY, current);
      }

      storageSet(ACTIVE_MANIFEST_KEY, remote);
      state.updateReady = true;

      emitNovaEvent('nova-update-ready', {
        currentVersion: current?.version,
        nextVersion: remote.version,
        updatedAt: remote.updatedAt || null
      });

      log(
        'Nova update',
        remote.version,
        'downloaded. It activates on next refresh.'
      );

      return remote;
    } catch (error) {
      warn('Background update check failed:', error);
      return null;
    }
  }

  function scheduleUpdateChecks() {
    setTimeout(
      () => checkForUpdates().catch(() => {}),
      1800
    );

    setInterval(
      () => checkForUpdates().catch(() => {}),
      UPDATE_CHECK_MS
    );

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkForUpdates().catch(() => {});
      }
    });
  }

  function showFatal(error) {
    state.phase = 'failed';
    state.lastError = String(error?.message || error);
    console.error('[Nova Bootstrap] Fatal load failure', error);
    releasePrepaintGate('fatal-error');

    updateHud(
      'Nova Bootstrap failed',
      state.lastError,
      100,
      'error',
      true
    );
  }

  window.NovaBootstrap = {
    version: VERSION,
    manifestUrl: MANIFEST_URL,
    state,
    fetchComponent,
    executeCode,
    clearComponentCache,
    clearAllCaches,
    checkForUpdates,
    releasePrepaintGate,
    getManifest: () =>
      state.manifest ||
      storageGet(ACTIVE_MANIFEST_KEY, null),
    getStatus: () =>
      JSON.parse(JSON.stringify(state))
  };

  startPrimeCaptureFromCache();

  const manifestPromise = resolveManifestForBoot();

  async function startNova() {
    try {
      if (!state.fastBoot) {
        updateHud(
          'Nova Bootstrap started',
          'Preparing the first cached Nova installation…',
          3
        );
      }

      state.phase = 'manifest';
      const manifest = await manifestPromise;
      state.manifest = manifest;
      createNovaShell(manifest);

      state.phase = 'core';
      await loadCore(manifest);
      bindAliases();

      state.phase = 'services';
      updateHud(
        'Starting Nova services',
        'Theme, menu, modules, and Watch…',
        93
      );
      startServices();

      state.phase = 'ready';
      scheduleUpdateChecks();

      if (!state.fastBoot) {
        updateHud(
          'Nova Core ready',
          `${state.loadedCore.length} Core components · ${(manifest.modules || []).length} modules`,
          100,
          'ready'
        );
        hideHudSoon();
      }

      if (!criticalSite) releasePrepaintGate('not-required');
    } catch (error) {
      showFatal(error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      startNova,
      { once: true }
    );
  } else {
    startNova();
  }
})();
