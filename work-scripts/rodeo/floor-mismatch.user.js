// ==UserScript==
// @name         Nova Work - Rodeo Floor Mismatch Scanner
// @namespace    nova.amazon.rodeo.binpodfloor.simple
// @version      2026.04.27.simple.v1.1-gh1
// @description  Manual Rodeo scanner: press Scan, read visible table rows, BIN -> Roboscout pod/floor lookup, show mismatches, copy shipment IDs. No background loop.
// @author       Martin + Nova
// @match        https://rodeo-dub.amazon.com/*
// @match        https://www.google.com/*
// @match        https://google.com/*
// @match        https://www.google.co.uk/*
// @match        https://google.co.uk/*
// @match        https://www.google.ie/*
// @match        https://google.ie/*
// @include      /^https:\/\/(www\.)?google\.[^\/]+\/.*/
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      roboscout.amazon.com
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/work-scripts/rodeo/floor-mismatch.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/work-scripts/rodeo/floor-mismatch.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    warehouseId: 'NCL1',
    concurrencyDefault: 6,
    requestTimeoutMs: 22000,
    queueDelayMs: 80,
    googlePreviewRows: true,
    maxPanelEntries: 300,
    rodeoShipmentUrl: (shipmentId) =>
      `https://rodeo-dub.amazon.com/${CONFIG.warehouseId}/Search?searchKey=${encodeURIComponent(shipmentId)}`
  };

  const STORAGE = {
    panelPos: 'rbpfm_simple_panel_pos',
    floors: 'rbpfm_simple_floors',
    c4Only: 'rbpfm_simple_c4only',
    concurrency: 'rbpfm_simple_concurrency'
  };

  const IS_RODEO = location.hostname.includes('rodeo-dub.amazon.com');
  const PREVIEW_MODE = !IS_RODEO;

  const state = {
    scanning: false,
    queue: [],
    active: 0,
    binRows: new Map(),
    binCache: new Map(),
    mismatches: [],
    errors: [],
    checkedRows: 0,
    scannedBins: 0,
    eligibleRows: 0,
    skippedRows: 0,
    skippedNotC4: 0,
    skippedNoExpectedFloor: 0,
    lastScanAt: null,
    scanId: 0,
    selectedFloors: loadFloors(),
    c4Only: GM_getValue(STORAGE.c4Only, true),
    concurrency: Number(GM_getValue(STORAGE.concurrency, CONFIG.concurrencyDefault)) || CONFIG.concurrencyDefault,
    dragging: null
  };

  function loadFloors() {
    const stored = GM_getValue(STORAGE.floors, null);
    if (stored && typeof stored === 'object') {
      return { P2: Boolean(stored.P2), P3: Boolean(stored.P3), P4: Boolean(stored.P4) };
    }
    return { P2: false, P3: true, P4: true };
  }

  function saveFloors() {
    GM_setValue(STORAGE.floors, state.selectedFloors);
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeKey(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normalizeBinId(text) {
    return cleanText(text).toUpperCase();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function unique(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  function normalizeFloor(value) {
    const t = cleanText(value).toUpperCase();
    if (!t) return '';
    const pakiva = t.match(/PAKIVAA0?([1-9])/i);
    if (pakiva) return `P${pakiva[1]}`;
    const pMatch = t.match(/\bP\s*([1-9])\b/);
    if (pMatch) return `P${pMatch[1]}`;
    const floorMatch = t.match(/(?:FLOOR|LEVEL|FLR)\s*([1-9])/);
    if (floorMatch) return `P${floorMatch[1]}`;
    const digit = t.match(/^0?([1-9])$/);
    if (digit) return `P${digit[1]}`;
    return t;
  }

  function expectedFloorFromProcessPath(processPathRaw) {
    const p = cleanText(processPathRaw).toUpperCase();
    if (!p) return '';
    if (/P2R\s*P2\b/.test(p) || /PICKTOREBIN2\b/.test(p) || /PPPICKTOREBIN2\b/.test(p)) return 'P2';
    if (/P2R\s*P3\b/.test(p) || /PICKTOREBIN3\b/.test(p) || /PPPICKTOREBIN3\b/.test(p)) return 'P3';
    if (/P2R\s*P4\b/.test(p) || /PICKTOREBIN4\b/.test(p) || /PPPICKTOREBIN4\b/.test(p)) return 'P4';
    if (/PP\s*PICK\s*TO\s*REBIN\s*2/.test(p)) return 'P2';
    if (/PP\s*PICK\s*TO\s*REBIN\s*3/.test(p)) return 'P3';
    if (/PP\s*PICK\s*TO\s*REBIN\s*4/.test(p)) return 'P4';
    if (/\bP2\b/.test(p)) return 'P2';
    if (/\bP3\b/.test(p)) return 'P3';
    if (/\bP4\b/.test(p)) return 'P4';
    return '';
  }

  function looksLikeBinId(text) {
    const t = normalizeBinId(text);
    if (!t || t.length < 4 || t.length > 80) return false;
    if (/^TBA/i.test(t)) return false;
    if (/^\d{8,}$/.test(t)) return false;
    if (/^P-\d-[A-Z0-9]+$/i.test(t)) return true;
    return /[A-Z]/i.test(t) && /\d/.test(t) && !/\s/.test(t) && t.includes('-');
  }

  function getHeaderMap(table) {
    const map = {};
    const headers = [...table.querySelectorAll('thead th')];
    const firstRowCells = [...(table.querySelector('tr') || document.createElement('tr')).querySelectorAll('th,td')];
    const source = headers.length ? headers : firstRowCells;
    source.forEach((cell, idx) => {
      const raw = cleanText(cell.innerText || cell.textContent);
      const key = normalizeKey(raw);
      if (key) map[key] = idx;
    });
    return map;
  }

  function findColumnIndex(headerMap, candidates) {
    const entries = Object.entries(headerMap);
    const normalized = candidates.map(normalizeKey);
    for (const candidate of normalized) {
      if (Number.isInteger(headerMap[candidate])) return headerMap[candidate];
    }
    for (const [key, index] of entries) {
      if (normalized.some(candidate => key.includes(candidate) || candidate.includes(key))) return index;
    }
    return -1;
  }

  function getTableRows(table) {
    const bodyRows = [...table.querySelectorAll('tbody tr')];
    if (bodyRows.length) return bodyRows;
    return [...table.querySelectorAll('tr')].filter(row => !row.querySelector('th'));
  }

  function extractRowsFromPage() {
    if (PREVIEW_MODE) return getPreviewRows();
    const rowsOut = [];
    const tables = [...document.querySelectorAll('table')];

    for (const table of tables) {
      const headerMap = getHeaderMap(table);
      const shipmentCol = findColumnIndex(headerMap, ['SHIPMENT ID', 'SHIPMENT_ID', 'SHIPMENTID']);
      const demandCol = findColumnIndex(headerMap, ['DEMAND ID', 'DEMAND_ID', 'DEMANDID']);
      const binCol = findColumnIndex(headerMap, ['SCANNABLE ID', 'SCANNABLE_ID', 'SCANNABLEID', 'BIN', 'BIN ID', 'BIN_ID', 'LOCATION', 'PICK LOCATION', 'PICK_LOCATION', 'OUTER SCANNABLE ID', 'OUTER_SCANNABLE_ID']);
      const conditionCol = findColumnIndex(headerMap, ['CONDITION']);
      const processPathCol = findColumnIndex(headerMap, ['PROCESS PATH', 'PROCESS_PATH', 'PROCESSPATH', 'PATH']);
      const rows = getTableRows(table);

      for (const row of rows) {
        if (!row.offsetParent) continue;
        const cells = [...row.querySelectorAll('td')];
        if (!cells.length) continue;
        const rowText = cleanText(row.innerText || row.textContent);
        if (!rowText) continue;

        const shipmentId = shipmentCol >= 0 && cells[shipmentCol] ? cleanText(cells[shipmentCol].innerText || cells[shipmentCol].textContent) : '';
        const demandId = demandCol >= 0 && cells[demandCol] ? cleanText(cells[demandCol].innerText || cells[demandCol].textContent) : '';
        let binId = binCol >= 0 && cells[binCol] ? cleanText(cells[binCol].innerText || cells[binCol].textContent).split(/\s+/)[0] : '';

        if (!looksLikeBinId(binId)) {
          const possible = unique(rowText.split(/\s+/).filter(looksLikeBinId));
          binId = possible[0] || '';
        }

        const condition = conditionCol >= 0 && cells[conditionCol] ? cleanText(cells[conditionCol].innerText || cells[conditionCol].textContent) : '';
        const processPath = processPathCol >= 0 && cells[processPathCol] ? cleanText(cells[processPathCol].innerText || cells[processPathCol].textContent) : '';

        if (!binId) {
          state.skippedRows++;
          continue;
        }
        if (state.c4Only && cleanText(condition) !== '4') {
          state.skippedRows++;
          state.skippedNotC4++;
          continue;
        }
        const expectedFloor = expectedFloorFromProcessPath(processPath);
        if (!expectedFloor) {
          state.skippedRows++;
          state.skippedNoExpectedFloor++;
          continue;
        }
        if (!state.selectedFloors[expectedFloor]) {
          state.skippedRows++;
          continue;
        }
        rowsOut.push({ shipmentId, demandId, binId: normalizeBinId(binId), condition, processPath, expectedFloor });
      }
    }

    const seen = new Set();
    return rowsOut.filter(row => {
      const key = `${row.shipmentId || 'NO_SHIPMENT'}|${row.binId}|${row.expectedFloor}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getPreviewRows() {
    if (!CONFIG.googlePreviewRows) return [];
    return [
      { shipmentId: '117502191071202', demandId: '1668352760603', binId: 'P-9-G438E034', condition: '4', processPath: 'PPPickToRebin4', expectedFloor: 'P4' },
      { shipmentId: '117504618046202', demandId: '1668388039703', binId: 'P-9-F252P079', condition: '4', processPath: 'PPPickToRebin4', expectedFloor: 'P4' },
      { shipmentId: '1175021118631202', demandId: '1668371422923', binId: 'P-8-C808Z747', condition: '4', processPath: 'PPPickToRebin4', expectedFloor: 'P4' }
    ];
  }

  function roboscoutUrl(binId) {
    const params = new URLSearchParams({ bin_id: normalizeBinId(binId), building: CONFIG.warehouseId });
    return `https://roboscout.amazon.com/ipa/kpps/get_neighboring_bins/?${params.toString()}`;
  }

  function gmRequestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: CONFIG.requestTimeoutMs,
        anonymous: false,
        headers: { Accept: 'application/json,text/plain,*/*' },
        onload: response => {
          const status = Number(response && response.status || 0);
          const text = response && response.responseText || '';
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status || 'ERR'}`));
            return;
          }
          try { resolve(JSON.parse(text)); }
          catch (_) { reject(new Error('Invalid JSON response')); }
        },
        ontimeout: () => reject(new Error('Request timeout')),
        onerror: () => reject(new Error('Request failed'))
      });
    });
  }

  function pickResponseObject(payload, binId) {
    if (!payload) return {};
    const normalizedTarget = normalizeBinId(binId);
    if (typeof payload === 'object' && !Array.isArray(payload) && ('floor' in payload || 'pod_id' in payload || 'target_bin_id' in payload || 'response_status' in payload)) return payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const exact = payload[binId];
      if (exact && typeof exact === 'object') return exact;
      for (const [key, value] of Object.entries(payload)) {
        if (normalizeBinId(key) === normalizedTarget && value && typeof value === 'object') return value;
      }
    }
    const nestedCandidates = [payload.data, payload.result, payload.results, payload.response, payload.payload].filter(Boolean);
    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate) && candidate.length) {
        const exact = candidate.find(item => item && typeof item === 'object' && normalizeBinId(item.target_bin_id || item.targetBinId || item.bin_id || item.binId) === normalizedTarget);
        if (exact) return exact;
        const first = candidate[0];
        if (first && typeof first === 'object') return first;
      }
      if (candidate && typeof candidate === 'object') {
        if ('floor' in candidate || 'pod_id' in candidate || 'target_bin_id' in candidate || 'response_status' in candidate) return candidate;
        const exact = candidate[binId];
        if (exact && typeof exact === 'object') return exact;
      }
    }
    if (Array.isArray(payload) && payload.length) {
      const exact = payload.find(item => item && typeof item === 'object' && normalizeBinId(item.target_bin_id || item.targetBinId || item.bin_id || item.binId) === normalizedTarget);
      if (exact) return exact;
      const first = payload[0];
      if (first && typeof first === 'object') return first;
    }
    return typeof payload === 'object' ? payload : {};
  }

  function normalizeLookupResult(binId, payload) {
    const data = pickResponseObject(payload, normalizeBinId(binId));
    const status = cleanText(data.response_status ?? data.status ?? data.result ?? '') || 'UNKNOWN';
    const floorRaw = cleanText(data.floor ?? data.kiva_floor ?? data.level ?? data.floorId ?? data.floor_id ?? '');
    const podId = cleanText(data.pod_id ?? data.podId ?? data.pod ?? data.podScannableId ?? '');
    const podFace = cleanText(data.pod_face ?? data.podFace ?? '');
    return { binId: normalizeBinId(binId), floorRaw, actualFloor: normalizeFloor(floorRaw), podId, podFace, status, ok: status.toUpperCase() === 'OK' || Boolean(floorRaw || podId) };
  }

  async function lookupBin(binId) {
    const key = normalizeBinId(binId);
    if (state.binCache.has(key)) return state.binCache.get(key);
    if (PREVIEW_MODE) {
      const fakeFloors = { 'P-9-G438E034': 'paKivaA03', 'P-9-F252P079': 'paKivaA04', 'P-8-C808Z747': 'paKivaA02' };
      const result = normalizeLookupResult(key, { response_status: 'OK', floor: fakeFloors[key] || 'paKivaA04', pod_id: `POD-${key.slice(-6)}`, target_bin_id: key });
      state.binCache.set(key, result);
      return result;
    }
    const payload = await gmRequestJson(roboscoutUrl(key));
    const result = normalizeLookupResult(key, payload);
    state.binCache.set(key, result);
    return result;
  }

  function resetScanState() {
    state.queue = [];
    state.active = 0;
    state.binRows.clear();
    state.binCache.clear();
    state.mismatches = [];
    state.errors = [];
    state.checkedRows = 0;
    state.scannedBins = 0;
    state.eligibleRows = 0;
    state.skippedRows = 0;
    state.skippedNotC4 = 0;
    state.skippedNoExpectedFloor = 0;
    state.scanId++;
  }

  async function startManualScan() {
    if (state.scanning) return;
    resetScanState();
    state.scanning = true;
    state.lastScanAt = new Date();
    updatePanel(true);
    const rows = extractRowsFromPage();
    state.eligibleRows = rows.length;
    for (const row of rows) {
      const binKey = normalizeBinId(row.binId);
      if (!state.binRows.has(binKey)) state.binRows.set(binKey, []);
      state.binRows.get(binKey).push(row);
    }
    state.queue = [...state.binRows.keys()];
    updatePanel(true);
    if (!state.queue.length) {
      state.scanning = false;
      updatePanel(true);
      return;
    }
    pumpQueue();
  }

  function pumpQueue() {
    while (state.scanning && state.active < state.concurrency && state.queue.length) {
      const binId = state.queue.shift();
      state.active++;
      processBin(binId)
        .catch(err => { state.errors.push({ binId, error: err.message || String(err) }); })
        .finally(() => {
          state.active--;
          setTimeout(() => {
            if (state.queue.length || state.active) pumpQueue();
            else state.scanning = false;
            updatePanel();
          }, CONFIG.queueDelayMs);
        });
    }
    updatePanel();
  }

  async function processBin(binId) {
    const rows = state.binRows.get(normalizeBinId(binId)) || [];
    const data = await lookupBin(binId);
    state.scannedBins++;
    const actualFloor = normalizeFloor(data.actualFloor || data.floorRaw);
    if (!actualFloor) {
      state.errors.push({ binId, error: 'No floor returned' });
      return;
    }
    for (const row of rows) {
      state.checkedRows++;
      const expectedFloor = normalizeFloor(row.expectedFloor);
      if (expectedFloor && actualFloor !== expectedFloor) {
        state.mismatches.push({ shipmentId: row.shipmentId || '', demandId: row.demandId || '', binId: row.binId, processPath: row.processPath, expectedFloor, actualFloor, podId: data.podId || '', podFace: data.podFace || '', status: data.status || '', foundAt: new Date().toLocaleTimeString() });
      }
    }
  }

  function createPanel() {
    if (document.getElementById('rbpfm-simple-panel')) return;
    const style = document.createElement('style');
    style.textContent = `
      #rbpfm-simple-panel{position:fixed;right:14px;bottom:14px;width:min(430px,calc(100vw - 28px));max-height:min(650px,calc(100vh - 28px));z-index:999999;background:#101820;color:#f5f7fa;border:1px solid #364653;border-radius:8px;box-shadow:0 12px 34px rgba(0,0,0,.35);font-family:Arial,Helvetica,sans-serif;font-size:12px;overflow:hidden;}
      #rbpfm-simple-panel *{box-sizing:border-box;}.rbpfm-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 9px;background:#162330;border-bottom:1px solid #364653;cursor:move;user-select:none;}.rbpfm-title{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.rbpfm-actions{display:flex;gap:5px;align-items:center;flex-shrink:0;}.rbpfm-btn{background:#243443;color:#f5f7fa;border:1px solid #4d6477;border-radius:6px;padding:4px 7px;cursor:pointer;font-size:11px;line-height:1.2;}.rbpfm-btn:hover{background:#30465a;}.rbpfm-btn:disabled{opacity:.55;cursor:default;}.rbpfm-body{padding:9px 10px;}.rbpfm-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#182633;border:1px solid #314352;border-radius:6px;padding:7px;margin-bottom:8px;}.rbpfm-controls label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;}.rbpfm-controls input[type="number"]{width:52px;background:#101820;color:#fff;border:1px solid #4d6477;border-radius:4px;padding:2px 4px;}.rbpfm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:8px;}.rbpfm-stat{background:#182633;border:1px solid #314352;border-radius:6px;padding:6px 4px;text-align:center;min-width:0;}.rbpfm-stat b{display:block;font-size:15px;margin-bottom:2px;}.rbpfm-stat span{color:#a8b5c1;font-size:10px;}.rbpfm-muted{color:#a8b5c1;}.rbpfm-danger{color:#ff9a9a;}.rbpfm-good{color:#94e6ad;}.rbpfm-preview{color:#ffd166;}.rbpfm-list{max-height:360px;overflow:auto;border-top:1px solid #314352;padding-top:7px;margin-top:8px;}.rbpfm-entry{display:block;color:#f5f7fa;text-decoration:none;background:#172331;border:1px solid #314352;border-radius:6px;padding:7px;margin-bottom:6px;}.rbpfm-entry-top{display:flex;justify-content:space-between;gap:8px;font-weight:700;}.rbpfm-entry-actions{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;}.rbpfm-foot{display:flex;justify-content:space-between;gap:8px;margin-top:8px;color:#a8b5c1;font-size:11px;}#rbpfm-simple-panel.rbpfm-min{width:270px;}#rbpfm-simple-panel.rbpfm-min .rbpfm-body{display:none;}
    `;
    document.head.appendChild(style);
    const panel = document.createElement('div');
    panel.id = 'rbpfm-simple-panel';
    panel.innerHTML = `<div class="rbpfm-head" id="rbpfm-drag-handle"><div class="rbpfm-title">P2R Bin -> Pod Floor Scan</div><div class="rbpfm-actions"><button class="rbpfm-btn" id="rbpfm-scan">Scan now</button><button class="rbpfm-btn" id="rbpfm-copy">Copy mismatches</button><button class="rbpfm-btn" id="rbpfm-min">_</button></div></div><div class="rbpfm-body" id="rbpfm-content"></div>`;
    document.body.appendChild(panel);
    restorePanelPosition(panel);
    makeDraggable(panel, document.getElementById('rbpfm-drag-handle'));
    document.getElementById('rbpfm-scan').addEventListener('click', startManualScan);
    document.getElementById('rbpfm-copy').addEventListener('click', copyAllShipmentIds);
    document.getElementById('rbpfm-min').addEventListener('click', () => panel.classList.toggle('rbpfm-min'));
  }

  function updatePanel() {
    createPanel();
    const content = document.getElementById('rbpfm-content');
    if (!content) return;
    const scanBtn = document.getElementById('rbpfm-scan');
    if (scanBtn) { scanBtn.disabled = state.scanning; scanBtn.textContent = state.scanning ? 'Scanning...' : 'Scan now'; }
    const copyBtn = document.getElementById('rbpfm-copy');
    if (copyBtn) { const count = unique(state.mismatches.map(m => m.shipmentId).filter(Boolean)).length; copyBtn.disabled = state.scanning || count === 0; copyBtn.textContent = count ? `Copy mismatches (${count})` : 'Copy mismatches'; }
    const selected = Object.entries(state.selectedFloors).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
    const lastScan = state.lastScanAt ? state.lastScanAt.toLocaleTimeString() : '-';
    const errorsShort = state.errors.length ? ` | Errors: ${state.errors.length}` : '';
    const visibleMismatches = state.mismatches.slice(-CONFIG.maxPanelEntries).reverse();
    content.innerHTML = `<div class="rbpfm-controls"><label><input type="checkbox" data-floor="P2" ${state.selectedFloors.P2 ? 'checked' : ''}> P2</label><label><input type="checkbox" data-floor="P3" ${state.selectedFloors.P3 ? 'checked' : ''}> P3</label><label><input type="checkbox" data-floor="P4" ${state.selectedFloors.P4 ? 'checked' : ''}> P4</label><label><input type="checkbox" id="rbpfm-c4only" ${state.c4Only ? 'checked' : ''}> C4 only</label><label>Conc <input type="number" id="rbpfm-concurrency" min="1" max="50" value="${escapeHtml(state.concurrency)}"></label></div><div class="rbpfm-stats"><div class="rbpfm-stat"><b>${state.eligibleRows}</b><span>Eligible</span></div><div class="rbpfm-stat"><b>${state.scannedBins}</b><span>Bins</span></div><div class="rbpfm-stat"><b>${state.checkedRows}</b><span>Checked</span></div><div class="rbpfm-stat"><b class="${state.mismatches.length ? 'rbpfm-danger' : 'rbpfm-good'}">${state.mismatches.length}</b><span>Mismatch</span></div></div><div class="rbpfm-muted">Selected: ${escapeHtml(selected)} | Queue: ${state.queue.length} | Active: ${state.active} | Last scan: ${escapeHtml(lastScan)}${escapeHtml(errorsShort)}</div><div class="rbpfm-muted">Skipped: ${state.skippedRows} | Not C4: ${state.skippedNotC4} | No floor/path: ${state.skippedNoExpectedFloor}</div>${PREVIEW_MODE ? '<div class="rbpfm-preview">Google preview mode. Live Roboscout scan runs on Rodeo.</div>' : ''}<div class="rbpfm-list">${visibleMismatches.length ? visibleMismatches.map(renderMismatch).join('') : '<div class="rbpfm-muted">No mismatches from current scan.</div>'}</div><div class="rbpfm-foot"><span>Manual scan only. Results clear on each scan.</span><span><button class="rbpfm-btn" id="rbpfm-copy-body">Copy all mismatched Shipment IDs</button><button class="rbpfm-btn" id="rbpfm-clear">Clear</button></span></div>`;
    content.querySelectorAll('input[data-floor]').forEach(cb => cb.addEventListener('change', () => { state.selectedFloors[cb.dataset.floor] = cb.checked; saveFloors(); updatePanel(true); }));
    const c4 = document.getElementById('rbpfm-c4only');
    if (c4) c4.addEventListener('change', () => { state.c4Only = c4.checked; GM_setValue(STORAGE.c4Only, state.c4Only); updatePanel(true); });
    const conc = document.getElementById('rbpfm-concurrency');
    if (conc) conc.addEventListener('change', () => { const value = Math.max(1, Math.min(50, Number(conc.value) || CONFIG.concurrencyDefault)); state.concurrency = value; GM_setValue(STORAGE.concurrency, value); updatePanel(true); });
    content.querySelectorAll('[data-copy-one]').forEach(btn => btn.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); copyText(btn.getAttribute('data-copy-one') || ''); }));
    const copyBodyBtn = document.getElementById('rbpfm-copy-body');
    if (copyBodyBtn) { const count = unique(state.mismatches.map(m => m.shipmentId).filter(Boolean)).length; copyBodyBtn.disabled = state.scanning || count === 0; copyBodyBtn.addEventListener('click', copyAllShipmentIds, { once: true }); }
    const clearBtn = document.getElementById('rbpfm-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { resetScanState(); state.scanning = false; updatePanel(true); }, { once: true });
  }

  function renderMismatch(m) {
    const id = m.shipmentId || '';
    const link = id ? CONFIG.rodeoShipmentUrl(id) : '#';
    return `<a class="rbpfm-entry" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"><div class="rbpfm-entry-top"><span>${escapeHtml(id || 'NO SHIPMENT ID')}</span><span class="rbpfm-danger">${escapeHtml(m.expectedFloor)} -> ${escapeHtml(m.actualFloor)}</span></div><div>Bin: ${escapeHtml(m.binId)}</div><div>Pod: ${escapeHtml(m.podId || '-')} | Face: ${escapeHtml(m.podFace || '-')}</div><div>Path: ${escapeHtml(m.processPath || '-')} | Status: ${escapeHtml(m.status || '-')}</div>${m.demandId ? `<div class="rbpfm-muted">Demand ID ref only: ${escapeHtml(m.demandId)}</div>` : ''}<div class="rbpfm-muted">Found: ${escapeHtml(m.foundAt)}</div><div class="rbpfm-entry-actions"><button class="rbpfm-btn" data-copy-one="${escapeHtml(id)}" type="button" ${id ? '' : 'disabled'}>Copy Shipment ID</button></div></a>`;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    flashTitle('Copied');
  }

  async function copyAllShipmentIds() {
    const ids = unique(state.mismatches.map(m => m.shipmentId).filter(Boolean));
    if (!ids.length) { flashTitle('No mismatches to copy'); return; }
    await copyText(ids.join('\n'));
    flashTitle(`Copied ${ids.length} shipment IDs`);
  }

  function flashTitle(msg) {
    const title = document.querySelector('#rbpfm-simple-panel .rbpfm-title');
    if (!title) return;
    const old = title.textContent;
    title.textContent = msg;
    setTimeout(() => { title.textContent = old; }, 1000);
  }

  function restorePanelPosition(panel) {
    const pos = GM_getValue(STORAGE.panelPos, null);
    if (!pos || typeof pos !== 'object') return;
    if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      panel.style.left = `${pos.left}px`;
      panel.style.top = `${pos.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
  }

  function makeDraggable(panel, handle) {
    if (!panel || !handle) return;
    handle.addEventListener('mousedown', event => {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      state.dragging = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      event.preventDefault();
    });
  }

  function onDragMove(event) {
    if (!state.dragging) return;
    const panel = document.getElementById('rbpfm-simple-panel');
    if (!panel) return;
    const maxLeft = window.innerWidth - panel.offsetWidth - 8;
    const maxTop = window.innerHeight - panel.offsetHeight - 8;
    const left = Math.max(8, Math.min(maxLeft, event.clientX - state.dragging.offsetX));
    const top = Math.max(8, Math.min(maxTop, event.clientY - state.dragging.offsetY));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function onDragEnd() {
    const panel = document.getElementById('rbpfm-simple-panel');
    if (panel) {
      const rect = panel.getBoundingClientRect();
      GM_setValue(STORAGE.panelPos, { left: rect.left, top: rect.top });
    }
    state.dragging = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  function init() {
    createPanel();
    updatePanel(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
