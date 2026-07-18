// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      2.2.5
// @description  Install once. Nova Core, modules, updates, cache, and recovery are managed automatically from GitHub.
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

  const VERSION = '2.2.5';
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
    phase: 'starting', online: false, manifest: null, manifestSource: 'none',
    loadedCore: [], failedCore: [], updateReady: false, lastError: null,
    startedAt: new Date().toISOString()
  };

  const log = (...args) => console.log('[Nova Bootstrap]', ...args);
  const warn = (...args) => console.warn('[Nova Bootstrap]', ...args);

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
    const hud = mountHud();
    const pct = Math.max(0, Math.min(100, Number(progress) || 0));
    const colour = mode === 'error' ? '#ff7070' : mode === 'ready' ? '#79ff91' : mode === 'offline' ? '#ffd166' : '#67e8f9';
    hud.style.borderColor = mode === 'error' ? 'rgba(255,70,70,.78)' : mode === 'ready' ? 'rgba(80,255,112,.66)' : mode === 'offline' ? 'rgba(255,193,60,.66)' : 'rgba(34,211,238,.62)';

    const header = el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center' }, [
      el('b', { text: title, style: `color:${colour};letter-spacing:.04em` }),
      el('span', { text: `v${VERSION}`, style: 'color:#9ca3af;font-size:10px' })
    ]);
    const description = el('div', { text: detail, style: 'margin-top:5px;color:#d1d5db;word-break:break-word' });
    const bar = el('div', { style: 'height:5px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden' },
      el('div', { style: `height:100%;width:${pct}%;background:linear-gradient(90deg,#7c4dff,#22d3ee,#39ff14,#ff8a1f,#ff2bd6);transition:width .18s ease` })
    );
    const children = [header, description, bar];
    if (retry) {
      const button = el('button', { id: 'nova-bootstrap-retry', type: 'button', text: 'Retry Nova', style: 'width:100%;margin-top:9px;padding:8px;border:1px solid rgba(255,95,95,.72);border-radius:10px;background:rgba(125,10,24,.82);color:#fff;font-weight:800;cursor:pointer' });
      button.addEventListener('click', () => location.reload());
      children.push(button);
    }
    hud.replaceChildren(...children);
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
    try { const value = GM_getValue(key, fallback); return value === undefined ? fallback : value; }
    catch (error) { warn('Storage read failed:', key, error); return fallback; }
  }
  function storageSet(key, value) {
    try { GM_setValue(key, value); return true; }
    catch (error) { warn('Storage write failed:', key, error); return false; }
  }
  function storageDelete(key) {
    try { GM_deleteValue(key); return true; }
    catch (error) { warn('Storage delete failed:', key, error); return false; }
  }

  const safeId = (value) => String(value || 'unknown').replace(/[^a-z0-9._-]+/gi, '_');
  const trustedUrl = (url) => typeof url === 'string' && url.startsWith(TRUSTED_PREFIX);

  function emitNovaEvent(type, detail = {}) {
    let event;
    try { event = new CustomEvent(type, { detail }); } catch (_) { return false; }
    try { if (typeof window.dispatchEvent === 'function') { window.dispatchEvent(event); return true; } } catch (_) {}
    try { if (document && typeof document.dispatchEvent === 'function') { document.dispatchEvent(event); return true; } } catch (_) {}
    return false;
  }
  window.NovaEvents = window.NovaEvents || {};
  window.NovaEvents.emit = emitNovaEvent;

  function addQuery(url, key, value) {
    return url + (url.includes('?') ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }

  function requestText(url, timeout = 18000) {
    if (!trustedUrl(url)) return Promise.reject(new Error('Blocked untrusted Nova URL: ' + url));
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, timeout,
        headers: { Accept: 'text/plain, application/json;q=0.9, */*;q=0.8', 'Cache-Control': 'no-cache' },
        onload(response) {
          if (response.status >= 200 && response.status < 300) { state.online = true; resolve(String(response.responseText || '')); }
          else reject(new Error('HTTP ' + response.status + ' for ' + url));
        },
        onerror: () => reject(new Error('Network error for ' + url)),
        ontimeout: () => reject(new Error('Timed out loading ' + url))
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

  const cacheKey = (component, kind) => PREFIX + 'code.' + safeId(kind) + '.' + safeId(component.id) + '.' + safeId(component.version || 'latest');
  function readCacheIndex() { const index = storageGet(CACHE_INDEX_KEY, []); return Array.isArray(index) ? index : []; }
  function touchCache(key) {
    const index = readCacheIndex().filter((entry) => entry && entry.key !== key);
    index.unshift({ key, touchedAt: Date.now() });
    while (index.length > MAX_CACHE_ENTRIES) { const removed = index.pop(); if (removed && removed.key) storageDelete(removed.key); }
    storageSet(CACHE_INDEX_KEY, index);
  }
  function readComponentCache(component, kind) {
    const key = cacheKey(component, kind); const cached = storageGet(key, null);
    if (!cached || typeof cached.code !== 'string' || !cached.code.trim()) return null;
    touchCache(key); return cached;
  }
  function writeComponentCache(component, kind, code) {
    const key = cacheKey(component, kind);
    const cached = { id: component.id, version: component.version || 'latest', url: component.url, kind, code, savedAt: new Date().toISOString() };
    storageSet(key, cached); touchCache(key); return cached;
  }
  async function fetchComponent(component, options = {}) {
    const kind = options.kind || (component.core ? 'core' : 'module');
    const preferCache = options.preferCache !== false;
    const force = options.force === true;
    validateComponent(component, kind);
    if (preferCache && !force) { const cached = readComponentCache(component, kind); if (cached) return cached.code; }
    const versioned = addQuery(component.url, 'v', component.version || 'latest');
    const url = force ? addQuery(versioned, 'ts', Date.now()) : versioned;
    try {
      const code = await requestText(url, Number(options.timeout) || 20000);
      if (!code.trim()) throw new Error('Empty source for ' + component.id);
      writeComponentCache(component, kind, code); return code;
    } catch (error) {
      const cached = readComponentCache(component, kind);
      if (cached) { warn('Using cached', kind, component.id, 'after download failure:', error); return cached.code; }
      throw error;
    }
  }

  async function clearComponentCache(component, kind) {
    const id = safeId(component && component.id);
    const kinds = kind ? [kind] : ['core', 'module', 'component'];
    const index = readCacheIndex(); const targets = new Set();
    for (const entry of index) {
      if (!entry || !entry.key) continue;
      if (kinds.some((itemKind) => entry.key.startsWith(PREFIX + 'code.' + safeId(itemKind) + '.' + id + '.'))) targets.add(entry.key);
    }
    targets.forEach(storageDelete);
    storageSet(CACHE_INDEX_KEY, index.filter((entry) => !entry || !targets.has(entry.key)));
    return targets.size;
  }
  async function clearAllCaches() {
    readCacheIndex().forEach((entry) => { if (entry && entry.key) storageDelete(entry.key); });
    [CACHE_INDEX_KEY, ACTIVE_MANIFEST_KEY, PREVIOUS_MANIFEST_KEY, LAST_CHECK_KEY].forEach(storageDelete);
    return true;
  }

  async function downloadManifest() {
    const text = await requestText(addQuery(MANIFEST_URL, 'ts', Date.now()), 15000);
    return validateManifest(JSON.parse(text));
  }
  async function stageManifest(manifest) {
    const core = manifest.core.filter((item) => item && item.enabled !== false).slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];
      updateHud('Preparing Nova update', `${index + 1}/${core.length} · ${component.name || component.id}`, 8 + ((index + 1) / core.length) * 45);
      try { await fetchComponent(component, { kind: 'core', preferCache: true }); }
      catch (error) {
        if (component.required === false) { warn('Optional Core failed to stage:', component.id, error); continue; }
        throw new Error('Could not stage required Core ' + component.id + ': ' + (error.message || error));
      }
    }
    return manifest;
  }
  async function resolveManifest() {
    const cached = storageGet(ACTIVE_MANIFEST_KEY, null);
    try {
      const remote = await downloadManifest(); storageSet(LAST_CHECK_KEY, Date.now());
      const changed = !cached || fingerprint(remote) !== fingerprint(cached);
      if (changed) {
        log('New Nova release found:', remote.version); await stageManifest(remote);
        if (cached) storageSet(PREVIOUS_MANIFEST_KEY, cached);
      }
      storageSet(ACTIVE_MANIFEST_KEY, remote);
      state.manifestSource = changed ? 'github-update' : 'github'; return remote;
    } catch (error) {
      warn('Manifest update check failed:', error);
      if (cached) { state.manifestSource = 'cache'; return validateManifest(cached); }
      const previous = storageGet(PREVIOUS_MANIFEST_KEY, null);
      if (previous) { state.manifestSource = 'previous-cache'; return validateManifest(previous); }
      throw error;
    }
  }

  function executeCode(component, code, kind = 'core') {
    const sourceName = safeId(component.id || 'nova-component') + '.js';
    const runner = new Function('GM_xmlhttpRequest','GM_getValue','GM_setValue','GM_deleteValue','GM_addValueChangeListener','GM_registerMenuCommand','unsafeWindow', code + '\n//# sourceURL=nova://' + kind + '/' + sourceName);
    runner.call(window,
      typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
      typeof GM_getValue === 'function' ? GM_getValue : undefined,
      typeof GM_setValue === 'function' ? GM_setValue : undefined,
      typeof GM_deleteValue === 'function' ? GM_deleteValue : undefined,
      typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : undefined,
      typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined,
      typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
    );
  }

  function createNovaShell(manifest) {
    window.Nova = window.Nova || {};
    const registry = [...manifest.core.map((item) => ({ ...item, core: true })), ...(manifest.modules || []).map((item) => ({ ...item, core: false }))];
    Object.assign(window.Nova, {
      version: manifest.version, bootstrapVersion: VERSION, build: manifest.build || 'manifest-' + manifest.version,
      loadedAt: new Date().toISOString(), manifestUrl: MANIFEST_URL, registryUrl: MANIFEST_URL,
      manifest, registry: { version: manifest.version, updatedAt: manifest.updatedAt || null, modules: registry },
      modulesRegistry: registry, core: window.Nova.core || {}
    });
    window.Nova.getModules = () => window.Nova.modulesRegistry.slice();
    window.Nova.getEnabledModules = () => window.Nova.modulesRegistry.filter((item) => item && item.enabled !== false);
    window.Nova.loadRegistry = async () => checkForUpdates({ force: true });
    try { if (document.documentElement) document.documentElement.setAttribute('data-nova-manifest', JSON.stringify(manifest)); }
    catch (error) { warn('Could not publish the Nova manifest bridge:', error); }
  }

  function isSunoPrimeWindow() {
    try { const host = String(location.hostname || '').toLowerCase(); return (host === 'suno.com' || host.endsWith('.suno.com')) && new URLSearchParams(location.search).has('nova_suno_prime'); }
    catch (_) { return false; }
  }
  function startPrimeCaptureFromCache() {
    if (!isSunoPrimeWindow()) return;
    const manifest = storageGet(ACTIVE_MANIFEST_KEY, null);
    const component = manifest && Array.isArray(manifest.modules) ? manifest.modules.find((item) => item && item.id === 'nova-suno-remote-any-page') : null;
    const cached = component && readComponentCache(component, 'module');
    if (!component || !cached) { warn('Prime popup opened before the Suno module cache was available.'); return; }
    try { executeCode(component, cached.code, 'module'); log('Started cached Suno Prime capture at document-start.'); }
    catch (error) { warn('Could not start cached Suno Prime capture:', error); }
  }

  async function loadCore(manifest) {
    const core = manifest.core.filter((item) => item && item.enabled !== false).slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    for (let index = 0; index < core.length; index += 1) {
      const component = core[index];
      updateHud('Loading Nova Core', `${index + 1}/${core.length} · ${component.name || component.id}`, 18 + ((index + 1) / core.length) * 68);
      try {
        const code = await fetchComponent(component, { kind: 'core', preferCache: true });
        executeCode(component, code, 'core'); state.loadedCore.push(component.id);
        if (component.api) window.Nova.core[component.id] = window[component.api] || null;
        log('Loaded', component.id, component.version || 'latest');
      } catch (error) {
        state.failedCore.push({ id: component.id, error: String(error) });
        if (component.required === false) { warn('Optional Core failed:', component.id, error); continue; }
        throw new Error('Required Core failed: ' + component.id + ' — ' + (error.message || error));
      }
    }
  }

  function bindAliases() {
    Object.assign(window.Nova.core, {
      theme: window.NovaTheme || null, audioTheme: window.NovaAudioTheme || null, session: window.NovaSession || null,
      memory: window.NovaMemory || null, memoryAutoLearn: window.NovaMemoryAutoLearn || null, brain: window.NovaBrain || null,
      traceNetwork: window.NovaTraceNetwork || null, apiCatcher: window.NovaApiCatcher || window.NovaTraceNetwork || null,
      apiBodyCatcher: window.NovaApiBodyCatcher || null, domInspector: window.NovaDOMInspector || null,
      investigationExport: window.NovaInvestigationExport || null, menu: window.NovaMenu || null,
      orbExtras: window.NovaOrbExtras || null, memoryPanel: window.NovaMemoryPanel || null,
      windowManager: window.NovaWindowManager || null, moduleLoader: window.NovaModuleLoader || null,
      youtubeMusicAdapter: window.NovaYouTubeMusicAdapter || null
    });
    window.Nova.theme = window.NovaTheme || null;
    window.Nova.audioTheme = window.NovaAudioTheme || null;
  }
  function startServices() {
    if (window.NovaTheme && typeof window.NovaTheme.inject === 'function') window.NovaTheme.inject();
    if (window.NovaAudioTheme && typeof window.NovaAudioTheme.init === 'function') window.NovaAudioTheme.init();
    if (window.NovaMenu && typeof window.NovaMenu.repair === 'function') window.NovaMenu.repair();
    if (window.NovaOrbExtras && typeof window.NovaOrbExtras.scan === 'function') window.NovaOrbExtras.scan();
    if (window.NovaWindowManager && typeof window.NovaWindowManager.scan === 'function') window.NovaWindowManager.scan();
    if (window.NovaModuleLoader && typeof window.NovaModuleLoader.loadMatching === 'function') window.NovaModuleLoader.loadMatching();
  }

  async function checkForUpdates(options = {}) {
    const force = options.force === true; const lastCheck = Number(storageGet(LAST_CHECK_KEY, 0)) || 0;
    if (!force && Date.now() - lastCheck < UPDATE_CHECK_MS) return null;
    try {
      const current = storageGet(ACTIVE_MANIFEST_KEY, state.manifest); const remote = await downloadManifest();
      storageSet(LAST_CHECK_KEY, Date.now());
      if (current && fingerprint(remote) === fingerprint(current)) return null;
      await stageManifest(remote); if (current) storageSet(PREVIOUS_MANIFEST_KEY, current);
      storageSet(ACTIVE_MANIFEST_KEY, remote); state.updateReady = true;
      emitNovaEvent('nova-update-ready', { currentVersion: current && current.version, nextVersion: remote.version, updatedAt: remote.updatedAt || null });
      log('Nova update', remote.version, 'downloaded. It activates on next refresh.'); return remote;
    } catch (error) { warn('Background update check failed:', error); return null; }
  }
  function scheduleUpdateChecks() {
    setInterval(() => checkForUpdates().catch(() => {}), UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates().catch(() => {}); });
  }
  function showFatal(error) {
    state.phase = 'failed'; state.lastError = String(error && error.message || error);
    console.error('[Nova Bootstrap] Fatal load failure', error);
    updateHud('Nova Bootstrap failed', state.lastError, 100, 'error', true);
  }

  window.NovaBootstrap = {
    version: VERSION, manifestUrl: MANIFEST_URL, state, fetchComponent, executeCode,
    clearComponentCache, clearAllCaches, checkForUpdates,
    getManifest: () => state.manifest || storageGet(ACTIVE_MANIFEST_KEY, null),
    getStatus: () => JSON.parse(JSON.stringify(state))
  };

  function startNova() {
    (async () => {
      try {
        updateHud('Nova Bootstrap started', 'Using Firefox CSP-safe userscript sandbox…', 3);
        state.phase = 'manifest'; const manifest = await resolveManifest(); state.manifest = manifest; createNovaShell(manifest);
        state.phase = 'core'; await loadCore(manifest); bindAliases();
        state.phase = 'services'; updateHud('Starting Nova services', 'Theme, menu, modules, and Watch…', 93); startServices();
        state.phase = 'ready'; scheduleUpdateChecks();
        updateHud('Nova Core ready', `${state.loadedCore.length} Core components · ${(manifest.modules || []).length} modules`, 100, 'ready');
        hideHudSoon();
      } catch (error) { showFatal(error); }
    })();
  }

  startPrimeCaptureFromCache();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startNova, { once: true });
  else startNova();
})();
