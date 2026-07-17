// core/nova-module-loader.js

(function () {
  'use strict';

  if (window.NovaModuleLoader) return;

  const VERSION = '1.0.0';
  const loaded = new Set();
  const loading = new Map();

  function matchOne(pattern) {
    const value = String(pattern || '');
    if (!value) return true;

    if (value.endsWith('*')) {
      return location.href.startsWith(value.slice(0, -1));
    }

    return location.href === value || location.href.startsWith(value);
  }

  function matches(patterns) {
    if (!Array.isArray(patterns) || !patterns.length) return true;
    return patterns.some(matchOne);
  }

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;

    window.NovaSession.addEvent({
      module: 'module-loader',
      type,
      summary,
      data: data || {}
    });
  }

  function canLoad(module) {
    if (!module || !module.id || !module.url) return false;
    if (module.enabled === false) return false;
    if (module.core) return false;
    if (!matches(module.match)) return false;
    return true;
  }

  async function fetchCode(module) {
    if (
      window.NovaBootstrap &&
      typeof window.NovaBootstrap.fetchComponent === 'function'
    ) {
      return window.NovaBootstrap.fetchComponent(module, {
        kind: 'module',
        preferCache: true
      });
    }

    const version = encodeURIComponent(module.version || 'latest');
    const joiner = module.url.includes('?') ? '&' : '?';
    const response = await fetch(
      module.url + joiner + 'v=' + version,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    return response.text();
  }

  function execute(module, code) {
    if (!code || typeof code !== 'string') {
      throw new Error('Empty module source');
    }

    const sourceUrl = String(module.id || 'nova-module') + '.js';
    const runner = new Function(
      code + '\n//# sourceURL=' + sourceUrl
    );

    runner();
  }

  async function loadScript(module) {
    if (!canLoad(module)) return false;
    if (loaded.has(module.id)) return true;
    if (loading.has(module.id)) return loading.get(module.id);

    const promise = (async () => {
      try {
        const code = await fetchCode(module);
        execute(module, code);
        loaded.add(module.id);

        console.log(
          '[Nova Module Loader] Loaded',
          module.id,
          module.version || 'latest'
        );

        emit(
          'module-loaded',
          'Nova module loaded: ' + module.id,
          {
            id: module.id,
            version: module.version || null,
            url: module.url
          }
        );

        return true;
      } catch (error) {
        console.warn('[Nova Module Loader] Failed', module.id, error);

        emit(
          'module-load-error',
          'Nova module failed: ' + module.id,
          {
            id: module.id,
            version: module.version || null,
            url: module.url,
            error: String(error)
          }
        );

        return false;
      } finally {
        loading.delete(module.id);
      }
    })();

    loading.set(module.id, promise);
    return promise;
  }

  async function loadMatching() {
    const modules = window.Nova && Array.isArray(window.Nova.modulesRegistry)
      ? window.Nova.modulesRegistry
      : [];

    const autoload = modules.filter(
      (module) => module && module.autoload === true && canLoad(module)
    );

    const results = [];

    for (const module of autoload) {
      results.push(await loadScript(module));
    }

    return results.filter(Boolean).length;
  }

  window.NovaModuleLoader = {
    version: VERSION,
    loaded,
    loading,
    matches,
    canLoad,
    loadMatching,
    loadScript,

    async reload(module) {
      if (!module || !module.id) return false;
      loaded.delete(module.id);

      if (
        window.NovaBootstrap &&
        typeof window.NovaBootstrap.clearComponentCache === 'function'
      ) {
        await window.NovaBootstrap.clearComponentCache(module);
      }

      return loadScript(module);
    }
  };

  console.log('[Nova Core] NovaModuleLoader loaded', VERSION);
})();
