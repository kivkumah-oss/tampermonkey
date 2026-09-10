// ==UserScript==
// @name         Nova Suno ObjectURL + MSE Probe
// @namespace    nova.research.suno
// @version      0.1.0
// @description  Manual-arm passive playback probe for Suno: traces object URLs, Blob/MediaSource type, MSE source buffers, append sizes, and media timeline. Generates no requests.
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
  const UI_ID = 'nova-suno-objecturl-mse-probe';
  const MAX_EVENTS = 4000;

  const state = {
    armed: false,
    seq: 0,
    events: [],
    objectUrls: new Map(),
    mediaIds: new WeakMap(),
    nextMediaId: 1,
    lastTimeSample: new WeakMap(),
    ui: null,
    stats: null,
    originals: {}
  };

  const nowMs = () => Math.round(performance.now() - START);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function stackShort() {
    try {
      return String(new Error().stack || '')
        .split('\n')
        .slice(2, 9)
        .map(x => clean(x).slice(0, 240));
    } catch (_) { return []; }
  }

  function mediaId(el) {
    if (!state.mediaIds.has(el)) state.mediaIds.set(el, `media-${state.nextMediaId++}`);
    return state.mediaIds.get(el);
  }

  function classifyObject(obj) {
    try {
      if (typeof Blob !== 'undefined' && obj instanceof Blob) {
        return { kind: 'Blob', size: obj.size, mime: obj.type || '' };
      }
    } catch (_) {}
    try {
      if (typeof MediaSource !== 'undefined' && obj instanceof MediaSource) {
        return { kind: 'MediaSource', readyState: obj.readyState || '' };
      }
    } catch (_) {}
    return { kind: Object.prototype.toString.call(obj) };
  }

  function add(type, data = {}) {
    const e = { n: ++state.seq, at: new Date().toISOString(), ms: nowMs(), type, topFrame: TOP, ...data };
    state.events.push(e);
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    updateStats();
    return e;
  }

  function mediaSnap(el) {
    let src = '';
    try { src = el.currentSrc || el.src || el.getAttribute('src') || ''; } catch (_) {}
    const objectInfo = src && state.objectUrls.has(src) ? state.objectUrls.get(src).object : null;
    return {
      id: mediaId(el),
      tag: el.tagName || '',
      src,
      objectInfo,
      paused: !!el.paused,
      ended: !!el.ended,
      readyState: el.readyState,
      networkState: el.networkState,
      duration: Number.isFinite(el.duration) ? +el.duration.toFixed(3) : null,
      currentTime: Number.isFinite(el.currentTime) ? +el.currentTime.toFixed(3) : null,
      volume: el.volume,
      muted: !!el.muted,
      playbackRate: el.playbackRate,
      crossOrigin: el.crossOrigin || ''
    };
  }

  function arm() {
    if (state.armed) return;
    state.armed = true;

    try {
      state.originals.createObjectURL = URL.createObjectURL;
      if (typeof state.originals.createObjectURL === 'function') {
        URL.createObjectURL = function (obj) {
          const object = classifyObject(obj);
          const stack = stackShort();
          const result = state.originals.createObjectURL.apply(this, arguments);
          const rec = { url: result, object, createdAt: new Date().toISOString(), ms: nowMs(), stack };
          state.objectUrls.set(result, rec);
          add('object-url-created', rec);
          return result;
        };
      }
    } catch (err) { add('hook-error', { hook: 'URL.createObjectURL', error: clean(err && err.message || err) }); }

    try {
      state.originals.revokeObjectURL = URL.revokeObjectURL;
      if (typeof state.originals.revokeObjectURL === 'function') {
        URL.revokeObjectURL = function (url) {
          add('object-url-revoked', { url: String(url || ''), known: state.objectUrls.has(String(url || '')) });
          return state.originals.revokeObjectURL.apply(this, arguments);
        };
      }
    } catch (err) { add('hook-error', { hook: 'URL.revokeObjectURL', error: clean(err && err.message || err) }); }

    try {
      if (typeof MediaSource !== 'undefined' && MediaSource.prototype && typeof MediaSource.prototype.addSourceBuffer === 'function') {
        state.originals.addSourceBuffer = MediaSource.prototype.addSourceBuffer;
        MediaSource.prototype.addSourceBuffer = function (mime) {
          add('mse-add-source-buffer', { mime: clean(mime), mediaSourceReadyState: this.readyState || '', stack: stackShort() });
          const sb = state.originals.addSourceBuffer.apply(this, arguments);
          try { sb.__novaMseMime = clean(mime); } catch (_) {}
          return sb;
        };
      }
    } catch (err) { add('hook-error', { hook: 'MediaSource.addSourceBuffer', error: clean(err && err.message || err) }); }

    try {
      if (typeof SourceBuffer !== 'undefined' && SourceBuffer.prototype && typeof SourceBuffer.prototype.appendBuffer === 'function') {
        state.originals.appendBuffer = SourceBuffer.prototype.appendBuffer;
        SourceBuffer.prototype.appendBuffer = function (buffer) {
          let bytes = null;
          try { bytes = Number(buffer && (buffer.byteLength != null ? buffer.byteLength : buffer.length)); } catch (_) {}
          add('mse-append-buffer', { bytes: Number.isFinite(bytes) ? bytes : null, mime: this.__novaMseMime || '', updating: !!this.updating, stack: stackShort() });
          return state.originals.appendBuffer.apply(this, arguments);
        };
      }
    } catch (err) { add('hook-error', { hook: 'SourceBuffer.appendBuffer', error: clean(err && err.message || err) }); }

    add('trace-armed', { hooks: ['URL.createObjectURL', 'URL.revokeObjectURL', 'MediaSource.addSourceBuffer', 'SourceBuffer.appendBuffer'] });
    updateStats();
  }

  const mediaEvents = ['loadstart','loadedmetadata','loadeddata','canplay','play','playing','pause','waiting','stalled','error','ended','volumechange','durationchange','ratechange','seeking','seeked','emptied'];
  for (const name of mediaEvents) {
    document.addEventListener(name, ev => {
      if (!state.armed || !(ev.target instanceof HTMLMediaElement)) return;
      add('media-event', { event: name, media: mediaSnap(ev.target), error: name === 'error' && ev.target.error ? { code: ev.target.error.code, message: ev.target.error.message || '' } : null });
    }, true);
  }

  document.addEventListener('timeupdate', ev => {
    if (!state.armed || !(ev.target instanceof HTMLMediaElement)) return;
    const el = ev.target;
    const t = Number(el.currentTime || 0);
    const prev = state.lastTimeSample.get(el);
    if (prev != null && Math.abs(t - prev) < 5 && !el.ended) return;
    state.lastTimeSample.set(el, t);
    add('media-time-sample', { media: mediaSnap(el) });
  }, true);

  function snapshot() {
    const media = [];
    try { document.querySelectorAll('audio,video').forEach(el => media.push(mediaSnap(el))); } catch (_) {}
    return { href: location.href, title: document.title, readyState: document.readyState, media };
  }

  function clear() {
    state.events.length = 0;
    state.objectUrls.clear();
    state.seq = 0;
    state.lastTimeSample = new WeakMap();
    add('capture-cleared', { snapshot: snapshot() });
  }

  function report() {
    return {
      tool: 'Nova Suno ObjectURL + MSE Probe',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      safety: { observationOnly: true, generatedRequests: false, replayedRequests: false, requestBodiesCaptured: false, authCaptured: false },
      armed: state.armed,
      page: snapshot(),
      objectUrls: [...state.objectUrls.values()],
      events: state.events.slice()
    };
  }

  function exportReport() {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' });
    const url = state.originals.createObjectURL ? state.originals.createObjectURL.call(URL, blob) : URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nova-Suno-ObjectURL-MSE-Probe-v${VERSION}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try {
        const revoke = state.originals.revokeObjectURL || URL.revokeObjectURL;
        revoke.call(URL, url);
      } catch (_) {}
    }, 1000);
  }

  function updateStats() {
    if (!state.stats) return;
    state.stats.textContent = `${state.armed ? 'ARMED' : 'SAFE'} · E ${state.events.length} · OBJ ${state.objectUrls.size}`;
  }

  function makeUi() {
    if (!TOP || state.ui || !document.documentElement) return;
    const host = document.createElement('div');
    host.id = UI_ID;
    host.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483646;width:330px;background:#0a1018;color:#eef7ff;border:1px solid #a855f7;border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.5);font:12px/1.35 Arial,sans-serif;overflow:hidden';
    host.innerHTML = `<div style="padding:8px 10px;background:linear-gradient(90deg,#7c3aed,#db2777);font-weight:900">🧬 Nova ObjectURL/MSE Probe <small>v${VERSION}</small></div>`;
    const body = document.createElement('div');
    body.style.cssText = 'padding:9px';
    const stats = document.createElement('div');
    stats.style.cssText = 'margin-bottom:7px;color:#d8b4fe';
    state.stats = stats;
    const note = document.createElement('div');
    note.textContent = 'ARM only after Suno is loaded. Then play one fresh song from the start.';
    note.style.cssText = 'font-size:10px;color:#94a3b8;margin-bottom:8px';
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
    const btn = (label, fn) => { const b=document.createElement('button'); b.textContent=label; b.style.cssText='padding:7px 4px;border-radius:8px;border:1px solid rgba(168,85,247,.55);background:rgba(255,255,255,.05);color:#fff;font-weight:800;font-size:9px;cursor:pointer'; b.onclick=fn; return b; };
    row.append(btn('ARM TRACE', arm), btn('SNAP', () => add('manual-snapshot', { snapshot: snapshot() })), btn('CLEAR', clear), btn('EXPORT', exportReport));
    body.append(stats, note, row);
    host.append(body);
    (document.body || document.documentElement).appendChild(host);
    state.ui = host;
    updateStats();
  }

  const uiBoot = () => document.documentElement ? makeUi() : setTimeout(uiBoot, 25);
  uiBoot();
  window.NovaSunoObjectUrlMseProbe = { version: VERSION, arm, clear, snapshot, report, export: exportReport };
})();
