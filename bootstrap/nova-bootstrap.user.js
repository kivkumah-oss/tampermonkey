// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      1.4.6
// @description  Nova Core bootstrap loader
// @author       Nova
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-theme.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-session.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-memory.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-trace.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-dom-inspector.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-investigation-export.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-menu.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-orb-extras.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-memory-panel.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-memory-autolearn.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-brain.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-window-manager.js?v=146
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-module-loader.js?v=146
// ==/UserScript==

(function () {
  'use strict';

  const REGISTRY_URL = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/modules/modules.registry.json';

  window.Nova = window.Nova || {};
  window.Nova.version = '1.4.6';
  window.Nova.build = 'mission-029-suno-player-orb-extras';
  window.Nova.loadedAt = new Date().toISOString();
  window.Nova.registryUrl = REGISTRY_URL;
  window.Nova.registry = null;
  window.Nova.modulesRegistry = [];

  window.Nova.core = {
    theme: window.NovaTheme || null,
    session: window.NovaSession || null,
    memory: window.NovaMemory || null,
    memoryAutoLearn: window.NovaMemoryAutoLearn || null,
    brain: window.NovaBrain || null,
    traceNetwork: window.NovaTraceNetwork || null,
    domInspector: window.NovaDOMInspector || null,
    investigationExport: window.NovaInvestigationExport || null,
    menu: window.NovaMenu || null,
    orbExtras: window.NovaOrbExtras || null,
    memoryPanel: window.NovaMemoryPanel || null,
    windowManager: window.NovaWindowManager || null,
    moduleLoader: window.NovaModuleLoader || null
  };

  async function loadRegistry() {
    try {
      const response = await fetch(REGISTRY_URL + '?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Registry HTTP ' + response.status);
      const registry = await response.json();
      window.Nova.registry = registry;
      window.Nova.modulesRegistry = Array.isArray(registry.modules) ? registry.modules : [];
      console.log('[Nova Core] Module registry loaded', window.Nova.modulesRegistry.length, 'modules');
      if (window.NovaMenu && typeof window.NovaMenu.refresh === 'function') window.NovaMenu.refresh();
      if (window.NovaMemoryPanel && typeof window.NovaMemoryPanel.refresh === 'function') window.NovaMemoryPanel.refresh();
      if (window.NovaWindowManager && typeof window.NovaWindowManager.scan === 'function') window.NovaWindowManager.scan();
      if (window.NovaModuleLoader && typeof window.NovaModuleLoader.loadMatching === 'function') window.NovaModuleLoader.loadMatching();
      if (window.NovaSession && window.NovaSession.isActive()) {
        window.NovaSession.addEvent({ module: 'bootstrap', type: 'registry-load', summary: 'Nova module registry loaded', data: { count: window.Nova.modulesRegistry.length, registryVersion: registry.version || null } });
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
  window.Nova.getModules = function getModules() { return window.Nova.modulesRegistry.slice(); };
  window.Nova.getEnabledModules = function getEnabledModules() { return window.Nova.modulesRegistry.filter((module) => module && module.enabled !== false); };

  function logStatus() {
    console.group('[Nova Core] Bootstrap loaded');
    console.log('Version:', window.Nova.version);
    console.log('Build:', window.Nova.build);
    console.log('Theme:', Boolean(window.NovaTheme));
    console.log('Session:', Boolean(window.NovaSession));
    console.log('Memory:', Boolean(window.NovaMemory));
    console.log('Memory AutoLearn:', Boolean(window.NovaMemoryAutoLearn));
    console.log('Brain:', Boolean(window.NovaBrain));
    console.log('Trace Network:', Boolean(window.NovaTraceNetwork));
    console.log('DOM Inspector:', Boolean(window.NovaDOMInspector));
    console.log('Investigation Export:', Boolean(window.NovaInvestigationExport));
    console.log('Menu:', Boolean(window.NovaMenu));
    console.log('Orb Extras:', Boolean(window.NovaOrbExtras));
    console.log('Memory Panel:', Boolean(window.NovaMemoryPanel));
    console.log('Window Manager:', Boolean(window.NovaWindowManager));
    console.log('Module Loader:', Boolean(window.NovaModuleLoader));
    console.log('Registry URL:', REGISTRY_URL);
    console.groupEnd();
  }

  if (window.NovaTheme && typeof window.NovaTheme.inject === 'function') window.NovaTheme.inject();
  if (window.NovaOrbExtras && typeof window.NovaOrbExtras.scan === 'function') window.NovaOrbExtras.scan();
  if (window.NovaSession && window.NovaSession.isActive()) window.NovaSession.addEvent({ module: 'bootstrap', type: 'load', summary: 'Nova Bootstrap loaded', data: { version: window.Nova.version, pageUrl: location.href } });
  loadRegistry();
  logStatus();
})();
