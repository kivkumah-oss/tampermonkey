// ==UserScript==
// @name         Nova Suno Player Inspector SAFE
// @namespace    nova.research.suno
// @version      0.2.0
// @description  Staged passive Suno inspector: safe baseline first, optional network deep-capture after page load, media/resource tracing, action marks, safe JSON export.
// @author       Martin + Nova
// @match        https://suno.com/*
// @match        https://*.suno.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.2.0';
  const TOP = window.top === window.self;
  const START = performance.now();
  const UI_ID = 'nova-suno-player-inspector-safe';
  const MAX_EVENTS = 5000;
  const SENSITIVE = /(authorization|cookie|token|secret|password|session|credential|signature|jwt|api[_-]?key|csrf|xsrf)/i;
  const INTERESTING = /^(id|clip_id|clipId|song_id|songId|title|status|duration|content_type|contentType|delivery|encoding|audio_url|audioUrl|video_url|videoUrl|media_urls|mediaUrls|image_url|imageUrl|image_large_url|position|volume|repeat|playing|paused|has_more|next_cursor)$/i;

  const state = { seq:0, mediaSeq:0, events:[], endpoints:new Map(), resources:new Map(), media:new Map(), marks:[], mutations:0, ui:null, stats:null, statsQueued:false, netArmed:false, fetchOriginal:null, xhrOpenOriginal:null, xhrSendOriginal:null };
  const ms = () => Math.round(performance.now() - START);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function safeUrl(input) {
    try {
      const u = new URL(String(input || ''), location.href);
      const queryKeys = [...u.searchParams.keys()];
      u.search = queryKeys.length ? '?' + queryKeys.map(k => encodeURIComponent(k) + '=<redacted>').join('&') : '';
      u.hash = '';
      return { full:u.toString(), origin:u.origin, host:u.hostname, path:u.pathname, queryKeys };
    } catch (_) {
      const raw = clean(input).slice(0, 300);
      return { full:raw, origin:'', host:'', path:raw, queryKeys:[] };
    }
  }

  function shape(value, depth=0) {
    if (depth > 5) return {type:'max-depth'};
    if (value == null) return {type:'null'};
    if (Array.isArray(value)) return {type:'array', length:value.length, itemShape:value.length ? shape(value[0], depth+1) : null};
    const t = typeof value;
    if (t === 'object') {
      const keys = Object.keys(value).slice(0, 100), child = {};
      for (const k of keys) child[k] = SENSITIVE.test(k) ? {type:'<sensitive-key>'} : shape(value[k], depth+1);
      return {type:'object', keyCount:Object.keys(value).length, keys, shape:child};
    }
    if (t === 'string') {
      const hints=[];
      if (/^https?:\/\//i.test(value)) hints.push('url');
      if (/^blob:/i.test(value)) hints.push('blob-url');
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) hints.push('uuid');
      return {type:'string', length:value.length, hints};
    }
    if (t === 'number') return {type:'number', finite:Number.isFinite(value)};
    return {type:t};
  }

  function interesting(value, path='', depth=0, out=[]) {
    if (value == null || depth > 7 || out.length >= 160) return out;
    if (Array.isArray(value)) { value.slice(0,25).forEach((v,i)=>interesting(v, `${path}[${i}]`, depth+1, out)); return out; }
    if (typeof value !== 'object') return out;
    for (const [k,v] of Object.entries(value).slice(0,150)) {
      if (SENSITIVE.test(k)) continue;
      const p = path ? `${path}.${k}` : k;
      if (INTERESTING.test(k)) {
        if (typeof v === 'string') out.push({path:p,key:k,value:/^https?:\/\//i.test(v)?safeUrl(v).full:clean(v).slice(0,350)});
        else if (typeof v === 'number' || typeof v === 'boolean') out.push({path:p,key:k,value:v});
      }
      interesting(v,p,depth+1,out);
    }
    return out;
  }

  function scheduleStats() {
    if (state.statsQueued) return;
    state.statsQueued = true;
    requestAnimationFrame(() => {
      state.statsQueued = false;
      if (!state.stats) return;
      let mc = state.media.size;
      try { mc = document.querySelectorAll('audio,video').length; } catch (_) {}
      const text = `E ${state.events.length} · API ${state.endpoints.size} · MEDIA ${mc} · MARKS ${state.marks.length} · NET ${state.netArmed?'ARMED':'SAFE'}`;
      if (state.stats.textContent !== text) state.stats.textContent = text;
    });
  }

  function addEvent(type, data={}) {
    const e = {n:++state.seq, at:new Date().toISOString(), ms:ms(), type, topFrame:TOP, ...data};
    state.events.push(e);
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    scheduleStats();
    return e;
  }

  function touchEndpoint(method,url,patch={}) {
    const u=safeUrl(url), key=`${String(method||'GET').toUpperCase()} ${u.origin}${u.path}`;
    let x=state.endpoints.get(key);
    if(!x){x={key,method:String(method||'GET').toUpperCase(),host:u.host,path:u.path,queryKeys:u.queryKeys,count:0,statuses:{},contentTypes:[],requestShapes:[],responseShapes:[],interesting:[]};state.endpoints.set(key,x)}
    if(patch.increment!==false)x.count++;
    if(patch.status!=null)x.statuses[String(patch.status)]=(x.statuses[String(patch.status)]||0)+1;
    if(patch.contentType&&!x.contentTypes.includes(patch.contentType))x.contentTypes.push(patch.contentType);
    if(patch.requestShape)x.requestShapes.push(patch.requestShape);
    if(patch.responseShape)x.responseShapes.push(patch.responseShape);
    if(patch.interesting&&patch.interesting.length)x.interesting.push(...patch.interesting);
    x.requestShapes=x.requestShapes.slice(-4);x.responseShapes=x.responseShapes.slice(-4);x.interesting=x.interesting.slice(-180);
  }

  function bodyShape(body){
    if(body==null)return null;
    if(typeof body==='string'){try{return shape(JSON.parse(body))}catch(_){return{type:'text',length:body.length}}}
    try{if(body instanceof FormData)return{type:'formdata',keys:[...body.keys()]}}catch(_){}
    try{if(body instanceof URLSearchParams)return{type:'urlsearchparams',keys:[...body.keys()]}}catch(_){}
    try{if(body instanceof Blob)return{type:'blob',size:body.size,mime:body.type||''}}catch(_){}
    return{type:Object.prototype.toString.call(body)};
  }

  function armNetworkCapture(){
    if(state.netArmed)return;
    state.netArmed=true;
    try{
      state.fetchOriginal=window.fetch;
      const original=state.fetchOriginal;
      if(typeof original==='function'){
        window.fetch=function(input,init){
          const url=typeof input==='string'?input:(input&&input.url)||'';
          const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
          const req=bodyShape(init&&init.body);
          addEvent('fetch-request',{method,url:safeUrl(url),requestShape:req});touchEndpoint(method,url,{requestShape:req});
          const result=original.apply(this,arguments);
          Promise.resolve(result).then(async r=>{
            const ct=r&&r.headers&&r.headers.get?(r.headers.get('content-type')||''):'';let rs=null,ints=[];
            if(/json/i.test(ct)){try{const d=await r.clone().json();rs=shape(d);ints=interesting(d)}catch(_){}}
            touchEndpoint(method,url,{increment:false,status:r.status,contentType:ct,responseShape:rs,interesting:ints});
            addEvent('fetch-response',{method,url:safeUrl(url),status:r.status,contentType:ct,responseShape:rs,interesting:ints});
          }).catch(err=>addEvent('fetch-observe-error',{method,url:safeUrl(url),error:clean(err&&err.message||err)}));
          return result;
        };
        addEvent('hook-installed',{hook:'fetch',stage:'manual'});
      }
    }catch(err){addEvent('hook-error',{hook:'fetch',error:clean(err&&err.message||err)})}

    try{
      const p=XMLHttpRequest&&XMLHttpRequest.prototype;
      if(p){
        state.xhrOpenOriginal=p.open;state.xhrSendOriginal=p.send;
        const originalOpen=state.xhrOpenOriginal, originalSend=state.xhrSendOriginal;
        p.open=function(method,url){this.__nspiReq={method:String(method||'GET').toUpperCase(),url:String(url||'')};return originalOpen.apply(this,arguments)};
        p.send=function(body){
          const m=this.__nspiReq||{method:'GET',url:''},req=bodyShape(body);
          addEvent('xhr-request',{method:m.method,url:safeUrl(m.url),requestShape:req});touchEndpoint(m.method,m.url,{requestShape:req});
          this.addEventListener('loadend',()=>{
            let ct='';try{ct=this.getResponseHeader('content-type')||''}catch(_){}let rs=null,ints=[];
            if(/json/i.test(ct)){try{const d=JSON.parse(this.responseText||'null');rs=shape(d);ints=interesting(d)}catch(_){}}
            touchEndpoint(m.method,m.url,{increment:false,status:this.status,contentType:ct,responseShape:rs,interesting:ints});
            addEvent('xhr-response',{method:m.method,url:safeUrl(m.url),status:this.status,contentType:ct,responseShape:rs,interesting:ints});
          },{once:true});
          return originalSend.apply(this,arguments);
        };
        addEvent('hook-installed',{hook:'xhr',stage:'manual'});
      }
    }catch(err){addEvent('hook-error',{hook:'xhr',error:clean(err&&err.message||err)})}
    scheduleStats();
  }

  function mediaSnap(el){
    const raw=el.currentSrc||el.src||el.getAttribute('src')||'',u=raw?safeUrl(raw):null;
    return{tag:el.tagName,src:u?u.full:'',srcHost:u?u.host:'',srcPath:u?u.path:'',readyState:el.readyState,networkState:el.networkState,paused:el.paused,ended:el.ended,duration:Number.isFinite(el.duration)?+el.duration.toFixed(3):null,currentTime:Number.isFinite(el.currentTime)?+el.currentTime.toFixed(3):null,volume:el.volume,muted:el.muted,playbackRate:el.playbackRate,crossOrigin:el.crossOrigin||''};
  }

  function watchMedia(el){
    if(!el||!(el instanceof HTMLMediaElement)||el.dataset.nspiWatched==='1')return;
    el.dataset.nspiWatched='1';const id=`media-${++state.mediaSeq}`;el.dataset.nspiId=id;state.media.set(id,mediaSnap(el));addEvent('media-found',{mediaId:id,media:mediaSnap(el)});
    for(const name of ['loadstart','loadedmetadata','loadeddata','canplay','play','playing','pause','waiting','stalled','error','ended','volumechange','durationchange','ratechange','seeking','seeked']){
      el.addEventListener(name,()=>{const snap=mediaSnap(el);state.media.set(id,snap);addEvent('media-event',{mediaId:id,event:name,media:snap,mediaError:name==='error'&&el.error?{code:el.error.code,message:el.error.message||''}:null})},true);
    }
  }

  function scanMedia(root=document){try{if(root.matches&&root.matches('audio,video'))watchMedia(root);if(root.querySelectorAll)root.querySelectorAll('audio,video').forEach(watchMedia)}catch(_){}}
  function isInspectorNode(node){if(!node||node.nodeType!==1)return false;if(node.id===UI_ID)return true;try{return Boolean(node.closest&&node.closest('#'+UI_ID))}catch(_){return false}}

  function installDomObserver(){
    const start=()=>{
      if(!document.documentElement)return setTimeout(start,25);
      scanMedia();
      new MutationObserver(records=>{
        let useful=false;
        for(const m of records){
          if(isInspectorNode(m.target))continue;
          if(m.type==='childList')for(const n of m.addedNodes){if(isInspectorNode(n))continue;if(n&&n.nodeType===1){scanMedia(n);useful=true}}
        }
        if(useful){state.mutations++;scheduleStats()}
      }).observe(document.documentElement,{subtree:true,childList:true});
      addEvent('hook-installed',{hook:'MutationObserver',mode:'self-excluding'});
    };
    start();
  }

  function recordResource(r){
    const u=safeUrl(r.name||''),key=`${r.initiatorType||'resource'} ${u.origin}${u.path}`;
    const x=state.resources.get(key)||{key,initiatorType:r.initiatorType||'',host:u.host,path:u.path,queryKeys:u.queryKeys,count:0,transferBytes:0,durationMs:0};
    x.count++;x.transferBytes+=Number(r.transferSize||0);x.durationMs+=Math.round(Number(r.duration||0));state.resources.set(key,x);
    if(/audio|video|media|clip|song|cloudfront|cdn/i.test(u.host+u.path)||['audio','video'].includes(r.initiatorType))addEvent('resource-media-like',{initiatorType:r.initiatorType||'',url:u,transferSize:Number(r.transferSize||0),encodedBodySize:Number(r.encodedBodySize||0),durationMs:Math.round(Number(r.duration||0))});
  }

  function installPerformanceObserver(){
    try{
      performance.getEntriesByType('resource').forEach(recordResource);
      const po=new PerformanceObserver(list=>{list.getEntries().forEach(recordResource);scheduleStats()});po.observe({type:'resource',buffered:true});
      addEvent('hook-installed',{hook:'PerformanceObserver(resource)'});
    }catch(err){addEvent('hook-error',{hook:'PerformanceObserver',error:clean(err&&err.message||err)})}
  }

  function mediaSessionSnapshot(){try{const m=navigator.mediaSession;if(!m)return null;const d=m.metadata;return{playbackState:m.playbackState||'',metadata:d?{title:clean(d.title||''),artist:clean(d.artist||''),album:clean(d.album||'')}:null}}catch(_){return null}}
  function startMediaSessionPolling(){let last='';setInterval(()=>{const s=mediaSessionSnapshot();if(!s)return;const j=JSON.stringify(s);if(j!==last){last=j;addEvent('media-session-state',s)}},1000)}

  function pageSnapshot(){const media=[];try{document.querySelectorAll('audio,video').forEach(x=>media.push(mediaSnap(x)))}catch(_){}return{href:safeUrl(location.href).full,title:document.title||'',readyState:document.readyState,visibilityState:document.visibilityState,media,mediaSession:mediaSessionSnapshot(),endpointCount:state.endpoints.size,resourceCount:state.resources.size,eventCount:state.events.length,mutations:state.mutations,networkDeepCaptureArmed:state.netArmed}}
  function mark(label){const t=clean(label);if(!t)return;const m={label:t,at:new Date().toISOString(),ms:ms(),eventN:state.seq+1};state.marks.push(m);addEvent('action-mark',m)}
  function clearCapture(){state.events.length=0;state.endpoints.clear();state.resources.clear();state.media.clear();state.marks.length=0;state.seq=0;state.mediaSeq=0;state.mutations=0;performance.getEntriesByType('resource').forEach(recordResource);scanMedia();addEvent('capture-cleared',{page:safeUrl(location.href)});scheduleStats()}
  function buildReport(){scanMedia();return{tool:'Nova Suno Player Inspector SAFE',version:VERSION,exportedAt:new Date().toISOString(),safety:{observationOnly:true,generatedRequests:false,replayedRequests:false,queryValuesExported:false,authHeadersExported:false,cookiesExported:false,rawBodiesExported:false,note:'Baseline uses observers only. Optional network capture wraps fetch/XHR only after manual ARM NET.'},page:pageSnapshot(),marks:state.marks.slice(),endpoints:[...state.endpoints.values()],resources:[...state.resources.values()],media:[...state.media.entries()].map(([id,v])=>({id,...v})),events:state.events.slice()}}
  function exportReport(){const r=buildReport(),blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Nova-Suno-Inspector-v${VERSION}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;(document.body||document.documentElement).appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);addEvent('report-exported',{events:r.events.length,endpoints:r.endpoints.length})}

  function makeUi(){
    if(!TOP||state.ui||!document.documentElement)return;
    const host=document.createElement('div');host.id=UI_ID;host.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647;width:360px;background:#071018;color:#eef7ff;border:1px solid #22d3ee;border-radius:14px;box-shadow:0 12px 44px rgba(0,0,0,.55),0 0 22px rgba(34,211,238,.22);font:12px/1.35 Arial,sans-serif;overflow:hidden';
    const head=document.createElement('div');head.style.cssText='padding:9px 11px;background:linear-gradient(90deg,#0891b2,#7c3aed,#db2777);font-weight:900;display:flex;justify-content:space-between;align-items:center';head.innerHTML=`<span>🔬 Nova Suno Inspector <small style="opacity:.8">v${VERSION}</small></span><span style="font-size:10px">SAFE BOOT</span>`;
    const body=document.createElement('div');body.style.cssText='padding:10px';
    const status=document.createElement('div');status.style.cssText='padding:7px 8px;margin-bottom:8px;background:rgba(255,255,255,.04);border-radius:9px;color:#9be7ff';state.stats=status;
    const note=document.createElement('div');note.textContent='Starts observer-only. ARM NET only after Suno has loaded.';note.style.cssText='font-size:10px;color:#93a4b8;margin-bottom:8px';
    const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:repeat(5,1fr);gap:6px';
    function button(label,onClick){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:7px 4px;border-radius:8px;border:1px solid rgba(34,211,238,.48);background:rgba(255,255,255,.05);color:white;cursor:pointer;font-weight:800;font-size:9px';b.addEventListener('click',onClick);return b}
    row.append(button('MARK',()=>{const label=prompt('Describe ONE action you are about to perform:','Play song');if(label)mark(label)}),button('SNAP',()=>addEvent('manual-snapshot',{snapshot:pageSnapshot()})),button('ARM NET',()=>{armNetworkCapture();note.textContent='Network deep capture armed. Now perform isolated actions.'}),button('CLEAR',clearCapture),button('EXPORT',exportReport));
    body.append(status,note,row);host.append(head,body);(document.body||document.documentElement).appendChild(host);state.ui=host;scheduleStats();
  }

  function boot(){
    addEvent('inspector-start',{version:VERSION,page:safeUrl(location.href),topFrame:TOP,mode:'safe-baseline'});
    installPerformanceObserver();installDomObserver();startMediaSessionPolling();
    window.addEventListener('message',e=>addEvent('postmessage-received',{origin:e.origin||'',dataShape:shape(e.data)}),true);
    const uiBoot=()=>document.documentElement?makeUi():setTimeout(uiBoot,25);uiBoot();
    document.addEventListener('DOMContentLoaded',()=>{scanMedia();addEvent('dom-content-loaded',{snapshot:pageSnapshot()})},{once:true});
    window.addEventListener('load',()=>{scanMedia();addEvent('window-load',{snapshot:pageSnapshot()})},{once:true});
    window.NovaSunoPlayerInspector={version:VERSION,mark,snapshot:pageSnapshot,report:buildReport,clear:clearCapture,export:exportReport,armNetwork:armNetworkCapture};
  }

  try{boot()}catch(error){console.error('[Nova Suno Player Inspector SAFE] failed to boot',error)}
})();
