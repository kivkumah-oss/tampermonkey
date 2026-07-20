// core/nova-default-module-state.js
(function () {
  'use strict';

  if (window.NovaDefaultModuleState) return;

  const VERSION = '1.2.0';
  const VISIBILITY_STATE_KEY = 'nova.modules.visibility.v1';
  const MIGRATION_MARKER_KEY = 'nova.modules.defaults.hero-pops.v1.applied';
  const DEFAULT_ON_MODULES = [
    'nova-hero-intelligence',
    'nova-pops-modern-ui'
  ];
  const RETRY_DELAYS = [300, 1200, 3000, 7000];

  function readValue(key, fallback) {
    try {
      if (typeof GM_getValue !== 'function') return fallback;
      const value = GM_getValue(key, fallback);
      return value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeValue(key, value) {
    try {
      if (typeof GM_setValue !== 'function') return false;
      GM_setValue(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readVisibilityState() {
    const value = readValue(VISIBILITY_STATE_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value }
      : {};
  }

  function getPreference(moduleId) {
    const state = readVisibilityState();
    if (!Object.prototype.hasOwnProperty.call(state, moduleId)) return null;
    return state[moduleId] === true;
  }

  function setPreference(moduleId, visible) {
    const state = readVisibilityState();
    state[moduleId] = Boolean(visible);
    return writeValue(VISIBILITY_STATE_KEY, state);
  }

  function applyDefaults(options = {}) {
    const force = options.force === true;
    const alreadyApplied = readValue(MIGRATION_MARKER_KEY, false) === true;

    if (alreadyApplied && !force) {
      return {
        applied: false,
        reason: 'already-applied',
        defaults: DEFAULT_ON_MODULES.slice(),
        state: readVisibilityState()
      };
    }

    const next = readVisibilityState();
    for (const moduleId of DEFAULT_ON_MODULES) {
      if (!Object.prototype.hasOwnProperty.call(next, moduleId) || force) {
        next[moduleId] = true;
      }
    }

    const saved = writeValue(VISIBILITY_STATE_KEY, next);
    if (saved) writeValue(MIGRATION_MARKER_KEY, true);

    return {
      applied: saved,
      reason: saved ? 'defaults-enabled' : 'storage-unavailable',
      defaults: DEFAULT_ON_MODULES.slice(),
      state: next
    };
  }

  function matchOne(pattern) {
    const value = String(pattern || '');
    if (!value) return true;
    if (value.endsWith('*')) return location.href.startsWith(value.slice(0, -1));
    return location.href === value || location.href.startsWith(value);
  }

  function matches(module) {
    if (!module || !Array.isArray(module.match) || !module.match.length) return true;
    return module.match.some(matchOne);
  }

  function getRegistry() {
    try {
      if (window.Nova && Array.isArray(window.Nova.modulesRegistry)) {
        return window.Nova.modulesRegistry.slice();
      }
    } catch (_) {}

    try {
      const manifest = window.NovaBootstrap?.getManifest?.();
      if (manifest && Array.isArray(manifest.modules)) {
        return manifest.modules.map((item) => ({ ...item, core: false }));
      }
    } catch (_) {}

    return [];
  }

  async function startMatching(reason = 'direct') {
    const loader = window.NovaModuleLoader;
    if (!loader || typeof loader.setVisible !== 'function') {
      console.warn('[Nova Core] Default module start skipped: loader unavailable', reason);
      return { started: 0, reason: 'loader-not-ready' };
    }

    const registry = getRegistry();
    let started = 0;

    for (const moduleId of DEFAULT_ON_MODULES) {
      const module = registry.find((item) => item && item.id === moduleId);
      if (!module || !matches(module)) continue;

      const preference = getPreference(moduleId);
      if (preference === false) continue;
      if (preference === null) setPreference(moduleId, true);

      try {
        const ok = await loader.setVisible(module, true, {
          source: 'default-site-module:' + reason
        });

        if (!ok) continue;
        started += 1;

        const api = module.api && window[module.api];
        if (api && typeof api.show === 'function') api.show();
        if (api && typeof api.refresh === 'function') api.refresh();
      } catch (error) {
        console.warn('[Nova Core] Default module start failed', moduleId, error);
      }
    }

    console.log('[Nova Core] Default site modules started', { reason, started });
    return { started, reason };
  }

  function scheduleRetries(reason) {
    for (const delay of RETRY_DELAYS) {
      setTimeout(() => {
        startMatching(reason + ':' + delay).catch(() => {});
      }, delay);
    }
  }

  function getStatus() {
    return {
      version: VERSION,
      applied: readValue(MIGRATION_MARKER_KEY, false) === true,
      defaults: DEFAULT_ON_MODULES.slice(),
      visibilityState: readVisibilityState(),
      loaderReady: Boolean(window.NovaModuleLoader),
      matching: getRegistry()
        .filter((item) => DEFAULT_ON_MODULES.includes(item?.id) && matches(item))
        .map((item) => item.id)
    };
  }

  window.NovaDefaultModuleState = {
    version: VERSION,
    applyDefaults,
    startMatching,
    scheduleRetries,
    getStatus
  };

  const result = applyDefaults();
  console.log('[Nova Core] Default module state', result);

  startMatching('core-after-loader').catch(() => {});
  scheduleRetries('core-after-loader');
  window.addEventListener('pageshow', () => {
    startMatching('pageshow').catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) startMatching('visible').catch(() => {});
  });
})();
