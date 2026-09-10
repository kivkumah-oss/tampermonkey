// ==UserScript==
// @name         Nova Suno Frame Audio Bridge v0.2
// @namespace    nova.research.suno
// @version      0.2.0
// @description  Suno-frame live audio analyser bridge for Nova. Retries capture after playback starts and falls back to MediaElementAudioSourceNode. No API replay, auth capture, or rights/decryption handling.
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

  const VERSION = '0.2.0';
  const BRIDGE = '__novaSunoAudioBridge_v2';
  const IS_SUNO = /(^|\.)suno\.com$/i.test(location.hostname);
  const IS_GOOGLE = /(^|\.)google\.(com|co\.uk)$/i.test(location.hostname);
  const IS_TOP = window.top === window.self;
  const GOOGLE_ORIGINS = new Set(['https://www.google.com','https://google.com','https://www.google.co.uk','https://google.co.uk']);

  const clean = v => String(v == null ? '' : v).replace(/\s+/g,' ').trim();
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const fmtTime = s => { s=Number(s)||0; const m=Math.floor(s/60), sec=Math.floor(s%60); return `${m}:${String(sec).padStart(2,'0')}`; };

  // ---------------- Suno frame side ----------------
  if (IS_SUNO) {
    const state = {
      audio: null,
      stream: null,
      ctx: null,
      sourceNode: null,
      analyser: null,
      freq: null,
      mode: 'waiting-for-playback',
      lastError: '',
      attempts: 0,
      zeroFrames: 0,
      lastAttachAt: 0,
      routeConnected: false
    };

    function pickAudio(){
      const all=[...document.querySelectorAll('audio')];
      const candidates=all.filter(a=>!/sil-100\.mp3/i.test(a.currentSrc||a.src||''));
      return candidates.find(a=>/^blob:/i.test(a.currentSrc||a.src||''))
        || candidates.find(a=>Number.isFinite(a.duration)&&a.duration>5)
        || candidates[0]
        || null;
    }

    function mediaTitle(){
      try {
        const m=navigator.mediaSession&&navigator.mediaSession.metadata;
        return m?{title:clean(m.title),artist:clean(m.artist),album:clean(m.album)}:{title:'',artist:'',album:''};
      } catch (_) { return {title:'',artist:'',album:''}; }
    }

    function makeAnalyser(ctx){
      const an=ctx.createAnalyser();
      an.fftSize=1024;
      an.smoothingTimeConstant=0.72;
      return an;
    }

    function bandAverage(data,sampleRate,fftSize,lo,hi){
      if(!data||!data.length||!sampleRate||!fftSize)return 0;
      const hzPerBin=sampleRate/fftSize;
      const a=Math.max(0,Math.floor(lo/hzPerBin));
      const b=Math.min(data.length-1,Math.ceil(hi/hzPerBin));
      if(b<a)return 0;
      let sum=0,n=0;
      for(let i=a;i<=b;i++){sum+=data[i];n++;}
      return n?sum/n/255:0;
    }

    function levels(){
      const an=state.analyser;
      if(!an||!state.freq||!state.ctx)return {bass:0,mids:0,highs:0,energy:0,active:false};
      try {
        an.getByteFrequencyData(state.freq);
        const bass=bandAverage(state.freq,state.ctx.sampleRate,an.fftSize,20,160);
        const mids=bandAverage(state.freq,state.ctx.sampleRate,an.fftSize,160,2500);
        const highs=bandAverage(state.freq,state.ctx.sampleRate,an.fftSize,2500,12000);
        let sum=0,max=0;
        for(const v of state.freq){sum+=v;if(v>max)max=v;}
        const energy=state.freq.length?sum/state.freq.length/255:0;
        if(energy<0.001&&max===0&&!state.audio?.paused)state.zeroFrames++;else state.zeroFrames=0;
        return {bass:+bass.toFixed(4),mids:+mids.toFixed(4),highs:+highs.toFixed(4),energy:+energy.toFixed(4),active:max>0};
      } catch (_) { return {bass:0,mids:0,highs:0,energy:0,active:false}; }
    }

    function closeOldContext(){
      try { if(state.ctx&&state.ctx.state!=='closed') state.ctx.close(); } catch (_) {}
      state.stream=null; state.ctx=null; state.sourceNode=null; state.analyser=null; state.freq=null; state.routeConnected=false;
    }

    async function tryCaptureStream(audio,methodName){
      const fn=audio&&audio[methodName];
      if(typeof fn!=='function')throw new Error(`${methodName} unavailable`);
      const stream=fn.call(audio);
      const tracks=stream&&stream.getAudioTracks?stream.getAudioTracks():[];
      if(!tracks.length)throw new Error(`${methodName} returned no audio track`);
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)throw new Error('AudioContext unavailable');
      const ctx=new AC();
      const src=ctx.createMediaStreamSource(stream);
      const analyser=makeAnalyser(ctx);
      src.connect(analyser);
      try{await ctx.resume();}catch(_){}
      state.stream=stream; state.ctx=ctx; state.sourceNode=src; state.analyser=analyser;
      state.freq=new Uint8Array(analyser.frequencyBinCount); state.mode=methodName; state.routeConnected=true;
      return true;
    }

    async function tryMediaElementSource(audio){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)throw new Error('AudioContext unavailable');
      const ctx=new AC();
      const src=ctx.createMediaElementSource(audio);
      const analyser=makeAnalyser(ctx);
      // createMediaElementSource reroutes the element through WebAudio, so reconnect to destination to preserve sound.
      src.connect(analyser);
      analyser.connect(ctx.destination);
      try{await ctx.resume();}catch(_){}
      state.ctx=ctx; state.sourceNode=src; state.analyser=analyser;
      state.freq=new Uint8Array(analyser.frequencyBinCount); state.mode='mediaElementSource'; state.routeConnected=true;
      return true;
    }

    async function attachAnalyser(audio,force=false){
      if(!audio)return;
      // v0.1 bug fix: do NOT permanently give up just because captureStream was empty while paused.
      if(!force&&state.analyser&&state.audio===audio)return;
      if(!force&&audio.paused){state.audio=audio;state.mode='waiting-for-playback';return;}
      const now=performance.now();
      if(!force&&now-state.lastAttachAt<800)return;
      state.lastAttachAt=now;
      state.audio=audio;
      state.lastError=''; state.attempts++;

      const errors=[];
      // Only tear down contexts created by a failed capture attempt. Never tear down a successful MediaElementSource route and recreate it.
      if(state.analyser)return;

      try {
        await tryCaptureStream(audio,'captureStream');
        return;
      } catch(err){errors.push(clean(err&&err.message||err));closeOldContext();}

      // Firefox can expose mozCaptureStream separately. Try it even if captureStream exists but yielded no audio track.
      try {
        if(audio.mozCaptureStream&&audio.mozCaptureStream!==audio.captureStream){
          await tryCaptureStream(audio,'mozCaptureStream');
          return;
        }
      } catch(err){errors.push(clean(err&&err.message||err));closeOldContext();}

      try {
        await tryMediaElementSource(audio);
        return;
      } catch(err){errors.push(clean(err&&err.message||err));closeOldContext();}

      state.mode='telemetry-only';
      state.lastError=errors.filter(Boolean).join(' | ').slice(0,500)||'No analyser path available';
    }

    function telemetry(){
      const a=state.audio||pickAudio();
      if(!a)return {type:'telemetry',version:VERSION,mode:'waiting',title:mediaTitle(),audio:null,levels:{bass:0,mids:0,highs:0,energy:0,active:false},contextState:'',attempts:state.attempts,error:''};
      const l=levels();
      let error=state.lastError;
      if(state.mode==='mediaElementSource'&&!a.paused&&state.zeroFrames>12)error='WebAudio connected but analyser is receiving silence';
      return {
        type:'telemetry',version:VERSION,mode:state.mode,title:mediaTitle(),
        audio:{paused:!!a.paused,ended:!!a.ended,currentTime:Number.isFinite(a.currentTime)?+a.currentTime.toFixed(3):0,duration:Number.isFinite(a.duration)?+a.duration.toFixed(3):0,volume:+a.volume.toFixed(3),muted:!!a.muted,playbackRate:+a.playbackRate.toFixed(3),srcKind:/^blob:/i.test(a.currentSrc||a.src||'')?'blob':'other'},
        levels:l,contextState:state.ctx?state.ctx.state:'',attempts:state.attempts,error
      };
    }

    function send(){
      if(IS_TOP)return;
      try{window.parent.postMessage({[BRIDGE]:true,...telemetry()},'*');}catch(_){}
    }

    async function ensure(force=false){
      const a=pickAudio();
      if(!a){send();return;}
      if(a!==state.audio){
        // Suno normally reuses one element, but handle replacement safely.
        if(state.mode!=='mediaElementSource')closeOldContext();
        state.audio=a;
      }
      if(!state.analyser&&!a.paused)await attachAnalyser(a,force);
      if(state.ctx&&state.ctx.state==='suspended'&&!a.paused){try{await state.ctx.resume();}catch(_){} }
      send();
    }

    window.addEventListener('message',async ev=>{
      if(IS_TOP||!ev.data||ev.data[BRIDGE]!==true)return;
      if(!GOOGLE_ORIGINS.has(ev.origin))return;
      const a=state.audio||pickAudio();
      if(ev.data.type==='reattach'){state.lastError='';state.zeroFrames=0;await ensure(true);send();return;}
      if(ev.data.type!=='command'||!a)return;
      const cmd=ev.data.command||{};
      try {
        switch(cmd.name){
          case 'play': await a.play(); break;
          case 'pause': a.pause(); break;
          case 'toggle': a.paused?await a.play():a.pause(); break;
          case 'seek': a.currentTime=clamp(Number(cmd.value)||0,0,Number.isFinite(a.duration)?a.duration:1e9); break;
          case 'seekBy': a.currentTime=clamp((Number(a.currentTime)||0)+(Number(cmd.value)||0),0,Number.isFinite(a.duration)?a.duration:1e9); break;
          case 'volume': a.volume=clamp(Number(cmd.value)||0,0,1); break;
        }
        await ensure();
      } catch(err){state.lastError=clean(err&&err.message||err);send();}
    },true);

    const boot=()=>{
      setInterval(()=>ensure(false),200);
      document.addEventListener('play',ev=>{if(ev.target instanceof HTMLMediaElement&&!/sil-100\.mp3/i.test(ev.target.currentSrc||ev.target.src||''))setTimeout(()=>attachAnalyser(ev.target,true).then(send),0);},true);
      document.addEventListener('playing',ev=>{if(ev.target instanceof HTMLMediaElement&&!/sil-100\.mp3/i.test(ev.target.currentSrc||ev.target.src||''))setTimeout(()=>attachAnalyser(ev.target,true).then(send),0);},true);
      document.addEventListener('loadedmetadata',()=>ensure(false),true);
      ensure(false);
    };
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
    return;
  }

  // ---------------- Google host side ----------------
  if(IS_GOOGLE&&IS_TOP){
    const state={source:null,origin:'',data:null,ui:null,bars:{},title:null,meta:null,time:null,mode:null,seek:null,vol:null,attempt:null};

    function send(name,value){if(!state.source||!state.origin)return;try{state.source.postMessage({[BRIDGE]:true,type:'command',command:{name,value}},state.origin);}catch(_){} }
    function reattach(){if(!state.source||!state.origin)return;try{state.source.postMessage({[BRIDGE]:true,type:'reattach'},state.origin);}catch(_){} }

    function makeUi(){
      if(state.ui||!document.documentElement)return;
      const host=document.createElement('div');host.id='nova-suno-frame-audio-bridge-ui-v2';host.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647;width:360px;background:#071018;color:#eef7ff;border:1px solid #a855f7;border-radius:14px;box-shadow:0 12px 44px rgba(0,0,0,.55);font:12px/1.35 Arial,sans-serif;overflow:hidden';
      host.innerHTML=`<div style="padding:9px 11px;background:linear-gradient(90deg,#7c3aed,#db2777,#0891b2);font-weight:900">🎚️ Nova Suno Audio Bridge <small style="opacity:.75">v${VERSION}</small></div>`;
      const body=document.createElement('div');body.style.cssText='padding:10px';
      const title=document.createElement('div');title.style.cssText='font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';title.textContent='Waiting for embedded Suno…';
      const meta=document.createElement('div');meta.style.cssText='font-size:10px;color:#94a3b8;margin:2px 0 7px';meta.textContent='No telemetry yet';
      const time=document.createElement('div');time.style.cssText='font-size:11px;color:#c4b5fd;margin-bottom:5px';time.textContent='0:00 / 0:00';
      const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.style.cssText='width:100%;margin:0 0 8px';seek.oninput=()=>{const d=state.data&&state.data.audio&&state.data.audio.duration||0;if(d)send('seek',d*(Number(seek.value)/1000));};
      const levelsWrap=document.createElement('div');levelsWrap.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px';
      for(const k of ['bass','mids','highs','energy']){const box=document.createElement('div');box.style.cssText='background:rgba(255,255,255,.04);padding:5px;border-radius:7px';const lab=document.createElement('div');lab.textContent=k.toUpperCase();lab.style.cssText='font-size:8px;color:#94a3b8;margin-bottom:3px';const outer=document.createElement('div');outer.style.cssText='height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden';const inner=document.createElement('div');inner.style.cssText='height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#a855f7,#ec4899);transition:width .06s linear';outer.appendChild(inner);box.append(lab,outer);levelsWrap.appendChild(box);state.bars[k]=inner;}
      const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:50px 1fr 50px 1fr;gap:6px;align-items:center';
      const btn=(t,fn)=>{const b=document.createElement('button');b.textContent=t;b.onclick=fn;b.style.cssText='padding:7px;border-radius:8px;border:1px solid rgba(168,85,247,.55);background:rgba(255,255,255,.05);color:white;font-weight:800;cursor:pointer';return b;};
      row.append(btn('-10',()=>send('seekBy',-10)),btn('PLAY / PAUSE',()=>send('toggle')),btn('+10',()=>send('seekBy',10)));
      const vol=document.createElement('input');vol.type='range';vol.min='0';vol.max='1';vol.step='0.01';vol.value='1';vol.oninput=()=>send('volume',Number(vol.value));row.append(vol);
      const diag=document.createElement('div');diag.style.cssText='display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;margin-top:7px';
      const mode=document.createElement('div');mode.style.cssText='font-size:9px;color:#94a3b8';mode.textContent='Mode: waiting';
      const retry=btn('RETRY ANALYSER',reattach);retry.style.fontSize='8px';retry.style.padding='5px 7px';diag.append(mode,retry);
      body.append(title,meta,time,seek,levelsWrap,row,diag);host.appendChild(body);(document.body||document.documentElement).appendChild(host);
      state.ui=host;state.title=title;state.meta=meta;state.time=time;state.mode=mode;state.seek=seek;state.vol=vol;
    }

    function render(){
      makeUi();const d=state.data;if(!d||!state.ui)return;const a=d.audio||{},t=d.title||{},l=d.levels||{};
      state.title.textContent=t.title||'Suno audio';state.meta.textContent=t.artist||state.origin||'Embedded Suno';state.time.textContent=`${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`;
      if(a.duration)state.seek.value=String(Math.round(clamp(a.currentTime/a.duration,0,1)*1000));if(Number.isFinite(a.volume))state.vol.value=String(a.volume);
      state.mode.textContent=`Mode: ${d.mode||'unknown'} · ctx ${d.contextState||'—'} · try ${d.attempts||0}${d.error?` · ${d.error}`:''}`;
      for(const k of ['bass','mids','highs','energy'])if(state.bars[k])state.bars[k].style.width=`${Math.round(clamp(Number(l[k])||0,0,1)*100)}%`;
    }

    window.addEventListener('message',ev=>{const d=ev.data;if(!d||d[BRIDGE]!==true||d.type!=='telemetry')return;try{if(!/(^|\.)suno\.com$/i.test(new URL(ev.origin).hostname))return;}catch(_){return;}state.source=ev.source;state.origin=ev.origin;state.data=d;render();},true);
    const boot=()=>{makeUi();setInterval(render,100);};
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
  }
})();
