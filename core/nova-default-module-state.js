// core/nova-default-module-state.js
(function () {
  'use strict';

  if (window.NovaDefaultModuleState) return;

  const VERSION = '1.0.0';
  const VISIBILITY_STATE_KEY = 'nova.modules.visibility.v1';
  const MIGRATION_MARKER_KEY = 'nova.modules.defaults.hero-pops.v1.applied';
  const DEFAULT_ON_MODULES = [
    'nova-hero-intelligence',
    'nova-pops-modern-ui'
  ];

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

  function applyDefaults(options = {}) {
    const force = options.force === true;
    const alreadyApplied = readValue(MIGRATION_MARKER_KEY, false) === true;

    if (alreadyApplied && !force) {
      return {
        applied: false,
        reason: 'already-applied',
        defaults: DEFAULT_ON_MODULES.slice()
      };
    }

    const current = readValue(VISIBILITY_STATE_KEY, {});
    const next = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...current }
      : {};

    for (const moduleId of DEFAULT_ON_MODULES) {
      next[moduleId] = true;
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

  function getStatus() {
    return {
      version: VERSION,
      applied: readValue(MIGRATION_MARKER_KEY, false) === true,
      defaults: DEFAULT_ON_MODULES.slice(),
      visibilityState: readValue(VISIBILITY_STATE_KEY, {})
    };
  }

  window.NovaDefaultModuleState = {
    version: VERSION,
    applyDefaults,
    getStatus
  };

  const result = applyDefaults();
  console.log('[Nova Core] Default module state', result);
})();
