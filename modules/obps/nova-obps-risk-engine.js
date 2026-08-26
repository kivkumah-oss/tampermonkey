// modules/obps/nova-obps-risk-engine.js
// Nova OB PS Risk Engine v1.2.0 — full wall loader with pure-JS gzip decoder.
(function () {
  'use strict';

  const API = 'NovaOBPSRiskEngine';
  const VERSION = '1.2.0';
  const BASE = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/modules/obps/payload/';
  const PARTS = [
    'obps-full-wall-v1.1.0.part1.txt',
    'obps-full-wall-v1.1.0.part2.txt',
    'obps-full-wall-v1.1.0.part3.txt'
  ];

  if (window[API] && window[API].loaderVersion === VERSION) return;

  let realApi = null;
  let loadError = null;
  let wantVisible = true;
  let wantRefresh = false;
  let statusNode = null;

  function showStatus(text, error = false) {
    try {
      if (!statusNode || !statusNode.isConnected) {
        statusNode = document.createElement('div');
        statusNode.id = 'nova-obps-loader-status';
        statusNode.style.cssText = 'position:fixed;left:18px;top:18px;z-index:2147483646;padding:10px 13px;border-radius:10px;background:#07110d;color:#8fffc2;border:1px solid #1d8055;box-shadow:0 8px 30px rgba(0,0,0,.28);font:700 12px/1.35 Arial,sans-serif;max-width:520px';
        (document.body || document.documentElement).appendChild(statusNode);
      }
      statusNode.style.color = error ? '#ff9a9a' : '#8fffc2';
      statusNode.style.borderColor = error ? '#8b3030' : '#1d8055';
      statusNode.textContent = text;
    } catch (_) {}
  }

  function clearStatus() {
    try { statusNode?.remove(); } catch (_) {}
    statusNode = null;
  }

  const proxy = {
    id: 'nova-obps-risk-engine',
    version: VERSION,
    loaderVersion: VERSION,
    loaded: true,
    show() {
      wantVisible = true;
      if (realApi && typeof realApi.show === 'function') return realApi.show();
      showStatus(loadError ? `OB PS wall failed: ${loadError.message || loadError}` : 'Loading full OB PS wall…', Boolean(loadError));
      return true;
    },
    hide() {
      wantVisible = false;
      clearStatus();
      if (realApi && typeof realApi.hide === 'function') return realApi.hide();
      return true;
    },
    refresh() {
      wantRefresh = true;
      if (realApi && typeof realApi.refresh === 'function') return realApi.refresh();
      return true;
    },
    getState() {
      if (realApi && typeof realApi.getState === 'function') return realApi.getState();
      return { loading: !loadError, error: loadError ? String(loadError) : null, fullWall: true, version: VERSION };
    }
  };

  window[API] = proxy;

  function gmText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        headers: { Accept: 'text/plain', 'Cache-Control': 'no-cache' },
        onload(r) {
          if (r.status >= 200 && r.status < 300) resolve(String(r.responseText || '').trim());
          else reject(new Error(`HTTP ${r.status} for ${url}`));
        },
        onerror: () => reject(new Error(`Network error for ${url}`)),
        ontimeout: () => reject(new Error(`Timeout for ${url}`))
      });
    });
  }

  function base64Bytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

