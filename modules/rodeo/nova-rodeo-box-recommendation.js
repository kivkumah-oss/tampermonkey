// Nova module: modules/rodeo/nova-rodeo-box-recommendation.js
(function () {
  'use strict';

  const MODULE_ID = 'nova-rodeo-box-recommendation';
  const MODULE_VERSION = '0.4.1';
  const LOG = '[Nova Rodeo BoxRec]';
  const HERO = 'https://hero.eu.picking.aft.a2z.com';
  const STYLE_ID = 'nova-rodeo-boxrec-style';
  const TARGET_CONDITIONS = new Set(['7', '15', '704', '13', '1320']);

  if (window.NovaRodeoBoxRecommendation) {
    try { window.NovaRodeoBoxRecommendation.hide?.(); } catch (_) {}
    try { delete window.NovaRodeoBoxRecommendation; } catch (_) {}
  }

  const cache = new Map();
  const diagnostics = {
    scans: 0,
    tablesSeen: 0,
    rowsSeen: 0,
    candidates: 0,
    heroRequests: 0,
    heroResponses: 0,
    rendered: 0,
    lastShipment: '',
    lastRequestUrl: '',
    lastHttpStatus: null,
    lastBoxRec: '',
    lastError: ''
  };

  let observer = null;
  let timer = null;
  let active = false;

  function norm(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function matchesPage() {
    const host = String(location.hostname || '').toLowerCase();
    return host === 'rodeo-dub.amazon.com' || host === 'rodeo-dub.aka.amazon.com';
  }

  function getFC() {
    const url = new URL(location.href);
    for (const key of ['fc', 'fcName', 'warehouse', 'site']) {
      const value = url.searchParams.get(key);
      if (value && /^[A-Z]{3,4}\d$/i.test(value)) return value.toUpperCase();
    }
    for (const part of url.pathname.split('/')) {
      if (/^[A-Z]{3,4}\d$/i.test(part)) return part.toUpperCase();
    }
    return 'NCL1';
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .nova-boxrec-anchor::after {
        content: " / " attr(data-nova-boxrec);
        font-weight: 700;
        white-space: nowrap;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function headerCells(table) {
    const headerRow = table.querySelector('thead tr') ||
      Array.from(table.querySelectorAll('tr')).find((row) => row.querySelector('th'));
    return headerRow ? Array.from(headerRow.children) : [];
  }

  function buildHeaderMap(table) {
    const map = new Map();
    headerCells(table).forEach((th, index) => {
      const candidates = [
        th.dataset?.columnKey,
        th.getAttribute?.('data-column'),
        th.getAttribute?.('name'),
        th.textContent
      ];
      for (const candidate of candidates) {
        const key = norm(candidate);
        if (key) map.set(key, index);
      }
    });
    return map;
  }

  function getCell(row, headerMap, names) {
    for (const cell of row.querySelectorAll('td[data-column-key]')) {
      const key = norm(cell.dataset.columnKey);
      if (names.some((name) => key === norm(name))) return cell;
    }

    for (const name of names) {
      const index = headerMap.get(norm(name));
      if (index !== undefined) return row.children[index] || null;
    }

    return null;
  }

  function cleanCellText(cell) {
    return cell ? String(cell.innerText || cell.textContent || '').trim() : '';
  }

  function requestJSON(url) {
    diagnostics.heroRequests += 1;
    diagnostics.lastRequestUrl = url;
    diagnostics.lastError = '';

    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        const error = new Error('GM_xmlhttpRequest is unavailable inside the Nova module runner');
        diagnostics.lastError = error.message;
        reject(error);
        return;
      }

      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: 15000,
          headers: {
            Accept: 'application/json, text/javascript',
            'Content-Type': 'application/json; charset=UTF-8'
          },
          onload(response) {
            diagnostics.heroResponses += 1;
            diagnostics.lastHttpStatus = response.status;
            if (response.status < 200 || response.status >= 300) {
              const error = new Error(`HERO HTTP ${response.status}`);
              diagnostics.lastError = error.message;
              reject(error);
              return;
            }

            try {
              resolve(JSON.parse(response.responseText || '{}'));
            } catch (error) {
              diagnostics.lastError = `HERO JSON parse failed: ${error.message || error}`;
              reject(error);
            }
          },
          onerror(response) {
            diagnostics.lastHttpStatus = response?.status ?? null;
            const error = new Error('HERO network/permission error');
            diagnostics.lastError = error.message;
            reject(error);
          },
          ontimeout() {
            const error = new Error('HERO request timed out');
            diagnostics.lastError = error.message;
            reject(error);
          }
        });
      } catch (error) {
        diagnostics.lastError = String(error?.message || error);
        reject(error);
      }
    });
  }

  async function getBoxRecommendation(fc, shipmentId, bypassCache = false) {
    if (!bypassCache && cache.has(shipmentId)) return cache.get(shipmentId);

    const lookup = (async () => {
      diagnostics.lastShipment = shipmentId;
      try {
        const eventsUrl =
          `${HERO}/api/fcs/${encodeURIComponent(fc)}` +
          `/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipmentId)}/events`;

        const events = await requestJSON(eventsUrl);
        const list = Array.isArray(events.EventList) ? events.EventList : [];

        let createPackage = null;
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (list[i]?.eventType === 'CREATE_PACKAGE') {
            createPackage = list[i];
            break;
          }
        }

        if (!createPackage?.eventDetailsKey || !createPackage?.requestId) {
          diagnostics.lastError = 'No CREATE_PACKAGE event with details key/request id';
          return null;
        }

        const detailsUrl =
          `${HERO}/api/fcs/${encodeURIComponent(fc)}` +
          `/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipmentId)}` +
          `/events/id/${encodeURIComponent(createPackage.requestId)}` +
          `/details/key/${encodeURIComponent(createPackage.eventDetailsKey)}`;

        const details = await requestJSON(detailsUrl);
        const message = details?.eventDetails?.message;
        if (!message) {
          diagnostics.lastError = 'CREATE_PACKAGE details contain no message';
          return null;
        }

        const match = String(message).match(/boxRecommendation=(.*?)(?:,|}|$)/i);
        const value = match?.[1]?.trim().replace(/^["']|["']$/g, '') || null;
        if (!value) {
          diagnostics.lastError = 'boxRecommendation not found in CREATE_PACKAGE message';
          return null;
        }

        diagnostics.lastBoxRec = value;
        diagnostics.lastError = '';
        return value;
      } catch (error) {
        diagnostics.lastError = String(error?.message || error);
        console.warn(LOG, shipmentId, error);
        return null;
      }
    })();

    if (!bypassCache) cache.set(shipmentId, lookup);
    return lookup;
  }

  async function processRow(row, headerMap, fc) {
    if (!active || row.dataset.novaBoxrecChecked === '1') return;

    const shipmentCell = getCell(row, headerMap, ['Shipment ID', 'ShipmentID', 'shipmentId']);
    const scannableCell = getCell(row, headerMap, [
      'Scannable ID', 'ScannableID', 'Outer Scannable ID', 'outerScannableId', 'scannableId'
    ]);
    const conditionCell = getCell(row, headerMap, ['Condition', 'Condition ID', 'ConditionID', 'condition']);

    const shipmentId = cleanCellText(shipmentCell);
    const scannableId = cleanCellText(scannableCell);
    const condition = cleanCellText(conditionCell).replace(/^C/i, '');

    if (!shipmentId || !scannableCell) return;

    if (!/^SP/i.test(scannableId)) {
      row.dataset.novaBoxrecChecked = '1';
      return;
    }

    if (conditionCell && !TARGET_CONDITIONS.has(condition)) {
      row.dataset.novaBoxrecChecked = '1';
      return;
    }

    diagnostics.candidates += 1;
    diagnostics.lastShipment = shipmentId;
    row.dataset.novaBoxrecChecked = '1';

    const boxRec = await getBoxRecommendation(fc, shipmentId);
    if (!active || !boxRec || !document.contains(row)) return;

    const anchor = scannableCell.querySelector('div') || scannableCell;
    anchor.dataset.novaBoxrec = boxRec;
    anchor.classList.add('nova-boxrec-anchor');
    diagnostics.rendered += 1;
  }

  function scan() {
    if (!active || !matchesPage()) return;
    diagnostics.scans += 1;
    const fc = getFC();
    const tables = Array.from(document.querySelectorAll('table'));
    diagnostics.tablesSeen = tables.length;
    diagnostics.rowsSeen = 0;

    tables.forEach((table) => {
      const rows = table.querySelectorAll('tbody tr');
      if (!rows.length) return;
      diagnostics.rowsSeen += rows.length;
      const headerMap = buildHeaderMap(table);
      rows.forEach((row) => processRow(row, headerMap, fc));
    });
  }

  function scheduleScan() {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 200);
  }

  function start() {
    if (!matchesPage()) return false;
    if (active) {
      scan();
      return true;
    }

    active = true;
    ensureStyle();
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
    console.log(LOG, `v${MODULE_VERSION} active for`, getFC());
    return true;
  }

  function stop() {
    active = false;
    clearTimeout(timer);
    timer = null;
    observer?.disconnect();
    observer = null;

    document.querySelectorAll('.nova-boxrec-anchor').forEach((node) => {
      node.classList.remove('nova-boxrec-anchor');
      delete node.dataset.novaBoxrec;
    });
    document.querySelectorAll('[data-nova-boxrec-checked]').forEach((row) => {
      delete row.dataset.novaBoxrecChecked;
    });
    document.getElementById(STYLE_ID)?.remove();
    return true;
  }

  window.NovaRodeoBoxRecommendation = {
    id: MODULE_ID,
    version: MODULE_VERSION,
    show: start,
    refresh() {
      document.querySelectorAll('[data-nova-boxrec-checked]').forEach((row) => {
        delete row.dataset.novaBoxrecChecked;
      });
      scan();
      return true;
    },
    hide: stop,
    clearCache() {
      cache.clear();
      this.refresh();
      return true;
    },
    async testHero(shipmentId) {
      if (!shipmentId) throw new Error('Shipment ID is required');
      return {
        fc: getFC(),
        shipmentId: String(shipmentId),
        boxRecommendation: await getBoxRecommendation(getFC(), String(shipmentId), true),
        diagnostics: { ...diagnostics }
      };
    },
    getStatus() {
      return {
        version: MODULE_VERSION,
        active,
        cacheSize: cache.size,
        fc: getFC(),
        matchesPage: matchesPage(),
        gmRequestAvailable: typeof GM_xmlhttpRequest === 'function',
        diagnostics: { ...diagnostics }
      };
    }
  };

  start();
})();
