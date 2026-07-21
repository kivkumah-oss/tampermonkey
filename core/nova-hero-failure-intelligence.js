// core/nova-hero-failure-intelligence.js
(function () {
  'use strict';

  if (window.NovaHeroFailureIntelligence) return;

  const VERSION = '0.1.1';
  const HERO_HOST = /^hero\.[^.]+\.picking\.aft\.a2z\.com$/i;
  const FAILURE_TYPES = new Set(['FAIL_SHIPMENT', 'ReportDefect']);
  const RETRY_DELAYS = [0, 350, 1200, 3500, 8000];

  let readyHref = '';
  let lastHref = location.href;
  let routeTimer = null;
  let panelObserver = null;
  let requestSequence = 0;
  let retryTimers = [];
  let lastResult = null;

  function isHeroHost() {
    return HERO_HOST.test(location.hostname);
  }

  function parseRoute() {
    const match = location.pathname.match(
      /\/fc\/([^/]+)\/.*customer-shipment\/([^/?#]+)/i
    );
    if (!match) return null;

    return {
      fc: decodeURIComponent(match[1]).toUpperCase(),
      shipment: decodeURIComponent(match[2])
    };
  }

  function cleanValue(value) {
    const cleaned = String(value ?? '')
      .trim()
      .replace(/^['"\s]+|['"\s]+$/g, '')
      .replace(/[}\]]+$/g, '')
      .trim();

    return /^(null|undefined|none)$/i.test(cleaned) ? '' : cleaned;
  }

  function extractValue(message, regex) {
    const match = String(message || '').match(regex);
    return cleanValue(match?.[1] || '');
  }

  function parseFailureMessage(message) {
    const text = String(message || '');
    const itemReasons = [...text.matchAll(/\bfailureReason=([^,}\]]+)/gi)]
      .map((match) => cleanValue(match[1]))
      .filter(Boolean);

    const broadReason = extractValue(
      text,
      /\bshipmentFailureReason=([^,}\]]+)/i
    );

    return {
      reason: itemReasons[0] || broadReason,
      psContainer: extractValue(
        text,
        /\bProblemSolveContainerScannableId=([^,}\]]+)/i
      ),
      previousCondition: extractValue(
        text,
        /\bPreviousExternalShipmentCondition=([^,}\]]+)/i
      ),
      source: extractValue(
        text,
        /\bShipmentGroupType=([^,}\]]+)/i
      ),
      client: extractValue(
        text,
        /\bClientApplicationName=([^,}\]]+)/i
      ),
      shipmentGroup: extractValue(
        text,
        /\bShipmentGroupId=([^,}\]]+)/i
      )
    };
  }

  function panel() {
    return document.getElementById('hero-tooltips-top-panel');
  }

  function setText(selector, value) {
    const node = panel()?.querySelector(selector);
    if (!node) return false;
    node.textContent = String(value || '');
    return true;
  }

  function setPsContainer(fc, value) {
    const node = panel()?.querySelector('.psContainer');
    if (!node) return false;

    node.textContent = '';
    if (!value) return true;

    const link = document.createElement('a');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.href = `https://fcresearch-eu.aka.amazon.com/${encodeURIComponent(fc)}/results?s=${encodeURIComponent(value)}`;
    link.textContent = value;
    node.appendChild(link);
    return true;
  }

  function createRow(label, className) {
    const row = document.createElement('div');
    row.className = 'novaDataRow novaHeroFailureRow';

    const labelNode = document.createElement('span');
    labelNode.className = 'novaDataLabel';
    labelNode.textContent = label;

    const valueNode = document.createElement('div');
    valueNode.className = `novaDataValue ${className}`;

    row.append(labelNode, valueNode);
    return row;
  }

  function ensureRows() {
    const details = panel()?.querySelector('.novaPsDetails');
    if (!details) return false;

    const rows = [
      ['Event', 'psEvent'],
      ['PS Tote', 'psContainer'],
      ['Previous Condition', 'previousCondition'],
      ['Source', 'failureSource'],
      ['Module / Team', 'failureModule']
    ];

    const cancelRow = details.querySelector('.cancelAttempt')
      ?.closest('.novaDataRow') || null;

    for (const [label, className] of rows) {
      if (details.querySelector(`.${className}`)) continue;
      details.insertBefore(createRow(label, className), cancelRow);
    }

    return true;
  }

  function clearExtensionFields() {
    for (const selector of [
      '.psEvent',
      '.psContainer',
      '.previousCondition',
      '.failureSource',
      '.failureModule'
    ]) {
      setText(selector, '');
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(Number(timestamp) * 1000).toLocaleString('en-GB', {
      timeZone: 'Europe/London'
    });
  }

  async function fetchJson(path) {
    const response = await fetch(new URL(path, location.href).href, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error(`HERO HTTP ${response.status}`);
    return response.json();
  }

  async function refresh(reason = 'manual') {
    if (!isHeroHost()) return false;

    const route = parseRoute();
    const heroPanel = panel();
    if (!route || !heroPanel || heroPanel.hidden || !ensureRows()) return false;

    const sequence = ++requestSequence;

    try {
      const eventsPath = `/api/fcs/${encodeURIComponent(route.fc)}/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(route.shipment)}/events`;
      const data = await fetchJson(eventsPath);
      if (sequence !== requestSequence) return false;

      const events = Array.isArray(data?.EventList) ? data.EventList : [];
      const failure = events
        .filter((event) => FAILURE_TYPES.has(event?.eventType))
        .sort((a, b) => Number(b?.timeStamp || 0) - Number(a?.timeStamp || 0))[0];

      clearExtensionFields();

      if (!failure) {
        readyHref = location.href;
        lastResult = {
          shipment: route.shipment,
          found: false,
          reason,
          readAt: new Date().toISOString()
        };
        return true;
      }

      const actor = cleanValue(failure?.metaData?.userId);
      const moduleName = cleanValue(failure?.metaData?.module);
      const team = cleanValue(failure?.metaData?.team);

      setText('.psEvent', failure.eventType || '');
      setText('.time', formatTime(failure.timeStamp));
      if (actor) setText('.associate', actor);

      let parsed = {
        reason: '',
        psContainer: '',
        previousCondition: '',
        source: '',
        client: '',
        shipmentGroup: ''
      };

      if (failure.requestId && failure.eventDetailsKey) {
        const detailsPath = `${eventsPath}/id/${encodeURIComponent(failure.requestId)}/details/key/${encodeURIComponent(failure.eventDetailsKey)}`;
        const details = await fetchJson(detailsPath);
        if (sequence !== requestSequence) return false;
        parsed = parseFailureMessage(details?.eventDetails?.message || '');
      }

      const defect =
        parsed.reason ||
        cleanValue(failure.description) ||
        failure.eventType;

      const moduleParts = [...new Set([
        moduleName,
        team,
        parsed.client
      ].filter(Boolean))];

      setText('.reason', defect);
      setPsContainer(route.fc, parsed.psContainer);
      setText('.previousCondition', parsed.previousCondition);
      setText('.failureSource', parsed.source || parsed.shipmentGroup);
      setText('.failureModule', moduleParts.join(' / '));

      readyHref = location.href;
      lastResult = {
        shipment: route.shipment,
        found: true,
        eventType: failure.eventType,
        defect,
        psContainer: parsed.psContainer || null,
        previousCondition: parsed.previousCondition || null,
        source: parsed.source || parsed.shipmentGroup || null,
        reason,
        readAt: new Date().toISOString()
      };

      console.log('[Nova HERO] Failure intelligence populated', lastResult);
      return true;
    } catch (error) {
      console.warn('[Nova HERO] Failure intelligence read failed', error);
      lastResult = {
        shipment: route.shipment,
        found: false,
        reason,
        error: String(error),
        readAt: new Date().toISOString()
      };
      return false;
    }
  }

  function clearRetryTimers() {
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers = [];
  }

  function schedule(reason = 'boot', force = false) {
    if (!isHeroHost()) return false;

    if (force) {
      readyHref = '';
      clearRetryTimers();
    } else if (retryTimers.length) {
      return true;
    }

    for (const delay of RETRY_DELAYS) {
      const timer = setTimeout(() => {
        retryTimers = retryTimers.filter((entry) => entry !== timer);
        if (!isHeroHost()) return;
        if (!force && readyHref === location.href) return;
        refresh(`${reason}:${delay}`);
      }, delay);
      retryTimers.push(timer);
    }

    return true;
  }

  function install() {
    if (!isHeroHost()) return false;

    if (!panelObserver && document.documentElement) {
      panelObserver = new MutationObserver(() => {
        if (readyHref === location.href) return;
        if (panel()) schedule('panel-ready');
      });

      panelObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    if (!routeTimer) {
      routeTimer = setInterval(() => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        readyHref = '';
        schedule('route-change', true);
      }, 500);
    }

    document.addEventListener('click', (event) => {
      if (!event.target?.closest?.('#hero-tooltips-top-panel .heroTopRefresh')) {
        return;
      }
      schedule('hero-refresh', true);
    }, true);

    document.addEventListener('nova-module-command-result', (event) => {
      const detail = event?.detail;
      if (detail?.id === 'nova-hero-intelligence' && detail?.ok) {
        schedule('hero-module-loaded', true);
      }
    });

    window.addEventListener('pageshow', () => schedule('pageshow'));
    schedule('core-ready');
    return true;
  }

  function getStatus() {
    return {
      version: VERSION,
      active: isHeroHost(),
      installed: Boolean(panelObserver || routeTimer),
      readyHref: readyHref || null,
      lastResult
    };
  }

  window.NovaHeroFailureIntelligence = {
    version: VERSION,
    install,
    refresh,
    schedule,
    parseFailureMessage,
    getStatus
  };

  install();
})();
