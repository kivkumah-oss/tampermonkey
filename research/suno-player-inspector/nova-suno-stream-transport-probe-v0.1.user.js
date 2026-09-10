// ==UserScript==
// @name         Nova Suno Stream Transport Probe
// @namespace    nova.research.suno
// @version      0.1.0
// @description  Manual-arm passive Suno audio transport probe. Traces target audio fetches, response body access, stream reader chunk sizes, and timing without consuming or replaying requests.
// @author       Martin + Nova
// @match        https://suno.com/*
// @match        https://*.suno.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.1.0';
  const START = performance.now();
  const TOP = window.top === window.self;
  const UI_ID = 'nova-suno-stream-transport-probe';
  const MAX_EVENTS = 5000;

  const state = {
    armed: false,
    seq: 0,
    events: [],
    stats: null,
    ui: null,
    originals: {},
    responseMeta: new WeakMap(),
    streamMeta: new WeakMap(),
    readerMeta: new WeakMap(),
    fetches: new Map()
  };

  const nowMs = () => Math.round(performance.now() - START);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function safeUrl(input) {
    try {
      const u = new URL(String(input || ''), location.href);
      return {
        full: u.origin + u.pathname,
        origin: u.origin,
        host: u.hostname,
        path: u.pathname,
        queryKeys: [...u.searchParams.keys()]
      };
    } catch (_) {
      const raw = clean(input).slice(0, 300);
      return { full: raw, origin: '', host: '', path: raw, queryKeys: [] };
    }
  }

  function isTarget(url) {
    const u = safeUrl(url);
    return (
      (/cloudfront\.net$/i.test(u.host) && /\/clip\//i.test(u.path)) ||
      /\/clip\/.*\.(m4a|mp4|mp3|webm|ogg)$/i.test(u.path) ||
      /audio/i.test(u.path)
    );
  }

  function stackShort() {
    try {
      return String(new Error().stack || '')
        .split('\n')
        .slice(2, 8)
        .map(x => clean(x).slice(0, 220));
    } catch (_) { return []; }
  }

  function add(type, data = {}) {
    const e = { n: ++state.seq, at: new Date().toISOString(), ms: nowMs(), type, topFrame: TOP, ...data };
    state.events.push(e);
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    updateStats();
    return e;
  }

  function byteLength(value) {
    try {
      if (value == null) return null;
      if (typeof value.byteLength === 'number') return value.byteLength;
      if (typeof value.length === 'number') return value.length;
      if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
    } catch (_) {}
    return null;
  }

  function getHeader(headers, name) {
    try {
      if (!headers) return '';
      if (headers instanceof Headers) return headers.get(name) || '';
      const h = new Headers(headers);
      return h.get(name) || '';
    } catch (_) { return ''; }
  }

  function requestSafeHeaders(input, init) {
    let range = '', accept = '';
    try {
      if (init && init.headers) {
        range = getHeader(init.headers, 'range');
        accept = getHeader(init.headers, 'accept');
      }
      if ((!range || !accept) && input && typeof input === 'object' && input.headers) {
        if (!range) range = input.headers.get('range') || '';
        if (!accept) accept = input.headers.get('accept') || '';
      }
    } catch (_) {}
    return { range: clean(range).slice(0,120), accept: clean(accept).slice(0,160) };
  }

  function responseSafeHeaders(r) {
    const h = r && r.headers;
    return {
      contentType: getHeader(h, 'content-type'),
      contentLength: getHeader(h, 'content-length'),
      acceptRanges: getHeader(h, 'accept-ranges'),
      contentRange: getHeader(h, 'content-range'),
      cacheControl: getHeader(h, 'cache-control')
    };
  }

  function metaForResponse(r) {
    try { return state.responseMeta.get(r) || null; } catch (_) { return null; }
  }

  function tagResponse(r, meta) {
    try { if (r && meta) state.responseMeta.set(r, meta); } catch (_) {}
  }

  function tagStream(stream, meta) {
    try { if (stream && meta) state.streamMeta.set(stream, meta); } catch (_) {}
  }

  function tagReader(reader, meta) {
    try {
      if (reader && meta) state.readerMeta.set(reader, { ...meta, readN: 0, totalBytes: 0 });
    } catch (_) {}
  }

  function wrapResponseMethod(name) {
    try {
      const proto = Response && Response.prototype;
      const original = proto && proto[name];
      if (typeof original !== 'function') return;
      state.originals['Response.' + name] = original;
      proto[name] = function () {
        const meta = metaForResponse(this);
        if (!meta) return original.apply(this, arguments);
        add('response-consume-call', { method: name, target: meta.url, status: meta.status, stack: stackShort() });
        const out = original.apply(this, arguments);
        return Promise.resolve(out).then(value => {
          add('response-consume-result', {
            method: name,
            target: meta.url,
            bytes: byteLength(value),
            blobType: (typeof Blob !== 'undefined' && value instanceof Blob) ? (value.type || '') : ''
          });
          return value;
        });
      };
    } catch (err) {
      add('hook-error', { hook: 'Response.' + name, error: clean(err && err.message || err) });
    }
  }

  function arm() {
    if (state.armed) return;
    state.armed = true;

    try {
      state.originals.fetch = window.fetch;
      const original = state.originals.fetch;
      if (typeof original === 'function') {
        window.fetch = function (input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          const target = isTarget(url);
          const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          const safeHeaders = target ? requestSafeHeaders(input, init) : null;
          if (target) add('target-fetch-request', { method, url: safeUrl(url), headers: safeHeaders, stack: stackShort() });
          const result = original.apply(this, arguments);
          if (!target) return result;
          return Promise.resolve(result).then(r => {
            const meta = {
              url: safeUrl(url),
              method,
              status: r.status,
              responseHeaders: responseSafeHeaders(r),
              seenAtMs: nowMs()
            };
            tagResponse(r, meta);
            add('target-fetch-response', meta);
            return r;
          });
        };
      }
    } catch (err) { add('hook-error', { hook: 'fetch', error: clean(err && err.message || err) }); }

    try {
      const proto = Response && Response.prototype;
      if (proto && typeof proto.clone === 'function') {
        state.originals.responseClone = proto.clone;
        proto.clone = function () {
          const clone = state.originals.responseClone.apply(this, arguments);
          const meta = metaForResponse(this);
          if (meta) {
            tagResponse(clone, meta);
            add('response-cloned', { target: meta.url });
          }
          return clone;
        };
      }
    } catch (err) { add('hook-error', { hook: 'Response.clone', error: clean(err && err.message || err) }); }

    try {
      const proto = Response && Response.prototype;
      const desc = proto && Object.getOwnPropertyDescriptor(proto, 'body');
      if (desc && typeof desc.get === 'function' && desc.configurable) {
        state.originals.responseBodyDescriptor = desc;
        Object.defineProperty(proto, 'body', {
          configurable: desc.configurable,
          enumerable: desc.enumerable,
          get: function () {
            const body = desc.get.call(this);
            const meta = metaForResponse(this);
            if (meta && body) {
              tagStream(body, meta);
              add('response-body-access', { target: meta.url, status: meta.status, locked: !!body.locked, stack: stackShort() });
            }
            return body;
          }
        });
      } else {
        add('hook-note', { hook: 'Response.body', note: 'getter unavailable or non-configurable' });
      }
    } catch (err) { add('hook-error', { hook: 'Response.body', error: clean(err && err.message || err) }); }

    for (const name of ['arrayBuffer', 'blob', 'bytes']) wrapResponseMethod(name);

    try {
      const proto = ReadableStream && ReadableStream.prototype;
      if (proto && typeof proto.getReader === 'function') {
        state.originals.getReader = proto.getReader;
        proto.getReader = function () {
          const reader = state.originals.getReader.apply(this, arguments);
          const meta = state.streamMeta.get(this);
          if (meta) {
            tagReader(reader, meta);
            add('stream-get-reader', {
              target: meta.url,
              mode: arguments[0] && arguments[0].mode ? String(arguments[0].mode) : 'default',
              stack: stackShort()
            });
          }
          return reader;
        };
      }
    } catch (err) { add('hook-error', { hook: 'ReadableStream.getReader', error: clean(err && err.message || err) }); }

    function wrapReader(proto, label) {
      try {
        if (!proto || typeof proto.read !== 'function') return;
        const key = label + '.read';
        state.originals[key] = proto.read;
        proto.read = function () {
          const reader = this;
          const meta = state.readerMeta.get(reader);
          if (!meta) return state.originals[key].apply(reader, arguments);
          const start = nowMs();
          const result = state.originals[key].apply(reader, arguments);
          return Promise.resolve(result).then(r => {
            const bytes = r && !r.done ? byteLength(r.value) : 0;
            meta.readN += 1;
            if (Number.isFinite(bytes)) meta.totalBytes += bytes;
            add('stream-read', {
              target: meta.url,
              readN: meta.readN,
              bytes,
              totalBytes: meta.totalBytes,
              done: !!(r && r.done),
              waitMs: nowMs() - start
            });
            return r;
          });
        };
      } catch (err) { add('hook-error', { hook: label + '.read', error: clean(err && err.message || err) }); }
    }

    try { wrapReader(typeof ReadableStreamDefaultReader !== 'undefined' ? ReadableStreamDefaultReader.prototype : null, 'ReadableStreamDefaultReader'); } catch (_) {}
    try { wrapReader(typeof ReadableStreamBYOBReader !== 'undefined' ? ReadableStreamBYOBReader.prototype : null, 'ReadableStreamBYOBReader'); } catch (_) {}

    try {
      const proto = ReadableStream && ReadableStream.prototype;
      for (const name of ['pipeThrough', 'pipeTo', 'tee']) {
        if (!proto || typeof proto[name] !== 'function') continue;
        const key = 'ReadableStream.' + name;
        state.originals[key] = proto[name];
        proto[name] = function () {
          const meta = state.streamMeta.get(this);
          if (meta) add('stream-' + name, { target: meta.url, stack: stackShort() });
          const out = state.originals[key].apply(this, arguments);
          if (meta && name === 'tee' && Array.isArray(out)) out.forEach(s => tagStream(s, meta));
          return out;
        };
      }
    } catch (err) { add('hook-error', { hook: 'ReadableStream pipe methods', error: clean(err && err.message || err) }); }

    try {
      performance.getEntriesByType('resource').forEach(recordPerf);
      const po = new PerformanceObserver(list => list.getEntries().forEach(recordPerf));
      po.observe({ type: 'resource', buffered: true });
      state.originals.performanceObserver = po;
    } catch (err) { add('hook-error', { hook: 'PerformanceObserver', error: clean(err && err.message || err) }); }

    add('trace-armed', {
      hooks: [
        'fetch(target audio only)',
        'Response.body/clone/arrayBuffer/blob/bytes',
        'ReadableStream.getReader/read',
        'ReadableStream.pipeThrough/pipeTo/tee',
        'PerformanceObserver'
      ]
    });
    updateStats();
  }

  function recordPerf(r) {
    try {
      if (!isTarget(r.name || '')) return;
      add('target-resource-timing', {
        url: safeUrl(r.name || ''),
        initiatorType: r.initiatorType || '',
        durationMs: Math.round(Number(r.duration || 0)),
        transferSize: Number(r.transferSize || 0),
        encodedBodySize: Number(r.encodedBodySize || 0),
        decodedBodySize: Number(r.decodedBodySize || 0)
      });
    } catch (_) {}
  }

  function clear() {
    state.events.length = 0;
    state.seq = 0;
    add('capture-cleared', { href: location.href });
  }

  function report() {
    return {
      tool: 'Nova Suno Stream Transport Probe',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      safety: {
        observationOnly: true,
        generatedRequests: false,
        replayedRequests: false,
        responseBodiesConsumedByProbe: false,
        rawBodyBytesCaptured: false,
        authCaptured: false,
        cookiesCaptured: false,
        safeHeadersOnly: ['Range', 'Accept', 'Content-Type', 'Content-Length', 'Accept-Ranges', 'Content-Range', 'Cache-Control']
      },
      armed: state.armed,
      page: { href: location.href, title: document.title, readyState: document.readyState },
      events: state.events.slice()
    };
  }

  function exportReport() {
    const payload = JSON.stringify(report(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nova-Suno-Stream-Transport-v${VERSION}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function updateStats() {
    if (!state.stats) return;
    const reads = state.events.filter(e => e.type === 'stream-read').length;
    const targetFetches = state.events.filter(e => e.type === 'target-fetch-request').length;
    state.stats.textContent = `${state.armed ? 'ARMED' : 'SAFE'} · E ${state.events.length} · FETCH ${targetFetches} · READ ${reads}`;
  }

  function makeUi() {
    if (!TOP || state.ui || !document.documentElement) return;
    const host = document.createElement('div');
    host.id = UI_ID;
    host.style.cssText = 'position:fixed;left:14px;top:14px;z-index:2147483645;width:350px;background:#07120e;color:#eefdf6;border:1px solid #22c55e;border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.5);font:12px/1.35 Arial,sans-serif;overflow:hidden';
    host.innerHTML = `<div style="padding:8px 10px;background:linear-gradient(90deg,#15803d,#0f766e,#0369a1);font-weight:900">🌊 Nova Stream Transport <small>v${VERSION}</small></div>`;
    const body = document.createElement('div');
    body.style.cssText = 'padding:9px';
    const stats = document.createElement('div');
    stats.style.cssText = 'margin-bottom:7px;color:#86efac';
    state.stats = stats;
    const note = document.createElement('div');
    note.textContent = 'ARM after Suno loads. Traces only audio transport metadata + byte counts; never consumes or replays traffic.';
    note.style.cssText = 'font-size:10px;color:#94a3b8;margin-bottom:8px';
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'padding:7px 4px;border-radius:8px;border:1px solid rgba(34,197,94,.55);background:rgba(255,255,255,.05);color:#fff;font-weight:800;font-size:9px;cursor:pointer';
      b.onclick = fn;
      return b;
    };
    row.append(
      btn('ARM TRACE', arm),
      btn('SNAP', () => add('manual-snapshot', { href: location.href, title: document.title })),
      btn('CLEAR', clear),
      btn('EXPORT', exportReport)
    );
    body.append(stats, note, row);
    host.append(body);
    (document.body || document.documentElement).appendChild(host);
    state.ui = host;
    updateStats();
  }

  const uiBoot = () => document.documentElement ? makeUi() : setTimeout(uiBoot, 25);
  uiBoot();

  window.NovaSunoStreamTransportProbe = { version: VERSION, arm, clear, report, export: exportReport };
})();
