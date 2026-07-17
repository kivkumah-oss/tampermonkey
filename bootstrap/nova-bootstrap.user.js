// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      2.2.0
// @description  Install once. Nova Core, modules, updates, cache, and recovery are managed automatically from GitHub.
// @author       Martins + Nova
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      raw.githubusercontent.com
// @sandbox      JavaScript
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__NOVA_BOOTSTRAP_RUNNING__) return;
  window.__NOVA_BOOTSTRAP_RUNNING__ = true;

  const VERSION = '2.2.0';
  const MANIFEST_URL = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/nova.manifest.json';
  const TRUSTED_PREFIX = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/';
  const PREFIX = 'nova.bootstrap.v2.';
  const ACTIVE_MANIFEST_KEY = PREFIX + 'manifest.active';
  const PREVIOUS_MANIFEST_KEY = PREFIX + 'manifest.previous';
  const CACHE_INDEX_KEY = PREFIX + 'cache.index';
  const LAST_CHECK_KEY = PREFIX + 'lastCheckAt';
  const HUD_ID = 'nova-bootstrap-status';
  const UPDATE_CHECK_MS = 15 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 80;

  const state = {
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
      'width:min(370px,calc(100vw - 28px))',
      'padding:11px 12px',
      'box-sizing:border-box',
      'border:1px solid rgba(34,211,238,.62)',
      'border-radius:14px',
      'background:rgba(7,9,18,.97)',
      'color:#fff',
      'box-shadow:0 0 24px rgba(34,211,238,.28),0 14px 45px rgba(0,0,0,.48)',
      'font:12px/1.4 Arial,sans-serif',
      'pointer-events:auto'
    ].join(';');

    (document.body || document.documentElement).appendChild(hud);
    return hud;
  }

  function updateHud(title, detail, progress, mode = 'loading', retry = false) {
    const hud = mountHud();
    const pct = Math.max(0, Math.min(100, Number(progress) || 0));
    const colour = mode === 'error' ? '#ff7070' : mode === 'ready' ? '#79ff91' : mode === 'offline' ? '#ffd166' : '#67e8f9';

    hud.style.borderColor = mode === 'error'
      ? 'rgba(255,70,70,.78)'
      : mode === 'ready'
        ? 'rgba(80,255,112,.66)'
        : mode === 'offline'
          ? 'rgba(255,193,60,.66)'
          : 'rgba(34,211,238,.62)';

    hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <b style="color:${colour};letter-spacing:.04em;">${escapeHtml(title)}</b>
        <span style="color:#9ca3af;font-size:10px;">v${VERSION}</span>
      </div>
      <div style="margin-top:5px;color:#d1d5db;word-break:break-word;">${escapeHtml(detail)}</div>
      <div style="height:5px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7c4dff,#22d3ee,#39ff14,#ff8a1f,#ff2bd6);transition:width .18s ease;"></div>
      </div>
      ${retry ? '<button id="nova-bootstrap-retry" style="width:100%;margin-top:9px;padding:8px;border:1px solid rgba(255,95,95,.72);border-radius:10px;background:rgba(125,10,24,.82);color:#fff;font-weight:800;cursor:pointer;">Retry Nova</button>' : ''}
    `;

    const button = hud.querySelector('#nova-bootstrap-retry');
    if (button) button.onclick = () => location.reload();
    return hud;
  }

  function hideHudSoon(delay = 1400) {
    setTimeout(() => {
      const hud = document.getElementById(HUD_ID);
      if (!hud) return;
      hud.style.transition = 'opacity .35s ease,transform .35s ease';
      hud.style.opacity = '0';
      hud.style.transform = 'translateY(8px)';
      setTimeout(() => hud.remove(), 420);
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

  function validateComponent(component, kind) {
    if (!component || typeof component !== 'object') throw new Error('Invalid ' + kind + ' component');
    if (!component.id || !component.url) throw new Error('Missing id/url in ' + kind + ' component');
    if (!trustedUrl(component.url)) throw new Error('Untrusted component URL: ' + component.url);
    return component;
  }

  function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') throw new Error('Manifest is not an object');
    if (!manifest.version) throw new Error('Manifest version is missing');
    if (!Array.isArray(manifest.core) || !manifest.core.length) throw new Error('Manifest core list is empty');
    manifest.core.forEach((item) => validateComponent(item, 'core'));
    (manifest.modules || []).forEach((item) => validateComponent(item, 'module'));
    return manifest;
  }

  function fingerprint(manifest) {
    return JSON.stringify({
      version: manifest && manifest.version,
      core: (manifest && manifest.core || []).map((item) => [item.id, item.version, item.url, item.enabled !== false, Number(item.order) || 0]),
      modules: (manifest && manifest.modules || []).map((item) => [item.id, item.version, item.url, item.enabled !== false, item.autoload === true])
    });
  }

  function cacheKey(component, kind) {
    return PREFIX + 'code.' + safeId(kind) + '.' + safeId(component.id) + '.' + safeId(component.version || 'latest');
  }

  function readCacheIndex() {
    const index = storageGet(CACHE_INDEX_KEY, []);
    return Array.isArray(index) ? index : [];
  }

  function touchCache(key) {
    const index = readCacheIndex().filter((entry) => entry && entry.key !== key);
    index.unshift({ key, touchedAt: Date.now() });

    while (index.length > MAX_CACHE_ENTRIES) {
      const removed = index.pop();
      if (removed && removed.key) storageDelete(removed.key);
    }

    storageSet(CACHE_INDEX_KEY, index);
  }

  function readComponentCache(component, kind) {
    const key = cacheKey(component, kind);
    const cached = storageGet(key, null);
    if (!cached || typeof cached.code !== 'string' || !cached.code.trim()) return null;
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

    const versioned = addQuery(component.url, 'v', component.version || 'latest');
    const url = force ? addQuery(versioned, 'ts', Date.now()) : versioned;

    try {
      const code = await requestText(url, Number(options.timeout) || 20000);
      if (!code.trim()) throw new Error('Empty source for ' + component.id);
      writeComponentCache(component, kind, code);
      return code;
    } catch (error) {
      const cached = readComponentCache(component, kind);
      if (cached) {
        warn('Using cached', kind, component.id, 'after download failure:', error);
        return cached.code;
      }
      throw error;
    }
  }

  async function clearComponentCache(component, kind) {
    const id = safeId(component && component.id);
    const kinds = kind ? [kind] : ['core', 'module', 'component'];
    const index = readCacheIndex();
    const targets = new Set();

    for (const entry of index) {
      if (!entry || !entry.key) continue;
      if (kinds.some((itemKind) => entry.key.startsWith(PREFIX + 'code.' + safeId(itemKind) + '.' + id + '.'))) {
        targets.add(entry.key);
      }
    }

    targets.forEach(storageDelete);
    storageSet(CACHE_INDEX_KEY, index.filter((entry) => !entry || !targets.has(entry.key)));
    return targets.size;
  }

  async function clearAllCaches() {
    readCacheIndex().forEach((entry) => {
      if (entry && entry.key) storageDelete(entry.key);
    });
    storageDelete(CACHE_INDEX_KEY);
    storageDelete(ACTIVE_MANIFEST_KEY);
    storageDelete(PREVIOUS_MANIFEST_KEY);
    storageDelete(LAST_CHECK_KEY);
    return true;
  }

  async function downloadManifest() {
    const text = await requestText(addQuery(MANIFEST_URL, 'ts', Date.now()), 15000);
    return validateManifest(JSON.parse(text));
  }

  async function stageManifest(manifest) {
    const core = manifest.core
      .filter((item) => item && item.enabled !== false)
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];
      updateHud('Preparing Nova update', `${index + 1}/${core.length} · ${component.name || component.id}`, 8 + ((index + 1) / core.length) * 45);
      try {
        await fetchComponent(component, { kind: 'core', preferCache: true });
      } catch (error) {
        if (component.required === false) {
          warn('Optional Core failed to stage:', component.id, error);
          continue;
        }
        throw new Error('Could not stage required Core ' + component.id + ': ' + (error.message || error));
      }
    }

    return manifest;
  }

  async function resolveManifest() {
    const cached = storageGet(ACTIVE_MANIFEST_KEY, null);

    try {
      const remote = await downloadManifest();
      storageSet(LAST_CHECK_KEY, Date.now());
      const changed = !cached || fingerprint(remote) !== fingerprint(cached);

      if (changed) {
        log('New Nova release found:', remote.version);
        await stageManifest(remote);
        if (cached) storageSet(PREVIOUS_MANIFEST_KEY, cached);
        storageSet(ACTIVE_MANIFEST_KEY, remote);
      } else {
        storageSet(ACTIVE_MANIFEST_KEY, remote);
      }

      state.manifestSource = changed ? 'github-update' : 'github';
      return remote;
    } catch (error) {
      warn('Manifest update check failed:', error);
      if (cached) {
        state.manifestSource = 'cache';
        return validateManifest(cached);
      }
      const previous = storageGet(PREVIOUS_MANIFEST_KEY, null);
      if (previous) {
        state.manifestSource = 'previous-cache';
        return validateManifest(previous);
      }
      throw error;
    }
  }

  function executeCode(component, code, kind = 'core') {
    const sourceName = safeId(component.id || 'nova-component') + '.js';
    try {
      const runner = new Function(code + '\n//# sourceURL=nova://' + kind + '/' + sourceName);
      runner.call(window);
    } catch (error) {
      const message = String(error && error.message || error);
      if (/Content Security Policy|blocked by CSP|unsafe-eval/i.test(message)) {
        throw new Error(component.id + ' execution blocked by CSP. Bootstrap must include @sandbox JavaScript.');
      }
      throw error;
    }
  }

  function createNovaShell(manifest) {
    window.Nova = window.Nova || {};
    const registry = [
      ...manifest.core.map((item) => ({ ...item, core: true })),
      ...(manifest.modules || []).map((item) => ({ ...item, core: false }))
    ];

    window.Nova.version = manifest.version;
    window.Nova.bootstrapVersion = VERSION;
    window.Nova.build = manifest.build || 'manifest-' + manifest.version;
    window.Nova.loadedAt = new Date().toISOString();
    window.Nova.manifestUrl = MANIFEST_URL;
    window.Nova.registryUrl = MANIFEST_URL;
    window.Nova.manifest = manifest;
    window.Nova.registry = { version: manifest.version, updatedAt: manifest.updatedAt || null, modules: registry };
    window.Nova.modulesRegistry = registry;
    window.Nova.core = window.Nova.core || {};
    window.Nova.getModules = () => window.Nova.modulesRegistry.slice();
    window.Nova.getEnabledModules = () => window.Nova.modulesRegistry.filter((item) => item && item.enabled !== false);
    window.Nova.loadRegistry = async () => checkForUpdates({ force: true });
  }

  async function loadCore(manifest) {
    const core = manifest.core
      .filter((item) => item && item.enabled !== false)
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];
      updateHud('Loading Nova Core', `${index + 1}/${core.length} · ${component.name || component.id}`, 18 + ((index + 1) / core.length) * 68);

      try {
        const code = await fetchComponent(component, { kind: 'core', preferCache: true });
        executeCode(component, code, 'core');
        state.loadedCore.push(component.id);
        if (component.api) window.Nova.core[component.id] = window[component.api] || null;
        log('Loaded', component.id, component.version || 'latest');
      } catch (error) {
        state.failedCore.push({ id: component.id, error: String(error) });
        if (component.required === false) {
          warn('Optional Core failed:', component.id, error);
          continue;
        }
        throw new Error('Required Core failed: ' + component.id + ' — ' + (error.message || error));
      }
    }
  }

  function bindAliases() {
    window.Nova.core.theme = window.NovaTheme || null;
    window.Nova.core.audioTheme = window.NovaAudioTheme || null;
    window.Nova.core.session = window.NovaSession || null;
    window.Nova.core.memory = window.NovaMemory || null;
    window.Nova.core.memoryAutoLearn = window.NovaMemoryAutoLearn || null;
    window.Nova.core.brain = window.NovaBrain || null;
    window.Nova.core.traceNetwork = window.NovaTraceNetwork || null;
    window.Nova.core.apiCatcher = window.NovaApiCatcher || window.NovaTraceNetwork || null;
    window.Nova.core.apiBodyCatcher = window.NovaApiBodyCatcher || null;
    window.Nova.core.domInspector = window.NovaDOMInspector || null;
    window.Nova.core.investigationExport = window.NovaInvestigationExport || null;
    window.Nova.core.menu = window.NovaMenu || null;
    window.Nova.core.orbExtras = window.NovaOrbExtras || null;
    window.Nova.core.memoryPanel = window.NovaMemoryPanel || null;
    window.Nova.core.windowManager = window.NovaWindowManager || null;
    window.Nova.core.moduleLoader = window.NovaModuleLoader || null;
    window.Nova.theme = window.NovaTheme || null;
    window.Nova.audioTheme = window.NovaAudioTheme || null;
  }

  function startServices() {
    if (window.NovaTheme && typeof window.NovaTheme.inject === 'function') window.NovaTheme.inject();
    if (window.NovaAudioTheme && typeof window.NovaAudioTheme.init === 'function') window.NovaAudioTheme.init();
    if (window.NovaMenu && typeof window.NovaMenu.repair === 'function') window.NovaMenu.repair();
    if (window.NovaOrbExtras && typeof window.NovaOrbExtras.scan === 'function') window.NovaOrbExtras.scan();
    if (window.NovaWindowManager && typeof window.NovaWindowManager.scan === 'function') window.NovaWindowManager.scan();
    if (window.NovaModuleLoader && typeof window.NovaModuleLoader.loadMatching === 'function') {
      window.NovaModuleLoader.loadMatching();
    }
  }

  async function checkForUpdates(options = {}) {
    const force = options.force === true;
    const lastCheck = Number(storageGet(LAST_CHECK_KEY, 0)) || 0;
    if (!force && Date.now() - lastCheck < UPDATE_CHECK_MS) return null;

    try {
      const current = storageGet(ACTIVE_MANIFEST_KEY, state.manifest);
      const remote = await downloadManifest();
      storageSet(LAST_CHECK_KEY, Date.now());
      if (current && fingerprint(remote) === fingerprint(current)) return null;

      await stageManifest(remote);
      if (current) storageSet(PREVIOUS_MANIFEST_KEY, current);
      storageSet(ACTIVE_MANIFEST_KEY, remote);
      state.updateReady = true;
      window.dispatchEvent(new CustomEvent('nova-update-ready', {
        detail: { currentVersion: current && current.version, nextVersion: remote.version, updatedAt: remote.updatedAt || null }
      }));
      log('Nova update', remote.version, 'downloaded. It activates on next refresh.');
      return remote;
    } catch (error) {
      warn('Background update check failed:', error);
      return null;
    }
  }

  function scheduleUpdateChecks() {
    setInterval(() => checkForUpdates().catch(() => {}), UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForUpdates().catch(() => {});
    });
  }

  function showFatal(error) {
    state.phase = 'failed';
    state.lastError = String(error && error.message || error);
    console.error('[Nova Bootstrap] Fatal load failure', error);
    updateHud('Nova Bootstrap failed', state.lastError, 100, 'error', true);
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
    getManifest: () => state.manifest || storageGet(ACTIVE_MANIFEST_KEY, null),
    getStatus: () => JSON.parse(JSON.stringify(state))
  };

  (async () => {
    try {
      updateHud('Nova Bootstrap started', 'Using Firefox CSP-safe userscript sandbox…', 3);
      state.phase = 'manifest';
      const manifest = await resolveManifest();
      state.manifest = manifest;
      createNovaShell(manifest);

      state.phase = 'core';
      await loadCore(manifest);
      bindAliases();

      state.phase = 'services';
      updateHud('Starting Nova services', 'Theme, menu, modules, and Watch…', 93);
      startServices();

      state.phase = 'ready';
      scheduleUpdateChecks();
      updateHud('Nova Core ready', `${state.loadedCore.length} Core components · ${(manifest.modules || []).length} modules`, 100, 'ready');
      hideHudSoon();

      console.group('[Nova Core] Ready');
      console.log('Bootstrap:', VERSION);
      console.log('Manifest:', manifest.version);
      console.log('Source:', state.manifestSource);
      console.log('Core loaded:', state.loadedCore.length);
      console.log('Modules registered:', (manifest.modules || []).length);
      console.groupEnd();

      window.dispatchEvent(new CustomEvent('nova-ready', {
        detail: {
          bootstrapVersion: VERSION,
          manifestVersion: manifest.version,
          source: state.manifestSource,
          loadedCore: state.loadedCore.slice()
        }
      }));
    } catch (error) {
      showFatal(error);
    }
  })();
})();
