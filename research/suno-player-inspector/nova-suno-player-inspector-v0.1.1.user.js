// ==UserScript==
// @name         Nova Suno Player Inspector
// @namespace    nova.research.suno
// @version      0.1.1
// @description  Passive Suno player microscope: network shapes, media lifecycle, playback calls, resources, action marks, and safe JSON export.
// @author       Martin + Nova
// @match        https://suno.com/*
// @match        https://*.suno.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.1.1';
  const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const TOP = window.top === window.self;
  const START = performance.now();
  const MAX_EVENTS = 6000;
  const SENSITIVE = /(authorization|cookie|token|secret|password|session|credential|signature|jwt|api[_-]?key|csrf|xsrf)/i;
  const INTERESTING = /^(id|clip_id|clipId|song_id|songId|title|status|duration|content_type|contentType|delivery|encoding|audio_url|audioUrl|video_url|videoUrl|media_urls|mediaUrls|image_url|imageUrl|image_large_url|position|volume|repeat|playing|paused)$/i;

  const state = { seq:0, mediaSeq:0, events:[], endpoints:new Map(), resources:new Map(), media:new Map(), marks:[], ui:null, stats:null, mutations:0 };
  const ms = () => Math.round(performance.now() - START);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g,' ').trim();

  function safeUrl(input) {
    try {
      const u = new URL(String(input || ''), location.href);
      const queryKeys = [...u.searchParams.keys()];
      u.search = queryKeys.length ? '?' + queryKeys.map(k => encodeURIComponent(k) + '=<redacted>').join('&') : '';
      u.hash = '';
      return { full:u.toString(), origin:u.origin, host:u.hostname, path:u.pathname, queryKeys };
    } catch (_) {
      const raw = clean(input).slice(0,300);
      return { full:raw, origin:'', host:'', path:raw, queryKeys:[] };
    }
  }

  function shape(value, depth=0) {
    if (depth > 5) return {type:'max-depth'};
    if (value == null) return {type:'null'};
    if (Array.isArray(value)) return {type:'array', length:value.length, itemShape:value.length ? shape(value[0],depth+1) : null};
    const t = typeof value;
    if (t === 'object') {
      const keys = Object.keys(value).slice(0,100), s = {};
      for (const k of keys) s[k] = SENSITIVE.test(k) ? {type:'<sensitive-key>'} : shape(value[k],depth+1);
      return {type:'object', keyCount:Object.keys(value).length, keys, shape:s};
    }
    if (t === 'string') return {type:'string', length:value.length, hints:[/^https?:\/\//i.test(value)?'url':'', /^blob:/i.test(value)?'blob-url':''].filter(Boolean)};
    return {type:t};
  }

  function interesting(value, path='', depth=0, out=[]) {
    if (value == null || depth > 7 || out.length >= 160) return out;
    if (Array.isArray(value)) { value.slice(0,25).forEach((v,i)=>interesting(v,`${path}[${i}]`,depth+1,out)); return out; }
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

  function renderStats() {
    if (!state.stats) return;
    let mc = state.media.size; try { mc = document.querySelectorAll('audio,video').length; } catch (_) {}
    state.stats.textContent = `E ${state.events.length} · API ${state.endpoints.size} · MEDIA ${mc} · MARKS ${state.marks.length}`;
  }

  function event(type,data={}) {
    const e = {n:++state.seq, at:new Date().toISOString(), ms:ms(), type, topFrame:TOP, ...data};
    state.events.push(e); if (state.events.length > MAX_EVENTS) state.events.shift(); renderStats(); return e;
  }

  function touch(method,url,patch={}) {
    const u = safeUrl(url), key = `${String(method||'GET').toUpperCase()} ${u.origin}${u.path}`;
    let x = state.endpoints.get(key);
    if (!x) { x={key,method:String(method||'GET').toUpperCase(),host:u.host,path:u.path,queryKeys:u.queryKeys,count:0,statuses:{},contentTypes:[],requestShapes:[],responseShapes:[],interesting:[]}; state.endpoints.set(key,x); }
    if (patch.increment !== false) x.count++;
    if (patch.status != null) x.statuses[String(patch.status)] = (x.statuses[String(patch.status)]||0)+1;
    if (patch.contentType && !x.contentTypes.includes(patch.contentType)) x.contentTypes.push(patch.contentType);
    if (patch.requestShape) x.requestShapes.push(patch.requestShape);
    if (patch.responseShape) x.responseShapes.push(patch.responseShape);
    if (patch.interesting?.length) x.interesting.push(...patch.interesting);
    x.requestShapes=x.requestShapes.slice(-4); x.responseShapes=x.responseShapes.slice(-4); x.interesting=x.interesting.slice(-180);
  }

  function bodyShape(body) {
    if (body == null) return null;
    if (typeof body === 'string') { try { return shape(JSON.parse(body)); } catch (_) { return {type:'text',length:body.length}; } }
    try { if (PAGE.FormData && body instanceof PAGE.FormData) return {type:'formdata',keys:[...body.keys()]}; } catch (_) {}
    return {type:Object.prototype.toString.call(body)};
  }

  function hookFetch() {
    try {
      const original=PAGE.fetch; if (typeof original!=='function' || original.__nspi) return;
      function wrapped(input,init) {
        const url=typeof input==='string'?input:(input&&input.url)||'';
        const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
        const req=bodyShape(init&&init.body); event('fetch-request',{method,url:safeUrl(url),requestShape:req}); touch(method,url,{requestShape:req});
        const result=original.apply(this,arguments);
        Promise.resolve(result).then(async r=>{
          const ct=r?.headers?.get?.('content-type')||''; let rs=null,ints=[];
          if (/json/i.test(ct)) { try { const d=await r.clone().json(); rs=shape(d); ints=interesting(d); } catch(_){} }
          touch(method,url,{increment:false,status:r.status,contentType:ct,responseShape:rs,interesting:ints}); event('fetch-response',{method,url:safeUrl(url),status:r.status,contentType:ct,responseShape:rs,interesting:ints});
        }).catch(err=>event('fetch-error',{method,url:safeUrl(url),error:clean(err?.message||err)}));
        return result;
      }
      wrapped.__nspi=true; PAGE.fetch=wrapped; event('hook-installed',{hook:'fetch'});
    } catch(err) { event('hook-error',{hook:'fetch',error:clean(err?.message||err)}); }
  }

  function hookXhr() {
    try {
      const X=PAGE.XMLHttpRequest; if (!X?.prototype || X.prototype.__nspi) return;
      const p=X.prototype,o=p.open,s=p.send;
      p.open=function(method,url){this.__nspiReq={method:String(method||'GET').toUpperCase(),url:String(url||'')};return o.apply(this,arguments)};
      p.send=function(body){const m=this.__nspiReq||{method:'GET',url:''}, req=bodyShape(body);event('xhr-request',{method:m.method,url:safeUrl(m.url),requestShape:req});touch(m.method,m.url,{requestShape:req});this.addEventListener('loadend',()=>{let ct='';try{ct=this.getResponseHeader('content-type')||''}catch(_){}let rs=null,ints=[];if(/json/i.test(ct)){try{const d=JSON.parse(this.responseText||'null');rs=shape(d);ints=interesting(d)}catch(_){}}touch(m.method,m.url,{increment:false,status:this.status,contentType:ct,responseShape:rs,interesting:ints});event('xhr-response',{method:m.method,url:safeUrl(m.url),status:this.status,contentType:ct,responseShape:rs,interesting:ints})},{once:true});return s.apply(this,arguments)};
      p.__nspi=true; event('hook-installed',{hook:'xhr'});
    } catch(err){event('hook-error',{hook:'xhr',error:clean(err?.message||err)})}
  }

  function mediaSnap(el){const raw=el.currentSrc||el.src||el.getAttribute?.('src')||'',u=raw?safeUrl(raw):null;return{tag:el.tagName,src:u?.full||'',srcHost:u?.host||'',srcPath:u?.path||'',readyState:el.readyState,networkState:el.networkState,paused:el.paused,ended:el.ended,duration:Number.isFinite(el.duration)?+el.duration.toFixed(3):null,currentTime:Number.isFinite(el.currentTime)?+el.currentTime.toFixed(3):null,volume:el.volume,muted:el.muted,playbackRate:el.playbackRate}}

  function watchMedia(el){try{if(!el || !(el instanceof PAGE.HTMLMediaElement) || el.__nspiWatched)return;el.__nspiWatched=true;const id=`media-${++state.mediaSeq}`;el.__nspiId=id;state.media.set(id,mediaSnap(el));event('media-found',{mediaId:id,media:mediaSnap(el)});for(const name of ['loadstart','loadedmetadata','loadeddata','canplay','play','playing','pause','waiting','stalled','error','ended','volumechange','seeking','seeked'])el.addEventListener(name,()=>{const snap=mediaSnap(el);state.media.set(id,snap);event('media-event',{mediaId:id,event:name,media:snap,mediaError:name==='error'&&el.error?{code:el.error.code,message:el.error.message||''}:null})},true)}catch(_){}}
  function scanMedia(root=document){try{if(root.matches?.('audio,video'))watchMedia(root);root.querySelectorAll?.('audio,video').forEach(watchMedia)}catch(_){}}

  function hookMedia(){try{const p=PAGE.HTMLMediaElement?.prototype;if(!p||p.__nspi)return;for(const name of ['play','pause','load']){const original=p[name];if(typeof original!=='function')continue;p[name]=function(){watchMedia(this);const id=this.__nspiId||'';event('media-call',{call:name,mediaId:id,media:mediaSnap(this),stack:String(new Error().stack||'').split('\n').slice(2,8).join('\n')});let r;try{r=original.apply(this,arguments)}catch(err){event('media-call-throw',{call:name,mediaId:id,error:clean(err?.message||err)});throw err}if(name==='play'&&r?.then)r.then(()=>event('media-play-resolved',{mediaId:id,media:mediaSnap(this)})).catch(err=>event('media-play-rejected',{mediaId:id,media:mediaSnap(this),error:clean(err?.message||err)}));return r}}p.__nspi=true;event('hook-installed',{hook:'HTMLMediaElement methods'})}catch(err){event('hook-error',{hook:'media',error:clean(err?.message||err)})}}

  function resources(){try{performance.getEntriesByType('resource').forEach(r=>recordResource(r));const po=new PerformanceObserver(list=>list.getEntries().forEach(recordResource));po.observe({type:'resource',buffered:true});event('hook-installed',{hook:'PerformanceObserver'})}catch(err){event('hook-error',{hook:'PerformanceObserver',error:clean(err?.message||err)})}}
  function recordResource(r){const u=safeUrl(r.name||''),key=`${r.initiatorType||'resource'} ${u.origin}${u.path}`,x=state.resources.get(key)||{key,initiatorType:r.initiatorType||'',host:u.host,path:u.path,queryKeys:u.queryKeys,count:0,transferBytes:0,durationMs:0};x.count++;x.transferBytes+=Number(r.transferSize||0);x.durationMs+=Math.round(Number(r.duration||0));state.resources.set(key,x);if(/audio|video|media|clip|song|cloudfront|cdn/i.test(u.host+u.path)||['audio','video'].includes(r.initiatorType))event('resource-media-like',{initiatorType:r.initiatorType||'',url:u,transferSize:Number(r.transferSize||0),durationMs:Math.round(Number(r.duration||0))})}

  function domObserver(){const start=()=>{if(!document.documentElement)return setTimeout(start,25);scanMedia();new MutationObserver(ms=>{state.mutations++;for(const m of ms)if(m.type==='childList')m.addedNodes.forEach(n=>{if(n?.nodeType===1)scanMedia(n)});renderStats()}).observe(document.documentElement,{subtree:true,childList:true});event('hook-installed',{hook:'MutationObserver'})};start()}

  function mediaSession(){try{const m=navigator.mediaSession;if(!m)return null;const d=m.metadata;return{playbackState:m.playbackState||'',metadata:d?{title:clean(d.title||''),artist:clean(d.artist||''),album:clean(d.album||'')}:null}}catch(_){return null}}
  function pollMediaSession(){let last='';setInterval(()=>{const s=mediaSession();if(!s)return;const j=JSON.stringify(s);if(j!==last){last=j;event('media-session-state',s)}},750)}

  function snapshot(){const media=[];try{document.querySelectorAll('audio,video').forEach(x=>media.push(mediaSnap(x)))}catch(_){}return{href:safeUrl(location.href).full,title:document.title||'',readyState:document.readyState,media,mediaSession:mediaSession(),endpointCount:state.endpoints.size,eventCount:state.events.length,mutations:state.mutations}}
  function mark(label){const t=clean(label);if(!t)return;const m={label:t,at:new Date().toISOString(),ms:ms(),eventN:state.seq+1};state.marks.push(m);event('action-mark',m)}
  function clear(){state.events.length=0;state.endpoints.clear();state.resources.clear();state.media.clear();state.marks.length=0;state.seq=0;state.mediaSeq=0;state.mutations=0;scanMedia();event('capture-cleared',{page:safeUrl(location.href)});renderStats()}
  function report(){scanMedia();return{tool:'Nova Suno Player Inspector',version:VERSION,exportedAt:new Date().toISOString(),safety:{observationOnly:true,generatedRequests:false,replayedRequests:false,queryValuesExported:false,authHeadersExported:false,cookiesExported:false,rawBodiesExported:false},page:snapshot(),marks:state.marks.slice(),endpoints:[...state.endpoints.values()],resources:[...state.resources.values()],media:[...state.media.entries()].map(([id,v])=>({id,...v})),events:state.events.slice()}}
  function exportReport(){const r=report(),blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Nova-Suno-Player-Inspector-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;(document.body||document.documentElement).appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);event('report-exported',{events:r.events.length,endpoints:r.endpoints.length})}

  function makeUi(){if(!TOP||state.ui||!document.documentElement)return;const host=document.createElement('div');host.id='nova-suno-player-inspector';host.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647;width:330px;background:#071018;color:#eef7ff;border:1px solid #22d3ee;border-radius:14px;box-shadow:0 12px 44px rgba(0,0,0,.55),0 0 22px rgba(34,211,238,.22);font:12px/1.35 Arial,sans-serif;overflow:hidden';const head=document.createElement('div');head.textContent=`🔬 Nova Suno Inspector v${VERSION}`;head.style.cssText='padding:10px 11px;background:linear-gradient(90deg,#0891b2,#7c3aed,#db2777);font-weight:900';const body=document.createElement('div');body.style.cssText='padding:10px';const status=document.createElement('div');status.style.cssText='padding:7px 8px;margin-bottom:8px;background:rgba(255,255,255,.04);border-radius:9px;color:#9be7ff';state.stats=status;const note=document.createElement('div');note.textContent='Passive capture only · credentials/query values/raw bodies are not exported.';note.style.cssText='font-size:10px;color:#93a4b8;margin-bottom:8px';const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:6px';const b=(txt,fn)=>{const x=document.createElement('button');x.type='button';x.textContent=txt;x.style.cssText='padding:7px 5px;border-radius:8px;border:1px solid rgba(34,211,238,.48);background:rgba(255,255,255,.05);color:white;cursor:pointer;font-weight:800;font-size:10px';x.onclick=fn;return x};row.append(b('MARK',()=>{const l=prompt('Describe ONE action you are about to perform:','Play song');if(l)mark(l)}),b('SNAP',()=>event('manual-snapshot',{snapshot:snapshot()})),b('CLEAR',clear),b('EXPORT',exportReport));body.append(status,note,row);host.append(head,body);(document.body||document.documentElement).appendChild(host);state.ui=host;renderStats();event('ui-mounted',{id:host.id})}

  function boot(){event('inspector-start',{version:VERSION,page:safeUrl(location.href),topFrame:TOP});hookFetch();hookXhr();hookMedia();resources();domObserver();pollMediaSession();const ui=()=>document.documentElement?makeUi():setTimeout(ui,25);ui();document.addEventListener('DOMContentLoaded',()=>{scanMedia();event('dom-content-loaded',{snapshot:snapshot()})},{once:true});window.addEventListener('load',()=>{scanMedia();event('window-load',{snapshot:snapshot()})},{once:true});PAGE.NovaSunoPlayerInspector={version:VERSION,mark,snapshot,report,clear,export:exportReport,show:()=>{if(!state.ui)makeUi();if(state.ui)state.ui.style.display=''}}}

  try{boot()}catch(error){console.error('[Nova Suno Player Inspector] failed to boot',error);if(TOP)setTimeout(()=>{try{const e=document.createElement('div');e.textContent='Nova Suno Inspector boot error: '+clean(error?.message||error);e.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#3b0d0d;color:#fff;padding:10px;border:1px solid #ef4444;border-radius:8px;font:12px Arial';(document.body||document.documentElement).appendChild(e)}catch(_){ }},100)}
})();
