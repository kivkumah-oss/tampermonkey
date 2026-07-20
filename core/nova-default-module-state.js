// core/nova-default-module-state.js
(function () {
  'use strict';

  if (window.NovaDefaultModuleState) return;

  const VERSION = '2.1.0';
  const VISIBILITY_STATE_KEY = 'nova.modules.visibility.v1';
  const MIGRATION_MARKER_KEY = 'nova.modules.autoload-defaults.v1.applied';
  const RETRY_DELAYS = [0, 250, 1000, 3000, 8000];
  const FETCH_BRIDGE_FLAG = '__novaAbsoluteUrlFetchBridge';

  function installFetchBridge() {
    const currentFetch = globalThis.fetch;
    if (typeof currentFetch !== 'function') return false;
    if (currentFetch[FETCH_BRIDGE_FLAG] === true) return true;

    const nativeFetch = currentFetch.bind(globalThis);
    const bridgedFetch = function novaAbsoluteUrlFetch(input, init) {
      let resolvedInput = input;

      if (typeof input === 'string') {
        resolvedInput = new URL(input, location.href).href;
      } else if (input instanceof URL) {
        resolvedInput = input.href;
      }

      return nativeFetch(resolvedInput, init);
    };

    try {
      Object.defineProperty(bridgedFetch, FETCH_BRIDGE_FLAG, {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false
      });
    } catch (_) {
      bridgedFetch[FETCH_BRIDGE_FLAG] = true;
    }

    try {
      globalThis.fetch = bridgedFetch;
    } catch (_) {
      try {
        Object.defineProperty(globalThis, 'fetch', {
          value: bridgedFetch,
          configurable: true,
          writable: true
        });
      } catch (error) {
        console.warn('[Nova Core] Could not install absolute URL fetch bridge', error);
        return false;
      }
    }

    console.log('[Nova Core] Absolute URL fetch bridge installed');
    return true;
  }

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

  function writePreference(moduleId, visible) {
    const state = readVisibilityState();
    state[moduleId] = Boolean(visible);
    return writeValue(VISIBILITY_STATE_KEY, state);
  }

  function registry() {
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

    try {
      const raw = document.documentElement?.getAttribute('data-nova-manifest');
      const manifest = raw && JSON.parse(raw);
      if (manifest && Array.isArray(manifest.modules)) {
        return manifest.modules.map((item) => ({ ...item, core: false }));
      }
    } catch (_) {}

    return [];
  }

  function autoloadModules() {
    return registry().filter((module) =>
      module &&
      !module.core &&
      module.enabled !== false &&
      module.autoload === true
    );
  }

  function applyDefaults() {
    const alreadyApplied = readValue(MIGRATION_MARKER_KEY, false) === true;
    if (alreadyApplied) {
      return {
        applied: false,
        reason: 'already-applied',
        state: readVisibilityState()
      };
    }

    const state = readVisibilityState();
    const modules = autoloadModules();

    // Reset the broken legacy state once. From this point onward, Hide/Launch
    // controls are respected because this migration never runs again.
    for (const module of modules) state[module.id] = true;

    const saved = writeValue(VISIBILITY_STATE_KEY, state);
    if (saved) writeValue(MIGRATION_MARKER_KEY, true);

    return {
      applied: saved,
      reason: saved ? 'autoload-defaults-enabled' : 'storage-unavailable',
      modules: modules.map((module) => module.id),
      state
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

  function moduleApi(module) {
    try {
      return module && module.api ? window[module.api] : null;
    } catch (_) {
      return null;
    }
  }

  function getModuleStatus(api) {
    try {
      if (api && typeof api.getStatus === 'function') {
        const status = api.getStatus();
        return status && typeof status === 'object' ? status : null;
      }
    } catch (_) {}
    return null;
  }

  function showModule(module) {
    const api = moduleApi(module);
    if (!api) return false;

    const status = getModuleStatus(api);
    if (status && (status.visible === true || status.active === true)) {
      return true;
    }

    try {
      if (typeof api.show === 'function') {
        api.show();
        return true;
      }

      if (typeof api.refresh === 'function') {
        api.refresh();
        return true;
      }

      return true;
    } catch (error) {
      console.warn('[Nova Core] Autoload show failed', module.id, error);
      return false;
    }
  }

  function dispatchLaunch(moduleId, reason) {
    try {
      document.dispatchEvent(new CustomEvent('nova-module-command', {
        detail: {
          action: 'launch',
          id: moduleId,
          source: 'nova-autostart:' + reason
        }
      }));
      return true;
    } catch (error) {
      console.warn('[Nova Core] Autoload launch dispatch failed', moduleId, error);
      return false;
    }
  }

  function ensureMatching(reason = 'boot') {
    const modules = autoloadModules();
    let matched = 0;
    let visible = 0;
    let requested = 0;
    let disabled = 0;

    for (const module of modules) {
      if (!matches(module)) continue;
      matched += 1;

      const preference = getPreference(module.id);
      if (preference === false) {
        disabled += 1;
        continue;
      }
      if (preference === null) writePreference(module.id, true);

      if (showModule(module)) {
        visible += 1;
        continue;
      }

      if (dispatchLaunch(module.id, reason)) requested += 1;
    }

    const result = { reason, matched, visible, requested, disabled };
    console.log('[Nova Core] Autoload check', result);
    return result;
  }

  function schedule(reason = 'boot') {
    for (const delay of RETRY_DELAYS) {
      setTimeout(() => ensureMatching(reason + ':' + delay), delay);
    }
  }

  function getStatus() {
    return {
      version: VERSION,
      fetchBridge: globalThis.fetch?.[FETCH_BRIDGE_FLAG] === true,
      visibilityState: readVisibilityState(),
      matching: autoloadModules()
        .filter(matches)
        .map((module) => ({
          id: module.id,
          api: module.api,
          apiReady: Boolean(moduleApi(module)),
          preference: getPreference(module.id)
        }))
    };
  }

  window.NovaDefaultModuleState = {
    version: VERSION,
    applyDefaults,
    ensureMatching,
    schedule,
    installFetchBridge,
    getStatus
  };

  installFetchBridge();
  console.log('[Nova Core] Autoload defaults', applyDefaults());

  document.addEventListener('nova-module-command-result', (event) => {
    const detail = event && event.detail;
    if (!detail || detail.action !== 'launch' || !detail.ok) return;

    const module = autoloadModules().find((item) => item.id === detail.id);
    if (module) showModule(module);
  });

  ensureMatching('core-ready');
  schedule('core-ready');

  window.addEventListener('pageshow', () => schedule('pageshow'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule('visible');
  });
})();
