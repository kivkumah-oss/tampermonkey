// core/nova-module-loader.js

(function () {
  'use strict';

  if (window.NovaModuleLoader) return;

  const VERSION = '1.2.0';
  const loaded = new Set();
  const loading = new Map();
  const LOADED_MODULES_ATTR = 'data-nova-loaded-modules';
  const BOOTSTRAP_PREFIX = 'nova.bootstrap.v2.';
  const BOOTSTRAP_CACHE_INDEX_KEY = BOOTSTRAP_PREFIX + 'cache.index';
  const BOOTSTRAP_MAX_CACHE_ENTRIES = 80;
  const VISIBILITY_STATE_KEY = 'nova.modules.visibility.v1';
  const RESTORE_REFRESH_DELAYS = [180, 900];

  function publishLoadedModules() {
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute(
          LOADED_MODULES_ATTR,
          JSON.stringify([...loaded])
        );
      }
    } catch (_) {}
  }

  function markLoaded(moduleId) {
    loaded.add(moduleId);
    publishLoadedModules();
  }

  function markUnloaded(moduleId) {
    loaded.delete(moduleId);
    publishLoadedModules();
  }

  function matchOne(pattern) {
    const value = String(pattern || '');
    if (!value) return true;
    if (value.endsWith('*')) return location.href.startsWith(value.slice(0, -1));
    return location.href === value || location.href.startsWith(value);
  }

  function matches(patterns) {
    if (!Array.isArray(patterns) || !patterns.length) return true;
    return patterns.some(matchOne);
  }

  function installEventBridge() {
    try {
      if (window.NovaEvents && typeof window.NovaEvents.emit === 'function') return true;
    } catch (_) {}

    if (typeof window.dispatchEvent === 'function') return true;
    if (!document || typeof document.dispatchEvent !== 'function') return false;

    const fallback = function novaSandboxDispatchEvent(event) {
      return document.dispatchEvent(event);
    };

    try {
      window.dispatchEvent = fallback;
      if (typeof window.dispatchEvent === 'function') return true;
    } catch (_) {}

    try {
      Object.defineProperty(window, 'dispatchEvent', {
        value: fallback,
        configurable: true,
        writable: true
      });
      return typeof window.dispatchEvent === 'function';
    } catch (_) {
      return false;
    }
  }

  function safeDispatch(type, detail) {
    try {
      if (window.NovaEvents && typeof window.NovaEvents.emit === 'function') {
        return window.NovaEvents.emit(type, detail);
      }
    } catch (_) {}

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

  function getRegistry() {
    try {
      if (
        window.Nova &&
        Array.isArray(window.Nova.modulesRegistry) &&
        window.Nova.modulesRegistry.length
      ) {
        return window.Nova.modulesRegistry.slice();
      }
    } catch (_) {}

    try {
      if (
        window.NovaBootstrap &&
        typeof window.NovaBootstrap.getManifest === 'function'
      ) {
        const manifest = window.NovaBootstrap.getManifest();
        if (manifest) {
          return [
            ...(manifest.core || []).map((item) => ({ ...item, core: true })),
            ...(manifest.modules || []).map((item) => ({ ...item, core: false }))
          ];
        }
      }
    } catch (_) {}

    try {
      const raw =
        document.documentElement &&
        document.documentElement.getAttribute('data-nova-manifest');
      const manifest = raw && JSON.parse(raw);
      if (manifest) {
        return [
          ...(manifest.core || []).map((item) => ({ ...item, core: true })),
          ...(manifest.modules || []).map((item) => ({ ...item, core: false }))
        ];
      }
    } catch (_) {}

    return [];
  }

  function emit(type, summary, data) {
    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({
        module: 'module-loader',
        type,
        summary,
        data: data || {}
      });
    }

    safeDispatch(
      type === 'module-loaded' ? 'nova-module-loaded' : 'nova-module-event',
      { type, summary, data: data || {} }
    );

    if (window.NovaMenu && typeof window.NovaMenu.refresh === 'function') {
      setTimeout(() => window.NovaMenu.refresh(), 0);
    }
  }

  function canLoad(module) {
    if (!module || !module.id || !module.url) return false;
    if (module.enabled === false || module.core) return false;
    return matches(module.match);
  }

  function canManuallyLoad(module) {
    if (!module || !module.id || !module.url) return false;
    if (module.enabled === false || module.core) return false;
    return module.manualAnywhere === true || canLoad(module);
  }

  function safeCacheId(value) {
    return String(value || 'unknown').replace(/[^a-z0-9._-]+/gi, '_');
  }

  function readGmJson(key, fallback) {
    if (typeof GM_getValue !== 'function') return fallback;
    try {
      const value = GM_getValue(key, fallback);
      return value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeGmValue(key, value) {
    if (typeof GM_setValue !== 'function') return false;
    try {
      GM_setValue(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function deleteGmValue(key) {
    if (typeof GM_deleteValue !== 'function') return false;
    try {
      GM_deleteValue(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readVisibilityState() {
    const value = readGmJson(VISIBILITY_STATE_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value }
      : {};
  }

  function getVisibilityPreference(moduleId) {
    const state = readVisibilityState();
    if (!Object.prototype.hasOwnProperty.call(state, moduleId)) return null;
    return state[moduleId] === true;
  }

  function setVisibilityPreference(moduleId, visible) {
    if (!moduleId) return false;
    const state = readVisibilityState();
    state[moduleId] = Boolean(visible);
    return writeGmValue(VISIBILITY_STATE_KEY, state);
  }

  function clearVisibilityPreference(moduleId) {
    if (!moduleId) return false;
    const state = readVisibilityState();
    if (!Object.prototype.hasOwnProperty.call(state, moduleId)) return true;
    delete state[moduleId];
    return writeGmValue(VISIBILITY_STATE_KEY, state);
  }

  function shouldRestore(module) {
    if (!module || !module.id || module.enabled === false || module.core) return false;

    const preference = getVisibilityPreference(module.id);
    if (preference === false) return false;
    if (preference === true) return canManuallyLoad(module);

    return module.autoload === true && canLoad(module);
  }

  function isDesiredVisible(moduleId) {
    const module = getRegistry().find((item) => item && item.id === moduleId);
    return module ? shouldRestore(module) : false;
  }

  function mirrorIntoBootstrapCache(module, code) {
    if (!module || !module.id || typeof code !== 'string' || !code.trim()) {
      return false;
    }

    const cacheKey =
      BOOTSTRAP_PREFIX +
      'code.module.' +
      safeCacheId(module.id) +
      '.' +
      safeCacheId(module.version || 'latest');

    const cached = {
      id: module.id,
      version: module.version || 'latest',
      url: module.url,
      kind: 'module',
      code,
      savedAt: new Date().toISOString()
    };

    if (!writeGmValue(cacheKey, cached)) return false;

    const index = readGmJson(BOOTSTRAP_CACHE_INDEX_KEY, []);
    const next = (Array.isArray(index) ? index : []).filter(
      (entry) => entry && entry.key !== cacheKey
    );
    next.unshift({ key: cacheKey, touchedAt: Date.now() });

    while (next.length > BOOTSTRAP_MAX_CACHE_ENTRIES) {
      const removed = next.pop();
      if (removed && removed.key) deleteGmValue(removed.key);
    }

    writeGmValue(BOOTSTRAP_CACHE_INDEX_KEY, next);
    console.log(
      '[Nova Module Loader] Mirrored module into Bootstrap cache',
      module.id,
      module.version || 'latest'
    );
    return true;
  }

  async function fetchCode(module) {
    if (
      window.NovaBootstrap &&
      typeof window.NovaBootstrap.fetchComponent === 'function'
    ) {
      const code = await window.NovaBootstrap.fetchComponent(module, {
        kind: 'module',
        preferCache: true
      });
      mirrorIntoBootstrapCache(module, code);
      return code;
    }

    const version = encodeURIComponent(module.version || 'latest');
    const joiner = module.url.includes('?') ? '&' : '?';
    const response = await fetch(module.url + joiner + 'v=' + version, {
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const code = await response.text();
    mirrorIntoBootstrapCache(module, code);
    return code;
  }

  function execute(module, code) {
    if (!code || typeof code !== 'string') {
      throw new Error('Empty module source');
    }

    if (
      window.NovaBootstrap &&
      typeof window.NovaBootstrap.executeCode === 'function'
    ) {
      window.NovaBootstrap.executeCode(module, code, 'module');
      return;
    }

    const sourceUrl = String(module.id || 'nova-module') + '.js';
    const runner = new Function(
      'GM_xmlhttpRequest',
      'GM_getValue',
      'GM_setValue',
      'GM_deleteValue',
      'GM_addValueChangeListener',
      'GM_registerMenuCommand',
      'unsafeWindow',
      code + '\n//# sourceURL=' + sourceUrl
    );

    runner.call(
      window,
      typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
      typeof GM_getValue === 'function' ? GM_getValue : undefined,
      typeof GM_setValue === 'function' ? GM_setValue : undefined,
      typeof GM_deleteValue === 'function' ? GM_deleteValue : undefined,
      typeof GM_addValueChangeListener === 'function'
        ? GM_addValueChangeListener
        : undefined,
      typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : undefined,
      typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
    );
  }

  function markAlreadyLoaded(module) {
    if (module && module.api && window[module.api]) {
      markLoaded(module.id);
      return true;
    }
    return false;
  }

  async function loadScript(module, options = {}) {
    const manual = options.manual === true;
    if (!(manual ? canManuallyLoad(module) : canLoad(module))) return false;
    if (loaded.has(module.id) || markAlreadyLoaded(module)) return true;
    if (loading.has(module.id)) return loading.get(module.id);

    const promise = (async () => {
      try {
        const code = await fetchCode(module);
        execute(module, code);

        if (module.api && !window[module.api]) {
          throw new Error('Module executed but API was not exposed: ' + module.api);
        }

        markLoaded(module.id);
        console.log(
          '[Nova Module Loader] Loaded',
          module.id,
          module.version || 'latest'
        );

        emit('module-loaded', 'Nova module loaded: ' + module.id, {
          id: module.id,
          version: module.version || null,
          url: module.url
        });

        return true;
      } catch (error) {
        if (module.api && window[module.api]) {
          markLoaded(module.id);
          console.warn(
            '[Nova Module Loader] Module API is available despite a non-fatal post-init error:',
            module.id,
            error
          );

          emit(
            'module-loaded',
            'Nova module loaded with a sandbox compatibility warning: ' + module.id,
            {
              id: module.id,
              version: module.version || null,
              url: module.url,
              warning: String(error)
            }
          );

          return true;
        }

        console.warn('[Nova Module Loader] Failed', module.id, error);
        emit('module-load-error', 'Nova module failed: ' + module.id, {
          id: module.id,
          version: module.version || null,
          url: module.url,
          error: String(error)
        });
        return false;
      } finally {
        loading.delete(module.id);
      }
    })();

    loading.set(module.id, promise);
    return promise;
  }

  function callApiMethod(module, method) {
    try {
      const api = module && module.api && window[module.api];
      if (!api || typeof api[method] !== 'function') return false;
      api[method]();
      return true;
    } catch (error) {
      console.warn(
        '[Nova Module Loader] Module API method failed',
        module && module.id,
        method,
        error
      );
      return false;
    }
  }

  function scheduleRefresh(module) {
    for (const delay of RESTORE_REFRESH_DELAYS) {
      setTimeout(() => {
        if (!isDesiredVisible(module.id)) return;
        callApiMethod(module, 'show');
        callApiMethod(module, 'refresh');
      }, delay);
    }
  }

  async function activateModule(module, options = {}) {
    if (!module) return false;
    const manual = options.manual === true;
    const ok = await loadScript(module, { manual });
    if (!ok) return false;

    callApiMethod(module, 'show');
    callApiMethod(module, 'refresh');
    scheduleRefresh(module);
    return true;
  }

  async function loadMatching() {
    const registry = getRegistry();
    const candidates = registry
      .filter((module) => module && shouldRestore(module))
      .sort((a, b) => {
        const aSpecific = Array.isArray(a.match) && a.match.length ? 1 : 0;
        const bSpecific = Array.isArray(b.match) && b.match.length ? 1 : 0;
        return bSpecific - aSpecific;
      });

    const results = await Promise.allSettled(
      candidates.map((module) =>
        activateModule(module, {
          manual: getVisibilityPreference(module.id) === true
        })
      )
    );

    return results.filter(
      (result) => result.status === 'fulfilled' && result.value === true
    ).length;
  }

  async function setVisible(moduleOrId, visible, options = {}) {
    const module =
      typeof moduleOrId === 'string'
        ? getRegistry().find((item) => item && item.id === moduleOrId)
        : moduleOrId;

    if (!module || !module.id) return false;
    setVisibilityPreference(module.id, visible);

    if (!visible) {
      callApiMethod(module, 'hide');
      emit('module-hidden', 'Nova module hidden: ' + module.id, {
        id: module.id,
        persisted: true
      });
      return true;
    }

    const ok = await activateModule(module, { manual: true });
    if (ok) {
      emit('module-visible', 'Nova module restored: ' + module.id, {
        id: module.id,
        persisted: true,
        source: options.source || 'api'
      });
    }
    return ok;
  }

  function handleModuleCommand(event) {
    const detail = event && event.detail;
    if (!detail || !detail.id || !['launch', 'hide'].includes(detail.action)) {
      return;
    }

    const module = getRegistry().find((item) => item && item.id === detail.id);
    if (!module) return;

    const visible = detail.action === 'launch';
    Promise.resolve(setVisible(module, visible, { source: 'menu' }))
      .then((ok) => {
        safeDispatch('nova-module-command-result', {
          id: module.id,
          action: detail.action,
          ok: Boolean(ok),
          persisted: true
        });
      })
      .catch((error) => {
        safeDispatch('nova-module-command-result', {
          id: module.id,
          action: detail.action,
          ok: false,
          persisted: false,
          error: String(error)
        });
      });
  }

  installEventBridge();
  document.addEventListener('nova-module-command', handleModuleCommand);

  window.NovaModuleLoader = {
    version: VERSION,
    loaded,
    loading,
    matches,
    canLoad,
    canManuallyLoad,
    getRegistry,
    loadMatching,
    restoreMatching: loadMatching,
    loadScript,
    activateModule,
    setVisible,
    shouldRestore,
    isDesiredVisible,
    getVisibilityPreference,
    setVisibilityPreference,
    clearVisibilityPreference,
    readVisibilityState,
    installEventBridge,
    safeDispatch,
    mirrorIntoBootstrapCache,

    async reload(module) {
      if (!module || !module.id) return false;
      markUnloaded(module.id);

      if (
        window.NovaBootstrap &&
        typeof window.NovaBootstrap.clearComponentCache === 'function'
      ) {
        await window.NovaBootstrap.clearComponentCache(module, 'module');
      }

      const ok = await loadScript(module, { manual: true });
      if (ok && shouldRestore(module)) {
        callApiMethod(module, 'show');
        callApiMethod(module, 'refresh');
      }
      return ok;
    }
  };

  getRegistry().forEach(markAlreadyLoaded);
  publishLoadedModules();
  console.log('[Nova Core] NovaModuleLoader loaded', VERSION);
})();
