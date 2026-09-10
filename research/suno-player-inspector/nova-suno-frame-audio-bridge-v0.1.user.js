// ==UserScript==
// @name         Nova Suno Frame Audio Bridge
// @namespace    nova.research.suno
// @version      0.1.0
// @description  Passive Suno-frame audio telemetry bridge for Nova. Uses the already-playing Suno audio element and sends sanitized playback/audio-reactive telemetry to a Google parent page. No API replay, no auth capture, no rights/decryption handling.
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

  const VERSION = '0.1.0';
  const BRIDGE = '__novaSunoAudioBridge_v1';
  const IS_SUNO = /(^|\.)suno\.com$/i.test(location.hostname);
  const IS_GOOGLE = /(^|\.)google\.(com|co\.uk)$/i.test(location.hostname);
  const IS_TOP = window.top === window.self;
  const GOOGLE_ORIGINS = new Set(['https://www.google.com','https://google.com','https://www.google.co.uk','https://google.co.uk']);

  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function fmtTime(s){ s=Number(s)||0; const m=Math.floor(s/60), sec=Math.floor(s%60); return `${m}:${String(sec).padStart(2,'0')}`; }

  // ---------------- Suno frame side ----------------
  if (IS_SUNO) {
    const state = {
      audio: null,
      stream: null,
      ctx: null,
      analyser: null,
      freq: null,
      mode: 'waiting',
      lastError: '',
      lastSent: 0
    };

    function pickAudio(){
      const all = [...document.querySelectorAll('audio')];
      const candidates = all.filter(a => !/sil-100\.mp3/i.test(a.currentSrc || a.src || ''));
      return candidates.find(a => /^blob:/i.test(a.currentSrc || a.src || ''))
        || candidates.find(a => Number.isFinite(a.duration) && a.duration > 5)
        || candidates[0]
        || null;
    }

    function mediaTitle(){
      try {
        const m = navigator.mediaSession && navigator.mediaSession.metadata;
        return m ? { title:clean(m.title), artist:clean(m.artist), album:clean(m.album) } : {title:'',artist:'',album:''};
      } catch (_) { return {title:'',artist:'',album:''}; }
    }

    function bandAverage(data, sampleRate, fftSize, lo, hi){
      if (!data || !data.length || !sampleRate || !fftSize) return 0;
      const hzPerBin = sampleRate / fftSize;
      let a = Math.max(0, Math.floor(lo / hzPerBin));
      let b = Math.min(data.length - 1, Math.ceil(hi / hzPerBin));
      if (b < a) return 0;
      let sum = 0, n = 0;
      for (let i=a;i<=b;i++){ sum += data[i]; n++; }
      return n ? sum / n / 255 : 0;
    }

    function levels(){
      const an = state.analyser;
      if (!an || !state.freq || !state.ctx) return {bass:0,mids:0,highs:0,energy:0,active:false};
      try {
        an.getByteFrequencyData(state.freq);
        const bass = bandAverage(state.freq,state.ctx.sampleRate,an.fftSize,20,160);
        const mids = bandAverage(state.freq,state.ctx.sampleRate,an.fftSize,160,2500);
        const highs = bandAverage(state.freq,state.ctx.sampleRate,an.fftSize,2500,12000);
        let sum = 0;
        for (const v of state.freq) sum += v;
        const energy = state.freq.length ? sum / state.freq.length / 255 : 0;
        return {bass:+bass.toFixed(4),mids:+mids.toFixed(4),highs:+highs.toFixed(4),energy:+energy.toFixed(4),active:true};
      } catch (_) { return {bass:0,mids:0,highs:0,energy:0,active:false}; }
    }

    async function attachAnalyser(audio){
      if (!audio || state.audio === audio && state.analyser) return;
      state.audio = audio;
      state.stream = null; state.ctx = null; state.analyser = null; state.freq = null; state.lastError='';
      try {
        const capture = audio.captureStream || audio.mozCaptureStream;
        if (typeof capture !== 'function') throw new Error('captureStream unavailable');
        const stream = capture.call(audio);
        const tracks = stream && stream.getAudioTracks ? stream.getAudioTracks() : [];
        if (!tracks.length) throw new Error('captureStream returned no audio track');
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('AudioContext unavailable');
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        src.connect(analyser);
        state.stream = stream;
        state.ctx = ctx;
        state.analyser = analyser;
        state.freq = new Uint8Array(analyser.frequencyBinCount);
        state.mode = 'captureStream';
        try { await ctx.resume(); } catch (_) {}
      } catch (err) {
        state.mode = 'telemetry-only';
        state.lastError = clean(err && err.message || err);
      }
    }

    function telemetry(){
      const a = state.audio || pickAudio();
      if (!a) return {type:'telemetry',version:VERSION,mode:'waiting',title:mediaTitle(),audio:null,levels:{bass:0,mids:0,highs:0,energy:0,active:false},error:''};
      return {
        type:'telemetry', version:VERSION, mode:state.mode, title:mediaTitle(),
        audio:{
          paused:!!a.paused, ended:!!a.ended,
          currentTime:Number.isFinite(a.currentTime)?+a.currentTime.toFixed(3):0,
          duration:Number.isFinite(a.duration)?+a.duration.toFixed(3):0,
          volume:+a.volume.toFixed(3), muted:!!a.muted,
          playbackRate:+a.playbackRate.toFixed(3),
          srcKind:/^blob:/i.test(a.currentSrc||a.src||'')?'blob':'other'
        },
        levels:levels(), error:state.lastError
      };
    }

    function send(){
      if (IS_TOP) return; // this prototype is for embedded Suno -> Google parent
      try { window.parent.postMessage({[BRIDGE]:true,...telemetry()}, '*'); } catch (_) {}
    }

    async function ensure(){
      const a = pickAudio();
      if (a && a !== state.audio) await attachAnalyser(a);
      else if (a && state.ctx && state.ctx.state === 'suspended' && !a.paused) { try { await state.ctx.resume(); } catch (_) {} }
      send();
    }

    window.addEventListener('message', async ev => {
      if (IS_TOP || !ev.data || ev.data[BRIDGE] !== true || ev.data.type !== 'command') return;
      if (!GOOGLE_ORIGINS.has(ev.origin)) return;
      const a = state.audio || pickAudio();
      if (!a) return;
      const cmd = ev.data.command || {};
      try {
        switch (cmd.name) {
          case 'play': await a.play(); break;
          case 'pause': a.pause(); break;
          case 'toggle': a.paused ? await a.play() : a.pause(); break;
          case 'seek': a.currentTime = clamp(Number(cmd.value)||0,0,Number.isFinite(a.duration)?a.duration:1e9); break;
          case 'seekBy': a.currentTime = clamp((Number(a.currentTime)||0)+(Number(cmd.value)||0),0,Number.isFinite(a.duration)?a.duration:1e9); break;
          case 'volume': a.volume = clamp(Number(cmd.value)||0,0,1); break;
        }
        if (state.ctx && state.ctx.state === 'suspended') { try { await state.ctx.resume(); } catch (_) {} }
      } catch (err) { state.lastError = clean(err && err.message || err); }
      send();
    }, true);

    const boot = () => {
      ensure();
      setInterval(ensure, 250);
      document.addEventListener('play', ensure, true);
      document.addEventListener('loadedmetadata', ensure, true);
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot, {once:true}) : boot();
    return;
  }

  // ---------------- Google host side ----------------
  if (IS_GOOGLE && IS_TOP) {
    const state = { source:null, origin:'', data:null, ui:null, bars:{}, title:null, meta:null, time:null, mode:null, seek:null, vol:null };

    function send(name,value){
      if (!state.source || !state.origin) return;
      try { state.source.postMessage({[BRIDGE]:true,type:'command',command:{name,value}}, state.origin); } catch (_) {}
    }

    function makeUi(){
      if (state.ui || !document.documentElement) return;
      const host=document.createElement('div');
      host.id='nova-suno-frame-audio-bridge-ui';
      host.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647;width:360px;background:#071018;color:#eef7ff;border:1px solid #a855f7;border-radius:14px;box-shadow:0 12px 44px rgba(0,0,0,.55);font:12px/1.35 Arial,sans-serif;overflow:hidden';
      host.innerHTML='<div style="padding:9px 11px;background:linear-gradient(90deg,#7c3aed,#db2777,#0891b2);font-weight:900">🎚️ Nova Suno Audio Bridge <small style="opacity:.75">v0.1.0</small></div>';
      const body=document.createElement('div'); body.style.cssText='padding:10px';
      const title=document.createElement('div'); title.style.cssText='font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; title.textContent='Waiting for embedded Suno…';
      const meta=document.createElement('div'); meta.style.cssText='font-size:10px;color:#94a3b8;margin:2px 0 7px'; meta.textContent='No telemetry yet';
      const time=document.createElement('div'); time.style.cssText='font-size:11px;color:#c4b5fd;margin-bottom:5px'; time.textContent='0:00 / 0:00';
      const seek=document.createElement('input'); seek.type='range'; seek.min='0'; seek.max='1000'; seek.value='0'; seek.style.cssText='width:100%;margin:0 0 8px'; seek.oninput=()=>{ const d=state.data&&state.data.audio&&state.data.audio.duration||0; if(d) send('seek',d*(Number(seek.value)/1000)); };
      const levelsWrap=document.createElement('div'); levelsWrap.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px';
      for(const k of ['bass','mids','highs','energy']){
        const box=document.createElement('div'); box.style.cssText='background:rgba(255,255,255,.04);padding:5px;border-radius:7px';
        const lab=document.createElement('div'); lab.textContent=k.toUpperCase(); lab.style.cssText='font-size:8px;color:#94a3b8;margin-bottom:3px';
        const outer=document.createElement('div'); outer.style.cssText='height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden';
        const inner=document.createElement('div'); inner.style.cssText='height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#a855f7,#ec4899);transition:width .08s linear'; outer.appendChild(inner); box.append(lab,outer); levelsWrap.appendChild(box); state.bars[k]=inner;
      }
      const row=document.createElement('div'); row.style.cssText='display:grid;grid-template-columns:55px 1fr 55px 1fr;gap:6px;align-items:center';
      const btn=(t,fn)=>{const b=document.createElement('button');b.textContent=t;b.onclick=fn;b.style.cssText='padding:7px;border-radius:8px;border:1px solid rgba(168,85,247,.55);background:rgba(255,255,255,.05);color:white;font-weight:800;cursor:pointer';return b};
      row.append(btn('-10',()=>send('seekBy',-10)),btn('PLAY / PAUSE',()=>send('toggle')),btn('+10',()=>send('seekBy',10)));
      const vol=document.createElement('input');vol.type='range';vol.min='0';vol.max='1';vol.step='0.01';vol.value='1';vol.oninput=()=>send('volume',Number(vol.value));row.append(vol);
      const mode=document.createElement('div');mode.style.cssText='font-size:9px;color:#94a3b8;margin-top:7px';mode.textContent='Mode: waiting';
      body.append(title,meta,time,seek,levelsWrap,row,mode);host.appendChild(body);(document.body||document.documentElement).appendChild(host);
      state.ui=host;state.title=title;state.meta=meta;state.time=time;state.mode=mode;state.seek=seek;state.vol=vol;
    }

    function render(){
      makeUi();
      const d=state.data;if(!d||!state.ui)return;
      const a=d.audio||{}, t=d.title||{}, l=d.levels||{};
      state.title.textContent=t.title||'Suno audio';
      state.meta.textContent=t.artist||state.origin||'Embedded Suno';
      state.time.textContent=`${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`;
      if(a.duration) state.seek.value=String(Math.round(clamp(a.currentTime/a.duration,0,1)*1000));
      if(Number.isFinite(a.volume)) state.vol.value=String(a.volume);
      state.mode.textContent=`Mode: ${d.mode||'unknown'}${d.error?` · ${d.error}`:''}`;
      for(const k of ['bass','mids','highs','energy']) if(state.bars[k]) state.bars[k].style.width=`${Math.round(clamp(Number(l[k])||0,0,1)*100)}%`;
    }

    window.addEventListener('message', ev=>{
      const d=ev.data;
      if(!d||d[BRIDGE]!==true||d.type!=='telemetry')return;
      if(!/(^|\.)suno\.com$/i.test(new URL(ev.origin).hostname))return;
      state.source=ev.source;state.origin=ev.origin;state.data=d;render();
    },true);

    const boot=()=>{makeUi();setInterval(render,250)};
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
  }
})();