function gunzip(bytes){
  let p=0;
  if(bytes[p++]!==0x1f||bytes[p++]!==0x8b) throw Error('not gzip');
  if(bytes[p++]!==8) throw Error('gzip method');
  const flg=bytes[p++]; p+=6; // mtime xfl os
  if(flg&4){const xlen=bytes[p]|(bytes[p+1]<<8); p+=2+xlen;}
  if(flg&8){while(p<bytes.length&&bytes[p++]);}
  if(flg&16){while(p<bytes.length&&bytes[p++]);}
  if(flg&2)p+=2;
  const data=bytes.subarray(p, bytes.length-8);
  let pos=0, bitbuf=0, bitcnt=0;
  function bits(n){
    while(bitcnt<n){ if(pos>=data.length) throw Error('deflate eof'); bitbuf |= data[pos++]<<bitcnt; bitcnt+=8; }
    const v=bitbuf & ((1<<n)-1); bitbuf >>>= n; bitcnt-=n; return v;
  }
  function align(){bitbuf=0;bitcnt=0;}
  function build(lengths){
    let max=0; for(const l of lengths) if(l>max)max=l;
    const count=new Array(max+1).fill(0); for(const l of lengths) if(l)count[l]++;
    const next=new Array(max+1).fill(0); let code=0;
    for(let len=1;len<=max;len++){ code=(code+(count[len-1]||0))<<1; next[len]=code; }
    const root={};
    for(let sym=0;sym<lengths.length;sym++){
      const len=lengths[sym]; if(!len)continue;
      const c=next[len]++;
      let node=root;
      for(let i=len-1;i>=0;i--){const b=(c>>i)&1; node[b] ||= {}; node=node[b];}
      node.s=sym;
    }
    return root;
  }
  function dec(tree){let n=tree; while(n.s===undefined){const b=bits(1); n=n[b]; if(!n)throw Error('bad huffman');} return n.s;}
  const LBASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEXT =[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DBASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DEXT =[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const out=[];
  let final=0;
  while(!final){
    final=bits(1); const type=bits(2);
    if(type===0){
      align();
      if(pos+4>data.length)throw Error('stored eof');
      const len=data[pos]|(data[pos+1]<<8); const nlen=data[pos+2]|(data[pos+3]<<8); pos+=4;
      if(((len^0xffff)&0xffff)!==nlen)throw Error('stored len');
      for(let i=0;i<len;i++)out.push(data[pos++]);
      continue;
    }
    let lit,dist;
    if(type===1){
      const ll=new Array(288); for(let i=0;i<=143;i++)ll[i]=8; for(let i=144;i<=255;i++)ll[i]=9; for(let i=256;i<=279;i++)ll[i]=7; for(let i=280;i<=287;i++)ll[i]=8;
      lit=build(ll); dist=build(new Array(32).fill(5));
    } else if(type===2){
      const hlit=bits(5)+257, hdist=bits(5)+1, hclen=bits(4)+4;
      const order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const clen=new Array(19).fill(0); for(let i=0;i<hclen;i++)clen[order[i]]=bits(3);
      const ctree=build(clen); const lens=[];
      while(lens.length<hlit+hdist){
        const s=dec(ctree);
        if(s<=15)lens.push(s);
        else if(s===16){if(!lens.length)throw Error('repeat no prev'); const n=bits(2)+3, v=lens[lens.length-1]; for(let i=0;i<n;i++)lens.push(v);}
        else if(s===17){const n=bits(3)+3; for(let i=0;i<n;i++)lens.push(0);}
        else if(s===18){const n=bits(7)+11; for(let i=0;i<n;i++)lens.push(0);}
      }
      lit=build(lens.slice(0,hlit)); dist=build(lens.slice(hlit,hlit+hdist));
    } else throw Error('reserved block');
    while(true){
      const s=dec(lit);
      if(s<256){out.push(s);continue;}
      if(s===256)break;
      if(s>285)throw Error('bad length sym '+s);
      const li=s-257; const len=LBASE[li]+(LEXT[li]?bits(LEXT[li]):0);
      const ds=dec(dist); if(ds>29)throw Error('bad dist sym');
      const dd=DBASE[ds]+(DEXT[ds]?bits(DEXT[ds]):0);
      if(dd>out.length)throw Error('distance too far '+dd+' > '+out.length);
      for(let i=0;i<len;i++) out.push(out[out.length-dd]);
    }
  }
  return new Uint8Array(out);
}

  function decodePayload(base64) {
    const bytes = gunzip(base64Bytes(base64));
    return new TextDecoder().decode(bytes);
  }

  async function loadFullWall() {
    try {
      showStatus('Loading full OB PS wall…');
      const chunks = [];
      for (let i = 0; i < PARTS.length; i += 1) {
        showStatus(`Loading full OB PS wall… ${i + 1}/${PARTS.length}`);
        chunks.push(await gmText(`${BASE}${PARTS[i]}?v=${VERSION}`));
      }

      let code = decodePayload(chunks.join(''));

      const guard = `
    if (window.NovaOBPSRiskEngine) {
        try { window.NovaOBPSRiskEngine.show?.(); } catch (_) {}
        return;
    }
`;
      code = code.replace(guard, '\n');

      const runner = new Function(
        'GM_xmlhttpRequest',
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_addValueChangeListener',
        'GM_registerMenuCommand',
        'unsafeWindow',
        code + '\n//# sourceURL=nova://module/nova-obps-risk-engine-full-wall.js'
      );

      runner.call(
        window,
        typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
        typeof GM_getValue === 'function' ? GM_getValue : undefined,
        typeof GM_setValue === 'function' ? GM_setValue : undefined,
        typeof GM_deleteValue === 'function' ? GM_deleteValue : undefined,
        typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : undefined,
        typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined,
        typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      );

      realApi = window[API];
      if (!realApi || realApi === proxy || typeof realApi.show !== 'function') {
        throw new Error('Full wall payload executed but did not expose its Nova API');
      }

      clearStatus();
      if (wantVisible) realApi.show();
      else if (typeof realApi.hide === 'function') realApi.hide();
      if (wantRefresh && typeof realApi.refresh === 'function') realApi.refresh();
      console.log('[Nova OBPS] Full wall v1.2.0 loaded.');
    } catch (error) {
      loadError = error;
      window[API] = proxy;
      showStatus(`OB PS full wall failed: ${error?.message || String(error)}`, true);
      console.error('[Nova OBPS] Full wall load failed', error);
    }
  }

  void loadFullWall();
})();
