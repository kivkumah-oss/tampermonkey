// ==UserScript==
// @name         Nova Suno Frame Audio Bridge v0.3
// @namespace    nova.research.suno
// @version      0.3.0
// @description  Resilient Suno-frame live audio analyser bridge for Nova. Survives Google DOM replacement and retries analyser attachment after playback starts. No API replay, auth capture, or rights/decryption handling.
// @author       Martin + Nova
// @match        https://suno.com/*
// @match        https://*.suno.com/*
// @match        https://www.google.com/*
// @match        https://www.google.co.uk/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.3.0';
  const BRIDGE = '__novaSunoAudioBridge_v3';
  const IS_SUNO = /(^|\.)suno\.com$/i.test(location.hostname);
  const IS_GOOGLE = /(^|\.)google\.(com|co\.uk)$/i.test(location.hostname);
  const IS_TOP = window.top === window.self;
  const GOOGLE_ORIGINS = new Set(['https://www.google.com','https://google.com','https://www.google.co.uk','https://google.co.uk']);

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fmtTime = s => {
    s = Number(s) || 0;
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ---------------- SUNO FRAME SIDE ----------------
  if (IS_SUNO) {
    const state = {
      audio: null,
      ctx: null,
      sourceNode: null,
      analyser: null,
      freq: null,
      stream: null,
      mode: 'waiting-for-playback',
      error: '',
      attempts: 0,
      attaching: false,
      lastAttachAt: 0,
      zeroFrames: 0
    };

    console.info(`[Nova Audio Bridge v${VERSION}] Suno frame loaded`, location.href);

    function pickAudio() {
      const all = [...document.querySelectorAll('audio')];
      const candidates = all.filter(a => !/sil-100\.mp3/i.test(a.currentSrc || a.src || ''));
      return candidates.find(a => /^blob:/i.test(a.currentSrc || a.src || ''))
        || candidates.find(a => Number.isFinite(a.duration) && a.duration > 5)
        || candidates[0]
        || null;
    }

    function titleInfo() {
      try {
        const m = navigator.mediaSession && navigator.mediaSession.metadata;
        return m ? { title: clean(m.title), artist: clean(m.artist), album: clean(m.album) } : { title:'', artist:'', album:'' };
      } catch (_) {
        return { title:'', artist:'', album:'' };
      }
    }

    function makeAnalyser(ctx) {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      a.smoothingTimeConstant = 0.72;
      return a;
    }

    function bandAverage(data, sampleRate, fftSize, lo, hi) {
      if (!data || !data.length || !sampleRate || !fftSize) return 0;
      const hz = sampleRate / fftSize;
      const first = Math.max(0, Math.floor(lo / hz));
      const last = Math.min(data.length - 1, Math.ceil(hi / hz));
      let sum = 0, n = 0;
      for (let i = first; i <= last; i++) { sum += data[i]; n++; }
      return n ? sum / n / 255 : 0;
    }

    function getLevels() {
      if (!state.analyser || !state.freq || !state.ctx) return { bass:0, mids:0, highs:0, energy:0, active:false };
      try {
        state.analyser.getByteFrequencyData(state.freq);
        const bass = bandAverage(state.freq, state.ctx.sampleRate, state.analyser.fftSize, 20, 160);
        const mids = bandAverage(state.freq, state.ctx.sampleRate, state.analyser.fftSize, 160, 2500);
        const highs = bandAverage(state.freq, state.ctx.sampleRate, state.analyser.fftSize, 2500, 12000);
        let sum = 0, max = 0;
        for (const v of state.freq) { sum += v; if (v > max) max = v; }
        const energy = state.freq.length ? sum / state.freq.length / 255 : 0;
        if (max === 0 && state.audio && !state.audio.paused) state.zeroFrames++; else state.zeroFrames = 0;
        return {
          bass: +bass.toFixed(4),
          mids: +mids.toFixed(4),
          highs: +highs.toFixed(4),
          energy: +energy.toFixed(4),
          active: max > 0
        };
      } catch (_) {
        return { bass:0, mids:0, highs:0, energy:0, active:false };
      }
    }

    function resetFailedContext() {
      try { if (state.ctx && state.ctx.state !== 'closed') state.ctx.close(); } catch (_) {}
      state.ctx = null;
      state.sourceNode = null;
      state.analyser = null;
      state.freq = null;
      state.stream = null;
    }

    async function tryStream(audio, method) {
      const fn = audio && audio[method];
      if (typeof fn !== 'function') throw new Error(`${method} unavailable`);
      const stream = fn.call(audio);
      const tracks = stream && stream.getAudioTracks ? stream.getAudioTracks() : [];
      if (!tracks.length) throw new Error(`${method} returned no audio track`);
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('AudioContext unavailable');
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = makeAnalyser(ctx);
      src.connect(analyser);
      try { await ctx.resume(); } catch (_) {}
      state.ctx = ctx;
      state.sourceNode = src;
      state.analyser = analyser;
      state.freq = new Uint8Array(analyser.frequencyBinCount);
      state.stream = stream;
      state.mode = method;
      return true;
    }

    async function tryMediaElement(audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('AudioContext unavailable');
      const ctx = new AC();
      const src = ctx.createMediaElementSource(audio);
      const analyser = makeAnalyser(ctx);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      try { await ctx.resume(); } catch (_) {}
      state.ctx = ctx;
      state.sourceNode = src;
      state.analyser = analyser;
      state.freq = new Uint8Array(analyser.frequencyBinCount);
      state.mode = 'mediaElementSource';
      return true;
    }

    async function attach(audio, force = false) {
      if (!audio || state.attaching) return;
      if (state.analyser && state.audio === audio) return;
      if (!force && audio.paused) {
        state.audio = audio;
        state.mode = 'waiting-for-playback';
        return;
      }
      const now = performance.now();
      if (!force && now - state.lastAttachAt < 1000) return;
      state.lastAttachAt = now;
      state.audio = audio;
      state.error = '';
      state.attempts++;
      state.attaching = true;
      const errors = [];

      try {
        try {
          await tryStream(audio, 'captureStream');
          return;
        } catch (e) {
          errors.push(clean(e && e.message || e));
          resetFailedContext();
        }

        try {
          if (audio.mozCaptureStream && audio.mozCaptureStream !== audio.captureStream) {
            await tryStream(audio, 'mozCaptureStream');
            return;
          }
        } catch (e) {
          errors.push(clean(e && e.message || e));
          resetFailedContext();
        }

        try {
          await tryMediaElement(audio);
          return;
        } catch (e) {
          errors.push(clean(e && e.message || e));
          resetFailedContext();
        }

        state.mode = 'telemetry-only';
        state.error = errors.filter(Boolean).join(' | ').slice(0, 600) || 'No analyser path available';
      } finally {
        state.attaching = false;
      }
    }

    function telemetry() {
      const a = state.audio || pickAudio();
      const levels = getLevels();
      let error = state.error;
      if (state.analyser && state.zeroFrames > 15 && a && !a.paused) error = 'Analyser attached but receiving silence';
      return {
        [BRIDGE]: true,
        type: 'telemetry',
        version: VERSION,
        mode: state.mode,
        contextState: state.ctx ? state.ctx.state : '',
        attempts: state.attempts,
        error,
        title: titleInfo(),
        audio: a ? {
          paused: !!a.paused,
          ended: !!a.ended,
          currentTime: Number.isFinite(a.currentTime) ? +a.currentTime.toFixed(3) : 0,
          duration: Number.isFinite(a.duration) ? +a.duration.toFixed(3) : 0,
          volume: Number.isFinite(a.volume) ? +a.volume.toFixed(3) : 1,
          muted: !!a.muted,
          playbackRate: Number.isFinite(a.playbackRate) ? +a.playbackRate.toFixed(3) : 1,
          srcKind: /^blob:/i.test(a.currentSrc || a.src || '') ? 'blob' : 'other'
        } : null,
        levels
      };
    }

    function send() {
      if (IS_TOP) return;
      try { window.parent.postMessage(telemetry(), '*'); } catch (_) {}
    }

    async function ensure(force = false) {
      const a = pickAudio();
      if (!a) { send(); return; }
      state.audio = a;
      if (!state.analyser && !a.paused) await attach(a, force);
      if (state.ctx && state.ctx.state === 'suspended' && !a.paused) {
        try { await state.ctx.resume(); } catch (_) {}
      }
      send();
    }

    window.addEventListener('message', async ev => {
      const d = ev.data;
      if (IS_TOP || !d || d[BRIDGE] !== true) return;
      if (!GOOGLE_ORIGINS.has(ev.origin)) return;
      const a = state.audio || pickAudio();

      if (d.type === 'reattach') {
        state.error = '';
        state.zeroFrames = 0;
        if (!state.analyser) await ensure(true);
        send();
        return;
      }

      if (d.type !== 'command' || !a) return;
      const cmd = d.command || {};
      try {
        if (cmd.name === 'play') await a.play();
        else if (cmd.name === 'pause') a.pause();
        else if (cmd.name === 'toggle') a.paused ? await a.play() : a.pause();
        else if (cmd.name === 'seek') a.currentTime = clamp(Number(cmd.value) || 0, 0, Number.isFinite(a.duration) ? a.duration : 1e9);
        else if (cmd.name === 'seekBy') a.currentTime = clamp((Number(a.currentTime) || 0) + (Number(cmd.value) || 0), 0, Number.isFinite(a.duration) ? a.duration : 1e9);
        else if (cmd.name === 'volume') a.volume = clamp(Number(cmd.value) || 0, 0, 1);
        await ensure(false);
      } catch (e) {
        state.error = clean(e && e.message || e);
        send();
      }
    }, true);

    function bootSuno() {
      setInterval(() => ensure(false), 250);
      const kick = ev => {
        if (!(ev.target instanceof HTMLMediaElement)) return;
        if (/sil-100\.mp3/i.test(ev.target.currentSrc || ev.target.src || '')) return;
        setTimeout(() => ensure(true), 50);
      };
      document.addEventListener('play', kick, true);
      document.addEventListener('playing', kick, true);
      document.addEventListener('loadedmetadata', () => ensure(false), true);
      ensure(false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSuno, { once:true });
    else bootSuno();
    return;
  }

  // ---------------- GOOGLE HOST SIDE ----------------
  if (IS_GOOGLE && IS_TOP) {
    const state = {
      source: null,
      origin: '',
      data: null,
      ui: null,
      bars: {},
      title: null,
      meta: null,
      time: null,
      mode: null,
      seek: null,
      vol: null,
      observer: null
    };

    console.info(`[Nova Audio Bridge v${VERSION}] Google host loaded`, location.href);

    function button(label, fn) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'padding:7px;border-radius:8px;border:1px solid rgba(168,85,247,.55);background:rgba(255,255,255,.05);color:white;font-weight:800;cursor:pointer;font:11px Arial,sans-serif';
      b.addEventListener('click', fn);
      return b;
    }

    function send(name, value) {
      if (!state.source || !state.origin) return;
      try { state.source.postMessage({ [BRIDGE]:true, type:'command', command:{ name, value } }, state.origin); } catch (_) {}
    }

    function reattach() {
      if (!state.source || !state.origin) return;
      try { state.source.postMessage({ [BRIDGE]:true, type:'reattach' }, state.origin); } catch (_) {}
    }

    function clearUiRefs() {
      state.ui = state.title = state.meta = state.time = state.mode = state.seek = state.vol = null;
      state.bars = {};
    }

    function makeUi() {
      if (!document.documentElement) return;
      if (state.ui && state.ui.isConnected) return;
      clearUiRefs();

      const old = document.getElementById('nova-suno-frame-audio-bridge-ui-v3');
      if (old) old.remove();

      const host = document.createElement('div');
      host.id = 'nova-suno-frame-audio-bridge-ui-v3';
      host.style.cssText = 'position:fixed!important;right:14px!important;bottom:14px!important;z-index:2147483647!important;width:360px!important;background:#071018!important;color:#eef7ff!important;border:1px solid #a855f7!important;border-radius:14px!important;box-shadow:0 12px 44px rgba(0,0,0,.55)!important;font:12px/1.35 Arial,sans-serif!important;overflow:hidden!important;pointer-events:auto!important;display:block!important;visibility:visible!important;opacity:1!important';

      const head = document.createElement('div');
      head.style.cssText = 'padding:9px 11px;background:linear-gradient(90deg,#7c3aed,#db2777,#0891b2);font-weight:900';
      head.textContent = `🎚️ Nova Suno Audio Bridge v${VERSION}`;

      const body = document.createElement('div');
      body.style.cssText = 'padding:10px';

      const title = document.createElement('div');
      title.style.cssText = 'font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      title.textContent = 'Waiting for embedded Suno…';

      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:10px;color:#94a3b8;margin:2px 0 7px;max-height:44px;overflow:hidden';
      meta.textContent = 'No telemetry yet';

      const time = document.createElement('div');
      time.style.cssText = 'font-size:11px;color:#c4b5fd;margin-bottom:5px';
      time.textContent = '0:00 / 0:00';

      const seek = document.createElement('input');
      seek.type = 'range';
      seek.min = '0'; seek.max = '1000'; seek.value = '0';
      seek.style.cssText = 'width:100%;margin:0 0 8px';
      seek.addEventListener('input', () => {
        const d = state.data && state.data.audio && state.data.audio.duration || 0;
        if (d) send('seek', d * (Number(seek.value) / 1000));
      });

      const levels = document.createElement('div');
      levels.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px';
      for (const key of ['bass','mids','highs','energy']) {
        const box = document.createElement('div');
        box.style.cssText = 'background:rgba(255,255,255,.04);padding:5px;border-radius:7px';
        const lab = document.createElement('div');
        lab.textContent = key.toUpperCase();
        lab.style.cssText = 'font-size:8px;color:#94a3b8;margin-bottom:3px';
        const outer = document.createElement('div');
        outer.style.cssText = 'height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden';
        const inner = document.createElement('div');
        inner.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#a855f7,#ec4899);transition:width .06s linear';
        outer.appendChild(inner); box.append(lab, outer); levels.appendChild(box); state.bars[key] = inner;
      }

      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:50px 1fr 50px 1fr;gap:6px;align-items:center';
      row.append(button('-10', () => send('seekBy', -10)), button('PLAY / PAUSE', () => send('toggle')), button('+10', () => send('seekBy', 10)));
      const vol = document.createElement('input');
      vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.01'; vol.value = '1';
      vol.addEventListener('input', () => send('volume', Number(vol.value)));
      row.appendChild(vol);

      const diag = document.createElement('div');
      diag.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;margin-top:7px';
      const mode = document.createElement('div');
      mode.style.cssText = 'font-size:9px;color:#94a3b8;overflow-wrap:anywhere';
      mode.textContent = 'Mode: waiting';
      const retry = button('RETRY ANALYSER', reattach);
      retry.style.fontSize = '8px'; retry.style.padding = '5px 7px';
      diag.append(mode, retry);

      body.append(title, meta, time, seek, levels, row, diag);
      host.append(head, body);

      const parent = document.body || document.documentElement;
      parent.appendChild(host);

      state.ui = host;
      state.title = title;
      state.meta = meta;
      state.time = time;
      state.mode = mode;
      state.seek = seek;
      state.vol = vol;
    }

    function render() {
      makeUi();
      const d = state.data;
      if (!d || !state.ui || !state.ui.isConnected) return;
      const a = d.audio || {}, t = d.title || {}, l = d.levels || {};
      state.title.textContent = t.title || 'Suno audio';
      state.meta.textContent = t.artist || state.origin || 'Embedded Suno';
      state.time.textContent = `${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`;
      if (a.duration) state.seek.value = String(Math.round(clamp((a.currentTime || 0) / a.duration, 0, 1) * 1000));
      if (Number.isFinite(a.volume)) state.vol.value = String(a.volume);
      state.mode.textContent = `Mode: ${d.mode || 'unknown'} · ctx ${d.contextState || '—'} · try ${d.attempts || 0}${d.error ? ` · ${d.error}` : ''}`;
      for (const key of ['bass','mids','highs','energy']) {
        if (state.bars[key]) state.bars[key].style.width = `${Math.round(clamp(Number(l[key]) || 0, 0, 1) * 100)}%`;
      }
    }

    function ensureUi() {
      try {
        if (!state.ui || !state.ui.isConnected) makeUi();
        if (state.ui && state.ui.parentNode !== document.body && document.body) document.body.appendChild(state.ui);
        render();
      } catch (e) {
        console.error(`[Nova Audio Bridge v${VERSION}] UI ensure failed`, e);
        clearUiRefs();
      }
    }

    window.addEventListener('message', ev => {
      const d = ev.data;
      if (!d || d[BRIDGE] !== true || d.type !== 'telemetry') return;
      try {
        if (!/(^|\.)suno\.com$/i.test(new URL(ev.origin).hostname)) return;
      } catch (_) { return; }
      state.source = ev.source;
      state.origin = ev.origin;
      state.data = d;
      render();
    }, true);

    function bootGoogle() {
      ensureUi();
      setInterval(ensureUi, 500);
      try {
        state.observer = new MutationObserver(() => {
          if (!state.ui || !state.ui.isConnected) ensureUi();
        });
        state.observer.observe(document.documentElement, { childList:true, subtree:true });
      } catch (_) {}
      window.addEventListener('pageshow', ensureUi, true);
      window.addEventListener('focus', ensureUi, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootGoogle, { once:true });
    else bootGoogle();
  }
})();
