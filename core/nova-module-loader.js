// core/nova-module-loader.js

(function () {
  'use strict';

  if (window.NovaModuleLoader) return;

  const VERSION = '0.1.0';
  const loaded = new Set();

  function matches(patterns) {
    if (!Array.isArray(patterns) || !patterns.length) return true;
    return patterns.some((pattern) => {
      const rx = new RegExp('^' + String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return rx.test(location.href);
    });
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

  function loadScript(module) {
    if (!module || !module.id || !module.url) return false;
    if (loaded.has(module.id)) return true;
    if (module.enabled === false) return false;
    if (module.core) return false;
    if (!matches(module.match)) return false;

    const script = document.createElement('script');
    script.src = module.url + (module.url.includes('?') ? '&' : '?') + 'ts=' + Date.now();
    script.async = false;
    script.dataset.novaModuleId = module.id;
    script.onload = () => {
      loaded.add(module.id);
      console.log('[Nova Module Loader] Loaded', module.id);
      emit('module-loaded', 'Nova module loaded: ' + module.id, { id: module.id, url: module.url });
    };
    script.onerror = () => {
      console.warn('[Nova Module Loader] Failed', module.id);
      emit('module-load-error', 'Nova module failed: ' + module.id, { id: module.id, url: module.url });
    };
    document.head.appendChild(script);
    return true;
  }

  function loadMatching() {
    const modules = window.Nova && Array.isArray(window.Nova.modulesRegistry) ? window.Nova.modulesRegistry : [];
    let count = 0;
    modules.forEach((module) => {
      if (loadScript(module)) count += 1;
    });
    return count;
  }

  window.NovaModuleLoader = {
    version: VERSION,
    loaded,
    loadMatching,
    loadScript
  };

  console.log('[Nova Core] NovaModuleLoader loaded');
})();
