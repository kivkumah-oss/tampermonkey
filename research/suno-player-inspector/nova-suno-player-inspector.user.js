// ==UserScript==
// @name         Nova Suno Player Inspector
// @namespace    nova.research.suno
// @version      0.1.0
// @description  Passive Suno player microscope: network shapes, media elements, resources, MediaSession, DOM changes, action marks, and safe JSON export.
// @author       Martin + Nova
// @match        https://suno.com/*
// @match        https://*.suno.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.1.0';
  const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const START = performance.now();
  const MAX_EVENTS = 5000;
  const MAX_ENDPOINTS = 500;
  const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|session|credential|signature|jwt|api[_-]?key|csrf|xsrf)/i;
  const INTERESTING_KEY = /^(id|clip_id|clipId|song_id|songId|title|status|duration|content_type|contentType|delivery|encoding|audio_url|audioUrl|video_url|videoUrl|media_urls|mediaUrls|image_url|imageUrl|image_large_url|current_index|currentIndex|position|volume|repeat|playing|paused)$/i;

  const state = {
    startedAt: new Date().toISOString(),
    events: [],
    endpoints: new Map(),
    resources: new Map(),
    media: new Map(),
    marks: [],
    seq: 0,
    mediaSeq: 0,
    mutationBatches: 0,
    shadowRoots: 0,
    ui: null,
    stats: null,
    observer: null
  };

  function ms() {
    return Math.round(performance.now() - START);
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function safeUrl(input) {
    try {
      const u = new URL(String(input || ''), location.href);
      const queryKeys = [...u.searchParams.keys()];
      u.search = queryKeys.length ? '?' + queryKeys.map(k => encodeURIComponent(k) + '=<redacted>').join('&') : '';
      u.hash = '';
      return {
        full: u.toString(),
        origin: u.origin,
        host: u.hostname,
        path: u.pathname,
        queryKeys
      };
    } catch (_) {
      const raw = clean(input).slice(0, 300);
      return { full: raw, origin: '', host: '', path: raw, queryKeys: [] };
    }
  }

  function valueShape(value, depth = 0) {
    if (depth > 5) return { type: 'max-depth' };
    if (value == null) return { type: 'null' };
    if (Array.isArray(value)) {
      return {
        type: 'array',
        length: value.length,
        itemShape: value.length ? valueShape(value[0], depth + 1) : null
      };
    }

    const type = typeof value;
    if (type === 'object') {
      const keys = Object.keys(value).slice(0, 100);
      const childShape = {};
      for (const key of keys) {
        childShape[key] = SENSITIVE_KEY.test(key)
          ? { type: '<sensitive-key>' }
          : valueShape(value[key], depth + 1);
      }
      return {
        type: 'object',
        keyCount: Object.keys(value).length,
        keys,
        shape: childShape
      };
    }

    if (type === 'string') {
      const hints = [];
      if (/^https?:\/\//i.test(value)) hints.push('url');
      if (/^blob:/i.test(value)) hints.push('blob-url');
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) hints.push('uuid');
      return { type: 'string', length: value.length, hints };
    }

    if (type === 'number') return { type: 'number', finite: Number.isFinite(value) };
    return { type };
  }

  function extractInteresting(value, path = '', depth = 0, out = []) {
    if (value == null || depth > 7 || out.length >= 140) return out;
    if (Array.isArray(value)) {
      value.slice(0, 25).forEach((item, index) => extractInteresting(item, path + '[' + index + ']', depth + 1, out));
      return out;
    }
    if (typeof value !== 'object') return out;

    for (const [key, child] of Object.entries(value).slice(0, 150)) {
      if (SENSITIVE_KEY.test(key)) continue;
      const childPath = path ? path + '.' + key : key;

      if (INTERESTING_KEY.test(key)) {
        if (typeof child === 'string') {
          out.push({
            path: childPath,
            key,
            value: /^https?:\/\//i.test(child) ? safeUrl(child).full : clean(child).slice(0, 350)
          });
        } else if (['number', 'boolean'].includes(typeof child)) {
          out.push({ path: childPath, key, value: child });
        }
      }
      extractInteresting(child, childPath, depth + 1, out);
    }
    return out;
  }

  function addEvent(type, data = {}) {
    const event = {
      n: ++state.seq,
      at: new Date().toISOString(),
      ms: ms(),
      type,
      topFrame: window.top === window.self,
      ...data
    };
    state.events.push(event);
    if (state.events.length > MAX_EVENTS) {
      state.events.splice(0, state.events.length - MAX_EVENTS);
    }
    renderStats();
    return event;
  }

  function bodyShape(body) {
    if (body == null) return null;
    try {
      if (typeof body === 'string') {
        try { return valueShape(JSON.parse(body)); }
        catch (_) { return { type: 'text', length: body.length }; }
      }
      if (PAGE.URLSearchParams && body instanceof PAGE.URLSearchParams) {
        return { type: 'urlsearchparams', keys: [...body.keys()] };
      }
      if (PAGE.FormData && body instanceof PAGE.FormData) {
        return { type: 'formdata', keys: [...body.keys()] };
      }
      if (PAGE.Blob && body instanceof PAGE.Blob) {
        return { type: 'blob', size: body.size, mime: body.type || '' };
      }
    } catch (_) {}
    return { type: Object.prototype.toString.call(body) };
  }

  function endpointKey(method, url) {
    const u = safeUrl(url);
    return String(method || 'GET').toUpperCase() + ' ' + u.origin + u.path;
  }

  function touchEndpoint(method, url, patch = {}) {
    const u = safeUrl(url);
    const key = endpointKey(method, url);
    let item = state.endpoints.get(key);
    if (!item) {
      if (state.endpoints.size >= MAX_ENDPOINTS) return;
      item = {
        key,
        method: String(method || 'GET').toUpperCase(),
        host: u.host,
        path: u.path,
        queryKeys: u.queryKeys,
        count: 0,
        statuses: {},
        contentTypes: [],
        requestShapes: [],
        responseShapes: [],
        interesting: [],
        firstMs: ms(),
        lastMs: ms()
      };
      state.endpoints.set(key, item);
    }

    item.count += patch.increment === false ? 0 : 1;
    item.lastMs = ms();
    if (patch.status != null) {
      item.statuses[String(patch.status)] = (item.statuses[String(patch.status)] || 0) + 1;
    }
    if (patch.contentType && !item.contentTypes.includes(patch.contentType)) item.contentTypes.push(patch.contentType);
    if (patch.requestShape) item.requestShapes.push(patch.requestShape);
    if (patch.responseShape) item.responseShapes.push(patch.responseShape);
    if (patch.interesting && patch.interesting.length) item.interesting.push(...patch.interesting);

    item.requestShapes = item.requestShapes.slice(-4);
    item.responseShapes = item.responseShapes.slice(-4);
    item.interesting = item.interesting.slice(-160);
  }

  function installFetchHook() {
    const originalFetch = PAGE.fetch;
    if (typeof originalFetch !== 'function' || originalFetch.__novaInspectorWrapped) return;

    function wrappedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const requestShape = bodyShape(init && init.body);

      addEvent('fetch-request', { method, url: safeUrl(url), requestShape });
      touchEndpoint(method, url, { requestShape });

      const result = originalFetch.apply(this, arguments);
      Promise.resolve(result).then(async response => {
        const contentType = response && response.headers && response.headers.get
          ? (response.headers.get('content-type') || '')
          : '';
        let responseShape = null;
        let interesting = [];

        if (/json/i.test(contentType)) {
          try {
            const data = await response.clone().json();
            responseShape = valueShape(data);
            interesting = extractInteresting(data);
          } catch (_) {}
        }

        touchEndpoint(method, url, {
          increment: false,
          status: response.status,
          contentType,
          responseShape,
          interesting
        });
        addEvent('fetch-response', {
          method,
          url: safeUrl(url),
          status: response.status,
          contentType,
          responseShape,
          interesting
        });
      }).catch(error => {
        addEvent('fetch-error', { method, url: safeUrl(url), error: clean(error && error.message || error) });
      });

      return result;
    }

    wrappedFetch.__novaInspectorWrapped = true;
    PAGE.fetch = wrappedFetch;
    addEvent('hook-installed', { hook: 'fetch' });
  }

  function installXhrHook() {
    const XHR = PAGE.XMLHttpRequest;
    if (!XHR || !XHR.prototype || XHR.prototype.__novaInspectorWrapped) return;

    const proto = XHR.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function(method, url) {
      this.__novaInspectorRequest = {
        method: String(method || 'GET').toUpperCase(),
        url: String(url || '')
      };
      return originalOpen.apply(this, arguments);
    };

    proto.send = function(body) {
      const meta = this.__novaInspectorRequest || { method: 'GET', url: '' };
      const requestShape = bodyShape(body);
      addEvent('xhr-request', { method: meta.method, url: safeUrl(meta.url), requestShape });
      touchEndpoint(meta.method, meta.url, { requestShape });

      this.addEventListener('loadend', () => {
        let contentType = '';
        try { contentType = this.getResponseHeader('content-type') || ''; } catch (_) {}
        let responseShape = null;
        let interesting = [];

        if (/json/i.test(contentType)) {
          try {
            const data = JSON.parse(this.responseText || 'null');
            responseShape = valueShape(data);
            interesting = extractInteresting(data);
          } catch (_) {}
        }

        touchEndpoint(meta.method, meta.url, {
          increment: false,
          status: this.status,
          contentType,
          responseShape,
          interesting
        });
        addEvent('xhr-response', {
          method: meta.method,
          url: safeUrl(meta.url),
          status: this.status,
          contentType,
          responseShape,
          interesting
        });
      }, { once: true });

      return originalSend.apply(this, arguments);
    };

    proto.__novaInspectorWrapped = true;
    addEvent('hook-installed', { hook: 'xhr' });
  }

  function mediaSnapshot(element) {
    const rawSrc = element.currentSrc || element.src || element.getAttribute('src') || '';
    const url = rawSrc ? safeUrl(rawSrc) : null;
    return {
      tag: element.tagName,
      id: element.id || '',
      className: clean(element.className).slice(0, 180),
      src: url ? url.full : '',
      srcHost: url ? url.host : '',
      srcPath: url ? url.path : '',
      readyState: element.readyState,
      networkState: element.networkState,
      paused: element.paused,
      ended: element.ended,
      duration: Number.isFinite(element.duration) ? Math.round(element.duration * 1000) / 1000 : null,
      currentTime: Number.isFinite(element.currentTime) ? Math.round(element.currentTime * 1000) / 1000 : null,
      volume: element.volume,
      muted: element.muted,
      playbackRate: element.playbackRate,
      crossOrigin: element.crossOrigin || '',
      preload: element.preload || ''
    };
  }

  function watchMedia(element) {
    if (!element || !(element instanceof PAGE.HTMLMediaElement) || element.__novaInspectorWatched) return;
    element.__novaInspectorWatched = true;
    const mediaId = 'media-' + (++state.mediaSeq);
    element.__novaInspectorId = mediaId;

    const snap = mediaSnapshot(element);
    state.media.set(mediaId, snap);
    addEvent('media-found', { mediaId, media: snap });

    const events = ['loadstart','loadedmetadata','loadeddata','canplay','canplaythrough','play','playing','pause','waiting','stalled','suspend','emptied','abort','error','ended','volumechange','durationchange','ratechange','seeking','seeked'];
    for (const eventName of events) {
      element.addEventListener(eventName, () => {
        const current = mediaSnapshot(element);
        state.media.set(mediaId, current);
        addEvent('media-event', {
          mediaId,
          event: eventName,
          media: current,
          mediaError: eventName === 'error' && element.error
            ? { code: element.error.code, message: element.error.message || '' }
            : null
        });
      }, true);
    }
  }

  function scanMedia(root) {
    const target = root || document;
    try {
      if (target.matches && target.matches('audio,video')) watchMedia(target);
      if (target.querySelectorAll) target.querySelectorAll('audio,video').forEach(watchMedia);
    } catch (_) {}
  }

  function installMediaMethodHooks() {
    const Media = PAGE.HTMLMediaElement;
    if (!Media || !Media.prototype || Media.prototype.__novaInspectorWrapped) return;
    const proto = Media.prototype;

    for (const methodName of ['play', 'pause', 'load']) {
      const original = proto[methodName];
      if (typeof original !== 'function') continue;

      proto[methodName] = function() {
        watchMedia(this);
        const mediaId = this.__novaInspectorId || '';
        addEvent('media-call', {
          call: methodName,
          mediaId,
          media: mediaSnapshot(this),
          stack: String(new Error().stack || '').split('\n').slice(2, 8).join('\n')
        });

        let result;
        try {
          result = original.apply(this, arguments);
        } catch (error) {
          addEvent('media-call-throw', {
            call: methodName,
            mediaId,
            error: clean(error && error.message || error)
          });
          throw error;
        }

        if (methodName === 'play' && result && typeof result.then === 'function') {
          result.then(() => {
            addEvent('media-play-resolved', { mediaId, media: mediaSnapshot(this) });
          }).catch(error => {
            addEvent('media-play-rejected', {
              mediaId,
              media: mediaSnapshot(this),
              error: clean(error && error.message || error)
            });
          });
        }
        return result;
      };
    }

    proto.__novaInspectorWrapped = true;
    addEvent('hook-installed', { hook: 'HTMLMediaElement methods' });
  }

  function resourceRecord(entry) {
    const url = safeUrl(entry.name || '');
    const key = (entry.initiatorType || 'resource') + ' ' + url.origin + url.path;
    const record = state.resources.get(key) || {
      key,
      initiatorType: entry.initiatorType || '',
      host: url.host,
      path: url.path,
      queryKeys: url.queryKeys,
      count: 0,
      transferBytes: 0,
      durationMs: 0,
      firstMs: ms(),
      lastMs: ms()
    };
    record.count++;
    record.transferBytes += Number(entry.transferSize || 0);
    record.durationMs += Math.round(Number(entry.duration || 0));
    record.lastMs = ms();
    state.resources.set(key, record);

    if (/audio|video|media|clip|song|cloudfront|cdn/i.test(url.host + url.path) || ['audio','video'].includes(entry.initiatorType)) {
      addEvent('resource-media-like', {
        initiatorType: entry.initiatorType || '',
        url,
        transferSize: Number(entry.transferSize || 0),
        encodedBodySize: Number(entry.encodedBodySize || 0),
        decodedBodySize: Number(entry.decodedBodySize || 0),
        durationMs: Math.round(Number(entry.duration || 0))
      });
    }
  }

  function installPerformanceObserver() {
    try {
      performance.getEntriesByType('resource').forEach(resourceRecord);
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(resourceRecord);
        renderStats();
      });
      observer.observe({ type: 'resource', buffered: true });
      state.observer = observer;
      addEvent('hook-installed', { hook: 'PerformanceObserver(resource)' });
    } catch (error) {
      addEvent('hook-error', { hook: 'PerformanceObserver', error: clean(error && error.message || error) });
    }
  }

  function iframeSnapshot(frame) {
    return {
      src: safeUrl(frame.getAttribute('src') || '').full,
      title: clean(frame.getAttribute('title') || ''),
      name: clean(frame.getAttribute('name') || ''),
      sandbox: clean(frame.getAttribute('sandbox') || ''),
      allow: clean(frame.getAttribute('allow') || '')
    };
  }

  function scanIframes(root) {
    const target = root || document;
    try {
      const frames = [];
      if (target.matches && target.matches('iframe')) frames.push(target);
      if (target.querySelectorAll) frames.push(...target.querySelectorAll('iframe'));
      for (const frame of frames) {
        if (frame.__novaInspectorSeen) continue;
        frame.__novaInspectorSeen = true;
        addEvent('iframe-found', { iframe: iframeSnapshot(frame) });
      }
    } catch (_) {}
  }

  function installDomObserver() {
    const start = () => {
      if (!document.documentElement) return setTimeout(start, 25);
      scanMedia(document);
      scanIframes(document);

      const observer = new MutationObserver(mutations => {
        state.mutationBatches++;
        let added = 0;
        let removed = 0;
        let attributes = 0;
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            added += mutation.addedNodes.length;
            removed += mutation.removedNodes.length;
            mutation.addedNodes.forEach(node => {
              if (node && node.nodeType === 1) {
                scanMedia(node);
                scanIframes(node);
              }
            });
          } else if (mutation.type === 'attributes') {
            attributes++;
            if (mutation.target && mutation.target instanceof PAGE.HTMLMediaElement) watchMedia(mutation.target);
          }
        }
        if (added || removed || attributes) {
          addEvent('dom-mutation-batch', { added, removed, attributes });
        }
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src','href','class','style','aria-label','aria-pressed','data-state']
      });
      addEvent('hook-installed', { hook: 'MutationObserver' });
    };
    start();
  }

  function installAttachShadowHook() {
    const ElementProto = PAGE.Element && PAGE.Element.prototype;
    if (!ElementProto || !ElementProto.attachShadow || ElementProto.attachShadow.__novaInspectorWrapped) return;
    const original = ElementProto.attachShadow;
    ElementProto.attachShadow = function(init) {
      const root = original.apply(this, arguments);
      state.shadowRoots++;
      addEvent('shadow-root-created', {
        hostTag: this.tagName || '',
        hostId: this.id || '',
        mode: init && init.mode || ''
      });
      try {
        const observer = new MutationObserver(() => {
          scanMedia(root);
          scanIframes(root);
        });
        observer.observe(root, { subtree: true, childList: true });
      } catch (_) {}
      return root;
    };
    ElementProto.attachShadow.__novaInspectorWrapped = true;
    addEvent('hook-installed', { hook: 'attachShadow' });
  }

  function messageShape(value) {
    if (typeof value === 'string') {
      try { return valueShape(JSON.parse(value)); }
      catch (_) { return { type: 'string', length: value.length }; }
    }
    return valueShape(value);
  }

  function installMessageObserver() {
    window.addEventListener('message', event => {
      addEvent('postmessage-received', {
        origin: event.origin || '',
        dataShape: messageShape(event.data)
      });
    }, true);
    addEvent('hook-installed', { hook: 'message listener' });
  }

  function mediaSessionSnapshot() {
    try {
      const msObj = navigator.mediaSession;
      if (!msObj) return null;
      const meta = msObj.metadata;
      return {
        playbackState: msObj.playbackState || '',
        metadata: meta ? {
          title: clean(meta.title || ''),
          artist: clean(meta.artist || ''),
          album: clean(meta.album || ''),
          artwork: Array.isArray(meta.artwork)
            ? meta.artwork.slice(0, 8).map(item => ({ src: safeUrl(item.src || '').full, sizes: item.sizes || '', type: item.type || '' }))
            : []
        } : null
      };
    } catch (_) {
      return null;
    }
  }

  function startMediaSessionPolling() {
    let last = '';
    setInterval(() => {
      const snap = mediaSessionSnapshot();
      if (!snap) return;
      const serialized = JSON.stringify(snap);
      if (serialized !== last) {
        last = serialized;
        addEvent('media-session-state', snap);
      }
    }, 750);
  }

  function pageSnapshot() {
    const media = [];
    try { document.querySelectorAll('audio,video').forEach(el => media.push(mediaSnapshot(el))); } catch (_) {}
    const iframes = [];
    try { document.querySelectorAll('iframe').forEach(el => iframes.push(iframeSnapshot(el))); } catch (_) {}

    return {
      href: safeUrl(location.href).full,
      title: document.title || '',
      visibilityState: document.visibilityState,
      readyState: document.readyState,
      media,
      iframes,
      mediaSession: mediaSessionSnapshot(),
      resourceCount: performance.getEntriesByType('resource').length,
      endpointCount: state.endpoints.size,
      eventCount: state.events.length,
      mutationBatches: state.mutationBatches,
      shadowRootsObserved: state.shadowRoots
    };
  }

  function markAction(label) {
    const text = clean(label || '');
    if (!text) return;
    const mark = { label: text, at: new Date().toISOString(), ms: ms(), eventN: state.seq + 1 };
    state.marks.push(mark);
    addEvent('action-mark', mark);
  }

  function clearCapture() {
    state.events.length = 0;
    state.endpoints.clear();
    state.resources.clear();
    state.media.clear();
    state.marks.length = 0;
    state.seq = 0;
    state.mediaSeq = 0;
    state.mutationBatches = 0;
    performance.getEntriesByType('resource').forEach(resourceRecord);
    scanMedia(document);
    addEvent('capture-cleared', { page: safeUrl(location.href) });
    renderStats();
  }

  function buildReport() {
    scanMedia(document);
    scanIframes(document);
    return {
      tool: 'Nova Suno Player Inspector',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      safety: {
        observationOnly: true,
        generatedRequests: false,
        replayedRequests: false,
        queryValuesExported: false,
        authHeadersExported: false,
        cookiesExported: false,
        rawBodiesExported: false,
        note: 'Captured request/response shapes and selected non-sensitive player fields only.'
      },
      page: pageSnapshot(),
      marks: state.marks.slice(),
      endpoints: [...state.endpoints.values()],
      resources: [...state.resources.values()],
      media: [...state.media.entries()].map(([id, value]) => ({ id, ...value })),
      events: state.events.slice()
    };
  }

  function exportReport() {
    const report = buildReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Nova-Suno-Player-Inspector-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addEvent('report-exported', { events: report.events.length, endpoints: report.endpoints.length });
  }

  function renderStats() {
    if (!state.stats) return;
    const mediaCount = (() => {
      try { return document.querySelectorAll('audio,video').length; } catch (_) { return state.media.size; }
    })();
    state.stats.textContent = 'E ' + state.events.length + ' · API ' + state.endpoints.size + ' · MEDIA ' + mediaCount + ' · MARKS ' + state.marks.length;
  }

  function makeUi() {
    if (!TOP || state.ui || !document.documentElement) return;
    const host = document.createElement('div');
    host.id = 'nova-suno-player-inspector';
    host.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:330px;background:#071018;color:#eef7ff;border:1px solid #22d3ee;border-radius:14px;box-shadow:0 12px 44px rgba(0,0,0,.55),0 0 22px rgba(34,211,238,.22);font:12px/1.35 Arial,sans-serif;overflow:hidden;';

    const head = document.createElement('div');
    head.style.cssText = 'padding:9px 11px;background:linear-gradient(90deg,#0891b2,#7c3aed,#db2777);font-weight:900;display:flex;justify-content:space-between;align-items:center;';
    head.innerHTML = '<span>🔬 Nova Suno Inspector <small style="opacity:.8">v' + VERSION + '</small></span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px;';

    const status = document.createElement('div');
    status.style.cssText = 'padding:7px 8px;margin-bottom:8px;background:rgba(255,255,255,.04);border-radius:9px;color:#9be7ff;';
    state.stats = status;

    const note = document.createElement('div');
    note.textContent = 'Passive capture only · query values/credentials/raw bodies are not exported.';
    note.style.cssText = 'font-size:10px;color:#93a4b8;margin-bottom:8px;';

    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;';

    function button(label, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'padding:7px 5px;border-radius:8px;border:1px solid rgba(34,211,238,.48);background:rgba(255,255,255,.05);color:white;cursor:pointer;font-weight:800;font-size:10px;';
      b.addEventListener('click', onClick);
      return b;
    }

    row.append(
      button('MARK', () => {
        const label = prompt('Describe ONE action you are about to perform:', 'Play song');
        if (label) markAction(label);
      }),
      button('SNAP', () => addEvent('manual-snapshot', { snapshot: pageSnapshot() })),
      button('CLEAR', () => clearCapture()),
      button('EXPORT', () => exportReport())
    );

    body.append(status, note, row);
    host.append(head, body);

    const mount = () => {
      if (document.body) document.body.appendChild(host);
      else document.documentElement.appendChild(host);
      state.ui = host;
      renderStats();
    };
    mount();
  }

  function boot() {
    addEvent('inspector-start', {
      version: VERSION,
      page: safeUrl(location.href),
      topFrame: TOP
    });

    installFetchHook();
    installXhrHook();
    installMediaMethodHooks();
    installAttachShadowHook();
    installPerformanceObserver();
    installMessageObserver();
    installDomObserver();
    startMediaSessionPolling();

    const uiBoot = () => {
      if (document.documentElement) makeUi();
      else setTimeout(uiBoot, 25);
    };
    uiBoot();

    document.addEventListener('DOMContentLoaded', () => {
      scanMedia(document);
      scanIframes(document);
      addEvent('dom-content-loaded', { snapshot: pageSnapshot() });
    }, { once: true });

    window.addEventListener('load', () => {
      scanMedia(document);
      scanIframes(document);
      addEvent('window-load', { snapshot: pageSnapshot() });
    }, { once: true });

    PAGE.NovaSunoPlayerInspector = {
      version: VERSION,
      mark: markAction,
      snapshot: pageSnapshot,
      report: buildReport,
      clear: clearCapture,
      export: exportReport
    };
  }

  try {
    boot();
  } catch (error) {
    console.error('[Nova Suno Player Inspector] failed to boot', error);
  }
})();
