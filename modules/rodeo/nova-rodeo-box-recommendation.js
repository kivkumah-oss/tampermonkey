// Nova module: modules/rodeo/nova-rodeo-box-recommendation.js
(function () {
  'use strict';

  const MODULE_ID = 'nova-rodeo-box-recommendation';
  const MODULE_VERSION = '0.4.0';
  const LOG = '[Nova Rodeo BoxRec]';
  const HERO = 'https://hero.eu.picking.aft.a2z.com';
  const STYLE_ID = 'nova-rodeo-boxrec-style';
  const TARGET_CONDITIONS = new Set(['7', '15', '704', '13', '1320']);

  if (window.NovaRodeoBoxRecommendation) {
    window.NovaRodeoBoxRecommendation.show?.();
    return;
  }

  const cache = new Map();
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
    return /^https:\/\/rodeo-dub(?:\.aka)?\.amazon\.com\//i.test(location.href);
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

  function buildHeaderMap(table) {
    const map = new Map();

    table.querySelectorAll('thead th').forEach((th, index) => {
      const candidates = [
        th.dataset.columnKey,
        th.getAttribute('data-column'),
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
    return cell ? cell.textContent.trim() : '';
  }

  function requestJSON(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest is unavailable'));
        return;
      }

      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        headers: {
          Accept: 'application/json, text/javascript'
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }

          try {
            resolve(JSON.parse(response.responseText));
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Request timed out'))
      });
    });
  }

  async function getBoxRecommendation(fc, shipmentId) {
    if (cache.has(shipmentId)) return cache.get(shipmentId);

    const lookup = (async () => {
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
          return null;
        }

        const detailsUrl =
          `${HERO}/api/fcs/${encodeURIComponent(fc)}` +
          `/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipmentId)}` +
          `/events/id/${encodeURIComponent(createPackage.requestId)}` +
          `/details/key/${encodeURIComponent(createPackage.eventDetailsKey)}`;

        const details = await requestJSON(detailsUrl);
        const message = details?.eventDetails?.message;
        if (!message) return null;

        const match = String(message).match(
          /boxRecommendation=(.*?)(?:,|}|$)/i
        );

        return match?.[1]?.trim().replace(/^["']|["']$/g, '') || null;
      } catch (error) {
        console.warn(LOG, shipmentId, error);
        return null;
      }
    })();

    cache.set(shipmentId, lookup);
    return lookup;
  }

  async function processRow(row, headerMap, fc) {
    if (!active || row.dataset.novaBoxrecChecked === '1') return;

    const shipmentCell = getCell(row, headerMap, [
      'Shipment ID',
      'ShipmentID',
      'shipmentId'
    ]);

    const scannableCell = getCell(row, headerMap, [
      'Scannable ID',
      'ScannableID',
      'Outer Scannable ID',
      'outerScannableId',
      'scannableId'
    ]);

    const conditionCell = getCell(row, headerMap, [
      'Condition',
      'Condition ID',
      'ConditionID',
      'condition'
    ]);

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

    row.dataset.novaBoxrecChecked = '1';

    const boxRec = await getBoxRecommendation(fc, shipmentId);
    if (!active || !boxRec || !document.contains(row)) return;

    const anchor = scannableCell.querySelector('div') || scannableCell;
    anchor.dataset.novaBoxrec = boxRec;
    anchor.classList.add('nova-boxrec-anchor');
  }

  function scan() {
    if (!active || !matchesPage()) return;
    const fc = getFC();

    document.querySelectorAll('table').forEach((table) => {
      const rows = table.querySelectorAll('tbody tr');
      if (!rows.length) return;

      const headerMap = buildHeaderMap(table);
      rows.forEach((row) => processRow(row, headerMap, fc));
    });
  }

  function scheduleScan() {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
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
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

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
    refresh: scan,
    hide: stop,
    clearCache() {
      cache.clear();
      document.querySelectorAll('[data-nova-boxrec-checked]').forEach((row) => {
        delete row.dataset.novaBoxrecChecked;
      });
      scan();
      return true;
    },
    getStatus() {
      return {
        active,
        cacheSize: cache.size,
        fc: getFC(),
        matchesPage: matchesPage()
      };
    }
  };

  start();
})();
