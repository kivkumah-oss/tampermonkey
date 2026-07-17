// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      2.1.0
// @description  Install once. Nova Core, modules, updates, cache, and recovery are managed automatically from GitHub.
// @author       Martins + Nova
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__NOVA_BOOTSTRAP_RUNNING__) return;
  window.__NOVA_BOOTSTRAP_RUNNING__ = true;

  const BOOTSTRAP_VERSION = '2.1.0';
  const MANIFEST_URL =
    'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/nova.manifest.json';
  const TRUSTED_PREFIX =
    'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/';
  const STORAGE_PREFIX = 'nova.bootstrap.v2.';
  const ACTIVE_MANIFEST_KEY = STORAGE_PREFIX + 'manifest.active';
  const PREVIOUS_MANIFEST_KEY = STORAGE_PREFIX + 'manifest.previous';
  const CACHE_INDEX_KEY = STORAGE_PREFIX + 'cache.index';
  const LAST_CHECK_KEY = STORAGE_PREFIX + 'lastCheckAt';
  const UPDATE_CHECK_MS = 15 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 70;
  const STAGE_CONCURRENCY = 4;
  const HUD_ID = 'nova-bootstrap-status';

  const bootState = {
    phase: 'starting',
    online: false,
    manifest: null,
    manifestSource: 'none',
    loadedCore: [],
    failedCore: [],
    updateReady: false,
    lastError: null,
    startedAt: new Date().toISOString()
  };

  function log(...args) {
    console.log('[Nova Bootstrap]', ...args);
  }

  function warn(...args) {
    console.warn('[Nova Bootstrap]', ...args);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function mountHud() {
    let hud = document.getElementById(HUD_ID);
    if (hud) return hud;

    hud = document.createElement('div');
    hud.id = HUD_ID;
    hud.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:14px',
      'z-index:2147483647',
      'width:min(360px,calc(100vw - 28px))',
      'padding:11px 12px',
      'box-sizing:border-box',
      'border:1px solid rgba(34,211,238,.62)',
      'border-radius:14px',
      'background:rgba(7,9,18,.96)',
      'color:#fff',
      'box-shadow:0 0 24px rgba(34,211,238,.28),0 14px 45px rgba(0,0,0,.48)',
      'font:12px/1.4 Arial,sans-serif',
      'pointer-events:auto'
    ].join(';');

    const parent = document.body || document.documentElement;
    parent.appendChild(hud);
    return hud;
  }

  function updateHud(title, detail, progress, mode = 'loading') {
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

    hud.style.boxShadow =
      mode === 'error'
        ? '0 0 26px rgba(255,0,0,.34),0 14px 45px rgba(0,0,0,.48)'
        : mode === 'ready'
          ? '0 0 25px rgba(70,255,100,.28),0 14px 45px rgba(0,0,0,.48)'
          : '0 0 24px rgba(34,211,238,.28),0 14px 45px rgba(0,0,0,.48)';

    hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <b style="color:${colour};letter-spacing:.04em;">${escapeHtml(title)}</b>
        <span style="color:#9ca3af;font-size:10px;">v${BOOTSTRAP_VERSION}</span>
      </div>
      <div style="margin-top:5px;color:#d1d5db;">${escapeHtml(detail)}</div>
      <div style="height:5px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7c4dff,#22d3ee,#39ff14,#ff8a1f,#ff2bd6);transition:width .18s ease;"></div>
      </div>
    `;

    return hud;
  }

  function hideHudSoon(delay = 1300) {
    window.setTimeout(() => {
      const hud = document.getElementById(HUD_ID);
      if (hud) {
        hud.style.transition = 'opacity .35s ease,transform .35s ease';
        hud.style.opacity = '0';
        hud.style.transform = 'translateY(8px)';
        window.setTimeout(() => hud.remove(), 420);
      }
    }, delay);
  }

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

  function safeId(value) {
    return String(value || 'unknown').replace(/[^a-z0-9._-]+/gi, '_');
  }

  function trustedUrl(url) {
    return typeof url === 'string' && url.startsWith(TRUSTED_PREFIX);
  }

  function addQuery(url, key, value) {
    const joiner = url.includes('?') ? '&' : '?';
    return url + joiner + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }

  function requestText(url, timeout = 15000) {
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
            bootState.online = true;
            resolve(String(response.responseText || ''));
            return;
          }

          reject(new Error('HTTP ' + response.status + ' for ' + url));
        },
        onerror() {
          reject(new Error('Network error for ' + url));
        },
        ontimeout() {
          reject(new Error('Timed out loading ' + url));
        }
      });
    });
  }

  function manifestFingerprint(manifest) {
    const core = Array.isArray(manifest && manifest.core) ? manifest.core : [];
    const modules = Array.isArray(manifest && manifest.modules) ? manifest.modules : [];

    return JSON.stringify({
      version: manifest && manifest.version,
      core: core.map((item) => [
        item.id,
        item.version,
        item.url,
        item.enabled !== false,
        Number(item.order) || 0
      ]),
      modules: modules.map((item) => [
        item.id,
        item.version,
        item.url,
        item.enabled !== false,
        item.autoload === true
      ])
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

  function componentCacheKey(component, kind = 'component') {
    return [
      STORAGE_PREFIX,
      'code.',
      safeId(kind),
      '.',
      safeId(component.id),
      '.',
      safeId(component.version || 'latest')
    ].join('');
  }

  function readCacheIndex() {
    const index = storageGet(CACHE_INDEX_KEY, []);
    return Array.isArray(index) ? index : [];
  }

  function writeCacheIndex(index) {
    storageSet(CACHE_INDEX_KEY, index.slice(0, MAX_CACHE_ENTRIES));
  }

  function touchCache(key) {
    const index = readCacheIndex()
      .filter((entry) => entry && entry.key && entry.key !== key);

    index.unshift({ key, touchedAt: Date.now() });

    while (index.length > MAX_CACHE_ENTRIES) {
      const removed = index.pop();
      if (removed && removed.key) storageDelete(removed.key);
    }

    writeCacheIndex(index);
  }

  function readComponentCache(component, kind) {
    const key = componentCacheKey(component, kind);
    const cached = storageGet(key, null);

    if (!cached || typeof cached.code !== 'string' || !cached.code.trim()) {
      return null;
    }

    touchCache(key);
    return cached;
  }

  function writeComponentCache(component, kind, code) {
    const key = componentCacheKey(component, kind);
    const entry = {
      id: component.id,
      version: component.version || 'latest',
      url: component.url,
      kind,
      code,
      savedAt: new Date().toISOString()
    };

    storageSet(key, entry);
    touchCache(key);
    return entry;
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
      component.version ||
        (bootState.manifest && bootState.manifest.version) ||
        'latest'
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
    const kinds = kind ? [kind] : ['core', 'module', 'component'];
    const index = readCacheIndex();
    const targets = new Set();

    for (const entry of index) {
      if (!entry || !entry.key) continue;

      for (const itemKind of kinds) {
        const prefix = [
          STORAGE_PREFIX,
          'code.',
          safeId(itemKind),
          '.',
          safeId(component && component.id),
          '.'
        ].join('');

        if (entry.key.startsWith(prefix)) targets.add(entry.key);
      }
    }

    targets.forEach(storageDelete);
    writeCacheIndex(
      index.filter((entry) => !entry || !targets.has(entry.key))
    );
    return targets.size;
  }

  async function clearAllCaches() {
    const index = readCacheIndex();

    index.forEach((entry) => {
      if (entry && entry.key) storageDelete(entry.key);
    });

    storageDelete(CACHE_INDEX_KEY);
    storageDelete(ACTIVE_MANIFEST_KEY);
    storageDelete(PREVIOUS_MANIFEST_KEY);
    storageDelete(LAST_CHECK_KEY);
    return true;
  }

  async function downloadManifest() {
    updateHud(
      'Nova is waking up',
      'Checking the GitHub manifest…',
      8
    );

    const url = addQuery(MANIFEST_URL, 'ts', Date.now());
    const text = await requestText(url, 15000);
    return validateManifest(JSON.parse(text));
  }

  async function stageManifest(manifest) {
    const core = manifest.core
      .filter((item) => item && item.enabled !== false)
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    let cursor = 0;
    let completed = 0;
    const failures = [];

    async function worker() {
      while (cursor < core.length) {
        const index = cursor;
        cursor += 1;
        const component = core[index];

        updateHud(
          'Preparing Nova Core',
          'Downloading ' + component.name + '…',
          10 + Math.round((completed / Math.max(1, core.length)) * 38)
        );

        try {
          await fetchComponent(component, {
            kind: 'core',
            preferCache: true
          });
        } catch (error) {
          failures.push({ component, error });

          if (component.required !== false) {
            throw new Error(
              'Could not download required Core component ' +
              component.id +
              ': ' +
              (error && error.message ? error.message : String(error))
            );
          }

          warn('Optional core failed to stage:', component.id, error);
        } finally {
          completed += 1;
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(STAGE_CONCURRENCY, core.length) },
      () => worker()
    );

    await Promise.all(workers);
    return { manifest, failures };
  }

  async function resolveManifest() {
    const cached = storageGet(ACTIVE_MANIFEST_KEY, null);

    try {
      const remote = await downloadManifest();
      storageSet(LAST_CHECK_KEY, Date.now());

      const changed =
        !cached ||
        manifestFingerprint(remote) !== manifestFingerprint(cached);

      if (changed) {
        log('New Nova release found:', remote.version);
        await stageManifest(remote);

        if (cached) storageSet(PREVIOUS_MANIFEST_KEY, cached);
        storageSet(ACTIVE_MANIFEST_KEY, remote);
      } else {
        storageSet(ACTIVE_MANIFEST_KEY, remote);
      }

      bootState.manifestSource =
        changed ? 'github-update' : 'github';
      return remote;
    } catch (error) {
      warn('Manifest update check failed:', error);

      if (cached) {
        bootState.manifestSource = 'cache';
        updateHud(
          'Nova offline mode',
          'GitHub was unavailable. Loading the last working Core…',
          18,
          'offline'
        );
        return validateManifest(cached);
      }

      const previous = storageGet(PREVIOUS_MANIFEST_KEY, null);

      if (previous) {
        bootState.manifestSource = 'previous-cache';
        updateHud(
          'Nova recovery mode',
          'Loading the previous working release…',
          18,
          'offline'
        );
        return validateManifest(previous);
      }

      throw error;
    }
  }

  function executeCode(component, code) {
    const sourceName = safeId(component.id || 'nova-core') + '.js';
    const runner = new Function(
      code + '\n//# sourceURL=nova://core/' + sourceName
    );
    runner();
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

    window.Nova.version = manifest.version;
    window.Nova.bootstrapVersion = BOOTSTRAP_VERSION;
    window.Nova.build =
      manifest.build || 'manifest-' + manifest.version;
    window.Nova.loadedAt = new Date().toISOString();
    window.Nova.manifestUrl = MANIFEST_URL;
    window.Nova.registryUrl = MANIFEST_URL;
    window.Nova.manifest = manifest;
    window.Nova.registry = {
      version: manifest.version,
      updatedAt: manifest.updatedAt || null,
      modules: registry
    };
    window.Nova.modulesRegistry = registry;
    window.Nova.core = window.Nova.core || {};

    window.Nova.loadRegistry = async function loadRegistry() {
      const fresh = await checkForUpdates({ force: true });
      return fresh || window.Nova.registry;
    };

    window.Nova.getModules = function getModules() {
      return window.Nova.modulesRegistry.slice();
    };

    window.Nova.getEnabledModules =
      function getEnabledModules() {
        return window.Nova.modulesRegistry.filter(
          (module) => module && module.enabled !== false
        );
      };
  }

  async function loadCore(manifest) {
    const core = manifest.core
      .filter((item) => item && item.enabled !== false)
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];

      updateHud(
        'Starting Nova Core',
        'Loading ' + component.name +
          ' (' + (index + 1) + '/' + core.length + ')…',
        50 + Math.round(((index + 1) / Math.max(1, core.length)) * 43)
      );

      try {
        const code = await fetchComponent(component, {
          kind: 'core',
          preferCache: true
        });

        executeCode(component, code);
        bootState.loadedCore.push(component.id);

        if (component.api) {
          window.Nova.core[component.id] =
            window[component.api] || null;
        }

        log(
          'Loaded',
          component.id,
          component.version || 'latest'
        );
      } catch (error) {
        bootState.failedCore.push({
          id: component.id,
          error: String(error)
        });

        if (component.required === false) {
          warn('Optional core failed:', component.id, error);
          continue;
        }

        throw new Error(
          'Required Core failed: ' +
          component.id +
          ' — ' +
          (error && error.message ? error.message : String(error))
        );
      }
    }
  }

  function bindFriendlyCoreAliases() {
    window.Nova.core.theme = window.NovaTheme || null;
    window.Nova.core.audioTheme = window.NovaAudioTheme || null;
    window.Nova.core.session = window.NovaSession || null;
    window.Nova.core.memory = window.NovaMemory || null;
    window.Nova.core.memoryAutoLearn =
      window.NovaMemoryAutoLearn || null;
    window.Nova.core.brain = window.NovaBrain || null;
    window.Nova.core.traceNetwork =
      window.NovaTraceNetwork || null;
    window.Nova.core.apiCatcher =
      window.NovaApiCatcher ||
      window.NovaTraceNetwork ||
      null;
    window.Nova.core.apiBodyCatcher =
      window.NovaApiBodyCatcher || null;
    window.Nova.core.domInspector =
      window.NovaDOMInspector || null;
    window.Nova.core.investigationExport =
      window.NovaInvestigationExport || null;
    window.Nova.core.menu = window.NovaMenu || null;
    window.Nova.core.orbExtras =
      window.NovaOrbExtras || null;
    window.Nova.core.memoryPanel =
      window.NovaMemoryPanel || null;
    window.Nova.core.windowManager =
      window.NovaWindowManager || null;
    window.Nova.core.moduleLoader =
      window.NovaModuleLoader || null;

    window.Nova.theme = window.NovaTheme || null;
    window.Nova.audioTheme = window.NovaAudioTheme || null;
  }

  function startNovaServices() {
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

    if (
      window.NovaSession &&
      window.NovaSession.isActive()
    ) {
      window.NovaSession.addEvent({
        module: 'bootstrap',
        type: 'load',
        summary: 'Nova Bootstrap loaded',
        data: {
          bootstrapVersion: BOOTSTRAP_VERSION,
          manifestVersion: bootState.manifest.version,
          manifestSource: bootState.manifestSource,
          pageUrl: location.href,
          loadedCore: bootState.loadedCore.slice()
        }
      });
    }
  }

  async function checkForUpdates(options = {}) {
    const force = options.force === true;
    const lastCheck =
      Number(storageGet(LAST_CHECK_KEY, 0)) || 0;

    if (!force && Date.now() - lastCheck < UPDATE_CHECK_MS) {
      return null;
    }

    try {
      const current =
        storageGet(ACTIVE_MANIFEST_KEY, bootState.manifest);
      const remote = await downloadManifest();
      storageSet(LAST_CHECK_KEY, Date.now());

      if (
        current &&
        manifestFingerprint(remote) ===
          manifestFingerprint(current)
      ) {
        return null;
      }

      await stageManifest(remote);

      if (current) {
        storageSet(PREVIOUS_MANIFEST_KEY, current);
      }

      storageSet(ACTIVE_MANIFEST_KEY, remote);
      bootState.updateReady = true;

      window.dispatchEvent(
        new CustomEvent('nova-update-ready', {
          detail: {
            currentVersion: current && current.version,
            nextVersion: remote.version,
            updatedAt: remote.updatedAt || null
          }
        })
      );

      log(
        'Nova update',
        remote.version,
        'downloaded. It will activate on the next page refresh.'
      );

      return remote;
    } catch (error) {
      warn('Background update check failed:', error);
      return null;
    }
  }

  function scheduleUpdateChecks() {
    window.setInterval(() => {
      checkForUpdates().catch(() => {});
    }, UPDATE_CHECK_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkForUpdates().catch(() => {});
      }
    });
  }

  function showFatal(error) {
    bootState.phase = 'failed';
    bootState.lastError = String(error);
    console.error('[Nova Bootstrap] Fatal load failure', error);

    const detail =
      error && error.message ? error.message : String(error);

    updateHud(
      'Nova Bootstrap failed',
      detail,
      100,
      'error'
    );

    const hud = mountHud();
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry Nova';
    retry.style.cssText = [
      'margin-top:9px',
      'width:100%',
      'padding:8px',
      'border:1px solid rgba(255,120,120,.62)',
      'border-radius:9px',
      'background:rgba(120,10,20,.72)',
      'color:#fff',
      'font-weight:800',
      'cursor:pointer'
    ].join(';');
    retry.addEventListener('click', () => location.reload());
    hud.appendChild(retry);
  }

  window.NovaBootstrap = {
    version: BOOTSTRAP_VERSION,
    manifestUrl: MANIFEST_URL,
    state: bootState,
    fetchComponent,
    clearComponentCache,
    clearAllCaches,
    checkForUpdates,

    getManifest() {
      return (
        bootState.manifest ||
        storageGet(ACTIVE_MANIFEST_KEY, null)
      );
    },

    getStatus() {
      return JSON.parse(JSON.stringify(bootState));
    }
  };

  updateHud(
    'Nova Bootstrap started',
    'Preparing the automatic loader…',
    3
  );

  (async () => {
    try {
      bootState.phase = 'manifest';
      const manifest = await resolveManifest();
      bootState.manifest = manifest;

      createNovaShell(manifest);

      bootState.phase = 'core';
      await loadCore(manifest);

      bindFriendlyCoreAliases();

      bootState.phase = 'services';
      updateHud(
        'Nova is almost ready',
        'Starting services and modules…',
        96
      );
      startNovaServices();

      bootState.phase = 'ready';
      scheduleUpdateChecks();

      updateHud(
        'Nova Core ready',
        bootState.loadedCore.length +
          ' Core components loaded from ' +
          bootState.manifestSource + '.',
        100,
        'ready'
      );
      hideHudSoon();

      console.group('[Nova Core] Ready');
      console.log('Bootstrap:', BOOTSTRAP_VERSION);
      console.log('Manifest:', manifest.version);
      console.log('Source:', bootState.manifestSource);
      console.log('Core loaded:', bootState.loadedCore.length);
      console.log(
        'Modules registered:',
        (manifest.modules || []).length
      );
      console.groupEnd();

      window.dispatchEvent(
        new CustomEvent('nova-ready', {
          detail: {
            bootstrapVersion: BOOTSTRAP_VERSION,
            manifestVersion: manifest.version,
            source: bootState.manifestSource,
            loadedCore: bootState.loadedCore.slice()
          }
        })
      );
    } catch (error) {
      showFatal(error);
    }
  })();
})();
