// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      0.4.0
// @description  Nova Core bootstrap loader
// @author       Nova
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-theme.js
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-session.js
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-trace.js
// ==/UserScript==

(function () {
  'use strict';

  const REGISTRY_URL = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/modules/modules.registry.json';

  window.Nova = window.Nova || {};
  window.Nova.version = '0.4.0';
  window.Nova.build = 'mission-004-module-registry';
  window.Nova.loadedAt = new Date().toISOString();
  window.Nova.registryUrl = REGISTRY_URL;
  window.Nova.registry = null;
  window.Nova.modulesRegistry = [];

  window.Nova.core = {
    theme: window.NovaTheme || null,
    session: window.NovaSession || null,
    traceNetwork: window.NovaTraceNetwork || null
  };

  async function loadRegistry() {
    try {
      const response = await fetch(REGISTRY_URL + '?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Registry HTTP ' + response.status);

      const registry = await response.json();
      window.Nova.registry = registry;
      window.Nova.modulesRegistry = Array.isArray(registry.modules) ? registry.modules : [];

      console.log('[Nova Core] Module registry loaded', window.Nova.modulesRegistry.length, 'modules');

      if (window.NovaSession && window.NovaSession.isActive()) {
        window.NovaSession.addEvent({
          module: 'bootstrap',
          type: 'registry-load',
          summary: 'Nova module registry loaded',
          data: {
            count: window.Nova.modulesRegistry.length,
            registryVersion: registry.version || null
          }
        });
      }

      return registry;
    } catch (error) {
      console.warn('[Nova Core] Failed to load module registry', error);
      window.Nova.registry = { version: 'error', modules: [] };
      window.Nova.modulesRegistry = [];
      return window.Nova.registry;
    }
  }

  window.Nova.loadRegistry = loadRegistry;
  window.Nova.getModules = function getModules() {
    return window.Nova.modulesRegistry.slice();
  };
  window.Nova.getEnabledModules = function getEnabledModules() {
    return window.Nova.modulesRegistry.filter((module) => module && module.enabled !== false);
  };

  function logStatus() {
    console.group('[Nova Core] Bootstrap loaded');
    console.log('Version:', window.Nova.version);
    console.log('Theme:', Boolean(window.NovaTheme));
    console.log('Session:', Boolean(window.NovaSession));
    console.log('Trace Network:', Boolean(window.NovaTraceNetwork));
    console.log('Registry URL:', REGISTRY_URL);
    console.groupEnd();
  }

  if (window.NovaTheme && typeof window.NovaTheme.inject === 'function') {
    window.NovaTheme.inject();
  }

  if (window.NovaSession && window.NovaSession.isActive()) {
    window.NovaSession.addEvent({
      module: 'bootstrap',
      type: 'load',
      summary: 'Nova Bootstrap loaded',
      data: {
        version: window.Nova.version,
        pageUrl: location.href
      }
    });
  }

  loadRegistry();
  logStatus();
})();
