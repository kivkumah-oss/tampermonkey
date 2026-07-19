// core/nova-trace.js
(function () {
  'use strict';

  if (window.NovaTraceNetwork) return;

  const VERSION = '0.5.2-prime-safe';
  const TRACE_ACTIVE_KEY = 'nova.trace.active';
  const TRACE_STARTED_AT_KEY = 'nova.trace.startedAt';
  const TRACE_PAGE_COUNT_KEY = 'nova.trace.pageCount';
  const MAX_LOGS = 650;
  const MAX_TEXT_CHARS = 240000;
  const MAX_SHAPE_DEPTH = 4;
  const MAX_KEYS = 45;
  const AUTO_RESUME_MAX_MINUTES = 30;
  const AUTO_RESUME_MAX_PAGES = 20;

  const state = {
    logs: [],
    originalFetch: window.fetch,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send,
    originalXhrSetRequestHeader: XMLHttpRequest.prototype.setRequestHeader,
    enabled: false,
    autoResumed: false,
    requestSeq: 0,
    hooksInstalled: false,
    captureResponseShapes: true
  };

  function readFlag(key) {
    try { return localStorage.getItem(key) === 'true'; }
    catch (error) { return false; }
  }

  function writeFlag(key, value) {
    try { localStorage.setItem(key, value ? 'true' : 'false'); }
    catch (error) {}
  }

  function setStore(key, value) {
    try { localStorage.setItem(key, value); }
    catch (error) {}
  }

  function getStore(key) {
    try { return localStorage.getItem(key); }
    catch (error) { return null; }
  }

  function removeStore(key) {
    try { localStorage.removeItem(key); }
    catch (error) {}
  }

  function now() {
    return new Date().toISOString();
  }

  // Prime popups run in Firefox's userscript bridge. Do not inspect their
  // cross-realm requests: Suno's own request must always win over telemetry.
  function isSunoPrimePopup() {
    try {
      const host = String(location.hostname || '').toLowerCase();
      return (host === 'suno.com' || host.endsWith('.suno.com')) &&
        new URLSearchParams(location.search || '').has('nova_suno_prime');
    } catch (_) {
      return false;
    }
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function nextId() {
    state.requestSeq += 1;
    return 'api-' + Date.now().toString(36) + '-' + state.requestSeq.toString(36);
  }

  function sessionAdd(type, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({
      module: 'api-catcher',
      type,
      summary: data && data.method && data.url ? data.method + ' ' + data.url : type,
      data: data || {}
    });
  }

  function add(type, data, options = {}) {
    if (!state.enabled && !options.always) return null;

    const entry = {
      time: now(),
      type,
      pageUrl: location.href,
      pagePath: location.pathname,
      ...data
    };

    state.logs.push(entry);
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    sessionAdd(type, entry);
    console.log('[Nova API Catcher]', type, data);
    return entry;
  }

  function safeUrl(rawUrl) {
    const fallback = cleanText(rawUrl).slice(0, 500);
    try {
      const url = new URL(String(rawUrl || ''), location.href);
      const queryKeys = [];
      const safeParams = [];
      url.searchParams.forEach((value, key) => {
        if (!queryKeys.includes(key)) queryKeys.push(key);
        safeParams.push(encodeURIComponent(key) + '=<redacted>');
      });
      const safeHref = url.origin + url.pathname + (safeParams.length ? '?' + safeParams.join('&') : '') + (url.hash ? '#<hash>' : '');
      return {
        url: safeHref,
        origin: url.origin,
        path: url.pathname,
        queryKeys,
        sameOrigin: url.origin === location.origin,
        host: url.hostname
      };
    } catch (error) {
      return { url: fallback, origin: '', path: fallback, queryKeys: [], sameOrigin: false, host: '' };
    }
  }

  function headerInfo(headers) {
    const names = [];
    const redacted = [];
    const sensitive = /^(authorization|cookie|set-cookie|x-amz-security-token|x-csrf-token|x-xsrf-token|csrf-token|x-api-key)$/i;

    function addName(name) {
      const clean = cleanText(name).toLowerCase();
      if (!clean) return;
      if (sensitive.test(clean)) {
        if (!redacted.includes(clean)) redacted.push(clean);
        return;
      }
      if (!names.includes(clean)) names.push(clean);
    }

    try {
      if (!headers) return { names, redacted };
      if (headers instanceof Headers) {
        headers.forEach((value, key) => addName(key));
      } else if (Array.isArray(headers)) {
        headers.forEach((item) => Array.isArray(item) && addName(item[0]));
      } else if (typeof headers === 'object') {
        Object.keys(headers).forEach(addName);
      }
    } catch (error) {}

    return { names: names.slice(0, 80), redacted: redacted.slice(0, 30) };
  }

  function parseHeaderString(raw) {
    const names = [];
    const redacted = [];
    const sensitive = /^(authorization|cookie|set-cookie|x-amz-security-token|x-csrf-token|x-xsrf-token|csrf-token|x-api-key)$/i;
    String(raw || '').split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      const name = cleanText(line.slice(0, idx)).toLowerCase();
      if (!name) return;
      if (sensitive.test(name)) {
        if (!redacted.includes(name)) redacted.push(name);
      } else if (!names.includes(name)) {
        names.push(name);
      }
    });
    return { names: names.slice(0, 80), redacted: redacted.slice(0, 30) };
  }

  function looksLike(value, type) {
    if (type === 'uuid') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (type === 'url') return /^https?:\/\//i.test(value);
    if (type === 'iso-date') return /^\d{4}-\d{2}-\d{2}T/.test(value);
    if (type === 'id') return /^[A-Za-z0-9_-]{12,}$/.test(value);
    return false;
  }

  function describeValue(value, depth = 0, seen = new WeakSet()) {
    if (value === null) return { type: 'null' };
    if (value === undefined) return { type: 'undefined' };

    const valueType = typeof value;
    if (valueType === 'string') {
      const hints = [];
      if (looksLike(value, 'uuid')) hints.push('uuid');
      if (looksLike(value, 'url')) hints.push('url');
      if (looksLike(value, 'iso-date')) hints.push('iso-date');
      if (looksLike(value, 'id')) hints.push('id-like');
      return { type: 'string', length: value.length, hints };
    }
    if (valueType === 'number') return { type: 'number', finite: Number.isFinite(value) };
    if (valueType === 'boolean') return { type: 'boolean' };
    if (valueType !== 'object') return { type: valueType };

    if (seen.has(value)) return { type: 'circular' };
    seen.add(value);

    if (Array.isArray(value)) {
      const sample = value.find((item) => item !== null && item !== undefined);
      return {
        type: 'array',
        length: value.length,
        itemShape: depth >= MAX_SHAPE_DEPTH ? { type: 'max-depth' } : describeValue(sample, depth + 1, seen)
      };
    }

    const keys = Object.keys(value);
    const shape = {};
    if (depth < MAX_SHAPE_DEPTH) {
      keys.slice(0, MAX_KEYS).forEach((key) => {
        shape[key] = describeValue(value[key], depth + 1, seen);
      });
    }

    return {
      type: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, MAX_KEYS),
      truncatedKeys: keys.length > MAX_KEYS,
      shape: depth >= MAX_SHAPE_DEPTH ? { note: 'max-depth' } : shape
    };
  }

  function jsonShapeFromText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { captured: true, bodyType: 'empty', textLength: 0 };
    if (!/^[\[{]/.test(trimmed)) {
      return {
        captured: true,
        bodyType: 'text',
        textLength: trimmed.length,
        lineCount: trimmed.split(/\r?\n/).length
      };
    }

    try {
      const parsed = JSON.parse(trimmed);
      return {
        captured: true,
        bodyType: 'json',
        textLength: trimmed.length,
        topLevel: Array.isArray(parsed) ? 'array' : typeof parsed,
        shape: describeValue(parsed)
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

  function requestBodyShape(body) {
    if (body === undefined || body === null) return null;
    try {
      if (typeof body === 'string') return { source: 'string', ...jsonShapeFromText(body) };
      if (body instanceof URLSearchParams) return { source: 'urlsearchparams', keys: Array.from(body.keys()).slice(0, MAX_KEYS) };
      if (typeof FormData !== 'undefined' && body instanceof FormData) return { source: 'formdata', keys: Array.from(body.keys()).slice(0, MAX_KEYS) };
      if (typeof Blob !== 'undefined' && body instanceof Blob) return { source: 'blob', size: body.size, mimeType: body.type || '' };
      if (body instanceof ArrayBuffer) return { source: 'arraybuffer', byteLength: body.byteLength };
      if (typeof body === 'object') return { source: 'object', shape: describeValue(body) };
    } catch (error) {
      return { source: 'unknown', error: error.message };
    }
    return { source: typeof body };
  }

  function requestInfo(source, input, init = {}) {
    let rawUrl = '';
    let method = 'GET';
    let inputHeaders = { names: [], redacted: [] };
    let initHeaders = { names: [], redacted: [] };

    try {
      rawUrl = typeof input === 'string' ? input : input && input.url ? input.url : '';
      method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      inputHeaders = input && input.headers ? headerInfo(input.headers) : inputHeaders;
      initHeaders = headerInfo(init && init.headers);
    } catch (_) {
      // Firefox can deny property reads for Request objects crossing realms.
    }

    const url = safeUrl(rawUrl);
    const headerNames = Array.from(new Set([...(inputHeaders.names || []), ...(initHeaders.names || [])]));
    const redactedHeaderNames = Array.from(new Set([...(inputHeaders.redacted || []), ...(initHeaders.redacted || [])]));

    return {
      id: nextId(),
      source,
      method,
      url: url.url,
      origin: url.origin,
      host: url.host,
      path: url.path,
      queryKeys: url.queryKeys,
      sameOrigin: url.sameOrigin,
      requestHeaders: headerNames,
      redactedRequestHeaders: redactedHeaderNames,
      requestBody: requestBodyShape(init && init.body)
    };
  }

  function shouldCaptureResponse(contentType, contentLength) {
    if (!state.enabled) return { ok: false, reason: 'catcher-idle' };
    if (!state.captureResponseShapes) return { ok: false, reason: 'disabled' };
    if (Number.isFinite(contentLength) && contentLength > MAX_TEXT_CHARS) return { ok: false, reason: 'too-large', contentLength };
    const type = String(contentType || '').toLowerCase();
    if (!type) return { ok: true, reason: 'unknown-content-type' };
    if (/json|text|javascript|graphql|x-www-form-urlencoded/.test(type)) return { ok: true, reason: 'text-like' };
    return { ok: false, reason: 'non-text-content-type', contentType };
  }

  async function captureFetchResponseShape(response) {
    try {
      const contentType = response.headers && response.headers.get ? response.headers.get('content-type') || '' : '';
      const lengthRaw = response.headers && response.headers.get ? response.headers.get('content-length') : null;
      const contentLength = lengthRaw ? Number(lengthRaw) : null;
      const decision = shouldCaptureResponse(contentType, contentLength);
      if (!decision.ok) return { captured: false, ...decision };
      const text = await response.clone().text();
      if (!state.enabled) return { captured: false, reason: 'catcher-stopped-during-read' };
      if (text.length > MAX_TEXT_CHARS) return { captured: false, reason: 'too-large-after-read', textLength: text.length };
      return { contentType, ...jsonShapeFromText(text) };
    } catch (error) {
      return { captured: false, reason: 'capture-error', error: error.message };
    }
  }

  function captureXhrResponseShape(xhr, contentType) {
    try {
      if (!state.enabled) return { captured: false, reason: 'catcher-idle' };
      if (xhr.responseType && xhr.responseType !== 'text') {
        return { captured: false, reason: 'xhr-responseType-' + xhr.responseType };
      }
      const text = xhr.responseText || '';
      if (text.length > MAX_TEXT_CHARS) return { captured: false, reason: 'too-large', textLength: text.length };
      const decision = shouldCaptureResponse(contentType, text.length || null);
      if (!decision.ok) return { captured: false, ...decision };
      return { contentType, ...jsonShapeFromText(text) };
    } catch (error) {
      return { captured: false, reason: 'capture-error', error: error.message };
    }
  }

  function hookFetch() {
    if (!window.fetch || window.fetch.__novaApiCatcherHooked) return;

    window.fetch = async function novaApiCatcherFetch(input, init = {}) {
      if (!state.enabled || isSunoPrimePopup()) return state.originalFetch.apply(this, arguments);

      let info;
      try {
        info = requestInfo('fetch', input, init || {});
      } catch (_) {
        // Observation is optional. A page request must still be sent.
        return state.originalFetch.apply(this, arguments);
      }
      const started = performance.now();

      add('api-request', info);

      try {
        const response = await state.originalFetch.apply(this, arguments);
        const base = {
          ...info,
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          responseType: response.type,
          durationMs: Math.round(performance.now() - started),
          responseHeaders: headerInfo(response.headers)
        };

        if (state.enabled && state.captureResponseShapes) {
          captureFetchResponseShape(response).then((shape) => {
            if (state.enabled) add('api-response', { ...base, response: shape });
          });
        } else {
          add('api-response', { ...base, response: { captured: false, reason: state.enabled ? 'disabled' : 'catcher-idle' } });
        }

        return response;
      } catch (error) {
        add('api-error', { ...info, error: error.message || String(error), durationMs: Math.round(performance.now() - started) });
        throw error;
      }
    };

    window.fetch.__novaApiCatcherHooked = true;
  }

  function hookXhr() {
    if (XMLHttpRequest.prototype.open.__novaApiCatcherHooked) return;

    XMLHttpRequest.prototype.open = function novaApiCatcherXhrOpen(method, url) {
      if (!state.enabled || isSunoPrimePopup()) {
        this.__novaApiCatcher = null;
        return state.originalXhrOpen.apply(this, arguments);
      }

      const safe = safeUrl(url);
      this.__novaApiCatcher = {
        id: nextId(),
        source: 'xhr',
        method: String(method || 'GET').toUpperCase(),
        url: safe.url,
        origin: safe.origin,
        host: safe.host,
        path: safe.path,
        queryKeys: safe.queryKeys,
        sameOrigin: safe.sameOrigin,
        requestHeaders: [],
        redactedRequestHeaders: [],
        requestBody: null,
        started: 0
      };
      return state.originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.open.__novaApiCatcherHooked = true;

    XMLHttpRequest.prototype.setRequestHeader = function novaApiCatcherXhrSetRequestHeader(name, value) {
      const trace = this.__novaApiCatcher;
      if (trace) {
        const info = headerInfo({ [name]: value });
        trace.requestHeaders = Array.from(new Set([...(trace.requestHeaders || []), ...info.names]));
        trace.redactedRequestHeaders = Array.from(new Set([...(trace.redactedRequestHeaders || []), ...info.redacted]));
      }
      return state.originalXhrSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function novaApiCatcherXhrSend(body) {
      if (!state.enabled || isSunoPrimePopup()) return state.originalXhrSend.apply(this, arguments);

      const trace = this.__novaApiCatcher || requestInfo('xhr', 'unknown', {});
      trace.started = performance.now();
      trace.requestBody = requestBodyShape(body);

      add('api-request', trace);

      this.addEventListener('loadend', () => {
        if (!state.enabled) return;
        const contentType = this.getResponseHeader ? this.getResponseHeader('content-type') || '' : '';
        add('api-response', {
          ...trace,
          status: this.status,
          ok: this.status >= 200 && this.status < 300,
          durationMs: Math.round(performance.now() - trace.started),
          responseHeaders: parseHeaderString(this.getAllResponseHeaders ? this.getAllResponseHeaders() : ''),
          response: captureXhrResponseShape(this, contentType)
        });
      });

      return state.originalXhrSend.apply(this, arguments);
    };
  }

  function installHooks() {
    if (state.hooksInstalled) return;
    hookFetch();
    hookXhr();
    state.hooksInstalled = true;
  }

  function incrementPageCount() {
    const current = Number(getStore(TRACE_PAGE_COUNT_KEY) || '0');
    const next = current + 1;
    setStore(TRACE_PAGE_COUNT_KEY, String(next));
    return next;
  }

  function clearPersistedTrace(reason) {
    writeFlag(TRACE_ACTIVE_KEY, false);
    removeStore(TRACE_STARTED_AT_KEY);
    removeStore(TRACE_PAGE_COUNT_KEY);
    console.log('[Nova API Catcher] Auto-resume disabled:', reason);
  }

  function shouldAutoResume() {
    if (!readFlag(TRACE_ACTIVE_KEY)) return false;

    const startedRaw = getStore(TRACE_STARTED_AT_KEY);
    const startedAt = Date.parse(startedRaw || '');
    if (!Number.isFinite(startedAt)) {
      clearPersistedTrace('missing start time');
      return false;
    }

    const ageMs = Date.now() - startedAt;
    if (ageMs > AUTO_RESUME_MAX_MINUTES * 60 * 1000) {
      clearPersistedTrace('expired after ' + AUTO_RESUME_MAX_MINUTES + ' minutes');
      return false;
    }

    const pages = Number(getStore(TRACE_PAGE_COUNT_KEY) || '0');
    if (pages >= AUTO_RESUME_MAX_PAGES) {
      clearPersistedTrace('page limit reached');
      return false;
    }

    return true;
  }

  function enable(options = {}) {
    if (window.NovaSession && !window.NovaSession.isActive()) {
      if (typeof window.NovaSession.resume === 'function') window.NovaSession.resume();
      if (!window.NovaSession.isActive() && typeof window.NovaSession.start === 'function') {
        window.NovaSession.start({ name: options.sessionName || 'Nova API Catcher Session' });
      }
    }

    state.enabled = true;
    installHooks();

    if (!options.autoResume) {
      writeFlag(TRACE_ACTIVE_KEY, true);
      setStore(TRACE_STARTED_AT_KEY, now());
      setStore(TRACE_PAGE_COUNT_KEY, '1');
      add('catcher-start', { mode: 'manual', url: location.href }, { always: true });
    } else {
      const pages = incrementPageCount();
      add('catcher-resume', { mode: 'auto', url: location.href, pages }, { always: true });
    }
  }

  function endpointKey(entry) {
    return [entry.method || 'GET', entry.origin || '', entry.path || entry.url || ''].join(' ');
  }

  function buildApiMap() {
    const endpoints = new Map();
    const responses = state.logs.filter((entry) => entry.type === 'api-response');

    responses.forEach((entry) => {
      const key = endpointKey(entry);
      if (!endpoints.has(key)) {
        endpoints.set(key, {
          key,
          method: entry.method,
          origin: entry.origin,
          host: entry.host,
          path: entry.path,
          count: 0,
          statuses: {},
          queryKeys: [],
          requestBodyShapes: [],
          responseExamples: [],
          firstSeen: entry.time,
          lastSeen: entry.time
        });
      }

      const item = endpoints.get(key);
      item.count += 1;
      item.lastSeen = entry.time;
      item.statuses[String(entry.status || 'unknown')] = (item.statuses[String(entry.status || 'unknown')] || 0) + 1;
      (entry.queryKeys || []).forEach((k) => { if (!item.queryKeys.includes(k)) item.queryKeys.push(k); });
      if (entry.requestBody && item.requestBodyShapes.length < 3) item.requestBodyShapes.push(entry.requestBody);
      if (entry.response && item.responseExamples.length < 3) {
        item.responseExamples.push({ status: entry.status, durationMs: entry.durationMs, response: entry.response });
      }
    });

    return Array.from(endpoints.values()).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function buildExport(options = {}) {
    const logs = options.recent ? state.logs.slice(-Number(options.recent)) : state.logs.slice();
    return {
      tool: 'Nova API Catcher',
      version: VERSION,
      exportedAt: now(),
      note: 'Safe metadata only. URL query values, headers values, cookies, auth tokens and raw response bodies are not collected. JSON response bodies are reduced to key/type/shape metadata.',
      page: {
        url: location.href,
        host: location.hostname,
        title: document.title,
        readyState: document.readyState
      },
      status: api.getStatus(),
      apiMap: buildApiMap(),
      logs,
      guide: {
        workflow: [
          'Press Start Trace / API Catcher.',
          'Do one page action: refresh, scroll, click, search, or open a panel.',
          'Press Copy Trace / API Map.',
          'Paste this JSON into chat and ask which endpoint powered the action.'
        ],
        usefulFor: [
          'Finding pagination/cursor endpoints.',
          'Finding request/response field names without exposing values.',
          'Comparing before/after API calls for a page action.',
          'Building Tampermonkey tools from real endpoints.'
        ]
      }
    };
  }

  const api = {
    version: VERSION,

    start(options = {}) {
      enable(options);
      console.log('[Nova API Catcher] Started');
    },

    stop(options = {}) {
      add('catcher-stop', { url: location.href, count: state.logs.length });
      state.enabled = false;
      writeFlag(TRACE_ACTIVE_KEY, false);
      if (options.stopSession && window.NovaSession && typeof window.NovaSession.stop === 'function') window.NovaSession.stop();
      console.log('[Nova API Catcher] Stopped');
    },

    clear() {
      state.logs = [];
      state.requestSeq = 0;
      removeStore(TRACE_STARTED_AT_KEY);
      removeStore(TRACE_PAGE_COUNT_KEY);
      add('catcher-clear', { url: location.href }, { always: true });
      console.log('[Nova API Catcher] Cleared');
    },

    mark(label) {
      const text = cleanText(label || (typeof prompt === 'function' ? prompt('Nova API mark label?', 'manual mark') : 'manual mark')) || 'manual mark';
      return add('api-mark', { label: text, url: location.href }, { always: true });
    },

    isActive() {
      return state.enabled;
    },

    getStatus() {
      return {
        enabled: state.enabled,
        persisted: readFlag(TRACE_ACTIVE_KEY),
        autoResumed: state.autoResumed,
        startedAt: getStore(TRACE_STARTED_AT_KEY),
        pageCount: Number(getStore(TRACE_PAGE_COUNT_KEY) || '0'),
        autoResumeMaxMinutes: AUTO_RESUME_MAX_MINUTES,
        autoResumeMaxPages: AUTO_RESUME_MAX_PAGES,
        localEvents: state.logs.length,
        responseShapes: state.captureResponseShapes,
        maxLogs: MAX_LOGS,
        maxTextChars: MAX_TEXT_CHARS
      };
    },

    getLogs() {
      return state.logs.slice();
    },

    getApiMap() {
      return buildApiMap();
    },

    setResponseShapes(enabled) {
      state.captureResponseShapes = Boolean(enabled);
      return state.captureResponseShapes;
    },

    export(options = {}) {
      return buildExport(options);
    },

    copy(options = {}) {
      const payload = buildExport(options);
      copyText(JSON.stringify(payload, null, 2));
      return payload;
    },

    copyApiMap() {
      return this.copy({ apiMapOnly: true });
    },

    copyRecent(count = 80) {
      return this.copy({ recent: count });
    }
  };

  window.NovaTraceNetwork = api;
  window.NovaApiCatcher = api;

  installHooks();

  if (shouldAutoResume()) {
    state.autoResumed = true;
    setTimeout(() => {
      if (!state.enabled) {
        enable({ autoResume: true, sessionName: 'Nova API Catcher Session' });
        console.log('[Nova API Catcher] Auto-resumed');
      }
    }, 0);
  }

  console.log('[Nova API Catcher] Loaded. Use NovaTraceNetwork.start().');
})();
