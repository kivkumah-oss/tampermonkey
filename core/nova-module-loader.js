// core/nova-module-loader.js

(function () {
  'use strict';

  if (window.NovaModuleLoader) return;

  const VERSION = '1.1.3';
  const loaded = new Set();
  const loading = new Map();

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
      if (window.Nova && Array.isArray(window.Nova.modulesRegistry) && window.Nova.modulesRegistry.length) {
        return window.Nova.modulesRegistry.slice();
      }
    } catch (_) {}

    try {
      if (window.NovaBootstrap && typeof window.NovaBootstrap.getManifest === 'function') {
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
      const raw = document.documentElement && document.documentElement.getAttribute('data-nova-manifest');
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

  async function fetchCode(module) {
    if (window.NovaBootstrap && typeof window.NovaBootstrap.fetchComponent === 'function') {
      return window.NovaBootstrap.fetchComponent(module, {
        kind: 'module',
        preferCache: true
      });
    }

    const version = encodeURIComponent(module.version || 'latest');
    const joiner = module.url.includes('?') ? '&' : '?';
    const response = await fetch(module.url + joiner + 'v=' + version, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.text();
  }

  function execute(module, code) {
    if (!code || typeof code !== 'string') throw new Error('Empty module source');

    if (window.NovaBootstrap && typeof window.NovaBootstrap.executeCode === 'function') {
      window.NovaBootstrap.executeCode(module, code, 'module');
      return;
    }

    const sourceUrl = String(module.id || 'nova-module') + '.js';
    const runner = new Function(code + '\n//# sourceURL=' + sourceUrl);
    runner.call(window);
  }

  function markAlreadyLoaded(module) {
    if (module && module.api && window[module.api]) {
      loaded.add(module.id);
      return true;
    }
    return false;
  }

  async function loadScript(module) {
    if (!canLoad(module)) return false;
    if (loaded.has(module.id) || markAlreadyLoaded(module)) return true;
    if (loading.has(module.id)) return loading.get(module.id);

    const promise = (async () => {
      try {
        const code = await fetchCode(module);
        execute(module, code);

        if (module.api && !window[module.api]) {
          throw new Error('Module executed but API was not exposed: ' + module.api);
        }

        loaded.add(module.id);
        console.log('[Nova Module Loader] Loaded', module.id, module.version || 'latest');

        emit('module-loaded', 'Nova module loaded: ' + module.id, {
          id: module.id,
          version: module.version || null,
          url: module.url
        });

        return true;
      } catch (error) {
        if (module.api && window[module.api]) {
          loaded.add(module.id);
          console.warn(
            '[Nova Module Loader] Module API is available despite a non-fatal post-init error:',
            module.id,
            error
          );

          emit('module-loaded', 'Nova module loaded with a sandbox compatibility warning: ' + module.id, {
            id: module.id,
            version: module.version || null,
            url: module.url,
            warning: String(error)
          });

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

  async function loadMatching() {
    const registry = getRegistry();
    const autoload = registry.filter((module) => module && module.autoload === true && canLoad(module));
    const results = [];

    for (const module of autoload) {
      results.push(await loadScript(module));
    }

    return results.filter(Boolean).length;
  }

  installEventBridge();

  window.NovaModuleLoader = {
    version: VERSION,
    loaded,
    loading,
    matches,
    canLoad,
    getRegistry,
    loadMatching,
    loadScript,
    installEventBridge,
    safeDispatch,

    async reload(module) {
      if (!module || !module.id) return false;
      loaded.delete(module.id);

      if (window.NovaBootstrap && typeof window.NovaBootstrap.clearComponentCache === 'function') {
        await window.NovaBootstrap.clearComponentCache(module, 'module');
      }

      return loadScript(module);
    }
  };

  getRegistry().forEach(markAlreadyLoaded);
  console.log('[Nova Core] NovaModuleLoader loaded', VERSION);
})();
