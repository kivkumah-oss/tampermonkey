// modules/obps/nova-obps-risk-engine.js
// Nova OB PS Risk Engine — Google-hosted wall control center.
(function () {
  'use strict';

  const API = 'NovaOBPSRiskEngine';
  const MODULE_ID = 'nova-obps-risk-engine';
  const VERSION = '1.0.0';
  if (window[API]) return;

  const FC = 'NCL1';
  const SETTINGS = {
    refreshMs: 30000,
    requestTimeout: 20000,
    rodeoBatchSize: 40,
    fcChecksPerRefresh: 40,
    fcConcurrency: 2,
    pcMax: 12,
    pcConcurrency: 2,
    heroMax: 10,
    heroConcurrency: 2,
    fcFreshMs: 180000,
    watchMin: 90,
    riskMin: 60,
    criticalMin: 30
  };

  const ENDPOINTS = {
    rodeo: `https://rodeo-dub.amazon.com/${FC}/Search`,
    fc: `https://fcresearch-eu.aka.amazon.com/${FC}/results/inventory?s=`,
    pc: `https://picking-console.eu.picking.aft.a2z.com/api/fcs/${FC}/pick-research/type/customer-shipment/id/`,
    hero: `https://hero.eu.picking.aft.a2z.com/api/fcs/${FC}/entities/type/CUSTOMER_SHIPMENT/id/`,
    heroPage: `https://hero.eu.picking.aft.a2z.com/fc/${FC}/pick-events/customer-shipment/`
  };

  const WALL = {
    prefix: 'chPSAFEW',
    rows: ['B', 'C', 'D', 'E'],
    bays: [
      ['07', [1,2,3,4,5,6]], ['08', [1,2,3,4]], ['09', [1,2,3,4,5,6]],
      ['10', [1,2,3,4]], ['11', [1,2,3,4,5,6]], ['12', [1,2,3,4]]
    ]
  };

  const state = {
    host: null,
    shadow: null,
    timer: null,
    refreshing: false,
    visible: true,
    selected: '',
    focus: 'action',
    lastUpdated: 0,
    lastError: '',
    fcCursor: 0,
    chutes: new Map(),
    shipmentMemory: new Map(),
    heroCache: new Map()
  };

  const allChutes = [];
  for (const row of WALL.rows) {
    for (const [bay, slots] of WALL.bays) {
      for (const slot of slots) allChutes.push({ id: `${WALL.prefix}${bay}${row}${slot}`, row, bay, slot });
    }
  }
  const knownChutes = new Set(allChutes.map(x => x.id.toUpperCase()));

  function blankTruth(meta) {
    return {
      ...meta,
      occupied: false,
      truth: 'RODEO_UNSEEN',
      confidence: 'LOW',
      source: 'R',
      lastVerifiedAt: 0,
      error: '',
      shipments: [],
      totalQty: 0,
      condition: '',
      cptMs: 0,
      processPath: '',
      ownerQty: { cs: 0, whse: 0, workOrder: 0, unowned: 0, unknown: 0 },
      dispositionQty: { sellable: 0, pr: 0, damaged: 0, other: 0 },
      flags: [],
      runner: '',
      risk: 'VERIFY',
      riskRank: 20,
      minutesToCpt: null
    };
  }
  allChutes.forEach(meta => state.chutes.set(meta.id, blankTruth(meta)));

  function gmGet(url, accept = 'text/html,application/json,*/*') {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: SETTINGS.requestTimeout,
        headers: { Accept: accept, 'Cache-Control': 'no-cache' },
        onload: r => r.status >= 200 && r.status < 300
          ? resolve(String(r.responseText || ''))
          : reject(new Error(`HTTP ${r.status} ${url}`)),
        onerror: () => reject(new Error(`Network error ${url}`)),
        ontimeout: () => reject(new Error(`Timeout ${url}`))
      });
    });
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        try { out[i] = await fn(items[i], i); }
        catch (e) { out[i] = { error: String(e && e.message || e) }; }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
    return out;
  }

  const norm = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const key = v => norm(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function shipmentId(v) {
    const s = norm(v).toUpperCase();
    const m = s.match(/\b(TBA[0-9A-Z]+|\d{8,}|[A-Z0-9]{8,}-[A-Z0-9-]+)\b/);
    return m ? m[1] : '';
  }

  function condition(v) {
    const s = norm(v).toUpperCase();
    const m = s.match(/\bC\s*([0-9]{1,4})\b/);
    return m ? `C${m[1]}` : s;
  }

  function epoch(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    const s = norm(v);
    if (/^\d{10,13}$/.test(s)) { const n = Number(s); return s.length <= 10 ? n * 1000 : n; }
    const direct = Date.parse(s);
    if (Number.isFinite(direct)) return direct;
    return 0;
  }

  function fmtCpt(ms) {
    if (!ms) return '--:--';
    return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function headers(table) {
    const cells = [...table.querySelectorAll('thead th')];
    const arr = cells.length ? cells : [...(table.querySelector('tr')?.querySelectorAll('th,td') || [])];
    const map = {};
    arr.forEach((c, i) => { const k = key(c.textContent); if (k) map[k] = i; });
    return map;
  }

  function col(map, names) {
    for (const name of names) {
      const n = key(name);
      if (Number.isInteger(map[n])) return map[n];
    }
    for (const [k, i] of Object.entries(map)) {
      if (names.some(n => k.includes(key(n)) || key(n).includes(k))) return i;
    }
    return -1;
  }

  function cell(cells, i) { return i >= 0 ? norm(cells[i]?.textContent) : ''; }

  function rodeoUrl(batch, columns) {
    const p = new URLSearchParams();
    p.append('_enabledColumns', 'on');
    columns.forEach(c => p.append('enabledColumns', c));
    p.append('searchKey', batch.join(' '));
    return `${ENDPOINTS.rodeo}?${p}`;
  }

  const RODEO_COLUMNS = [
    'DEMAND_ID','OUTER_CONTAINER_TYPE','OUTER_SCANNABLE_ID','SORT_CODE','CONDITION',
    'PICK_BATCH_ID','SHIPMENT_ID','SCANNABLE_ID','PROCESS_PATH','EXPECTED_SHIP_DATE',
    'QUANTITY','WORK_POOL','DWELL_TIME'
  ];

  function findRodeoTable(doc) {
    return doc.querySelector('.result-table') || [...doc.querySelectorAll('table')].sort((a,b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0] || null;
  }

  function parseRodeo(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = findRodeoTable(doc);
    if (!table) throw new Error('Rodeo table missing');
    const hm = headers(table);
    const ix = {
      outer: col(hm, ['Outer Scannable ID','Outer Scannable']),
      scan: col(hm, ['Scannable ID']),
      ship: col(hm, ['Shipment ID','Demand ID','Customer Shipment ID','Transfer Request ID']),
      cond: col(hm, ['Condition','Status']),
      path: col(hm, ['Process Path','Work Pool']),
      cpt: col(hm, ['Expected Ship Date','CPT','Ship By','Need To Ship By Date']),
      qty: col(hm, ['Quantity','Qty'])
    };
    const rows = [...table.querySelectorAll('tbody tr')];
    const use = rows.length ? rows : [...table.querySelectorAll('tr')].slice(1);
    const out = [];
    for (const tr of use) {
      const cells = [...tr.querySelectorAll('td')];
      if (!cells.length) continue;
      const texts = cells.map(c => norm(c.textContent));
      let chute = [cell(cells,ix.outer), cell(cells,ix.scan), ...texts]
        .map(x => x.toUpperCase()).find(x => knownChutes.has(x));
      if (!chute) chute = norm(tr.textContent).toUpperCase().match(/CHPSAFEW\d{2}[BCDE]\d/)?.[0] || '';
      if (!knownChutes.has(chute)) continue;
      out.push({
        chute,
        shipment: shipmentId(cell(cells, ix.ship)),
        condition: condition(cell(cells, ix.cond)),
        path: cell(cells, ix.path),
        cptMs: epoch(cell(cells, ix.cpt)),
        qty: Math.max(1, parseInt(cell(cells, ix.qty).replace(/\D/g,''),10) || 1)
      });
    }
    return out;
  }

  async function scanRodeo() {
    const fresh = new Map(allChutes.map(m => [m.id, blankTruth(m)]));
    const batches = [];
    for (let i=0;i<allChutes.length;i+=SETTINGS.rodeoBatchSize) batches.push(allChutes.slice(i,i+SETTINGS.rodeoBatchSize).map(x=>x.id));
    const results = await mapLimit(batches, 1, async batch => {
      const html = await gmGet(rodeoUrl(batch, RODEO_COLUMNS));
      return { batch, rows: parseRodeo(html) };
    });
    for (const result of results) {
      if (!result || result.error) {
        for (const chute of result?.batch || []) {
          const t = fresh.get(chute); if (t) { t.truth='RODEO_BATCH_ERROR'; t.error=result.error || 'Rodeo batch failed'; t.risk='VERIFY'; t.riskRank=75; }
        }
        continue;
      }
      for (const row of result.rows) {
        const t = fresh.get(row.chute); if (!t) continue;
        t.occupied = true; t.truth='RODEO_OCCUPIED'; t.confidence='HIGH'; t.source='R'; t.lastVerifiedAt=Date.now();
        if (row.shipment && !t.shipments.includes(row.shipment)) t.shipments.push(row.shipment);
        t.totalQty += row.qty;
        if (row.condition) t.condition = row.condition;
        if (row.path) t.processPath = row.path;
        if (row.cptMs && (!t.cptMs || row.cptMs < t.cptMs)) t.cptMs = row.cptMs;
        t.ownerQty.cs += row.qty;
        if (row.shipment) state.shipmentMemory.set(row.shipment, { condition:row.condition, path:row.path, cptMs:row.cptMs, at:Date.now() });
      }
    }
    return fresh;
  }

  function bestInventoryTable(doc) {
    let best=null, score=-1;
    for (const table of doc.querySelectorAll('table')) {
      const h = norm([...table.querySelectorAll('th')].map(x=>x.textContent).join(' ')).toLowerCase();
      let s=table.querySelectorAll('tr').length;
      if (h.includes('consumer')) s+=10; if(h.includes('disposition')) s+=10; if(h.includes('quantity')) s+=5; if(h.includes('asin')) s+=3;
      if (s>score) { score=s; best=table; }
    }
    return best;
  }

  function classifyOwner(text) {
    const s=norm(text).toUpperCase();
    if (/CUSTOMER[_ ]?SHIPMENT|CUSTOMERSHIPMENT/.test(s)) return 'cs';
    if (/WORK[_ ]?ORDER|WORKORDER/.test(s)) return 'workOrder';
    if (/WHSE|WAREHOUSE/.test(s)) return 'whse';
    if (/UNOWNED|NO OWNER|NO CONSUMER/.test(s)) return 'unowned';
    return 'unknown';
  }

  function classifyDisp(text) {
    const s=norm(text).toUpperCase();
    if (s.includes('SELLABLE')) return 'sellable';
    if (s.includes('PENDING') && s.includes('RESEARCH')) return 'pr';
    if (/DAMAGED|DEFECT|UNSELLABLE/.test(s)) return 'damaged';
    return 'other';
  }

  function parseFc(html) {
    const doc = new DOMParser().parseFromString(html,'text/html');
    const table = bestInventoryTable(doc);
    const inv = { total:0, ownerQty:{cs:0,whse:0,workOrder:0,unowned:0,unknown:0}, dispositionQty:{sellable:0,pr:0,damaged:0,other:0}, shipments:[], flags:[] };
    if (!table) return inv;
    const hm=headers(table);
    const ix={ qty:col(hm,['Quantity','Qty']), disp:col(hm,['Disposition']), consumer:col(hm,['Consumer','Owner','Consumer Type']), consumerId:col(hm,['Consumer ID','ConsumerId','Owner ID']) };
    const rows=[...table.querySelectorAll('tbody tr')];
    const use=rows.length?rows:[...table.querySelectorAll('tr')].slice(1);
    for (const tr of use) {
      const cells=[...tr.querySelectorAll('td')]; if(!cells.length) continue;
      const qty=Math.max(1,parseInt(cell(cells,ix.qty).replace(/\D/g,''),10)||1);
      const ownerText=[cell(cells,ix.consumer),cell(cells,ix.consumerId),norm(tr.textContent)].join(' ');
      const o=classifyOwner(ownerText); inv.ownerQty[o]+=qty;
      const d=classifyDisp(cell(cells,ix.disp)); inv.dispositionQty[d]+=qty;
      inv.total+=qty;
      if(o==='cs') { const sid=shipmentId(cell(cells,ix.consumerId)) || shipmentId(norm(tr.textContent)); if(sid && !inv.shipments.includes(sid)) inv.shipments.push(sid); }
    }
    if(inv.ownerQty.unowned) inv.flags.push('UNOWNED');
    if(inv.ownerQty.whse) inv.flags.push('WHSE');
    if(inv.ownerQty.workOrder) inv.flags.push('WORK_ORDER');
    if(inv.ownerQty.unknown) inv.flags.push('UNKNOWN_OWNER');
    if(inv.dispositionQty.pr) inv.flags.push('PENDING_RESEARCH');
    if(inv.dispositionQty.damaged) inv.flags.push('DAMAGED');
    if(inv.shipments.length>1) inv.flags.push('MULTI_CS');
    return inv;
  }

  function fcCandidates(map) {
    const now=Date.now();
    const arr=[...map.values()].filter(t => !t.occupied && t.truth !== 'RODEO_BATCH_ERROR' && (!t.lastVerifiedAt || now-t.lastVerifiedAt>SETTINGS.fcFreshMs));
    if (!arr.length) return [];
    const start=state.fcCursor % arr.length;
    const rotated=arr.slice(start).concat(arr.slice(0,start));
    const pick=rotated.slice(0,SETTINGS.fcChecksPerRefresh);
    state.fcCursor=(start+pick.length)%arr.length;
    return pick;
  }

  async function verifyFc(map) {
    const targets=fcCandidates(map);
    await mapLimit(targets, SETTINGS.fcConcurrency, async t => {
      try {
        const html=await gmGet(ENDPOINTS.fc+encodeURIComponent(t.id));
        const inv=parseFc(html);
        const cur=map.get(t.id); if(!cur) return;
        cur.lastVerifiedAt=Date.now(); cur.confidence='HIGH'; cur.source='F';
        cur.ownerQty=inv.ownerQty; cur.dispositionQty=inv.dispositionQty; cur.flags=[...new Set([...(cur.flags||[]),...inv.flags])];
        if(inv.total>0) {
          cur.occupied=true; cur.truth='FC_CONFIRMED_OCCUPIED'; cur.totalQty=Math.max(cur.totalQty,inv.total);
          for(const sid of inv.shipments) if(!cur.shipments.includes(sid)) cur.shipments.push(sid);
          for(const sid of cur.shipments) {
            const m=state.shipmentMemory.get(sid); if(!m) continue;
            if(!cur.condition&&m.condition) cur.condition=m.condition; if(!cur.processPath&&m.path) cur.processPath=m.path; if(!cur.cptMs&&m.cptMs) cur.cptMs=m.cptMs;
          }
        } else { cur.occupied=false; cur.truth='FC_CONFIRMED_EMPTY'; cur.totalQty=0; }
      } catch(e) {
        const cur=map.get(t.id); if(cur){cur.error=String(e.message||e);cur.flags.push('FC_READ_ERROR');}
      }
    });
  }

  function walk(obj, depth=0, out=[]) {
    if (depth>6 || obj==null) return out;
    if(Array.isArray(obj)){obj.forEach(v=>walk(v,depth+1,out));return out;}
    if(typeof obj==='object'){for(const [k,v] of Object.entries(obj)){out.push([k,v]);walk(v,depth+1,out);}}
    return out;
  }

  function pcExtract(json) {
    let cond='', path='', cptMs=0;
    for(const [k,v] of walk(json)) {
      const kk=key(k); const s=typeof v==='string'||typeof v==='number'?String(v):'';
      if(!cond && /(condition|shipmentstate|status)/.test(kk)) { const c=condition(s); if(/^C\d+$/.test(c)) cond=c; }
      if(!path && /(processpath|workpool)/.test(kk) && s.length<100) path=norm(s);
      if(!cptMs && /(cpt|expectedship|shipby|needtoship)/.test(kk)) cptMs=epoch(v);
    }
    return {cond,path,cptMs};
  }

  async function enrichPc(map) {
    const targets=[];
    for(const t of map.values()) for(const sid of t.shipments) if(!t.condition||!t.processPath||!t.cptMs) targets.push({sid,t});
    targets.sort((a,b)=>(a.t.cptMs||Infinity)-(b.t.cptMs||Infinity));
    const unique=[]; const seen=new Set();
    for(const x of targets){if(!seen.has(x.sid)){seen.add(x.sid);unique.push(x);} if(unique.length>=SETTINGS.pcMax)break;}
    await mapLimit(unique, SETTINGS.pcConcurrency, async x => {
      try {
        const text=await gmGet(ENDPOINTS.pc+encodeURIComponent(x.sid),'application/json,*/*');
        const data=pcExtract(JSON.parse(text));
        for(const t of map.values()) if(t.shipments.includes(x.sid)) {
          if(!t.condition&&data.cond)t.condition=data.cond;
          if(!t.processPath&&data.path)t.processPath=data.path;
          if(!t.cptMs&&data.cptMs)t.cptMs=data.cptMs;
        }
        state.shipmentMemory.set(x.sid,{condition:data.cond,path:data.path,cptMs:data.cptMs,at:Date.now()});
      } catch(_) {}
    });
  }

  function heroRunner(json) {
    const text=walk(json).map(([k,v])=>`${k}:${typeof v==='string'?v:''}`).join(' ').toUpperCase();
    if(!/RUNNER|HOT ?PICK|SEND ?RUNNER|REQUESTED/.test(text)) return '';
    if(/P2R ?P4|P2RP4|P4/.test(text)) return 'P4 runner';
    if(/P2R ?P3|P2RP3|P3/.test(text)) return 'P3 runner';
    if(/P2R ?P2|P2RP2|P2/.test(text)) return 'P2 runner';
    if(/AFE/.test(text)) return 'AFE runner';
    if(/HOT ?PICK/.test(text)) return 'Hotpick';
    return 'Runner requested';
  }

  async function enrichHero(map) {
    const now=Date.now();
    const targets=[]; const seen=new Set();
    for(const t of map.values()) {
      const mins=t.cptMs?(t.cptMs-now)/60000:null;
      if(t.condition==='C15'||(mins!=null&&mins<=60)) for(const sid of t.shipments) if(!seen.has(sid)){seen.add(sid);targets.push({sid,t});}
    }
    await mapLimit(targets.slice(0,SETTINGS.heroMax), SETTINGS.heroConcurrency, async x => {
      const cached=state.heroCache.get(x.sid);
      if(cached&&now-cached.at<300000){x.t.runner=cached.runner;return;}
      try{const text=await gmGet(ENDPOINTS.hero+encodeURIComponent(x.sid),'application/json,*/*');const r=heroRunner(JSON.parse(text));state.heroCache.set(x.sid,{runner:r,at:now});x.t.runner=r;}catch(_){}
    });
  }

  function applyDuplicateFlags(map) {
    const by=new Map();
    for(const t of map.values()) for(const sid of t.shipments){if(!by.has(sid))by.set(sid,[]);by.get(sid).push(t.id);}
    for(const [sid,chutes] of by) if(chutes.length>1) for(const id of chutes){const t=map.get(id);if(t&&!t.flags.includes('CS_MULTI_CHUTE'))t.flags.push('CS_MULTI_CHUTE');}
  }

  function classifyRisk(t) {
    const mins=t.cptMs?(t.cptMs-Date.now())/60000:null;
    t.minutesToCpt=mins;
    const severe=t.ownerQty.unowned||t.ownerQty.whse||t.ownerQty.workOrder||t.flags.includes('CS_MULTI_CHUTE')||t.flags.includes('MULTI_CS');
    if(t.truth==='RODEO_BATCH_ERROR'||t.flags.includes('FC_READ_ERROR')) return ['VERIFY',78];
    if(severe) return ['ACT NOW',100];
    if(mins!=null&&mins<0) return ['ACT NOW',100];
    if(t.condition==='C15'&&mins!=null&&mins<=60) return ['ACT NOW',96];
    if(mins!=null&&mins<=30) return ['ACT NOW',92];
    if(mins!=null&&mins<=60) return ['WATCH',72];
    if(mins!=null&&mins<=90) return ['WATCH',55];
    if(t.condition==='C5') return ['CLEANUP',30];
    if(t.occupied) return ['WATCH',40];
    if(t.truth==='FC_CONFIRMED_EMPTY') return ['CLEAR',0];
    return ['VERIFY',20];
  }

  function finalize(map) {
    applyDuplicateFlags(map);
    for(const t of map.values()) { const [risk,rank]=classifyRisk(t); t.risk=risk;t.riskRank=rank; }
  }

  async function refresh() {
    if(state.refreshing) return false;
    state.refreshing=true; state.lastError=''; render();
    try {
      const map=await scanRodeo();
      await verifyFc(map);
      await enrichPc(map);
      finalize(map);
      await enrichHero(map);
      finalize(map);
      state.chutes=map; state.lastUpdated=Date.now();
    } catch(e){state.lastError=String(e&&e.message||e);}
    finally{state.refreshing=false;render();}
    return true;
  }

  function sourceBadge(t){return t.truth==='RODEO_OCCUPIED'?'R':t.truth.startsWith('FC_')?'F':t.truth==='RODEO_BATCH_ERROR'?'!':'?';}
  function tileClass(t){if(t.risk==='ACT NOW')return'act';if(t.risk==='WATCH')return'watch';if(t.risk==='CLEANUP')return'clean';if(t.truth==='FC_CONFIRMED_EMPTY')return'empty';return'verify';}
  function queueItems(){return [...state.chutes.values()].filter(t=>t.risk!=='CLEAR').sort((a,b)=>b.riskRank-a.riskRank||((a.cptMs||Infinity)-(b.cptMs||Infinity))).slice(0,30);}
  function why(t){const bits=[];if(t.minutesToCpt!=null)bits.push(`${Math.round(t.minutesToCpt)}m`);if(t.condition)bits.push(t.condition);if(t.processPath)bits.push(t.processPath);if(t.ownerQty.unowned)bits.push(`UNOWNED ${t.ownerQty.unowned}`);if(t.ownerQty.whse)bits.push(`WHSE ${t.ownerQty.whse}`);if(t.ownerQty.workOrder)bits.push(`WO ${t.ownerQty.workOrder}`);if(t.flags.includes('CS_MULTI_CHUTE'))bits.push('SAME CS MULTI-CHUTE');if(t.runner)bits.push(t.runner);if(t.truth==='RODEO_BATCH_ERROR')bits.push('RODEO ERROR');return bits.join(' · ')||t.truth;}

  function selectedHtml(){const t=state.chutes.get(state.selected);if(!t)return'<div class="muted">Select a chute.</div>';return `<div class="detailGrid"><b>Chute</b><span>${esc(t.id)}</span><b>Truth</b><span>${esc(t.truth)} / ${esc(t.confidence)}</span><b>Risk</b><span>${esc(t.risk)}</span><b>Shipments</b><span>${esc(t.shipments.join(', ')||'—')}</span><b>CPT</b><span>${fmtCpt(t.cptMs)}${t.minutesToCpt!=null?` (${Math.round(t.minutesToCpt)}m)`:''}</span><b>Condition</b><span>${esc(t.condition||'—')}</span><b>Path</b><span>${esc(t.processPath||'—')}</span><b>CS</b><span>${t.ownerQty.cs}</span><b>WHSE</b><span>${t.ownerQty.whse}</span><b>Work order</b><span>${t.ownerQty.workOrder}</span><b>Unowned</b><span>${t.ownerQty.unowned}</span><b>Unknown owner</b><span>${t.ownerQty.unknown}</span><b>PR / Damaged</b><span>${t.dispositionQty.pr} / ${t.dispositionQty.damaged}</span><b>Flags</b><span>${esc(t.flags.join(', ')||'—')}</span><b>Runner</b><span>${esc(t.runner||'—')}</span></div>${t.shipments[0]?`<a class="link" target="_blank" href="${ENDPOINTS.heroPage}${encodeURIComponent(t.shipments[0])}">Open HERO</a>`:''}`;}

  function wallHtml(){let html='';for(const row of WALL.rows){html+=`<section class="wallRow"><div class="rowLabel">${row}</div>`;for(const [bay,slots] of WALL.bays){html+=`<div class="bay"><div class="bayTitle">${bay}</div><div class="slots">`;for(const slot of slots){const id=`${WALL.prefix}${bay}${row}${slot}`,t=state.chutes.get(id)||blankTruth({id,row,bay,slot});html+=`<button class="tile ${tileClass(t)} ${state.selected===id?'sel':''}" data-chute="${id}" title="${esc(why(t))}"><span class="src">${sourceBadge(t)}</span><strong>${slot}</strong><small>${t.condition||''}${t.minutesToCpt!=null?` ${Math.round(t.minutesToCpt)}m`:''}</small></button>`;}html+='</div></div>';}html+='</section>'; }return html;}

  function queueHtml(){const q=queueItems();if(!q.length)return'<div class="muted">No active risks.</div>';return q.map(t=>`<button class="qitem ${tileClass(t)}" data-chute="${t.id}"><b>${esc(t.risk)}</b><span>${esc(t.id)}</span><small>${esc(why(t))}</small></button>`).join('');}

  function coverage(){const vals=[...state.chutes.values()];const known=vals.filter(t=>t.truth==='RODEO_OCCUPIED'||t.truth==='FC_CONFIRMED_EMPTY'||t.truth==='FC_CONFIRMED_OCCUPIED').length;return Math.round(known/vals.length*100);}

  const CSS=`:host{all:initial}*{box-sizing:border-box}.panel{position:fixed;left:18px;top:18px;width:min(1460px,calc(100vw - 36px));height:min(900px,calc(100vh - 36px));z-index:2147483000;background:#07100d;color:#eefbf4;border:1px solid #1d6045;border-radius:14px;box-shadow:0 18px 60px #000b,0 0 35px #20ff8a1e;font:12px/1.35 Inter,"Segoe UI",Arial,sans-serif;display:grid;grid-template-rows:auto 1fr;overflow:hidden}.head{display:flex;align-items:center;gap:10px;padding:11px 13px;background:linear-gradient(90deg,#0b1712,#0d2419);border-bottom:1px solid #1a4a36}.head h1{font-size:15px;margin:0;color:#73ffb1}.pill{padding:3px 7px;border-radius:999px;background:#ffffff0d;border:1px solid #ffffff17;color:#b5c9bf}.grow{flex:1}.btn{border:1px solid #2b7252;background:#10261b;color:#dff9e9;border-radius:8px;padding:6px 9px;cursor:pointer}.btn:hover{background:#173527}.body{display:grid;grid-template-columns:minmax(0,1fr) 390px;min-height:0}.main{padding:10px;overflow:auto}.side{border-left:1px solid #173b2c;padding:10px;overflow:auto;background:#07130e}.sectionTitle{font-size:10px;letter-spacing:.12em;color:#76b998;margin:7px 0}.wallRow{display:grid;grid-template-columns:25px repeat(6,minmax(95px,1fr));gap:6px;margin:7px 0}.rowLabel{display:grid;place-items:center;font-weight:900;color:#8cffbe}.bay{border:1px solid #173b2c;border-radius:9px;padding:4px;background:#0a1711}.bayTitle{text-align:center;font-size:9px;color:#739b86;margin-bottom:4px}.slots{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}.tile{position:relative;min-height:44px;border-radius:7px;border:1px solid #244b39;background:#0c1c14;color:#d9f4e4;cursor:pointer;display:grid;place-items:center}.tile strong{font-size:13px}.tile small{font-size:8px;color:#a4c6b4}.src{position:absolute;left:4px;top:3px;font-size:8px;color:#8eb5a0}.tile.act,.qitem.act{border-color:#ff596a;background:#381419}.tile.watch,.qitem.watch{border-color:#e9b94f;background:#302713}.tile.clean,.qitem.clean{border-color:#7d78d7;background:#1d1b35}.tile.empty{opacity:.55;background:#0b1611}.tile.verify{background:repeating-linear-gradient(135deg,#101914,#101914 6px,#15231b 6px,#15231b 12px);border-color:#526c5d}.tile.sel{outline:2px solid #6affad}.queue{display:grid;gap:5px}.qitem{text-align:left;border:1px solid #244b39;border-radius:8px;padding:7px;background:#0c1b14;color:#e8f8ef;cursor:pointer}.qitem b{display:inline-block;min-width:70px;font-size:9px}.qitem span{font:10px Consolas,monospace}.qitem small{display:block;margin-top:3px;color:#b9cfc3}.detailGrid{display:grid;grid-template-columns:105px 1fr;gap:5px 8px;padding:8px;border:1px solid #173b2c;border-radius:9px;background:#091711}.detailGrid b{color:#78b895;font-size:9px;text-transform:uppercase}.detailGrid span{word-break:break-word}.link{display:inline-block;margin-top:7px;color:#6dffae;text-decoration:none}.muted{color:#7f998b;padding:8px}.err{color:#ff8290}.spin{animation:p 1s linear infinite}@keyframes p{to{transform:rotate(360deg)}}@media(max-width:1000px){.body{grid-template-columns:1fr}.side{border-left:0;border-top:1px solid #173b2c}.panel{width:calc(100vw - 20px);height:calc(100vh - 20px);left:10px;top:10px}.wallRow{grid-template-columns:25px repeat(3,minmax(100px,1fr))}}`;

  function mount(){if(state.host&&state.host.isConnected)return;const host=document.createElement('div');host.id='nova-obps-risk-engine';const shadow=host.attachShadow({mode:'open'});shadow.innerHTML=`<style>${CSS}</style><div class="panel"><div class="head"><h1>OB PS CONTROL CENTER · RISK ENGINE</h1><span class="pill" id="cov"></span><span class="pill" id="stamp"></span><span class="grow"></span><button class="btn" id="refresh">↻ Refresh</button><button class="btn" id="hide">Hide</button></div><div class="body"><main class="main"><div id="error"></div><div class="sectionTitle">PS WALL</div><div id="wall"></div></main><aside class="side"><div class="sectionTitle">ACTION QUEUE</div><div class="queue" id="queue"></div><div class="sectionTitle">SELECTED CHUTE</div><div id="detail"></div></aside></div></div>`;(document.body||document.documentElement).appendChild(host);state.host=host;state.shadow=shadow;shadow.getElementById('refresh').onclick=()=>refresh();shadow.getElementById('hide').onclick=()=>hide();shadow.addEventListener('click',e=>{const b=e.target.closest?.('[data-chute]');if(!b)return;state.selected=b.dataset.chute;render();});}

  function render(){if(!state.visible)return;mount();const s=state.shadow;if(!s)return;s.getElementById('cov').textContent=`Truth ${coverage()}%`;s.getElementById('stamp').textContent=state.refreshing?'Refreshing…':state.lastUpdated?`Updated ${new Date(state.lastUpdated).toLocaleTimeString('en-GB')}`:'Starting…';s.getElementById('error').innerHTML=state.lastError?`<div class="err">${esc(state.lastError)}</div>`:'';s.getElementById('wall').innerHTML=wallHtml();s.getElementById('queue').innerHTML=queueHtml();s.getElementById('detail').innerHTML=selectedHtml();}

  function show(){state.visible=true;mount();if(state.host)state.host.style.display='';if(!state.timer)state.timer=setInterval(()=>refresh(),SETTINGS.refreshMs);render();return true;}
  function hide(){state.visible=false;if(state.timer){clearInterval(state.timer);state.timer=null;}if(state.host)state.host.style.display='none';return true;}
  function destroy(){hide();state.host?.remove();state.host=null;state.shadow=null;return true;}

  window[API]={id:MODULE_ID,version:VERSION,loaded:true,show,hide,refresh,destroy,getState:()=>({refreshing:state.refreshing,lastUpdated:state.lastUpdated,coverage:coverage(),selected:state.selected})};

  function boot(){show();refresh();console.log('[Nova OBPS Risk Engine] loaded',VERSION);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();