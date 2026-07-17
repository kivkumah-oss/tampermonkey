// core/nova-api-body-catcher.js
(function () {
  'use strict';

  if (window.NovaApiBodyCatcher) return;

  const VERSION = '0.2.0-sandbox-safe';
  const MAX_TEXT_CHARS = 120000;
  const MAX_KEYS = 50;
  const MAX_DEPTH = 4;
  const MAX_LOGS = 240;

  const state = {
    captures: [],
    originalFetch: typeof window.fetch === 'function' ? window.fetch : null,
    hooked: false,
    hookBlocked: false,
    hookError: '',
    originalTraceExport: null,
    originalTraceCopy: null,
    originalTraceGetStatus: null,
    patchedTrace: false
  };

  function active() {
    try {
      if (window.NovaTraceNetwork && typeof window.NovaTraceNetwork.isActive === 'function') {
        return window.NovaTraceNetwork.isActive();
      }
      return localStorage.getItem('nova.trace.active') === 'true';
    } catch (_) {
      return false;
    }
  }

  function now() {
    return new Date().toISOString();
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function safeUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ''), location.href);
      const queryKeys = [];
      const safeParams = [];
      url.searchParams.forEach((_value, key) => {
        if (!queryKeys.includes(key)) queryKeys.push(key);
        safeParams.push(encodeURIComponent(key) + '=<redacted>');
      });
      return {
        url: url.origin + url.pathname + (safeParams.length ? '?' + safeParams.join('&') : '') + (url.hash ? '#<hash>' : ''),
        origin: url.origin,
        host: url.hostname,
        path: url.pathname,
        queryKeys
      };
    } catch (_) {
      const fallback = clean(rawUrl).slice(0, 500);
      return { url: fallback, origin: '', host: '', path: fallback, queryKeys: [] };
    }
  }

  function describe(value, depth = 0, seen = new WeakSet()) {
    if (value === null) return { type: 'null' };
    if (value === undefined) return { type: 'undefined' };

    const type = typeof value;
    if (type === 'string') return { type: 'string', length: value.length };
    if (type === 'number') return { type: 'number', finite: Number.isFinite(value) };
    if (type === 'boolean') return { type: 'boolean' };
    if (type !== 'object') return { type };

    if (seen.has(value)) return { type: 'circular' };
    seen.add(value);

    if (Array.isArray(value)) {
      const sample = value.find((item) => item !== null && item !== undefined);
      return {
        type: 'array',
        length: value.length,
        itemShape: depth >= MAX_DEPTH ? { type: 'max-depth' } : describe(sample, depth + 1, seen)
      };
    }

    const keys = Object.keys(value);
    const shape = {};
    if (depth < MAX_DEPTH) {
      keys.slice(0, MAX_KEYS).forEach((key) => {
        shape[key] = describe(value[key], depth + 1, seen);
      });
    }

    return {
      type: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, MAX_KEYS),
      truncatedKeys: keys.length > MAX_KEYS,
      shape: depth >= MAX_DEPTH ? { note: 'max-depth' } : shape
    };
  }

  function jsonShapeFromText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { captured: true, bodyType: 'empty', textLength: 0 };
    if (trimmed.length > MAX_TEXT_CHARS) {
      return { captured: false, reason: 'too-large', textLength: trimmed.length };
    }
    if (!/^[\[{]/.test(trimmed)) {
      return { captured: true, bodyType: 'text', textLength: trimmed.length };
    }
    try {
      const parsed = JSON.parse(trimmed);
      return {
        captured: true,
        bodyType: 'json',
        textLength: trimmed.length,
        topLevel: Array.isArray(parsed) ? 'array' : typeof parsed,
        shape: describe(parsed)
      };
    } catch (error) {
      return {
        captured: true,
        bodyType: 'json-parse-failed',
        textLength: trimmed.length,
        error: error.message
      };
    }
  }

  function syncBodyShape(body) {
    if (body === undefined || body === null) return null;
    try {
      if (typeof body === 'string') return { source: 'init.body.string', ...jsonShapeFromText(body) };
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        return { source: 'init.body.urlsearchparams', keys: Array.from(body.keys()).slice(0, MAX_KEYS) };
      }
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        return { source: 'init.body.formdata', keys: Array.from(body.keys()).slice(0, MAX_KEYS) };
      }
      if (typeof Blob !== 'undefined' && body instanceof Blob) {
        return { source: 'init.body.blob', size: body.size, mimeType: body.type || '' };
      }
      if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
        return { source: 'init.body.arraybuffer', byteLength: body.byteLength };
      }
      if (typeof body === 'object') return { source: 'init.body.object', shape: describe(body) };
    } catch (error) {
      return { source: 'init.body.unknown', captured: false, error: error.message };
    }
    return { source: 'init.body.' + typeof body };
  }

  async function fetchBodyShape(input, init = {}) {
    if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
      return syncBodyShape(init.body);
    }

    try {
      if (typeof Request !== 'undefined' && input instanceof Request) {
        const method = String(init.method || input.method || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD') return null;
        if (input.bodyUsed) return { source: 'request.clone', captured: false, reason: 'body-used' };
        const clone = input.clone();
        const contentType = clone.headers && clone.headers.get ? clone.headers.get('content-type') || '' : '';
        const text = await clone.text();
        return { source: 'request.clone.text', contentType, ...jsonShapeFromText(text) };
      }
    } catch (error) {
      return { source: 'request.clone', captured: false, reason: 'clone-error', error: error.message };
    }

    return null;
  }

  function requestMeta(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input && input.url ? input.url : String(input || '');
    const url = safeUrl(rawUrl);
    return {
      method: String(init.method || (input && input.method) || 'GET').toUpperCase(),
      url: url.url,
      origin: url.origin,
      host: url.host,
      path: url.path,
      queryKeys: url.queryKeys
    };
  }

  function addCapture(meta, requestBody) {
    if (!requestBody) return null;
    const capture = {
      time: now(),
      pageUrl: location.href,
      pagePath: location.pathname,
      ...meta,
      requestBody
    };
    state.captures.push(capture);
    if (state.captures.length > MAX_LOGS) {
      state.captures.splice(0, state.captures.length - MAX_LOGS);
    }
    return capture;
  }

  function hookFetch() {
    if (state.hooked || state.hookBlocked) return state.hooked;
    if (typeof window.fetch !== 'function') return false;
    if (window.fetch.__novaApiBodyCatcherHooked) {
      state.hooked = true;
      return true;
    }

    const original = window.fetch;
    const wrapped = async function novaApiBodyCatcherFetch(input, init = {}) {
      if (active()) {
        const meta = requestMeta(input, init || {});
        fetchBodyShape(input, init || {}).then((shape) => addCapture(meta, shape));
      }
      return original.apply(this, arguments);
    };

    try {
      wrapped.__novaApiBodyCatcherHooked = true;
      window.fetch = wrapped;
      if (window.fetch !== wrapped) {
        throw new Error('fetch replacement was not accepted by the userscript sandbox');
      }
      state.originalFetch = original;
      state.hooked = true;
      state.hookError = '';
      return true;
    } catch (error) {
      state.hooked = false;
      state.hookBlocked = true;
      state.hookError = String(error && error.message || error);
      console.warn('[Nova API Body Catcher] Fetch hook unavailable; continuing without it:', state.hookError);
      return false;
    }
  }

  function mergeIntoApiMap(payload) {
    if (!payload || !Array.isArray(payload.apiMap)) return payload;
    payload.apiMap.forEach((endpoint) => {
      const matches = state.captures.filter((capture) =>
        capture.method === endpoint.method &&
        capture.origin === endpoint.origin &&
        capture.path === endpoint.path
      );
      if (matches.length) {
        endpoint.requestBodyShapes = endpoint.requestBodyShapes || [];
        matches.slice(0, 3).forEach((match) => endpoint.requestBodyShapes.push(match.requestBody));
        endpoint.requestBodyCaptureCount = matches.length;
      }
    });
    return payload;
  }

  function decoratePayload(payload) {
    const decorated = payload || {};
    mergeIntoApiMap(decorated);
    decorated.bodyCatcher = {
      tool: 'Nova API Body Catcher',
      version: VERSION,
      note: 'Safe request body shape only. Raw body values are not exported.',
      captureCount: state.captures.length,
      hookAvailable: state.hooked,
      hookBlocked: state.hookBlocked,
      hookError: state.hookError,
      captures: state.captures.slice()
    };
    if (decorated.status) decorated.status.requestBodyCaptures = state.captures.length;
    return decorated;
  }

  function patchTraceApi() {
    const trace = window.NovaTraceNetwork || window.NovaApiCatcher;
    if (!trace || trace.__novaApiBodyCatcherPatched) return false;

    try {
      state.originalTraceExport = typeof trace.export === 'function' ? trace.export.bind(trace) : null;
      state.originalTraceCopy = typeof trace.copy === 'function' ? trace.copy.bind(trace) : null;
      state.originalTraceGetStatus = typeof trace.getStatus === 'function' ? trace.getStatus.bind(trace) : null;

      trace.export = function novaBodyDecoratedExport(options = {}) {
        const payload = state.originalTraceExport ? state.originalTraceExport(options) : { tool: 'Nova API Catcher', logs: [] };
        return decoratePayload(payload);
      };

      trace.getStatus = function novaBodyDecoratedStatus() {
        const status = state.originalTraceGetStatus ? state.originalTraceGetStatus() : {};
        return {
          ...status,
          requestBodyCaptures: state.captures.length,
          requestBodyHookAvailable: state.hooked,
          requestBodyHookError: state.hookError
        };
      };

      trace.getRequestBodyCaptures = () => state.captures.slice();
      trace.clearRequestBodyCaptures = () => { state.captures = []; };
      trace.__novaApiBodyCatcherPatched = true;
      state.patchedTrace = true;
      return true;
    } catch (error) {
      console.warn('[Nova API Body Catcher] Trace decoration unavailable; continuing:', error);
      return false;
    }
  }

  function clear() {
    state.captures = [];
  }

  function init() {
    hookFetch();
    patchTraceApi();
    setInterval(() => {
      if (!state.hooked && !state.hookBlocked) hookFetch();
      if (!state.patchedTrace) patchTraceApi();
    }, 1500);
    console.log('[Nova API Body Catcher] Loaded', VERSION, state.hooked ? '(fetch hooked)' : '(degraded mode)');
  }

  window.NovaApiBodyCatcher = {
    version: VERSION,
    init,
    clear,
    getCaptures: () => state.captures.slice(),
    decoratePayload,
    getStatus: () => ({
      hooked: state.hooked,
      hookBlocked: state.hookBlocked,
      hookError: state.hookError,
      patchedTrace: state.patchedTrace,
      captureCount: state.captures.length
    })
  };

  init();
})();
