// core/nova-module-loader.js

(function () {
  'use strict';

  if (window.NovaModuleLoader) return;

  const VERSION = '0.3.0';
  const loaded = new Set();

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

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({ module: 'module-loader', type, summary, data: data || {} });
  }

  function canLoad(module) {
    if (!module || !module.id || !module.url) return false;
    if (module.enabled === false) return false;
    if (module.core) return false;
    if (!matches(module.match)) return false;
    return true;
  }

  async function loadScript(module) {
    if (!canLoad(module)) return false;
    if (loaded.has(module.id)) return true;

    try {
      const url = module.url + (module.url.includes('?') ? '&' : '?') + 'ts=' + Date.now();
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const code = await response.text();
      const runner = new Function(code + '\n//# sourceURL=' + module.id + '.js');
      runner();
      loaded.add(module.id);
      console.log('[Nova Module Loader] Loaded', module.id);
      emit('module-loaded', 'Nova module loaded: ' + module.id, { id: module.id, url: module.url });
      return true;
    } catch (error) {
      console.warn('[Nova Module Loader] Failed', module.id, error);
      emit('module-load-error', 'Nova module failed: ' + module.id, { id: module.id, url: module.url, error: String(error) });
      return false;
    }
  }

  function loadMatching() {
    const modules = window.Nova && Array.isArray(window.Nova.modulesRegistry) ? window.Nova.modulesRegistry : [];
    let count = 0;
    modules.forEach((module) => {
      if (module.autoload === true) {
        loadScript(module).then((ok) => { if (ok) count += 1; });
      }
    });
    return count;
  }

  window.NovaModuleLoader = { version: VERSION, loaded, matches, canLoad, loadMatching, loadScript };
  console.log('[Nova Core] NovaModuleLoader loaded');
})();
