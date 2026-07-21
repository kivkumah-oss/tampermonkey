// core/nova-hero-failure-intelligence.js
(function () {
  'use strict';

  if (window.NovaHeroFailureIntelligence) return;

  const VERSION = '0.3.0';
  const HERO_HOST = /^hero\.[^.]+\.picking\.aft\.a2z\.com$/i;
  const FAILURE_TYPES = new Set(['FAIL_SHIPMENT', 'ReportDefect']);
  const RETRY_DELAYS = [0, 350, 1200, 3500, 8000];

  let readyHref = '';
  let lastHref = location.href;
  let routeTimer = null;
  let panelObserver = null;
  let fieldObserver = null;
  let observedDetails = null;
  let requestSequence = 0;
  let retryTimers = [];
  let reapplyTimer = null;
  let applyingEvidence = false;
  let lastEvidence = null;
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

    return /^(null|undefined|none|n\/a)$/i.test(cleaned) ? '' : cleaned;
  }

  function extractValue(message, regex) {
    const match = String(message || '').match(regex);
    return cleanValue(match?.[1] || '');
  }

  function extractAny(message, names) {
    for (const name of names) {
      const value = extractValue(
        message,
        new RegExp(`\\b${name}\\s*[=:]\\s*([^,}\\]\\n]+)`, 'i')
      );
      if (value) return value;
    }
    return '';
  }

  function parseFailureMessage(message) {
    const text = String(message || '');

    const itemReasons = [...text.matchAll(/\bfailureReason\s*[=:]\s*([^,}\]\n]+)/gi)]
      .map((match) => cleanValue(match[1]))
      .filter(Boolean);

    const defectReasonCode = extractAny(text, [
      'DefectReasonCode',
      'defectReasonCode',
      'ReasonCode',
      'reasonCode'
    ]);

    const defectReasonText = extractAny(text, [
      'DefectReasonText',
      'defectReasonText',
      'DefectReason',
      'defectReason',
      'DamageReason',
      'damageReason'
    ]);

    const defectType = extractAny(text, [
      'DefectType',
      'defectType',
      'ProblemType',
      'problemType'
    ]);

    const broadReason = extractValue(
      text,
      /\bshipmentFailureReason\s*[=:]\s*([^,}\]\n]+)/i
    );

    return {
      itemReason: itemReasons[0] || '',
      defectReasonCode,
      defectReasonText,
      defectType,
      broadReason,
      psContainer: extractAny(text, [
        'ProblemSolveContainerScannableId',
        'problemSolveContainerScannableId'
      ]),
      previousCondition: extractAny(text, [
        'PreviousExternalShipmentCondition',
        'previousExternalShipmentCondition'
      ]),
      source: extractAny(text, [
        'ShipmentGroupType',
        'shipmentGroupType'
      ]),
      client: extractAny(text, [
        'ClientApplicationName',
        'clientApplicationName'
      ]),
      shipmentGroup: extractAny(text, [
        'ShipmentGroupId',
        'shipmentGroupId'
      ]),
      raw: text
    };
  }

  function normaliseEvidence(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[\s./-]+/g, '_');
  }

  function humaniseRaw(value) {
    const cleaned = cleanValue(value);
    if (!cleaned) return '';
    return cleaned
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function classifyDefect(parsed, event) {
    const structured = [
      { value: parsed.itemReason, priority: 5, source: 'itemFailureReason' },
      { value: parsed.defectReasonCode, priority: 5, source: 'DefectReasonCode' },
      { value: parsed.defectReasonText, priority: 4, source: 'DefectReasonText' },
      { value: parsed.broadReason, priority: 3, source: 'shipmentFailureReason' },
      { value: parsed.defectType, priority: 2, source: 'DefectType' }
    ].filter((entry) => cleanValue(entry.value));

    const allText = [
      ...structured.map((entry) => entry.value),
      event?.description,
      event?.eventType
    ].filter(Boolean).join(' | ');

    const normalised = normaliseEvidence(allText);

    const specificSource = structured[0]?.source || 'eventDescription';
    const raw = structured[0]?.value || cleanValue(event?.description) || event?.eventType || '';
    const priority = structured[0]?.priority || 0;

    if (/TRANSPARENCY|SERIAL(_NUMBER)?|SERIALIZATION|SERIALISATION/.test(normalised)) {
      return {
        label: 'Transparency / serial number issue',
        category: 'TRANSPARENCY_SERIAL',
        raw,
        source: specificSource,
        specificity: Math.max(priority, 5)
      };
    }

    if (/ITEM_MISSING|MISSING_ITEM|MISSING_FROM|NOT_PRESENT|ITEM_NOT_FOUND|UNIT_MISSING|SHORTAGE/.test(normalised)) {
      return {
        label: 'Item missing',
        category: 'MISSING',
        raw,
        source: specificSource,
        specificity: Math.max(priority, 4)
      };
    }

    if (/ITEM_DAMAGED|DAMAGED_ITEM|DAMAGE|BROKEN|CRUSHED/.test(normalised)) {
      return {
        label: 'Damaged',
        category: 'DAMAGED',
        raw,
        source: specificSource,
        specificity: Math.max(priority, 3)
      };
    }

    if (/UNSCANNABLE|BARCODE.*(FAIL|INVALID|UNREADABLE)|CANNOT_SCAN|WON_T_SCAN/.test(normalised)) {
      return {
        label: 'Unscannable',
        category: 'UNSCANNABLE',
        raw,
        source: specificSource,
        specificity: Math.max(priority, 3)
      };
    }

    const generic = /ITEM_REPORTED_AS_DEFECTIVE|ITEM REPORTED AS DEFECTIVE|FAILED ATTEMPT AT PACKING SHIPMENT/.test(normalised);

    return {
      label: generic ? 'Defect reason not exposed' : (humaniseRaw(raw) || 'Defect reason not exposed'),
      category: generic ? 'UNKNOWN' : 'OTHER',
      raw,
      source: specificSource,
      specificity: generic ? 0 : priority
    };
  }

  function panel() {
    return document.getElementById('hero-tooltips-top-panel');
  }

  function valueNode(selector) {
    return panel()?.querySelector(selector) || null;
  }

  function readText(selector) {
    return String(valueNode(selector)?.textContent || '').trim();
  }

  function setText(selector, value) {
    const node = valueNode(selector);
    if (!node) return false;

    const next = String(value || '');
    if (node.textContent !== next) node.textContent = next;
    return true;
  }

  function setPsContainer(fc, value) {
    const node = valueNode('.psContainer');
    if (!node) return false;

    const next = String(value || '');
    if (!next) {
      if (node.textContent) node.textContent = '';
      return true;
    }

    const currentLink = node.querySelector('a');
    if (currentLink && currentLink.textContent === next) return true;

    node.textContent = '';
    const link = document.createElement('a');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.href = `https://fcresearch-eu.aka.amazon.com/${encodeURIComponent(fc)}/results?s=${encodeURIComponent(next)}`;
    link.textContent = next;
    node.appendChild(link);
    return true;
  }

  function createRow(label, className) {
    const row = document.createElement('div');
    row.className = 'novaDataRow novaHeroFailureRow';

    const labelNode = document.createElement('span');
    labelNode.className = 'novaDataLabel';
    labelNode.textContent = label;

    const value = document.createElement('div');
    value.className = `novaDataValue ${className}`;

    row.append(labelNode, value);
    return row;
  }

  function ensureRows() {
    const details = panel()?.querySelector('.novaPsDetails');
    if (!details) return false;

    const rows = [
      ['Event', 'psEvent'],
      ['Defect Evidence', 'defectEvidence'],
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

    attachFieldObserver();
    return true;
  }

  function clearExtensionFields() {
    applyingEvidence = true;
    try {
      for (const selector of [
        '.psEvent',
        '.defectEvidence',
        '.psContainer',
        '.previousCondition',
        '.failureSource',
        '.failureModule'
      ]) {
        setText(selector, '');
      }
    } finally {
      applyingEvidence = false;
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(Number(timestamp) * 1000).toLocaleString('en-GB', {
      timeZone: 'Europe/London'
    });
  }

  function evidenceMatchesCurrentRoute(evidence) {
    const route = parseRoute();
    return Boolean(
      evidence &&
      route &&
      evidence.href === location.href &&
      evidence.fc === route.fc &&
      evidence.shipment === route.shipment
    );
  }

  function applyEvidence(evidence, reason = 'apply') {
    if (!evidenceMatchesCurrentRoute(evidence)) return false;
    if (!ensureRows()) return false;

    applyingEvidence = true;
    try {
      setText('.psEvent', evidence.eventType);
      setText('.associate', evidence.actor);
      setText('.reason', evidence.defectLabel);
      setText('.time', evidence.defectTime);
      setText('.defectEvidence', evidence.defectRaw);
      setPsContainer(evidence.fc, evidence.psContainer);
      setText('.previousCondition', evidence.previousCondition);
      setText('.failureSource', evidence.source);
      setText('.failureModule', evidence.moduleText);
    } finally {
      applyingEvidence = false;
    }

    console.debug('[Nova HERO] Failure evidence applied', reason);
    return true;
  }

  function evidenceIsVisible(evidence) {
    if (!evidenceMatchesCurrentRoute(evidence)) return false;

    const expected = [
      ['.psEvent', evidence.eventType],
      ['.associate', evidence.actor],
      ['.reason', evidence.defectLabel],
      ['.time', evidence.defectTime],
      ['.defectEvidence', evidence.defectRaw],
      ['.psContainer', evidence.psContainer],
      ['.previousCondition', evidence.previousCondition],
      ['.failureSource', evidence.source],
      ['.failureModule', evidence.moduleText]
    ];

    return expected.every(([selector, value]) => {
      const next = String(value || '').trim();
      if (!next) return true;
      return readText(selector) === next;
    });
  }

  function queueEvidenceRepair(reason = 'mutation') {
    if (applyingEvidence || !lastEvidence) return;
    clearTimeout(reapplyTimer);

    reapplyTimer = setTimeout(() => {
      reapplyTimer = null;
      if (!lastEvidence || !evidenceMatchesCurrentRoute(lastEvidence)) return;
      if (!evidenceIsVisible(lastEvidence)) applyEvidence(lastEvidence, reason);
    }, 45);
  }

  function attachFieldObserver() {
    const details = panel()?.querySelector('.novaPsDetails') || null;
    if (!details) return false;
    if (fieldObserver && observedDetails === details) return true;

    fieldObserver?.disconnect();
    observedDetails = details;
    fieldObserver = new MutationObserver(() => queueEvidenceRepair('field-overwrite'));
    fieldObserver.observe(details, {
      subtree: true,
      childList: true,
      characterData: true
    });
    return true;
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

  async function buildCandidate(event, eventsPath, sequence, route) {
    let parsed = parseFailureMessage('');

    if (event.requestId && event.eventDetailsKey) {
      const detailsPath = `${eventsPath}/id/${encodeURIComponent(event.requestId)}/details/key/${encodeURIComponent(event.eventDetailsKey)}`;
      const details = await fetchJson(detailsPath);
      if (sequence !== requestSequence || location.href !== lastHref) return null;
      parsed = parseFailureMessage(details?.eventDetails?.message || '');
    }

    const classification = classifyDefect(parsed, event);
    const moduleName = cleanValue(event?.metaData?.module);
    const team = cleanValue(event?.metaData?.team);
    const actor = cleanValue(event?.metaData?.userId);
    const moduleParts = [...new Set([
      moduleName,
      team,
      parsed.client
    ].filter(Boolean))];

    return {
      href: location.href,
      fc: route.fc,
      shipment: route.shipment,
      eventType: event.eventType || '',
      actor,
      defectLabel: classification.label,
      defectCategory: classification.category,
      defectRaw: classification.raw,
      defectSource: classification.source,
      specificity: classification.specificity,
      defectTime: formatTime(event.timeStamp),
      psContainer: parsed.psContainer,
      previousCondition: parsed.previousCondition,
      source: parsed.source || parsed.shipmentGroup,
      moduleText: moduleParts.join(' / '),
      timestamp: Number(event.timeStamp || 0)
    };
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
      if (sequence !== requestSequence || location.href !== lastHref) return false;

      const events = (Array.isArray(data?.EventList) ? data.EventList : [])
        .filter((event) => FAILURE_TYPES.has(event?.eventType))
        .sort((a, b) => Number(b?.timeStamp || 0) - Number(a?.timeStamp || 0));

      if (!events.length) {
        lastEvidence = null;
        clearExtensionFields();
        readyHref = location.href;
        lastResult = {
          shipment: route.shipment,
          found: false,
          reason,
          readAt: new Date().toISOString()
        };
        return true;
      }

      let selected = null;
      let fallback = null;

      for (const event of events.slice(0, 8)) {
        const candidate = await buildCandidate(event, eventsPath, sequence, route);
        if (!candidate) return false;
        if (!fallback) fallback = candidate;

        if (candidate.specificity >= 2 && candidate.defectCategory !== 'UNKNOWN') {
          selected = candidate;
          break;
        }
      }

      const evidence = selected || fallback;
      if (!evidence) return false;

      lastEvidence = evidence;
      applyEvidence(evidence, reason);
      readyHref = location.href;

      lastResult = {
        shipment: route.shipment,
        found: true,
        eventType: evidence.eventType,
        defectLabel: evidence.defectLabel,
        defectCategory: evidence.defectCategory,
        defectRaw: evidence.defectRaw || null,
        defectSource: evidence.defectSource,
        psContainer: evidence.psContainer || null,
        previousCondition: evidence.previousCondition || null,
        source: evidence.source || null,
        moduleText: evidence.moduleText || null,
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
        if (!force && readyHref === location.href) {
          queueEvidenceRepair('scheduled-check');
          return;
        }
        refresh(`${reason}:${delay}`);
      }, delay);
      retryTimers.push(timer);
    }

    return true;
  }

  function resetForRouteChange() {
    requestSequence += 1;
    readyHref = '';
    lastEvidence = null;
    clearTimeout(reapplyTimer);
    reapplyTimer = null;
    clearRetryTimers();
    clearExtensionFields();
  }

  function install() {
    if (!isHeroHost()) return false;

    if (!panelObserver && document.documentElement) {
      panelObserver = new MutationObserver(() => {
        if (panel()) {
          ensureRows();
          attachFieldObserver();
          if (lastEvidence) queueEvidenceRepair('panel-mutation');
          if (readyHref !== location.href) schedule('panel-ready');
        }
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
        resetForRouteChange();
        schedule('route-change', true);
      }, 500);
    }

    document.addEventListener('click', (event) => {
      if (!event.target?.closest?.('#hero-tooltips-top-panel .heroTopRefresh')) return;
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
      fieldGuard: Boolean(fieldObserver),
      readyHref: readyHref || null,
      lastEvidence,
      lastResult
    };
  }

  window.NovaHeroFailureIntelligence = {
    version: VERSION,
    install,
    refresh,
    schedule,
    applyEvidence,
    parseFailureMessage,
    classifyDefect,
    getStatus
  };

  install();
})();
