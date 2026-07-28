// ==UserScript==
// @name         Nova HERO Intelligence Console
// @namespace    NCL1
// @version      20260728-v1.6.1
// @author       lorfeuvr | shocklp | ofianajo | haljackg | bartohal
// @description  Nova HERO Intelligence Console with Theme Studio, defect/operator intelligence and integrated lazy Shipment Timeline.
// @match        https://hero.eu.picking.aft.a2z.com/*
// @require      https://drive.corp.amazon.com/view/LCY3repart/lib/jquery.min.js
// @require      https://drive.corp.amazon.com/view/LCY3repart/lib/waitForKeyElements.js
// @icon         https://hero.eu.picking.aft.a2z.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      rodeo-dub.amazon.com
// ==/UserScript==

/* globals jQuery, $, waitForKeyElements */

(function () {
  'use strict';

  if (typeof window.jQuery !== 'function' && typeof jQuery === 'function') window.jQuery = jQuery;
  if (typeof window.$ !== 'function' && typeof jQuery === 'function') window.$ = jQuery;

  var _region, _fcname, _CustomerShipment;
  let topPanelLoadSequence = 0;
  var bridgingReason = "No bridging reason detected";

  // -----------------------------
  // Helpers (unchanged)
  // -----------------------------
  function parseHeroUrl(url) {
    let m = url.match(/https:\/\/hero\.([^.]+)\.picking\.aft\.a2z\.com\/fc\/([^/]+)\/pick-events\/customer-shipment\/([^/?#]+)/i);
    if (m) return { region: m[1], fc: m[2], shipment: m[3] };

    m = url.match(/https:\/\/hero\.([^.]+)\.picking\.aft\.a2z\.com\/fc\/([^/]+)\/.*customer-shipment\/([^/?#]+)/i);
    if (m) return { region: m[1], fc: m[2], shipment: m[3] };

    return null;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const numeric = Number(ts);
    const milliseconds = Number.isFinite(numeric)
      ? (numeric > 10_000_000_000 ? numeric : numeric * 1000)
      : Date.parse(ts);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime())
      ? String(ts)
      : date.toLocaleString('en-GB', { timeZone: 'Europe/London' });
  }

  function isCurrentTopPanelRequest(shipment, fc, sequence) {
    return sequence === topPanelLoadSequence &&
      shipment === _CustomerShipment &&
      fc === _fcname;
  }

  function setSafeLink(selector, href, label) {
    const $target = $(selector).empty();
    $('<a>', {
      target: '_blank',
      rel: 'noopener noreferrer',
      href: String(href || '')
    }).text(String(label || '')).appendTo($target);
  }

  function setBridgingReason(msg) {
    if (!msg) return;

    const lowerMsg = String(msg).toLowerCase();
    bridgingReason = "No bridging reason detected";

    if (lowerMsg.includes('age verification') ||
        lowerMsg.includes('items that require age verification') ||
        lowerMsg.includes('age restriction constraint') ||
        lowerMsg.includes('age restricted unit')) {
      bridgingReason = "RC: Could not process due to age restricted unit.";
    } else if (lowerMsg.includes('hazmat')) {
      bridgingReason = "RC: Unable to process due to Hazmat issue.";
    } else if (lowerMsg.includes('unable to assign ship method') || lowerMsg.includes('route_not_found')) {
      bridgingReason = "RC: ATROPS, Unable to assign ship method.";
    }

    const $reason = $('.BridgingReason').text(bridgingReason);
    $reason.toggleClass('is-alert', bridgingReason !== "No bridging reason detected");
    updateStatusRail();
  }

  const NOVA_UI_STATE_KEY = 'novaHeroIntelligenceUiV1';
  let statusObserver;

  function loadUiState() {
    try {
      return JSON.parse(localStorage.getItem(NOVA_UI_STATE_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function saveUiState(state) {
    try {
      localStorage.setItem(NOVA_UI_STATE_KEY, JSON.stringify(state));
    } catch (error) {}
  }

  const NOVA_HERO_THEME_KEY = 'novaHeroIntelligenceThemeV1';

  const NOVA_HERO_PRESETS = {
    venom: {
      name: 'Venom Green',
      accent: '#39ff14',
      accent2: '#00e5ff',
      accent3: '#a7ff24',
      bg: '#030a08',
      panel: '#07120e',
      text: '#f4fff4',
      muted: '#9be7a0'
    },
    violet: {
      name: 'Violet Cyber',
      accent: '#7c4dff',
      accent2: '#00e5ff',
      accent3: '#f472b6',
      bg: '#0a0a12',
      panel: '#141423',
      text: '#ffffff',
      muted: '#9ca3af'
    },
    fire: {
      name: 'Fire Core',
      accent: '#ff3d00',
      accent2: '#ffea00',
      accent3: '#ff8a20',
      bg: '#100906',
      panel: '#1c0e09',
      text: '#fff7ed',
      muted: '#fed7aa'
    },
    ice: {
      name: 'Ice Terminal',
      accent: '#38bdf8',
      accent2: '#e0f2fe',
      accent3: '#67e8f9',
      bg: '#050c14',
      panel: '#091623',
      text: '#f8fbff',
      muted: '#bae6fd'
    },
    matrix: {
      name: 'Matrix',
      accent: '#00ff66',
      accent2: '#00aa44',
      accent3: '#64ffda',
      bg: '#000602',
      panel: '#000e05',
      text: '#eaffef',
      muted: '#8fffb5'
    },
    rose: {
      name: 'Rose Gold',
      accent: '#fb7185',
      accent2: '#fbbf24',
      accent3: '#ff2bd6',
      bg: '#140a0f',
      panel: '#201018',
      text: '#fff7f8',
      muted: '#fecdd3'
    },
    warehouse: {
      name: 'Warehouse Amber',
      accent: '#f59e0b',
      accent2: '#22d3ee',
      accent3: '#facc15',
      bg: '#0c0c0a',
      panel: '#18150f',
      text: '#fffbea',
      muted: '#fde68a'
    },
    stealth: {
      name: 'Stealth',
      accent: '#64748b',
      accent2: '#94a3b8',
      accent3: '#cbd5e1',
      bg: '#0b0f15',
      panel: '#151b24',
      text: '#f1f5f9',
      muted: '#94a3b8'
    },
    neon: {
      name: 'Neon Pink',
      accent: '#22d3ee',
      accent2: '#ec4899',
      accent3: '#a855f7',
      bg: '#080810',
      panel: '#12121f',
      text: '#ffffff',
      muted: '#d1d5db'
    }
  };

  function defaultThemeSettings() {
    return {
      preset: 'venom',
      accent: '#59ffb1',
      accent2: '#5ca8ff',
      accent3: '#b18cff',
      bg: '#03070c',
      panel: '#0b1824',
      text: '#eef8f4',
      muted: '#8ea8a0',
      opacity: 97,
      glassOpacity: 52,
      blur: 12,
      glow: 55
    };
  }

  function loadHeroTheme() {
    try {
      return { ...defaultThemeSettings(), ...JSON.parse(localStorage.getItem(NOVA_HERO_THEME_KEY) || '{}') };
    } catch (_) {
      return defaultThemeSettings();
    }
  }

  function saveHeroTheme(theme) {
    try {
      localStorage.setItem(NOVA_HERO_THEME_KEY, JSON.stringify(theme));
    } catch (_) {}
  }

  function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function applyHeroTheme(panel, theme = loadHeroTheme()) {
    if (!panel) return;
    const isGlass = panel.classList.contains('is-light');
    const surfaceOpacity = isGlass ? Number(theme.glassOpacity) / 100 : Number(theme.opacity) / 100;
    const accentAlpha = Math.max(.12, Number(theme.glow) / 100);

    panel.style.setProperty('--nova-green', theme.accent);
    panel.style.setProperty('--nova-green-dark', theme.accent2);
    panel.style.setProperty('--nova-blue', theme.accent2);
    panel.style.setProperty('--nova-purple', theme.accent3);
    panel.style.setProperty('--nova-text', theme.text);
    panel.style.setProperty('--nova-muted', theme.muted);
    panel.style.setProperty('--nova-bg-0', rgba(theme.bg, isGlass ? .52 : .98));
    panel.style.setProperty('--nova-bg-1', rgba(theme.bg, isGlass ? .44 : .94));
    panel.style.setProperty('--nova-bg-2', rgba(theme.panel, isGlass ? .40 : .96));
    panel.style.setProperty('--nova-card', rgba(theme.panel, surfaceOpacity));
    panel.style.setProperty('--nova-card-deep', rgba(theme.bg, Math.min(1, surfaceOpacity + .03)));
    panel.style.setProperty('--nova-line', rgba(theme.accent, .18 + accentAlpha * .18));
    panel.style.setProperty('--nova-line-hot', rgba(theme.accent, .38 + accentAlpha * .38));
    panel.style.setProperty('--nova-theme-bg', theme.bg);
    panel.style.setProperty('--nova-theme-panel', theme.panel);
    panel.style.setProperty('--nova-theme-opacity', surfaceOpacity);
    panel.style.setProperty('--nova-theme-blur', `${Number(theme.blur)}px`);
    panel.style.setProperty('--nova-theme-glow', `${Math.round(Number(theme.glow) * .32)}px`);
    panel.dataset.novaHeroPreset = theme.preset || 'custom';

    const studio = panel.querySelector('.novaThemeStudio');
    if (studio) syncThemeStudio(studio, theme);
  }

  function syncThemeStudio(studio, theme) {
    studio.querySelectorAll('[data-theme-field]').forEach(input => {
      const field = input.dataset.themeField;
      if (theme[field] !== undefined) input.value = theme[field];
    });

    const presetSelect = studio.querySelector('.novaThemePreset');
    if (presetSelect) presetSelect.value = NOVA_HERO_PRESETS[theme.preset] ? theme.preset : 'custom';

    studio.querySelectorAll('output[data-output-for]').forEach(output => {
      const field = output.dataset.outputFor;
      const suffix = field === 'blur' ? 'px' : '%';
      output.textContent = `${theme[field]}${suffix}`;
    });
  }

  function setThemeStudioOpen(panel, open) {
    const studio = panel?.querySelector('.novaThemeStudio');
    if (!studio) return;
    studio.hidden = !open;
    panel.classList.toggle('theme-studio-open', open);
  }

  function applyPreset(panel, presetId) {
    const preset = NOVA_HERO_PRESETS[presetId];
    if (!preset) return;
    const current = loadHeroTheme();
    const next = { ...current, ...preset, preset: presetId };
    saveHeroTheme(next);
    applyHeroTheme(panel, next);
  }

  function updateCustomTheme(panel, field, value) {
    const next = loadHeroTheme();
    next[field] = ['opacity', 'glassOpacity', 'blur', 'glow'].includes(field) ? Number(value) : value;
    next.preset = 'custom';
    saveHeroTheme(next);
    applyHeroTheme(panel, next);
  }

  function resetHeroTheme(panel) {
    const fresh = defaultThemeSettings();
    saveHeroTheme(fresh);
    applyHeroTheme(panel, fresh);
  }

  async function copyText(value) {
    const text = String(value || '').trim();
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    }
  }

  function setFailureReason(reason) {
    const fullReason = String(reason || '').trim();
    const preview = fullReason
      ? (fullReason.length > 170 ? `${fullReason.slice(0, 170)}…` : fullReason)
      : 'No failure message captured.';

    $('.KickoutReason').text(fullReason);
    $('.KickoutReasonPreview').text(preview).toggleClass('is-empty', !fullReason);
    $('.novaReasonToggle, .novaReasonCopy').prop('disabled', !fullReason);
  }

  function looksLikeSystemActor(actor) {
    return /^(autodwell|system|service|unknown)$/i.test(String(actor || '').trim()) ||
      /service|system|lambda|pipeline|automation|scheduler|workflow|core/i.test(String(actor || ''));
  }

  function setDwellActor(kind, actor) {
    const selector = kind === 'auto' ? '.autoDwellBy' : '.manualDwellBy';
    const badgeSelector = kind === 'auto' ? '.autoDwellActorType' : '.manualDwellActorType';
    const cleaned = String(actor || '').trim();
    const system = looksLikeSystemActor(cleaned);

    $(selector)
      .text(cleaned || 'Not exposed')
      .toggleClass('is-system', system)
      .toggleClass('is-unknown', !cleaned);

    $(badgeSelector)
      .text(cleaned ? (system ? 'SYSTEM / SERVICE' : 'ASSOCIATE / USER') : 'UNKNOWN')
      .attr('data-type', cleaned ? (system ? 'system' : 'user') : 'unknown');
  }

  function findActorInObject(value, depth = 0, visited = new WeakSet()) {
    if (!value || typeof value !== 'object' || depth > 8 || visited.has(value)) return '';
    visited.add(value);

    const actorKeys = [
      'userId', 'userid', 'user', 'username', 'login', 'alias', 'associate',
      'associateId', 'employeeId', 'owner', 'actor', 'performedBy',
      'requestedBy', 'reportedBy', 'dweller', 'operator'
    ];

    for (const [key, raw] of Object.entries(value)) {
      if (actorKeys.some(candidate => candidate.toLowerCase() === key.toLowerCase())) {
        const actor = String(raw ?? '').trim().replace(/^["'{[(\s]+|["'}\])\s,;]+$/g, '');
        if (actor && actor.length <= 100 && !/[={}]/.test(actor)) return actor;
      }
    }

    for (const nested of Object.values(value)) {
      const actor = findActorInObject(nested, depth + 1, visited);
      if (actor) return actor;
    }

    return '';
  }

  function extractActorFromText(message) {
    const text = String(message || '').trim();
    if (!text) return '';

    try {
      const parsed = JSON.parse(text);
      const actor = findActorInObject(parsed);
      if (actor) return actor;
    } catch (error) {}

    const patterns = [
      /(?:^|[,{;\s])["']?(?:userId|userid|username|user|login|alias|associateId|associate|employeeId|owner|actor|performedBy|requestedBy|reportedBy|dweller|operator)["']?\s*[:=]\s*["']?([A-Za-z0-9._@-]{2,100})/i,
      /\bby\s+user\s+([A-Za-z0-9._@-]{2,100})\b/i,
      /\bperformed\s+by\s+([A-Za-z0-9._@-]{2,100})\b/i,
      /\brequested\s+by\s+([A-Za-z0-9._@-]{2,100})\b/i,
      /\breported\s+by\s+([A-Za-z0-9._@-]{2,100})\b/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }

    return '';
  }

  function setStage(stage, state, label) {
    const element = document.querySelector(`#hero-tooltips-top-panel .novaStage[data-stage="${stage}"]`);
    if (!element) return;
    element.dataset.state = state;
    const value = element.querySelector('.novaStageValue');
    if (value) value.textContent = label;
  }

  function updateStatusRail() {
    if (!document.getElementById('hero-tooltips-top-panel')) return;

    const pick = $('.PickEventName').text().trim();
    const pack = $('.PackEventName').text().trim();
    const slam = $('.KOEventName').text().trim();
    const atrops = $('.AtropsIssue').text().trim().toUpperCase();
    const age = $('.AgeVerification').text().trim().toUpperCase();
    const autoDwell = $('.autoDwelled').text().trim().toUpperCase();
    const manualDwell = $('.manualDwelled').text().trim().toUpperCase();
    const psActivity = [
      $('.associate').text(), $('.reason').text(), $('.cancelAttempt').text(), $('.actualCancel').text()
    ].some(value => String(value).trim());

    setStage('pick', pick ? 'success' : 'idle', pick ? 'COMPLETE' : 'WAITING');
    setStage('pack', pack ? 'success' : 'idle', pack ? 'COMPLETE' : 'WAITING');

    if (atrops === 'YES' || age === 'YES') {
      setStage('slam', 'danger', 'ATROPS ALERT');
    } else if (/SUCCESS/i.test(slam)) {
      setStage('slam', 'success', 'SLAMMED');
    } else if (slam || $('.KickoutCode').text().trim()) {
      setStage('slam', 'warning', 'KICKOUT');
    } else {
      setStage('slam', 'idle', 'WAITING');
    }

    if (manualDwell === 'YES') {
      setStage('dwell', 'warning', 'MANUAL');
    } else if (autoDwell === 'YES') {
      setStage('dwell', 'info', 'AUTO');
    } else {
      setStage('dwell', 'idle', 'CLEAR');
    }

    setStage('ps', psActivity ? 'warning' : 'idle', psActivity ? 'ACTIVITY' : 'CLEAR');
  }

  function initialiseStatusObserver() {
    if (statusObserver) statusObserver.disconnect();
    const content = document.querySelector('#hero-tooltips-top-panel .heroTopContent');
    if (!content) return;

    let timer;
    statusObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(updateStatusRail, 30);
    });

    statusObserver.observe(content, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  function resetFields() {
    bridgingReason = "No bridging reason detected";

    $(
      '.ASIN,.pickTote,.PickEventName,.PickEventTime,' +
      '.packAA,.packStation,.boxRec,.Spoo,.PackEventName,.packEventTime,' +
      '.slamStation,.KickoutCode,.KOEventName,.KOEventTime,' +
      '.SRArea,.SRTime,' +
      '.associate,.reason,.time,.cancelAttempt,.actualCancel,.autoDwellTime,.manualDwellTime,' +
      '.CategoryAccepted,.ProcessPathChosen,.CatEventTime'
    ).text('');

    setFailureReason('');
    setDwellActor('auto', '');
    setDwellActor('manual', '');

    $('.AtropsIssue').text('No').removeClass('is-alert');
    $('.AgeVerification').text('No').removeClass('is-alert');
    $('.BridgingReason').text(bridgingReason).removeClass('is-alert');
    $('.BridgingTT').text('Fetching...');
    $('.autoDwelled').text('No').removeClass('is-yes');
    $('.manualDwelled').text('No').removeClass('is-yes');
    $('.novaReasonDrawer').prop('hidden', true);
    $('.novaReasonToggle').text('OPEN ATROPS MESSAGE');
    updateStatusRail();
  }

  function setTopPanelShipmentText() {
    const panel = document.getElementById('hero-tooltips-top-panel');
    if (!panel) return;

    const shipment = _CustomerShipment || '—';
    const shipmentElement = panel.querySelector('.heroTopShipment');
    const fcElement = panel.querySelector('.heroTopFc');

    if (shipmentElement) shipmentElement.textContent = shipment;
    if (fcElement) fcElement.textContent = _fcname || '—';
  }

  function refreshData() {
    if (!_CustomerShipment || !_fcname) return;

    const shipment = _CustomerShipment;
    const fc = _fcname;
    const sequence = ++topPanelLoadSequence;

    const panel = document.getElementById('hero-tooltips-top-panel');
    panel?.classList.add('is-loading');
    resetFields();

    const refreshed = panel?.querySelector('.heroLastRefresh');
    if (refreshed) {
      refreshed.textContent = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    getDatas(shipment, fc, sequence);
    fetchTicket(shipment, fc, sequence);
  }


  function renderTopPanelHtml() {
    const row = (label, valueClass, extra = '') => `
      <div class="novaDataRow ${extra}">
        <span class="novaDataLabel">${label}</span>
        <div class="novaDataValue ${valueClass}"></div>
      </div>`;

    const cardHeader = (index, title, icon) => `
      <div class="novaCardHeader">
        <div class="novaCardIdentity">
          <span class="novaCardIndex">${index}</span>
          <span class="novaCardIcon">${icon}</span>
          <h3>${title}</h3>
        </div>
        <button type="button" class="novaCardToggle" title="Collapse card">−</button>
      </div>`;

    return `
      <section id="hero-tooltips-top-panel" class="heroTopPanel">
        <header class="heroTopHeader">
          <div class="heroTopBrand">
            <div class="heroTopLogo">N</div>
            <div class="heroTopTitle">
              <strong>NOVA // HERO INTELLIGENCE</strong>
              <div class="heroTopSub">
                <span class="heroLiveDot"></span>
                <span class="heroTopFc">—</span>
                <span>//</span>
                <span class="heroTopShipment">—</span>
                <span class="heroHeaderDivider">//</span>
                <span>LAST READ <b class="heroLastRefresh">—</b></span>
              </div>
            </div>
          </div>

          <div class="heroTopActions">
            <button type="button" class="heroThemeToggle" title="Switch between dark and glass mode">◫ GLASS</button>
            <button type="button" class="heroThemeMenuToggle" title="Open colour and appearance controls">◈ THEME</button>
            <button type="button" class="heroTimelineToggle" title="Open Shipment Timeline">⌁ TIMELINE</button>
            <button type="button" class="heroCopyShipment" title="Copy shipment ID">COPY ID</button>
            <button type="button" class="heroTopRefresh" title="Refresh HERO data">↻ REFRESH</button>
            <button type="button" class="heroTopCollapse" title="Minimise console">−</button>
          </div>
        </header>

        <aside class="novaThemeStudio" hidden>
          <div class="novaThemeStudioHead">
            <div>
              <strong>NOVA // THEME STUDIO</strong>
              <span>Preset first, then change absolutely anything.</span>
            </div>
            <button type="button" class="novaThemeStudioClose" title="Close theme studio">×</button>
          </div>

          <div class="novaThemeStudioGrid">
            <label class="novaThemeWide">
              <span>PRESET</span>
              <select class="novaThemePreset">
                <option value="venom">Venom Green</option>
                <option value="violet">Violet Cyber</option>
                <option value="fire">Fire Core</option>
                <option value="ice">Ice Terminal</option>
                <option value="matrix">Matrix</option>
                <option value="rose">Rose Gold</option>
                <option value="warehouse">Warehouse Amber</option>
                <option value="stealth">Stealth</option>
                <option value="neon">Neon Pink</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label><span>PRIMARY</span><input type="color" data-theme-field="accent"></label>
            <label><span>SECONDARY</span><input type="color" data-theme-field="accent2"></label>
            <label><span>TERTIARY</span><input type="color" data-theme-field="accent3"></label>
            <label><span>BACKGROUND</span><input type="color" data-theme-field="bg"></label>
            <label><span>CARD SURFACE</span><input type="color" data-theme-field="panel"></label>
            <label><span>MAIN TEXT</span><input type="color" data-theme-field="text"></label>
            <label><span>MUTED TEXT</span><input type="color" data-theme-field="muted"></label>

            <label class="novaThemeRange">
              <span>DARK OPACITY <output data-output-for="opacity">97%</output></span>
              <input type="range" min="35" max="100" step="1" data-theme-field="opacity">
            </label>
            <label class="novaThemeRange">
              <span>GLASS OPACITY <output data-output-for="glassOpacity">52%</output></span>
              <input type="range" min="12" max="90" step="1" data-theme-field="glassOpacity">
            </label>
            <label class="novaThemeRange">
              <span>BLUR <output data-output-for="blur">12px</output></span>
              <input type="range" min="0" max="30" step="1" data-theme-field="blur">
            </label>
            <label class="novaThemeRange">
              <span>GLOW <output data-output-for="glow">55%</output></span>
              <input type="range" min="0" max="100" step="1" data-theme-field="glow">
            </label>
          </div>

          <div class="novaThemeStudioActions">
            <button type="button" class="novaThemeReset">RESET NOVA DEFAULT</button>
            <span>Saved automatically on this browser.</span>
          </div>
        </aside>

        <div class="novaStatusRail">
          <div class="novaStage" data-stage="pick" data-state="idle"><span>01 PICK</span><b class="novaStageValue">WAITING</b></div>
          <div class="novaStage" data-stage="pack" data-state="idle"><span>02 PACK</span><b class="novaStageValue">WAITING</b></div>
          <div class="novaStage" data-stage="slam" data-state="idle"><span>03 SLAM</span><b class="novaStageValue">WAITING</b></div>
          <div class="novaStage" data-stage="dwell" data-state="idle"><span>04 DWELL</span><b class="novaStageValue">CLEAR</b></div>
          <div class="novaStage" data-stage="ps" data-state="idle"><span>05 PS</span><b class="novaStageValue">CLEAR</b></div>
        </div>

        <div class="heroTopContent">
          <div class="novaConsoleGrid">
            <article class="novaCard novaPickCard" data-card-id="pick">
              ${cardHeader('01', 'PICK', '⌁')}
              <div class="novaCardBody">
                ${row('ASIN', 'ASIN')}
                ${row('Tote', 'pickTote')}
                ${row('Event', 'PickEventName')}
                ${row('Time', 'PickEventTime')}
              </div>
            </article>

            <article class="novaCard novaPackCard" data-card-id="pack">
              ${cardHeader('02', 'PACK', '▣')}
              <div class="novaCardBody">
                ${row('Associate', 'packAA')}
                ${row('Station', 'packStation')}
                ${row('Box Rec', 'boxRec')}
                ${row('SPOO', 'Spoo')}
                ${row('Event', 'PackEventName')}
                ${row('Time', 'packEventTime')}
              </div>
            </article>

            <article class="novaCard novaSlamCard" data-card-id="slam">
              ${cardHeader('03', 'SLAM / KICKOUT', '⚠')}
              <div class="novaCardBody">
                <div class="novaSlamMeta">
                  ${row('Station', 'slamStation')}
                  ${row('Kickout Code', 'KickoutCode')}
                  ${row('Event', 'KOEventName')}
                  ${row('Time', 'KOEventTime')}
                </div>

                <div class="novaRiskFlags">
                  <div class="novaRiskFlag"><span>ATROPS</span><b class="AtropsIssue">No</b></div>
                  <div class="novaRiskFlag"><span>AGE CHECK</span><b class="AgeVerification">No</b></div>
                </div>

                <div class="novaAlertPreview">
                  <div class="novaAlertGlyph">!</div>
                  <div class="novaAlertText">
                    <span>FAILURE REASON</span>
                    <strong class="KickoutReasonPreview is-empty">No failure message captured.</strong>
                  </div>
                </div>

                <div class="novaReasonActions">
                  <button type="button" class="novaReasonToggle" disabled>OPEN ATROPS MESSAGE</button>
                  <button type="button" class="novaReasonCopy" disabled>COPY MESSAGE</button>
                </div>

                <div class="novaReasonDrawer" hidden>
                  <div class="novaReasonDrawerTitle">RAW FAILURE / ATROPS MESSAGE</div>
                  <pre class="KickoutReason"></pre>
                </div>
              </div>
            </article>

            <article class="novaCard novaBridgeCard" data-card-id="bridge">
              ${cardHeader('04', 'BRIDGING', '↗')}
              <div class="novaCardBody">
                ${row('Root Cause', 'BridgingReason')}
                ${row('Ticket', 'BridgingTT')}
              </div>
            </article>

            <article class="novaCard novaRunnerCard" data-card-id="runner">
              ${cardHeader('05', 'SEND RUNNER', '➤')}
              <div class="novaCardBody">
                ${row('Area', 'SRArea')}
                ${row('Requested', 'SRTime')}
              </div>
            </article>

            <article class="novaCard novaPsCard" data-card-id="ps">
              ${cardHeader('06', 'PROBLEM SOLVE & DWELL', '◆')}
              <div class="novaCardBody novaPsLayout">
                <div class="novaPsDetails">
                  ${row('Associate', 'associate')}
                  ${row('Defect', 'reason')}
                  ${row('Defect Time', 'time')}
                  ${row('Cancel Attempt', 'cancelAttempt')}
                  ${row('Actual Cancel', 'actualCancel')}
                </div>

                <div class="novaDwellGrid">
                  <section class="novaDwellUnit novaAutoDwell">
                    <div class="novaDwellUnitHead">
                      <span>AUTO DWELL</span>
                      <b class="autoDwelled">No</b>
                    </div>
                    <strong class="autoDwellBy is-unknown">Not exposed</strong>
                    <span class="autoDwellActorType novaActorBadge" data-type="unknown">UNKNOWN</span>
                    <div class="novaDwellTime"><span>TIME</span><b class="autoDwellTime"></b></div>
                  </section>

                  <section class="novaDwellUnit novaManualDwell">
                    <div class="novaDwellUnitHead">
                      <span>MANUAL DWELL</span>
                      <b class="manualDwelled">No</b>
                    </div>
                    <strong class="manualDwellBy is-unknown">Not exposed</strong>
                    <span class="manualDwellActorType novaActorBadge" data-type="unknown">UNKNOWN</span>
                    <div class="novaDwellTime"><span>TIME</span><b class="manualDwellTime"></b></div>
                  </section>
                </div>
              </div>
            </article>

            <article class="novaCard novaCategorizeCard" data-card-id="categorize">
              ${cardHeader('07', 'CATEGORIZE', '◇')}
              <div class="novaCardBody">
                ${row('Category', 'CategoryAccepted')}
                ${row('Process Path', 'ProcessPathChosen')}
                ${row('Event Time', 'CatEventTime')}
              </div>
            </article>
          </div>
        </div>
      </section>
    `;
  }

  function ensureTopPanelExists() {
    if (document.getElementById('hero-tooltips-top-panel')) return;

    document.body.insertAdjacentHTML('afterbegin', renderTopPanelHtml());
    const panel = document.getElementById('hero-tooltips-top-panel');
    const state = loadUiState();

    if (state.panelCollapsed) panel.classList.add('is-collapsed');
    if (state.theme === 'light') panel.classList.add('is-light');

    const themeToggle = panel.querySelector('.heroThemeToggle');
    if (themeToggle) themeToggle.textContent = panel.classList.contains('is-light') ? '☾ DARK' : '◫ GLASS';
    applyHeroTheme(panel);

    panel.querySelectorAll('.novaCard').forEach(card => {
      const cardId = card.dataset.cardId;
      if (state.cards?.[cardId]) card.classList.add('is-card-collapsed');
      const button = card.querySelector('.novaCardToggle');
      if (button) button.textContent = card.classList.contains('is-card-collapsed') ? '+' : '−';
    });

    const panelCollapse = panel.querySelector('.heroTopCollapse');
    if (panelCollapse) panelCollapse.textContent = panel.classList.contains('is-collapsed') ? '+' : '−';

    const themeStudio = panel.querySelector('.novaThemeStudio');
    if (themeStudio) {
      themeStudio.addEventListener('input', event => {
        const input = event.target.closest('[data-theme-field]');
        if (!input) return;
        updateCustomTheme(panel, input.dataset.themeField, input.value);
      });

      themeStudio.addEventListener('change', event => {
        const preset = event.target.closest('.novaThemePreset');
        if (preset && preset.value !== 'custom') applyPreset(panel, preset.value);
      });
    }

    panel.addEventListener('click', async event => {
      const themeMenuToggle = event.target.closest('.heroThemeMenuToggle');
      if (themeMenuToggle) {
        const studio = panel.querySelector('.novaThemeStudio');
        setThemeStudioOpen(panel, Boolean(studio?.hidden));
        return;
      }

      if (event.target.closest('.novaThemeStudioClose')) {
        setThemeStudioOpen(panel, false);
        return;
      }

      if (event.target.closest('.novaThemeReset')) {
        resetHeroTheme(panel);
        return;
      }

      const themeToggle = event.target.closest('.heroThemeToggle');
      if (themeToggle) {
        panel.classList.toggle('is-light');
        const isLight = panel.classList.contains('is-light');
        themeToggle.textContent = isLight ? '☾ DARK' : '◫ GLASS';
        themeToggle.title = isLight ? 'Switch to dark mode' : 'Switch to glass mode';

        const next = loadUiState();
        next.theme = isLight ? 'light' : 'dark';
        saveUiState(next);
        applyHeroTheme(panel);
        return;
      }

      const timelineToggle = event.target.closest('.heroTimelineToggle');
      if (timelineToggle) {
        if (!window.NovaHeroTimeline || typeof window.NovaHeroTimeline.toggle !== 'function') {
          timelineToggle.textContent = 'TL ERROR';
          console.error('[Nova HERO] Shipment Timeline API unavailable');
          setTimeout(() => { timelineToggle.textContent = '⌁ TIMELINE'; }, 1600);
          return;
        }

        const isOpen = await window.NovaHeroTimeline.toggle();
        timelineToggle.textContent = isOpen ? '⌁ CLOSE TL' : '⌁ TIMELINE';
        timelineToggle.title = isOpen ? 'Close Shipment Timeline' : 'Open Shipment Timeline';
        return;
      }

      const refresh = event.target.closest('.heroTopRefresh');
      if (refresh) {
        refreshData();
        window.NovaHeroTimeline?.refreshIfOpen?.();
        return;
      }

      const copyShipment = event.target.closest('.heroCopyShipment');
      if (copyShipment) {
        const copied = await copyText(_CustomerShipment);
        const original = copyShipment.textContent;
        copyShipment.textContent = copied ? 'COPIED' : 'COPY FAILED';
        setTimeout(() => { copyShipment.textContent = original; }, 1200);
        return;
      }

      const collapse = event.target.closest('.heroTopCollapse');
      if (collapse) {
        panel.classList.toggle('is-collapsed');
        collapse.textContent = panel.classList.contains('is-collapsed') ? '+' : '−';
        const next = loadUiState();
        next.panelCollapsed = panel.classList.contains('is-collapsed');
        saveUiState(next);
        return;
      }

      const cardToggle = event.target.closest('.novaCardToggle');
      if (cardToggle) {
        const card = cardToggle.closest('.novaCard');
        card.classList.toggle('is-card-collapsed');
        cardToggle.textContent = card.classList.contains('is-card-collapsed') ? '+' : '−';

        const next = loadUiState();
        next.cards = next.cards || {};
        next.cards[card.dataset.cardId] = card.classList.contains('is-card-collapsed');
        saveUiState(next);
        return;
      }

      const reasonToggle = event.target.closest('.novaReasonToggle');
      if (reasonToggle && !reasonToggle.disabled) {
        const drawer = panel.querySelector('.novaReasonDrawer');
        drawer.hidden = !drawer.hidden;
        reasonToggle.textContent = drawer.hidden ? 'OPEN ATROPS MESSAGE' : 'CLOSE ATROPS MESSAGE';
        return;
      }

      const reasonCopy = event.target.closest('.novaReasonCopy');
      if (reasonCopy && !reasonCopy.disabled) {
        const copied = await copyText(panel.querySelector('.KickoutReason')?.textContent || '');
        const original = reasonCopy.textContent;
        reasonCopy.textContent = copied ? 'COPIED' : 'COPY FAILED';
        setTimeout(() => { reasonCopy.textContent = original; }, 1200);
      }
    });

    initialiseStatusObserver();
    updateStatusRail();
  }

  function injectPanel() {
    ensureTopPanelExists();

    const parsed = parseHeroUrl(location.href);
    if (!parsed) {
      _CustomerShipment = undefined;
      setTopPanelShipmentText();
      return;
    }

    _fcname = (parsed.fc || '').toUpperCase();
    _CustomerShipment = parsed.shipment;

    setTopPanelShipmentText();
    refreshData();
  }


  function fetchTicket(shipment, fc, sequence) {
    let rodeoUrl = `https://rodeo-dub.amazon.com/${fc}/Search?_enabledColumns=on&enabledColumns=ASIN_TITLES&enabledColumns=OUTER_CONTAINER_TYPE&enabledColumns=OUTER_SCANNABLE_ID&searchKey=${encodeURIComponent(shipment)}`;
    GM_xmlhttpRequest({
      method: 'GET',
      url: rodeoUrl,
      onload: function (res) {
        if (!isCurrentTopPanelRequest(shipment, fc, sequence)) return;
        let html = res.responseText;
        let match = html.match(/(https?:\\?\/\\?\/t\.corp\.amazon\.com\/[A-Z0-9]+\/communication)/i);
        if (!match) match = html.match(/(https?:\/\/t\.corp\.amazon\.com\/[A-Z0-9]+\/communication)/i);

        if (match && match[1]) {
          let ticketLink = match[1].replace(/\\+/g, '');
          setSafeLink('.BridgingTT', ticketLink, ticketLink);
        } else {
          $('.BridgingTT').text("Not found");
        }
      },
      onerror: () => {
        if (isCurrentTopPanelRequest(shipment, fc, sequence)) $('.BridgingTT').text("Error fetching");
      },
      ontimeout: () => {
        if (isCurrentTopPanelRequest(shipment, fc, sequence)) $('.BridgingTT').text("Timeout");
      }
    });
  }

  function getDatas(shipment, fc, sequence) {
    GM_xmlhttpRequest({
      method: 'GET',
        url: `https://hero.eu.picking.aft.a2z.com/api/fcs/${encodeURIComponent(fc)}/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipment)}/events`,
      headers: { 'Accept': 'application/json' },
      onload: function (res) {
        try {
          if (!isCurrentTopPanelRequest(shipment, fc, sequence)) return;
          const data = JSON.parse(res.responseText);
          if (!data.EventList) throw new Error('HERO EventList missing');

          const seen = {};

          for (let i = data.EventList.length - 1; i >= 0; i--) {
            const e = data.EventList[i];
            const type = e.eventType;
            const ts = e.timeStamp;

            if (type === 'SHIPMENT_STAGED' && !seen.SHIPMENT_STAGED) {
              $('.PickEventName').text('PICK_COMPLETE');
              $('.PickEventTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.SHIPMENT_STAGED = true;
            }

            if (type === 'CREATE_PACKAGE' && !seen.CREATE_PACKAGE) {
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.CREATE_PACKAGE = true;
            }

            if (type === 'COMPLETE_PACKAGE' && !seen.COMPLETE_PACKAGE) {
              $('.PackEventName').text('COMPLETE_PACKAGE');
              $('.packEventTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.COMPLETE_PACKAGE = true;
            }

            if (type === 'SLAM_VALIDATIONS_CACHING_PROCESSING_FAILURE' && !seen.SLAM_FAILURE) {
              $('.KOEventName').text('SLAM_VALIDATIONS_FAILURE');
              $('.KOEventTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.SLAM_FAILURE = true;
            }

            if ((type === 'PackageShipStarted' || type === 'PackageShipCompleted') && !seen.PACKAGE_SHIP) {
              $('.KOEventName').text(type === 'PackageShipCompleted' ? 'SLAM_SUCCESS' : 'SLAM_KICKOUT');
              $('.KOEventTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.PACKAGE_SHIP = true;
            }

            if (type === 'GET_SHIPPING_LABEL_REALTIME_CALL_FAILURE' && !seen.GET_LABEL_FAILURE) {
              $('.KOEventName').text('GET_SHIPPING_LABEL_FAILURE');
              $('.KOEventTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.GET_LABEL_FAILURE = true;
            }

            if ((type === 'ReportDefect' || type === 'FAIL_SHIPMENT') && !seen.PROBLEM) {
              $('.time').text(formatTime(ts));

              const defectActor = String(
                e.metaData?.userId ||
                e.metaData?.login ||
                e.metaData?.actor ||
                ''
              ).trim();

              if (defectActor) {
                setSafeLink(
                  '.associate',
                  `https://fclm-portal.amazon.com/employee/timeDetails?warehouseId=${encodeURIComponent(fc)}&employeeId=${encodeURIComponent(defectActor)}`,
                  defectActor
                );
              }

              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.PROBLEM = true;
            }

            if (type === 'Categorize' && !seen.CATEGORIZE) {
              $('.CatEventTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.CATEGORIZE = true;
            }

            if (type === 'SendRunnerRequest' && !seen.SENDRUNNER) {
              $('.SRTime').text(formatTime(ts));
              getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              seen.SENDRUNNER = true;
            }

            if (type === 'SDP_SMCLambda_Cancel' && !seen.SDP_CANCEL) {
              $('.cancelAttempt').text(formatTime(ts));
              seen.SDP_CANCEL = true;
            }

            if (type === 'FRPS_ShipmentCancelPipeline' && !seen.FRPS_CANCEL) {
              $('.actualCancel').text(formatTime(ts));
              seen.FRPS_CANCEL = true;
            }

            if (type === 'ReportDwellingInventory' && !seen.AUTO_DWELL) {
              $('.autoDwelled').text('YES').addClass('is-yes');
              $('.autoDwellTime').text(formatTime(ts));

              const actor = String(e.metaData?.userId || '').trim();
              setDwellActor('auto', actor || 'AutoDwell');
              if (!actor && e.requestId && e.eventDetailsKey) {
                getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              }

              seen.AUTO_DWELL = true;
            }

            if (type === 'ReportDwellingShipment' && !seen.MANUAL_DWELL) {
              $('.manualDwelled').text('YES').addClass('is-yes');
              $('.manualDwellTime').text(formatTime(ts));

              const actor = String(e.metaData?.userId || '').trim();
              setDwellActor('manual', actor);
              if (!actor && e.requestId && e.eventDetailsKey) {
                getEventDetail(type, shipment, e.requestId, e.eventDetailsKey, fc, sequence);
              }

              seen.MANUAL_DWELL = true;
            }
          }

          updateStatusRail();
          document.getElementById('hero-tooltips-top-panel')?.classList.remove('is-loading');
        } catch (error) {
          console.error('[Nova HERO] Failed to parse HERO events', error);
          document.getElementById('hero-tooltips-top-panel')?.classList.remove('is-loading');
        }
      },
      onerror: function () {
        document.getElementById('hero-tooltips-top-panel')?.classList.remove('is-loading');
      },
      ontimeout: function () {
        document.getElementById('hero-tooltips-top-panel')?.classList.remove('is-loading');
      }
    });
  }

  function getEventDetail(type, shipment, reqId, key, fc, sequence) {
    if (!reqId || !key) return;

    GM_xmlhttpRequest({
      method: 'GET',
      url: `https://hero.eu.picking.aft.a2z.com/api/fcs/${encodeURIComponent(fc)}/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipment)}/events/id/${encodeURIComponent(reqId)}/details/key/${encodeURIComponent(key)}`,
      headers: { 'Accept': 'application/json' },
      onload: function (res) {
        if (!isCurrentTopPanelRequest(shipment, fc, sequence)) return;
        let msg = res.responseText;

        try {
          const json = JSON.parse(msg);
          msg = json.eventDetails?.message || msg;
        } catch (error) {}

        function extract(regex) {
          const match = String(msg).match(regex);
          return match?.[1] ? match[1].trim() : '';
        }

        if (/GET_SHIPPING_LABEL_REALTIME_CALL_FAILURE|SLAM_VALIDATIONS|PackageShip/.test(type)) {
          $('.AtropsIssue').text('No').removeClass('is-alert');
          $('.AgeVerification').text('No').removeClass('is-alert');

          if (msg.includes('U_002') || msg.includes('ROUTE_NOT_FOUND') || msg.includes('Unable to assign ship method')) {
            $('.AtropsIssue').text('YES').addClass('is-alert');
          }

          if (msg.includes('U_002') && (
            msg.toLowerCase().includes('age verification') ||
            msg.includes('items that require age verification') ||
            msg.includes('age restriction constraint')
          )) {
            $('.AgeVerification').text('YES').addClass('is-alert');
          }

          setBridgingReason(msg);
        }

        switch (type) {
          case 'SHIPMENT_STAGED': {
            const asin = extract(/fnSku=(.*?),/);
            const tote = extract(/ShipmentGroupId=LCY3-(.*?)-/);

            if (asin) {
              setSafeLink(
                '.ASIN',
                `http://fcresearch-eu.aka.amazon.com/${encodeURIComponent(fc)}/results?s=${encodeURIComponent(asin)}`,
                asin
              );
            }
            if (tote) {
              setSafeLink(
                '.pickTote',
                `http://fcresearch-eu.aka.amazon.com/${encodeURIComponent(fc)}/results?s=${encodeURIComponent(tote)}`,
                tote
              );
            }
            break;
          }

          case 'CREATE_PACKAGE': {
            const aa = extract(/owner=(.*?),/);
            const station = extract(/locationScannableId=(.*?),/);
            const box = extract(/boxRecommendation=(.*?),/);

            if (aa) {
              setSafeLink(
                '.packAA',
                `https://fclm-portal.amazon.com/employee/timeDetails?warehouseId=${encodeURIComponent(fc)}&employeeId=${encodeURIComponent(aa)}`,
                aa
              );
            }
            if (station) $('.packStation').text(station);
            if (box) $('.boxRec').text(box);
            break;
          }

          case 'COMPLETE_PACKAGE': {
            const spoo = extract(/data=(.*?),/);
            if (spoo) {
              setSafeLink(
                '.Spoo',
                `http://fcresearch-eu.aka.amazon.com/${encodeURIComponent(fc)}/results?s=${encodeURIComponent(spoo)}`,
                spoo
              );
            }
            break;
          }

          case 'SLAM_VALIDATIONS_CACHING_PROCESSING_FAILURE':
          case 'PackageShipStarted':
          case 'PackageShipCompleted':
          case 'GET_SHIPPING_LABEL_REALTIME_CALL_FAILURE': {
            const slamStation = extract(/Station=(.*?),/);
            const errorCode = extract(/errorCode[=:] ?([^,\s]+)/i) || extract(/errorCode["=]([^"\s]+)/);
            const errorMsg =
              extract(/errorMessage["=]([^"\n]+)/) ||
              extract(/exceptionMessage["=]([^"\n]+)/) ||
              extract(/Error Message=(.*?)(?:,|$)/);
            const problemAsin = extract(/\[([A-Z0-9]{10})\]/);

            if (slamStation) $('.slamStation').text(slamStation);
            if (errorCode) $('.KickoutCode').text(errorCode);

            let fullReason = errorMsg || String(msg || '').trim() || 'Unknown compliance failure';
            if (problemAsin && !fullReason.includes(problemAsin)) fullReason += ` (ASIN: ${problemAsin})`;
            setFailureReason(fullReason);
            break;
          }

          case 'ReportDefect':
          case 'FAIL_SHIPMENT': {
            const defectType =
              extract(/DefectType=([^,\s}]+)/i) ||
              extract(/defectType[=:]\s*["']?([^,"'}\s]+)/i) ||
              extract(/defect_type[=:]\s*["']?([^,"'}\s]+)/i);

            const defectReason =
              extract(/DefectReasonCode=([^,}]*)/i) ||
              extract(/defectReason[=:]\s*["']?([^,"'}]+)/i) ||
              extract(/damageReason[=:]\s*["']?([^,"'}]+)/i) ||
              extract(/problemReason[=:]\s*["']?([^,"'}]+)/i);

            const defectProcess =
              extract(/DefectFromProcess=([^,\s}]+)/i) ||
              extract(/defectFromProcess[=:]\s*["']?([^,"'}\s]+)/i);

            const sourceContainer =
              extract(/sourceContainer=([^,\s}]+)/i) ||
              extract(/containerId[=:]\s*["']?([^,"'}\s]+)/i);

            const actor =
              extract(/owner=([^,\s}]+)/i) ||
              extract(/userId[=:]\s*["']?([^,"'}\s]+)/i) ||
              extract(/login[=:]\s*["']?([^,"'}\s]+)/i);

            const readableType = String(defectType || '').replaceAll('_', ' ').trim();
            const readableReason = String(defectReason || '').replaceAll('_', ' ').trim();
            const displayedDefect = readableReason || readableType || 'Defect reported';

            $('.reason').text(displayedDefect);

            if (actor && !/^[a-f0-9-]{24,}$/i.test(actor)) {
              setSafeLink(
                '.associate',
                `https://fclm-portal.amazon.com/employee/timeDetails?warehouseId=${encodeURIComponent(fc)}&employeeId=${encodeURIComponent(actor)}`,
                actor
              );
            }

            const extra = [];
            if (defectProcess) extra.push(`From ${defectProcess}`);
            if (sourceContainer) extra.push(`Container ${sourceContainer}`);
            $('.reason').attr('title', extra.join(' • '));

            break;
          }

          case 'SendRunnerRequest': {
            let area =
              extract(/areaId=([^,\s}]+)/) ||
              extract(/areaId["':\s]+([^"'}]+)/) ||
              extract(/psPOPS_?([A-Z0-9]+)/);

            if (!area) {
              const direct = String(msg).match(/binId=(P-\d-[A-Z0-9]+)/i);
              area = direct?.[1] || '';
            }

            if (area) {
              area = area
                .replace(/^psPOPS_/, '')
                .replace(/^AFE$/i, 'AFE')
                .replace(/^P2R[234]$/i, match => match.toUpperCase());
              $('.SRArea').text(area);
            }
            break;
          }

          case 'ReportDwellingInventory': {
            const actor = extractActorFromText(msg);
            if (actor) setDwellActor('auto', actor);
            break;
          }

          case 'ReportDwellingShipment': {
            const actor = extractActorFromText(msg);
            if (actor) setDwellActor('manual', actor);
            break;
          }
        }

        updateStatusRail();
      }
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  $(document).ready(function () {
    waitForKeyElements('body', injectPanel);

    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        injectPanel();
      }
    }, 500);
  });

  // -----------------------------
  // Styles
  // -----------------------------
  GM_addStyle(`
    :root {
      --nova-bg-0: #03070c;
      --nova-bg-1: #07121c;
      --nova-bg-2: #0c1a27;
      --nova-card: rgba(11, 24, 36, .97);
      --nova-card-deep: rgba(5, 13, 21, .99);
      --nova-line: rgba(91, 255, 178, .18);
      --nova-line-hot: rgba(91, 255, 178, .56);
      --nova-green: #59ffb1;
      --nova-green-dark: #25ca7c;
      --nova-blue: #5ca8ff;
      --nova-purple: #b18cff;
      --nova-orange: #ffbd59;
      --nova-red: #ff6478;
      --nova-cyan: #5ce7ff;
      --nova-text: #eef8f4;
      --nova-muted: #8ea8a0;
    }

    #hero-tooltips-top-panel,
    #hero-tooltips-top-panel * {
      box-sizing: border-box;
    }

    .heroTopPanel {
      position: relative;
      width: 100%;
      margin: 0;
      overflow: hidden;
      color: var(--nova-text);
      background:
        radial-gradient(circle at 10% -20%, rgba(89,255,177,.14), transparent 37%),
        radial-gradient(circle at 92% 0%, rgba(92,168,255,.09), transparent 28%),
        linear-gradient(145deg, var(--nova-bg-0), var(--nova-bg-1) 57%, #040b12);
      border-bottom: 1px solid var(--nova-line-hot);
      box-shadow: 0 14px 38px rgba(0,0,0,.42);
      font-family: "Amazon Ember", Inter, "Segoe UI", Arial, sans-serif;
      isolation: isolate;
    }

    .heroTopPanel::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      opacity: .2;
      background-image:
        linear-gradient(rgba(89,255,177,.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(89,255,177,.04) 1px, transparent 1px);
      background-size: 28px 28px;
      mask-image: linear-gradient(to bottom, black, transparent 94%);
    }

    .heroTopPanel::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--nova-green), var(--nova-blue), transparent);
      box-shadow: 0 0 18px var(--nova-green);
    }

    .heroTopHeader {
      min-height: 70px;
      padding: 11px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--nova-line);
      background: rgba(3, 10, 16, .78);
      backdrop-filter: blur(14px);
    }

    .heroTopBrand {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .heroTopLogo {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      display: grid;
      place-items: center;
      border: 1px solid var(--nova-line-hot);
      border-radius: 13px;
      color: #03110a;
      background: linear-gradient(145deg, #9affcd, var(--nova-green-dark));
      box-shadow: 0 0 0 3px rgba(89,255,177,.07), 0 0 24px rgba(89,255,177,.25);
      font-size: 22px;
      font-weight: 1000;
      transform: skew(-4deg);
    }

    .heroTopTitle {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .heroTopTitle > strong {
      font-size: 15px;
      letter-spacing: .95px;
      text-shadow: 0 0 18px rgba(89,255,177,.16);
    }

    .heroTopSub {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      color: var(--nova-muted);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .75px;
    }

    .heroTopShipment,
    .heroTopFc,
    .heroLastRefresh {
      color: var(--nova-green);
      font-family: Consolas, "Courier New", monospace;
    }

    .heroLiveDot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nova-green);
      box-shadow: 0 0 10px var(--nova-green);
      animation: novaHeroPulse 1.8s ease-in-out infinite;
    }

    @keyframes novaHeroPulse {
      0%, 100% { opacity: .45; transform: scale(.78); }
      50% { opacity: 1; transform: scale(1.12); }
    }

    .heroTopActions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .heroTopActions button,
    .novaReasonActions button,
    .novaCardToggle {
      min-height: 37px;
      padding: 8px 13px;
      border: 1px solid var(--nova-line-hot);
      border-radius: 9px;
      color: #03110a;
      background: linear-gradient(135deg, #82ffc1, var(--nova-green-dark));
      box-shadow: 0 7px 18px rgba(37,202,124,.16);
      cursor: pointer;
      font-size: 10px;
      font-weight: 1000;
      letter-spacing: .55px;
      transition: transform .15s ease, filter .15s ease, border-color .15s ease;
    }

    .heroTopActions button:hover,
    .novaReasonActions button:hover,
    .novaCardToggle:hover {
      filter: brightness(1.09);
      transform: translateY(-1px);
    }

    .heroCopyShipment,
    .heroTopCollapse,
    .novaReasonCopy,
    .novaCardToggle {
      color: var(--nova-text) !important;
      background: rgba(255,255,255,.055) !important;
      border-color: rgba(255,255,255,.16) !important;
      box-shadow: none !important;
    }

    .heroTopCollapse,
    .novaCardToggle {
      width: 37px;
      padding: 0 !important;
      font-size: 15px !important;
    }

    .heroTopPanel.is-loading .heroTopRefresh {
      cursor: progress;
      animation: novaRefreshGlow 1s ease-in-out infinite alternate;
    }

    @keyframes novaRefreshGlow {
      from { box-shadow: 0 0 0 rgba(89,255,177,0); }
      to { box-shadow: 0 0 20px rgba(89,255,177,.32); }
    }

    .novaStatusRail {
      padding: 9px 18px;
      display: grid;
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      gap: 7px;
      border-bottom: 1px solid rgba(255,255,255,.055);
      background: rgba(0,0,0,.14);
    }

    .novaStage {
      position: relative;
      min-height: 38px;
      padding: 7px 10px 7px 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 8px;
      color: var(--nova-muted);
      background: rgba(255,255,255,.025);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .7px;
    }

    .novaStage::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      width: 3px;
      height: 100%;
      background: rgba(255,255,255,.16);
    }

    .novaStageValue { color: #b9c9c3; }
    .novaStage[data-state="success"] { border-color: rgba(89,255,177,.29); background: rgba(89,255,177,.06); }
    .novaStage[data-state="success"]::before { background: var(--nova-green); }
    .novaStage[data-state="success"] .novaStageValue { color: var(--nova-green); }
    .novaStage[data-state="warning"] { border-color: rgba(255,189,89,.34); background: rgba(255,189,89,.07); }
    .novaStage[data-state="warning"]::before { background: var(--nova-orange); }
    .novaStage[data-state="warning"] .novaStageValue { color: var(--nova-orange); }
    .novaStage[data-state="danger"] { border-color: rgba(255,100,120,.42); background: rgba(255,100,120,.09); }
    .novaStage[data-state="danger"]::before { background: var(--nova-red); }
    .novaStage[data-state="danger"] .novaStageValue { color: var(--nova-red); }
    .novaStage[data-state="info"] { border-color: rgba(92,168,255,.36); background: rgba(92,168,255,.07); }
    .novaStage[data-state="info"]::before { background: var(--nova-blue); }
    .novaStage[data-state="info"] .novaStageValue { color: var(--nova-blue); }

    .heroTopContent {
      padding: 13px 18px 18px;
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--nova-green-dark) var(--nova-bg-0);
    }

    .heroTopPanel.is-collapsed .novaStatusRail,
    .heroTopPanel.is-collapsed .heroTopContent {
      display: none;
    }

    .novaConsoleGrid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 11px;
      align-items: start;
    }

    .novaCard {
      --card-accent: var(--nova-green);
      position: relative;
      min-width: 0;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 12px;
      background: linear-gradient(155deg, var(--nova-card), var(--nova-card-deep));
      box-shadow: 0 10px 24px rgba(0,0,0,.23);
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
    }

    .novaCard::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      width: 3px;
      height: 100%;
      background: var(--card-accent);
      box-shadow: 0 0 16px var(--card-accent);
    }

    .novaCard:hover {
      border-color: color-mix(in srgb, var(--card-accent) 44%, transparent);
      box-shadow: 0 14px 30px rgba(0,0,0,.30), 0 0 20px color-mix(in srgb, var(--card-accent) 7%, transparent);
      transform: translateY(-1px);
    }

    .novaPickCard { --card-accent: var(--nova-blue); grid-column: span 2; }
    .novaPackCard { --card-accent: var(--nova-purple); grid-column: span 2; }
    .novaSlamCard { --card-accent: var(--nova-red); grid-column: span 4; }
    .novaBridgeCard { --card-accent: var(--nova-orange); grid-column: span 2; }
    .novaRunnerCard { --card-accent: var(--nova-cyan); grid-column: span 2; }
    .novaPsCard { --card-accent: var(--nova-green); grid-column: span 8; }
    .novaCategorizeCard { --card-accent: var(--nova-cyan); grid-column: span 4; }

    .novaCardHeader {
      min-height: 42px;
      padding: 7px 8px 7px 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid rgba(255,255,255,.065);
      background: linear-gradient(90deg, color-mix(in srgb, var(--card-accent) 11%, transparent), transparent 72%);
    }

    .novaCardIdentity {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .novaCardIndex {
      color: var(--card-accent);
      font-family: Consolas, "Courier New", monospace;
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .8px;
    }

    .novaCardIcon {
      color: var(--card-accent);
      font-size: 14px;
      text-shadow: 0 0 12px var(--card-accent);
    }

    .novaCardHeader h3 {
      margin: 0;
      color: var(--nova-text);
      font-size: 11px;
      font-weight: 1000;
      letter-spacing: .9px;
      text-transform: uppercase;
    }

    .novaCardToggle {
      width: 29px !important;
      min-height: 29px !important;
      border-radius: 7px !important;
    }

    .novaCardBody {
      padding: 8px 11px 11px 14px;
    }

    .novaCard.is-card-collapsed .novaCardBody {
      display: none;
    }

    .novaDataRow {
      min-height: 30px;
      display: grid;
      grid-template-columns: minmax(86px, .72fr) minmax(0, 1.28fr);
      align-items: center;
      gap: 9px;
      border-bottom: 1px solid rgba(255,255,255,.055);
    }

    .novaDataRow:last-child { border-bottom: 0; }

    .novaDataLabel {
      color: var(--nova-muted);
      font-size: 9px;
      font-weight: 950;
      letter-spacing: .6px;
      text-transform: uppercase;
    }

    .novaDataValue {
      min-width: 0;
      color: var(--nova-text);
      font-size: 11px;
      font-weight: 750;
      overflow-wrap: anywhere;
    }

    .novaDataValue:empty::after,
    .novaDwellTime b:empty::after {
      content: "—";
      color: rgba(142,168,160,.55);
      font-weight: 600;
    }

    .novaDataValue a,
    .BridgingTT a {
      color: var(--card-accent, var(--nova-green));
      text-decoration: none;
      border-bottom: 1px dashed currentColor;
    }

    .novaDataValue a:hover,
    .BridgingTT a:hover {
      filter: brightness(1.25);
    }

    .novaSlamMeta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      column-gap: 13px;
    }

    .novaRiskFlags {
      margin-top: 9px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 7px;
    }

    .novaRiskFlag {
      min-height: 38px;
      padding: 7px 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      background: rgba(255,255,255,.025);
      color: var(--nova-muted);
      font-size: 9px;
      font-weight: 950;
      letter-spacing: .55px;
    }

    .novaRiskFlag b {
      color: var(--nova-green);
      font-size: 10px;
    }

    .novaRiskFlag b.is-alert {
      color: var(--nova-red);
      text-shadow: 0 0 12px rgba(255,100,120,.4);
    }

    .novaAlertPreview {
      margin-top: 9px;
      padding: 9px;
      display: grid;
      grid-template-columns: 34px minmax(0,1fr);
      gap: 9px;
      border: 1px solid rgba(255,100,120,.24);
      border-radius: 9px;
      background: rgba(255,100,120,.055);
    }

    .novaAlertGlyph {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,100,120,.44);
      border-radius: 9px;
      color: var(--nova-red);
      background: rgba(255,100,120,.09);
      font-size: 18px;
      font-weight: 1000;
      box-shadow: 0 0 14px rgba(255,100,120,.12);
    }

    .novaAlertText {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .novaAlertText span {
      color: var(--nova-red);
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .8px;
    }

    .KickoutReasonPreview {
      display: -webkit-box;
      overflow: hidden;
      color: #ffdce1;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.35;
      overflow-wrap: anywhere;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .KickoutReasonPreview.is-empty { color: var(--nova-muted); }

    .novaReasonActions {
      margin-top: 8px;
      display: flex;
      gap: 7px;
    }

    .novaReasonActions button {
      min-height: 32px;
      padding: 6px 10px;
      color: #fff;
      background: linear-gradient(135deg, #b83c53, #ff6478);
      border-color: rgba(255,100,120,.45);
      box-shadow: 0 6px 16px rgba(255,100,120,.12);
      font-size: 9px;
    }

    .novaReasonActions button:disabled {
      cursor: not-allowed;
      filter: grayscale(.8);
      opacity: .35;
      transform: none;
    }

    .novaReasonDrawer {
      margin-top: 8px;
      padding: 9px;
      border: 1px solid rgba(255,100,120,.25);
      border-radius: 9px;
      background: rgba(2,6,10,.92);
    }

    .novaReasonDrawerTitle {
      margin-bottom: 7px;
      color: var(--nova-red);
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .75px;
    }

    .KickoutReason {
      max-height: 300px;
      margin: 0;
      padding: 9px;
      overflow: auto;
      border-radius: 7px;
      color: #ffdce1;
      background: #010509;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 10px/1.45 Consolas, "Courier New", monospace;
      scrollbar-width: thin;
      scrollbar-color: var(--nova-red) #010509;
    }

    .BridgingReason.is-alert {
      color: var(--nova-red);
      font-weight: 900;
    }

    .SRArea { color: var(--nova-orange); }

    .novaPsLayout {
      display: grid;
      grid-template-columns: minmax(250px, .8fr) minmax(430px, 1.45fr);
      gap: 12px;
    }

    .novaPsDetails {
      min-width: 0;
    }

    .novaDwellGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 9px;
    }

    .novaDwellUnit {
      position: relative;
      min-width: 0;
      padding: 10px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 10px;
      background: rgba(255,255,255,.025);
    }

    .novaDwellUnit::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      width: 3px;
      height: 100%;
      background: var(--dwell-accent);
      box-shadow: 0 0 14px var(--dwell-accent);
    }

    .novaAutoDwell { --dwell-accent: var(--nova-blue); }
    .novaManualDwell { --dwell-accent: var(--nova-orange); }

    .novaDwellUnitHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--dwell-accent);
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .8px;
    }

    .novaDwellUnitHead b {
      color: var(--nova-muted);
      font-size: 9px;
    }

    .novaDwellUnitHead b.is-yes {
      color: var(--dwell-accent);
      text-shadow: 0 0 10px color-mix(in srgb, var(--dwell-accent) 40%, transparent);
    }

    .autoDwellBy,
    .manualDwellBy {
      margin: 9px 0 6px;
      display: block;
      color: var(--nova-text);
      font: 1000 16px Consolas, "Courier New", monospace;
      overflow-wrap: anywhere;
    }

    .autoDwellBy.is-system,
    .manualDwellBy.is-system { color: var(--nova-blue); }
    .autoDwellBy.is-unknown,
    .manualDwellBy.is-unknown { color: var(--nova-muted); font: 700 11px "Amazon Ember", Arial, sans-serif; }

    .novaActorBadge {
      padding: 3px 6px;
      display: inline-flex;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 999px;
      color: var(--nova-muted);
      background: rgba(255,255,255,.035);
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .5px;
    }

    .novaActorBadge[data-type="system"] { color: var(--nova-blue); border-color: rgba(92,168,255,.25); }
    .novaActorBadge[data-type="user"] { color: var(--nova-green); border-color: rgba(89,255,177,.25); }

    .novaDwellTime {
      margin-top: 10px;
      padding-top: 7px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-top: 1px solid rgba(255,255,255,.06);
      color: var(--nova-muted);
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .55px;
    }

    .novaDwellTime b {
      color: var(--nova-text);
      font-size: 10px;
    }

    .cancelAttempt,
    .actualCancel,
    .autoDwellTime,
    .manualDwellTime {
      color: var(--nova-red);
      font-weight: 900;
    }


    /* -----------------------------
       Glass mode
       Keeps the dark-mode structure, borders and depth,
       but makes the surfaces translucent and text darker.
       ----------------------------- */
    .heroTopPanel.is-light {
      --nova-bg-0: rgba(202, 216, 210, .48);
      --nova-bg-1: rgba(183, 201, 193, .42);
      --nova-bg-2: rgba(166, 187, 178, .36);
      --nova-card: rgba(225, 234, 230, .54);
      --nova-card-deep: rgba(209, 222, 216, .58);
      --nova-line: rgba(24, 69, 52, .28);
      --nova-line-hot: rgba(12, 119, 76, .58);
      --nova-green: #056b45;
      --nova-green-dark: #064a33;
      --nova-blue: #155b88;
      --nova-purple: #63408f;
      --nova-orange: #8a5104;
      --nova-red: #ad3045;
      --nova-cyan: #066f7f;
      --nova-text: #10221a;
      --nova-muted: #415b50;
      color-scheme: light;
      background:
        radial-gradient(circle at 10% -20%, rgba(17, 128, 83, .12), transparent 38%),
        radial-gradient(circle at 92% 0%, rgba(31, 103, 151, .09), transparent 30%),
        linear-gradient(145deg, rgba(202,216,210,.52), rgba(177,198,189,.44) 57%, rgba(146,172,161,.40));
      box-shadow: 0 14px 38px rgba(12, 33, 25, .26);
      backdrop-filter: blur(12px) saturate(112%);
      -webkit-backdrop-filter: blur(12px) saturate(112%);
    }

    .heroTopPanel.is-light::before {
      opacity: .20;
      background-image:
        linear-gradient(rgba(10, 82, 55, .075) 1px, transparent 1px),
        linear-gradient(90deg, rgba(10, 82, 55, .075) 1px, transparent 1px);
    }

    .heroTopPanel.is-light .heroTopHeader {
      background: rgba(214, 226, 221, .52);
      border-bottom-color: rgba(18, 78, 55, .28);
      backdrop-filter: blur(16px) saturate(115%);
      -webkit-backdrop-filter: blur(16px) saturate(115%);
    }

    .heroTopPanel.is-light .novaStatusRail,
    .heroTopPanel.is-light .heroTopContent {
      background: rgba(170, 192, 182, .24);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .heroTopPanel.is-light .novaCard,
    .heroTopPanel.is-light .novaDwellUnit,
    .heroTopPanel.is-light .novaAlertPreview,
    .heroTopPanel.is-light .novaReasonDrawer,
    .heroTopPanel.is-light .novaRiskFlag,
    .heroTopPanel.is-light .novaStage {
      background: rgba(226, 235, 231, .50);
      border-color: rgba(25, 71, 54, .22);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.34),
        0 8px 22px rgba(17, 48, 36, .13);
      backdrop-filter: blur(10px) saturate(108%);
      -webkit-backdrop-filter: blur(10px) saturate(108%);
    }

    .heroTopPanel.is-light .novaCardHeader,
    .heroTopPanel.is-light .novaDwellUnitHead,
    .heroTopPanel.is-light .novaReasonDrawerTitle {
      background: rgba(176, 198, 188, .32);
      border-bottom-color: rgba(21, 69, 51, .19);
    }

    .heroTopPanel.is-light .novaDataRow,
    .heroTopPanel.is-light .novaDwellTime {
      border-color: rgba(18, 70, 51, .20);
    }

    .heroTopPanel.is-light .novaDataLabel,
    .heroTopPanel.is-light .novaDwellTime,
    .heroTopPanel.is-light .novaStage span {
      color: #3d584c;
    }

    .heroTopPanel.is-light .novaDataValue,
    .heroTopPanel.is-light .KickoutReason,
    .heroTopPanel.is-light .novaDwellUnit strong,
    .heroTopPanel.is-light .novaStage b,
    .heroTopPanel.is-light .heroTopTitle > strong {
      color: #0d2118;
      text-shadow: none;
    }

    .heroTopPanel.is-light .heroTopActions button,
    .heroTopPanel.is-light .novaReasonActions button,
    .heroTopPanel.is-light .novaCardToggle {
      background: rgba(220, 232, 227, .32);
      color: #123f2e;
      border-color: rgba(7, 105, 67, .43);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.28);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .heroTopPanel.is-light .heroTopActions button:hover,
    .heroTopPanel.is-light .novaReasonActions button:hover,
    .heroTopPanel.is-light .novaCardToggle:hover {
      background: rgba(190, 216, 204, .46);
      color: #062f20;
    }

    .heroTopPanel.is-light .heroCopyShipment,
    .heroTopPanel.is-light .heroTopCollapse,
    .heroTopPanel.is-light .novaReasonCopy,
    .heroTopPanel.is-light .novaCardToggle {
      background: rgba(216, 228, 223, .26) !important;
      border-color: rgba(20, 73, 54, .28) !important;
      color: #173e2f !important;
    }

    .heroTopPanel.is-light .novaReasonDrawer pre,
    .heroTopPanel.is-light pre {
      background: rgba(165, 187, 177, .32);
      color: #18352a;
      border-color: rgba(22, 72, 54, .20);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }


    .heroTopPanel {
      --nova-theme-bg: #03070c;
      --nova-theme-panel: #0b1824;
      --nova-theme-opacity: .97;
      --nova-theme-blur: 12px;
      --nova-theme-glow: 18px;
    }

    .heroTopPanel,
    .heroTopHeader,
    .novaStatusRail,
    .heroTopContent,
    .novaCard,
    .novaDwellUnit,
    .novaRiskFlag,
    .novaAlertPreview,
    .novaReasonDrawer,
    .novaStage {
      backdrop-filter: blur(var(--nova-theme-blur)) saturate(110%);
      -webkit-backdrop-filter: blur(var(--nova-theme-blur)) saturate(110%);
    }

    .heroTopPanel::after {
      box-shadow: 0 0 var(--nova-theme-glow) var(--nova-green);
    }

    .novaThemeStudio {
      position: relative;
      z-index: 8;
      margin: 10px 18px 0;
      padding: 14px;
      color: var(--nova-text);
      border: 1px solid var(--nova-line-hot);
      border-radius: 13px;
      background:
        radial-gradient(circle at 8% 0%, rgba(255,255,255,.055), transparent 32%),
        var(--nova-card-deep);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.07),
        0 10px 30px rgba(0,0,0,.28),
        0 0 var(--nova-theme-glow) rgba(89,255,177,.12);
      backdrop-filter: blur(calc(var(--nova-theme-blur) + 4px)) saturate(120%);
      -webkit-backdrop-filter: blur(calc(var(--nova-theme-blur) + 4px)) saturate(120%);
    }

    .novaThemeStudio[hidden] {
      display: none !important;
    }

    .novaThemeStudioHead,
    .novaThemeStudioActions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .novaThemeStudioHead strong {
      display: block;
      color: var(--nova-text);
      font-size: 13px;
      letter-spacing: .85px;
    }

    .novaThemeStudioHead span,
    .novaThemeStudioActions span {
      display: block;
      margin-top: 3px;
      color: var(--nova-muted);
      font-size: 10px;
      letter-spacing: .25px;
    }

    .novaThemeStudioClose,
    .novaThemeReset {
      min-height: 34px;
      padding: 0 12px;
      color: var(--nova-text);
      border: 1px solid var(--nova-line-hot);
      border-radius: 9px;
      background: rgba(255,255,255,.035);
      cursor: pointer;
      font: 800 10px/1 "Amazon Ember", Inter, sans-serif;
      letter-spacing: .45px;
    }

    .novaThemeStudioClose {
      width: 34px;
      padding: 0;
      font-size: 18px;
    }

    .novaThemeStudioGrid {
      display: grid;
      grid-template-columns: 1.35fr repeat(7, minmax(100px, 1fr));
      gap: 10px;
      margin-top: 13px;
    }

    .novaThemeStudioGrid label {
      min-width: 0;
      padding: 9px;
      border: 1px solid var(--nova-line);
      border-radius: 9px;
      background: rgba(255,255,255,.025);
    }

    .novaThemeStudioGrid label > span {
      display: flex;
      justify-content: space-between;
      margin-bottom: 7px;
      color: var(--nova-muted);
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .7px;
    }

    .novaThemeStudioGrid input[type="color"] {
      width: 100%;
      height: 30px;
      padding: 2px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      cursor: pointer;
    }

    .novaThemeStudioGrid select {
      width: 100%;
      min-height: 30px;
      padding: 0 8px;
      color: var(--nova-text);
      border: 1px solid var(--nova-line);
      border-radius: 7px;
      background: var(--nova-card-deep);
      font: 800 10px/1 "Amazon Ember", Inter, sans-serif;
    }

    .novaThemeRange {
      grid-column: span 2;
    }

    .novaThemeRange input {
      width: 100%;
      accent-color: var(--nova-green);
    }

    .novaThemeRange output {
      color: var(--nova-text);
    }

    .novaThemeStudioActions {
      margin-top: 12px;
      padding-top: 11px;
      border-top: 1px solid var(--nova-line);
    }

    .heroTopPanel.is-light .novaThemeStudio,
    .heroTopPanel.is-light .novaThemeStudioGrid label,
    .heroTopPanel.is-light .novaThemeStudioGrid select,
    .heroTopPanel.is-light .novaThemeStudioClose,
    .heroTopPanel.is-light .novaThemeReset {
      color: var(--nova-text);
      border-color: var(--nova-line);
      background: var(--nova-card);
    }

    @media (max-width: 1700px) {
      .novaThemeStudioGrid {
        grid-template-columns: repeat(4, minmax(130px, 1fr));
      }
      .novaThemeWide { grid-column: span 2; }
    }

    @media (max-width: 950px) {
      .novaThemeStudioGrid {
        grid-template-columns: repeat(2, minmax(130px, 1fr));
      }
      .novaThemeRange,
      .novaThemeWide { grid-column: span 2; }
    }

    @media (max-width: 1500px) {
      .novaPickCard,
      .novaPackCard,
      .novaBridgeCard,
      .novaRunnerCard { grid-column: span 3; }
      .novaSlamCard { grid-column: span 6; }
      .novaPsCard { grid-column: span 8; }
      .novaCategorizeCard { grid-column: span 4; }
    }

    @media (max-width: 1050px) {
      .novaStatusRail { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .novaConsoleGrid { grid-template-columns: repeat(6, minmax(0,1fr)); }
      .novaPickCard,
      .novaPackCard,
      .novaBridgeCard,
      .novaRunnerCard,
      .novaCategorizeCard { grid-column: span 3; }
      .novaSlamCard,
      .novaPsCard { grid-column: span 6; }
      .novaPsLayout { grid-template-columns: 1fr; }
    }

    @media (max-width: 720px) {
      .heroTopHeader { align-items: stretch; flex-direction: column; }
      .heroTopActions { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 37px; }
      .novaStatusRail { grid-template-columns: 1fr; }
      .novaConsoleGrid { grid-template-columns: 1fr; }
      .novaCard { grid-column: 1 !important; }
      .novaSlamMeta,
      .novaRiskFlags,
      .novaDwellGrid { grid-template-columns: 1fr; }
      .novaDataRow { grid-template-columns: minmax(85px,.7fr) minmax(0,1.3fr); }
      .heroHeaderDivider { display: none; }
    }
  `);

})();

/* Integrated lazy Shipment Timeline */

(function () {
  'use strict';

  const PANEL_ID = 'nova-hero-shipment-timeline';
  const STYLE_ID = 'nova-hero-shipment-timeline-style';
  const VERSION = '0.6.0';

  let currentShipmentKey = '';
  let loadSequence = 0;
  let navigationTimer = null;

  function parseHeroUrl(url = location.href) {
    const match = String(url).match(
      /\/fc\/([^/]+)\/(?:pick-events\/)?customer-shipment\/([^/?#]+)/i
    );
    if (!match) return null;

    return {
      fc: decodeURIComponent(match[1]).toUpperCase(),
      shipment: decodeURIComponent(match[2])
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'Unknown time';

    const numeric = Number(timestamp);
    const milliseconds = Number.isFinite(numeric)
      ? (numeric > 10_000_000_000 ? numeric : numeric * 1000)
      : Date.parse(timestamp);

    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return String(timestamp);

    return date.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        timeout: 18000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }

          try {
            resolve(JSON.parse(response.responseText));
          } catch (error) {
            reject(new Error(`Invalid JSON: ${error.message}`));
          }
        },
        onerror() {
          reject(new Error('Network request failed'));
        },
        ontimeout() {
          reject(new Error('Request timed out'));
        }
      });
    });
  }

  function eventTimestamp(event) {
    return Number(event?.timeStamp || event?.timestamp || event?.eventTime || 0);
  }

  function eventType(event) {
    return String(event?.eventType || event?.type || '').trim();
  }

  function detailMessage(payload) {
    if (typeof payload === 'string') return payload;
    return String(
      payload?.eventDetails?.message ??
      payload?.message ??
      payload?.eventDetails ??
      JSON.stringify(payload ?? {})
    );
  }

  function extract(message, patterns) {
    const text = String(message || '');

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }

    return '';
  }

  function parseDetail(type, payload) {
    const message = detailMessage(payload);

    const common = {
      raw: message,
      actor: extract(message, [
        /owner=(.*?)(?:,|}|$)/i,
        /userId[=:]\s*["']?([^,"'}\s]+)/i,
        /associateId[=:]\s*["']?([^,"'}\s]+)/i,
        /login[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      station: extract(message, [
        /locationScannableId=(.*?)(?:,|}|$)/i,
        /Station[=:]\s*["']?([^,"'}\s]+)/i,
        /stationId[=:]\s*["']?([^,"'}\s]+)/i,
        /workstation[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      box: extract(message, [
        /boxRecommendation=(.*?)(?:,|}|$)/i,
        /boxType[=:]\s*["']?([^,"'}\s]+)/i,
        /containerType[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      spoo: extract(message, [
        /\bdata=(sp[A-Z0-9_-]+)(?:,|}|$)/i,
        /\bscannableId=(sp[A-Z0-9_-]+)(?:,|}|$)/i,
        /\b(sp[A-Z0-9_-]{5,})\b/i
      ]),
      errorCode: extract(message, [
        /errorCode[=:]\s*["']?([^,"'}\s]+)/i,
        /exceptionCode[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      defectType: extract(message, [
        /DefectType[=:]\s*["']?([^,"'}\s]+)/i,
        /defectType[=:]\s*["']?([^,"'}\s]+)/i,
        /defect_type[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      defectReason: extract(message, [
        /DefectReasonCode[=:]\s*["']?([^,"'}]*)/i,
        /defectReason[=:]\s*["']?([^,"'}]+)/i,
        /defect_reason[=:]\s*["']?([^,"'}]+)/i,
        /damageReason[=:]\s*["']?([^,"'}]+)/i,
        /problemReason[=:]\s*["']?([^,"'}]+)/i,
        /reasonCode[=:]\s*["']?([^,"'}]+)/i,
        /reasonName[=:]\s*["']?([^,"'}]+)/i,
        /reason[=:]\s*["']?([^,"'}]+)/i
      ]),
      defectProcess: extract(message, [
        /DefectFromProcess[=:]\s*["']?([^,"'}\s]+)/i,
        /defectFromProcess[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      sourceContainer: extract(message, [
        /sourceContainer[=:]\s*["']?([^,"'}\s]+)/i,
        /containerId[=:]\s*["']?([^,"'}\s]+)/i
      ]),
      reason: extract(message, [
        /exceptionRootMessage[=:]\s*["']?([^,"'}]+)/i,
        /errorMessage["'=:\s]+([^"\n}]+)/i,
        /exceptionMessage["'=:\s]+([^"\n}]+)/i,
        /Error Message=(.*?)(?:,|$)/i,
        /description[=:]\s*["']?([^,"'}]+)/i,
        /message[=:]\s*["']?([^,"'}]+)/i
      ])
    };

    if (/ReportDwelling/i.test(type) && !common.actor) {
      common.actor = extract(message, [
        /requestedBy[=:]\s*["']?([^,"'}\s]+)/i,
        /createdBy[=:]\s*["']?([^,"'}\s]+)/i
      ]);
    }

    return common;
  }

  function classify(type) {
    const value = String(type || '');

    if (value === 'CREATE_PACKAGE') return 'pack-start';
    if (value === 'COMPLETE_PACKAGE') return 'pack-complete';
    if (value === 'ReportDwellingInventory') return 'auto-dwell';
    if (value === 'ReportDwellingShipment') return 'manual-dwell';
    if (/PackageShipCompleted/i.test(value)) return 'slam-success';
    if (/PackageShipStarted|SLAM_VALIDATIONS|GET_SHIPPING_LABEL/i.test(value)) return 'slam-attempt';
    if (/unpack|unpackage|remove.*package|delete.*package|package.*removed/i.test(value)) return 'unpack';
    if (/ReportDefect|FAIL_SHIPMENT|Defect|Damage|Mark.*Defective|InventoryDefect/i.test(value)) return 'problem';
    if (/Categorize/i.test(value)) return 'categorize';
    if (/SendRunnerRequest/i.test(value)) return 'runner';
    if (/SHIPMENT_STAGED/i.test(value)) return 'pick';
    if (/cancel/i.test(value)) return 'cancel';
    return 'other';
  }

  function shouldLoadDetail(type) {
    return [
      'pack-start',
      'pack-complete',
      'auto-dwell',
      'manual-dwell',
      'slam-success',
      'slam-attempt',
      'unpack',
      'problem',
      'cancel'
    ].includes(classify(type));
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const result = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;

        try {
          result[index] = await mapper(items[index], index);
        } catch (error) {
          result[index] = { error };
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(limit, items.length || 1) }, worker)
    );

    return result;
  }

  async function enrichEvent(fc, shipment, event, sequence) {
    const type = eventType(event);
    const enriched = {
      source: event,
      type,
      kind: classify(type),
      timestamp: eventTimestamp(event),
      actor: String(
        event?.metaData?.userId ||
        event?.metaData?.login ||
        event?.metaData?.actor ||
        event?.metadata?.userId ||
        event?.metadata?.login ||
        ''
      ).trim(),
      detail: null,
      detailError: ''
    };

    if (!shouldLoadDetail(type) || !event?.requestId || !event?.eventDetailsKey) {
      return enriched;
    }

    const detailUrl =
      `https://hero.eu.picking.aft.a2z.com/api/fcs/${encodeURIComponent(fc)}` +
      `/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipment)}` +
      `/events/id/${encodeURIComponent(event.requestId)}` +
      `/details/key/${encodeURIComponent(event.eventDetailsKey)}`;

    try {
      const payload = await requestJson(detailUrl);
      if (sequence !== loadSequence) return enriched;

      enriched.detail = parseDetail(type, payload);
      if (!enriched.actor && enriched.detail.actor) enriched.actor = enriched.detail.actor;
    } catch (error) {
      enriched.detailError = error.message;
    }

    return enriched;
  }

  function cleanActor(value, options = {}) {
    const actor = String(value || '').trim();
    if (!actor) return '';

    const serviceNames = [
      'SlamComplianceService',
      'AutoDwell',
      'ShipmentComplianceService',
      'PopsService',
      'AFT POPS'
    ];

    if (serviceNames.includes(actor)) return actor;

    if (/^[a-f0-9-]{24,}$/i.test(actor)) {
      return options.allowSystemLabel ? 'System-generated reference' : '';
    }

    return actor;
  }

  function compactReason(detail) {
    if (!detail) return '';
    const defectReason = String(detail.defectReason || '').trim();
    const defectType = String(detail.defectType || '').trim();

    if (defectReason && defectReason !== 'null') return defectReason.replaceAll('_', ' ');
    if (defectType && defectType !== 'null') return defectType.replaceAll('_', ' ');
    if (detail.reason && detail.reason !== 'null') return detail.reason;
    if (detail.errorCode && detail.errorCode !== 'null') return detail.errorCode;
    return '';
  }

  function groupDefinition(kind) {
    const map = {
      pack: {
        id: 'pack',
        order: 10,
        title: 'PACK HISTORY',
        subtitle: 'Create package, complete package, SP00, station, box and associate',
        kinds: ['pack-start', 'pack-complete', 'unpack']
      },
      defect: {
        id: 'defect',
        order: 20,
        title: 'DEFECT HISTORY',
        subtitle: 'Defect type, reporter, process and source container',
        kinds: ['problem']
      },
      dwell: {
        id: 'dwell',
        order: 30,
        title: 'DWELL HISTORY',
        subtitle: 'Automatic and manual dwell actions',
        kinds: ['auto-dwell', 'manual-dwell']
      },
      slam: {
        id: 'slam',
        order: 40,
        title: 'SLAM / KICKOUT HISTORY',
        subtitle: 'Slam attempts, failures and successful completion',
        kinds: ['slam-attempt', 'slam-success']
      },
      pick: {
        id: 'pick',
        order: 50,
        title: 'PICK HISTORY',
        subtitle: 'Pick and shipment-staged events',
        kinds: ['pick']
      },
      categorize: {
        id: 'categorize',
        order: 60,
        title: 'CATEGORIZE HISTORY',
        subtitle: 'POPS categorization events',
        kinds: ['categorize']
      },
      other: {
        id: 'other',
        order: 90,
        title: 'OTHER SHIPMENT EVENTS',
        subtitle: 'Runner, cancellation and remaining relevant events',
        kinds: ['runner', 'cancel', 'other']
      }
    };

    return map[kind];
  }

  function resolveGroup(event) {
    const kind = classify(eventType(event));
    if (['pack-start', 'pack-complete', 'unpack'].includes(kind)) return 'pack';
    if (kind === 'problem') return 'defect';
    if (['auto-dwell', 'manual-dwell'].includes(kind)) return 'dwell';
    if (['slam-attempt', 'slam-success'].includes(kind)) return 'slam';
    if (kind === 'pick') return 'pick';
    if (kind === 'categorize') return 'categorize';
    return 'other';
  }

  function groupEvents(events) {
    const grouped = new Map();

    for (const event of events) {
      const groupId = resolveGroup(event);
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push(event);
    }

    return [...grouped.entries()]
      .map(([id, items]) => ({
        definition: groupDefinition(id),
        events: items.sort((a, b) => eventTimestamp(a) - eventTimestamp(b))
      }))
      .filter(group => group.events.length)
      .sort((a, b) => a.definition.order - b.definition.order);
  }

  function eventLabel(event) {
    const labels = {
      'pack-start': 'CREATE PACKAGE',
      'pack-complete': 'COMPLETE PACKAGE',
      'auto-dwell': 'AUTO DWELL',
      'manual-dwell': 'MANUAL DWELL',
      'slam-attempt': 'SLAM / KICKOUT',
      'slam-success': 'SLAM SUCCESS',
      unpack: 'UNPACK / PACKAGE REMOVED',
      problem: 'DEFECT / PROBLEM',
      categorize: 'CATEGORIZE',
      runner: 'SEND RUNNER',
      pick: 'PICK COMPLETE',
      cancel: 'CANCEL EVENT',
      other: event.type
    };

    return labels[event.kind] || event.type;
  }

  function eventDescription(event) {
    const detail = event.detail || {};
    const actor = cleanActor(event.actor || detail.actor, {
      allowSystemLabel: event.kind !== 'pack-start' && event.kind !== 'pick'
    });
    const reason = compactReason(detail);
    const parts = [];

    if (detail.spoo) parts.push(`SP00 ${detail.spoo}`);
    if (actor) parts.push(`By ${actor}`);
    if (detail.station) parts.push(`Station ${detail.station}`);
    if (detail.box) parts.push(`Box ${detail.box}`);

    if (event.kind === 'problem') {
      if (reason) parts.push(`Defect ${reason}`);
      if (detail.defectProcess) parts.push(`From ${detail.defectProcess}`);
      if (detail.sourceContainer) parts.push(`Container ${detail.sourceContainer}`);
    } else if (reason) {
      parts.push(`Result ${reason}`);
    }

    if (event.detailError) parts.push(`Details unavailable: ${event.detailError}`);
    return parts.join(' • ') || 'No additional detail captured';
  }

  function rawDetailsHtml(event) {
    const raw = String(event.detail?.raw || '').trim();
    if (!raw) return '';

    return `
      <details class="nsm-raw">
        <summary>RAW EVENT DETAILS</summary>
        <pre>${escapeHtml(raw)}</pre>
      </details>
    `;
  }

  function renderEvent(event) {
    return `
      <div class="nsm-event nsm-kind-${escapeHtml(event.kind)}">
        <div class="nsm-event-dot"></div>
        <div class="nsm-event-main">
          <div class="nsm-event-top">
            <strong>${escapeHtml(eventLabel(event))}</strong>
            <time>${escapeHtml(formatTime(event.timestamp))}</time>
          </div>
          <div class="nsm-event-detail">${escapeHtml(eventDescription(event))}</div>
          ${rawDetailsHtml(event)}
        </div>
      </div>
    `;
  }

  function renderGroupShell(group) {
    const { definition, events } = group;
    return `
      <article class="nsm-group" data-group-id="${escapeHtml(definition.id)}" data-loaded="false">
        <header class="nsm-group-head">
          <div class="nsm-group-title">
            <span>${escapeHtml(definition.title)}</span>
            <strong>${events.length} EVENT${events.length === 1 ? '' : 'S'}</strong>
            <small>${escapeHtml(definition.subtitle)}</small>
          </div>
          <button type="button" class="nsm-group-toggle" title="Open group">+</button>
        </header>
        <div class="nsm-group-body" hidden>
          <div class="nsm-status">Open this group to read its event details.</div>
        </div>
      </article>
    `;
  }

  async function loadGroup(panel, groupElement) {
    if (!panel || !groupElement) return;

    const groupId = groupElement.dataset.groupId;
    const body = groupElement.querySelector('.nsm-group-body');
    const toggle = groupElement.querySelector('.nsm-group-toggle');
    const state = panel.__nsmState;
    if (!state) return;

    const isOpen = !body.hidden;
    if (isOpen) {
      body.hidden = true;
      toggle.textContent = '+';
      toggle.title = 'Open group';
      return;
    }

    body.hidden = false;
    toggle.textContent = '−';
    toggle.title = 'Close group';

    if (groupElement.dataset.loaded === 'true') return;
    if (groupElement.dataset.loading === 'true') return;

    groupElement.dataset.loading = 'true';
    body.innerHTML = '<div class="nsm-status">Reading event details for this group…</div>';

    const group = state.groups.find(item => item.definition.id === groupId);
    if (!group) {
      body.innerHTML = '<div class="nsm-status">Group data is unavailable.</div>';
      return;
    }

    const sequence = state.sequence;
    const detailed = await mapWithConcurrency(
      group.events,
      4,
      (sourceEvent) => enrichEvent(state.fc, state.shipment, sourceEvent, sequence)
    );

    if (sequence !== loadSequence) return;

    const safeDetailed = detailed.map((event, index) => {
      if (!event?.error) return event;

      const sourceEvent = group.events[index];
      return {
        source: sourceEvent,
        type: eventType(sourceEvent),
        kind: classify(eventType(sourceEvent)),
        timestamp: eventTimestamp(sourceEvent),
        actor: '',
        detail: null,
        detailError: event.error?.message || 'Details unavailable'
      };
    });

    body.innerHTML = `
      <div class="nsm-timeline">
        ${safeDetailed.map(renderEvent).join('')}
      </div>
      <div class="nsm-group-foot">
        ${safeDetailed.length} event${safeDetailed.length === 1 ? '' : 's'} loaded on demand
      </div>
    `;

    groupElement.dataset.loaded = 'true';
    groupElement.dataset.loading = 'false';
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        --nsm-bg: rgba(3, 10, 8, .97);
        --nsm-panel: rgba(9, 24, 18, .96);
        --nsm-card: rgba(14, 35, 27, .94);
        --nsm-line: rgba(82, 255, 170, .25);
        --nsm-hot: #59ffb1;
        --nsm-cyan: #5cc8ff;
        --nsm-orange: #ffb454;
        --nsm-red: #ff637b;
        --nsm-text: #effff7;
        --nsm-muted: #94b9a8;

        position: relative;
        z-index: 50;
        width: calc(100% - 28px);
        margin: 12px 14px 0;
        color: var(--nsm-text);
        border: 1px solid var(--nsm-line);
        border-radius: 14px;
        background:
          radial-gradient(circle at 10% -20%, rgba(89, 255, 177, .13), transparent 35%),
          linear-gradient(145deg, var(--nsm-bg), rgba(4, 14, 22, .98));
        box-shadow: 0 16px 42px rgba(0,0,0,.42);
        font-family: "Amazon Ember", Inter, Arial, sans-serif;
        overflow: hidden;
      }

      #${PANEL_ID} * { box-sizing: border-box; }

      .heroTopPanel.is-light #${PANEL_ID} {
        --nsm-bg: rgba(190, 209, 201, .48);
        --nsm-panel: rgba(210, 224, 218, .52);
        --nsm-card: rgba(222, 233, 228, .50);
        --nsm-line: rgba(12, 105, 67, .30);
        --nsm-text: #10231a;
        --nsm-muted: #466156;
        background:
          radial-gradient(circle at 10% -20%, rgba(20, 133, 86, .10), transparent 35%),
          linear-gradient(145deg, rgba(210,225,218,.48), rgba(174,199,188,.42));
      }

      .heroTopPanel.is-light #${PANEL_ID} .nsm-event-detail,
      .heroTopPanel.is-light #${PANEL_ID} .nsm-raw pre {
        color: #29483a;
      }

      #${PANEL_ID} .nsm-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        min-height: 64px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--nsm-line);
        background: rgba(11, 30, 23, .86);
      }

      #${PANEL_ID} .nsm-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      #${PANEL_ID} .nsm-logo {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        border: 1px solid rgba(89,255,177,.52);
        border-radius: 11px;
        color: #07120d;
        background: linear-gradient(145deg, #9fffd2, #25af72);
        box-shadow: 0 0 18px rgba(89,255,177,.24);
        font-size: 21px;
        font-weight: 1000;
        font-style: italic;
      }

      #${PANEL_ID} .nsm-title strong {
        display: block;
        font-size: 14px;
        letter-spacing: .8px;
      }

      #${PANEL_ID} .nsm-title span {
        display: block;
        margin-top: 4px;
        color: var(--nsm-muted);
        font-size: 10px;
        letter-spacing: .45px;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .nsm-actions {
        display: flex;
        gap: 8px;
      }

      #${PANEL_ID} button {
        min-height: 34px;
        padding: 0 12px;
        color: var(--nsm-text);
        border: 1px solid var(--nsm-line);
        border-radius: 9px;
        background: rgba(255,255,255,.035);
        cursor: pointer;
        font: 900 10px/1 "Amazon Ember", Inter, Arial, sans-serif;
        letter-spacing: .5px;
      }

      #${PANEL_ID} button:hover {
        border-color: rgba(89,255,177,.62);
        background: rgba(89,255,177,.09);
      }

      #${PANEL_ID} .nsm-body {
        padding: 14px;
      }

      #${PANEL_ID}.is-collapsed .nsm-body {
        display: none;
      }

      #${PANEL_ID} .nsm-status {
        padding: 16px;
        border: 1px dashed var(--nsm-line);
        border-radius: 11px;
        color: var(--nsm-muted);
        background: rgba(255,255,255,.02);
        text-align: center;
        font-size: 12px;
      }

      #${PANEL_ID} .nsm-group {
        margin-top: 10px;
        border: 1px solid var(--nsm-line);
        border-radius: 12px;
        background: var(--nsm-card);
        overflow: hidden;
      }

      #${PANEL_ID} .nsm-group:first-child {
        margin-top: 0;
      }

      #${PANEL_ID} .nsm-group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        background: rgba(255,255,255,.025);
      }

      #${PANEL_ID} .nsm-group-title {
        min-width: 0;
      }

      #${PANEL_ID} .nsm-group-title span {
        color: var(--nsm-cyan);
        font-size: 9px;
        font-weight: 1000;
        letter-spacing: .75px;
      }

      #${PANEL_ID} .nsm-group-title strong {
        margin-left: 9px;
        font-size: 10px;
        letter-spacing: .55px;
      }

      #${PANEL_ID} .nsm-group-title small {
        display: block;
        margin-top: 4px;
        color: var(--nsm-muted);
        font-size: 9px;
      }

      #${PANEL_ID} .nsm-group-body {
        padding: 12px;
        border-top: 1px solid var(--nsm-line);
      }

      #${PANEL_ID} .nsm-group-foot {
        margin-top: 10px;
        color: var(--nsm-muted);
        font-size: 9px;
        text-align: right;
      }

      #${PANEL_ID} .nsm-timeline {
        position: relative;
        padding-left: 10px;
      }

      #${PANEL_ID} .nsm-timeline::before {
        content: "";
        position: absolute;
        top: 8px;
        bottom: 8px;
        left: 15px;
        width: 1px;
        background: var(--nsm-line);
      }

      #${PANEL_ID} .nsm-event {
        position: relative;
        display: flex;
        gap: 12px;
        padding: 7px 0;
      }

      #${PANEL_ID} .nsm-event-dot {
        position: relative;
        z-index: 1;
        width: 11px;
        height: 11px;
        flex: 0 0 11px;
        margin-top: 3px;
        border: 2px solid var(--nsm-card);
        border-radius: 50%;
        background: var(--nsm-cyan);
        box-shadow: 0 0 9px rgba(92,200,255,.4);
      }

      #${PANEL_ID} .nsm-kind-auto-dwell .nsm-event-dot,
      #${PANEL_ID} .nsm-kind-manual-dwell .nsm-event-dot {
        background: var(--nsm-orange);
        box-shadow: 0 0 9px rgba(255,180,84,.38);
      }

      #${PANEL_ID} .nsm-kind-problem .nsm-event-dot,
      #${PANEL_ID} .nsm-kind-slam-attempt .nsm-event-dot {
        background: var(--nsm-red);
        box-shadow: 0 0 9px rgba(255,99,123,.38);
      }

      #${PANEL_ID} .nsm-kind-slam-success .nsm-event-dot,
      #${PANEL_ID} .nsm-kind-pack-complete .nsm-event-dot {
        background: var(--nsm-hot);
        box-shadow: 0 0 9px rgba(89,255,177,.38);
      }

      #${PANEL_ID} .nsm-event-main {
        min-width: 0;
        flex: 1;
      }

      #${PANEL_ID} .nsm-event-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      #${PANEL_ID} .nsm-event-top strong {
        font-size: 10px;
        letter-spacing: .45px;
      }

      #${PANEL_ID} .nsm-event-top time {
        color: var(--nsm-muted);
        font-size: 9px;
        white-space: nowrap;
      }

      #${PANEL_ID} .nsm-kind-problem .nsm-event-detail {
        color: #ffb1bd;
        font-weight: 700;
      }

      #${PANEL_ID} .nsm-event-detail {
        margin-top: 3px;
        color: #c5ddd2;
        font-size: 10px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .nsm-raw {
        margin-top: 7px;
        border: 1px solid rgba(255,255,255,.055);
        border-radius: 7px;
        background: rgba(0,0,0,.12);
      }

      #${PANEL_ID} .nsm-raw summary {
        padding: 7px 9px;
        color: var(--nsm-muted);
        cursor: pointer;
        font-size: 8px;
        font-weight: 1000;
        letter-spacing: .7px;
      }

      #${PANEL_ID} .nsm-raw pre {
        max-height: 220px;
        margin: 0;
        padding: 9px;
        overflow: auto;
        border-top: 1px solid rgba(255,255,255,.05);
        color: #c6ddd3;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font: 9px/1.45 Consolas, "Courier New", monospace;
      }

      #${PANEL_ID} .nsm-debug-note {
        margin-top: 12px;
        color: var(--nsm-muted);
        font-size: 9px;
        text-align: right;
      }
    `;

    document.head.appendChild(style);
  }

  function createPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    injectStyle();

    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <header class="nsm-head">
        <div class="nsm-brand">
          <div class="nsm-logo">N</div>
          <div class="nsm-title">
            <strong>NOVA // SHIPMENT TIMELINE</strong>
            <span class="nsm-subtitle">Waiting for a HERO customer-shipment page…</span>
          </div>
        </div>

        <div class="nsm-actions">
          <button type="button" class="nsm-refresh">↻ REFRESH TIMELINE</button>
          <button type="button" class="nsm-collapse" title="Minimise">−</button>
        </div>
      </header>

      <div class="nsm-body">
        <div class="nsm-status">Open a HERO shipment to reconstruct its timeline.</div>
      </div>
    `;

    const heroPanel = document.getElementById('hero-tooltips-top-panel');
    const statusRail = heroPanel?.querySelector('.novaStatusRail');

    if (statusRail) statusRail.insertAdjacentElement('afterend', panel);
    else if (heroPanel) heroPanel.appendChild(panel);
    else document.body.insertAdjacentElement('afterbegin', panel);

    panel.style.display = 'none';

    panel.querySelector('.nsm-refresh').addEventListener('click', () => loadCurrent(true));

    panel.querySelector('.nsm-collapse').addEventListener('click', event => {
      panel.classList.toggle('is-collapsed');
      event.currentTarget.textContent = panel.classList.contains('is-collapsed') ? '+' : '−';
    });

    panel.addEventListener('click', event => {
      const toggle = event.target.closest('.nsm-group-toggle');
      if (!toggle) return;
      loadGroup(panel, toggle.closest('.nsm-group'));
    });

    return panel;
  }

  function setStatus(message, isError = false) {
    const panel = createPanel();
    const body = panel.querySelector('.nsm-body');
    body.innerHTML = `
      <div class="nsm-status" ${isError ? 'style="color:#ff9aaa;border-color:rgba(255,99,123,.4)"' : ''}>
        ${escapeHtml(message)}
      </div>
    `;
  }

  async function loadCurrent(force = false) {
    const parsed = parseHeroUrl();
    const panel = createPanel();

    if (!parsed) {
      currentShipmentKey = '';
      panel.querySelector('.nsm-subtitle').textContent =
        'Waiting for a HERO customer-shipment page…';
      setStatus('Open a HERO customer shipment to reconstruct its timeline.');
      return;
    }

    const key = `${parsed.fc}:${parsed.shipment}`;
    if (!force && key === currentShipmentKey) return;

    currentShipmentKey = key;
    const sequence = ++loadSequence;

    panel.querySelector('.nsm-subtitle').textContent =
      `${parsed.fc} // ${parsed.shipment} // LAZY TIMELINE v${VERSION}`;

    setStatus('Reading the lightweight HERO event index…');

    const eventsUrl =
      `https://hero.eu.picking.aft.a2z.com/api/fcs/${encodeURIComponent(parsed.fc)}` +
      `/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(parsed.shipment)}/events`;

    try {
      const payload = await requestJson(eventsUrl);
      if (sequence !== loadSequence) return;

      const sourceEvents = Array.isArray(payload?.EventList) ? payload.EventList : [];
      if (!sourceEvents.length) {
        setStatus('HERO returned no shipment events.');
        return;
      }

      const relevant = sourceEvents.filter(event => classify(eventType(event)) !== 'other');
      const groups = groupEvents(relevant);

      panel.__nsmState = {
        fc: parsed.fc,
        shipment: parsed.shipment,
        sequence,
        sourceEvents,
        groups
      };

      panel.querySelector('.nsm-body').innerHTML = `
        ${groups.map(renderGroupShell).join('')}
        <div class="nsm-debug-note">
          ${sourceEvents.length} total HERO events • ${relevant.length} relevant events • ${groups.length} lazy groups
        </div>
      `;
    } catch (error) {
      if (sequence !== loadSequence) return;
      console.error('[Nova Shipment Timeline] Load failed', error);
      setStatus(`Could not read shipment timeline: ${error.message}`, true);
    }
  }

  function scheduleNavigationCheck() {
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(() => {
      currentShipmentKey = '';
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;

      panel.__nsmState = null;
      panel.querySelector('.nsm-subtitle').textContent =
        'Shipment changed — open Timeline to read the new event index.';
      panel.querySelector('.nsm-body').innerHTML =
        '<div class="nsm-status">Timeline is idle. Open it when needed.</div>';

      if (panel.style.display !== 'none') loadCurrent(true);
    }, 120);
  }

  function installNavigationWatcher() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      scheduleNavigationCheck();
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleNavigationCheck();
      return result;
    };

    window.addEventListener('popstate', scheduleNavigationCheck);
    window.addEventListener('hashchange', scheduleNavigationCheck);

    let lastHref = location.href;
    setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      scheduleNavigationCheck();
    }, 750);
  }

  installNavigationWatcher();

  window.NovaHeroTimeline = {
    version: VERSION,

    async toggle() {
      const panel = createPanel();
      const isHidden = panel.style.display === 'none';

      if (isHidden) {
        panel.style.display = 'block';
        await loadCurrent(false);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }

      panel.style.display = 'none';
      return false;
    },

    async refreshIfOpen() {
      const panel = document.getElementById(PANEL_ID);
      if (panel && panel.style.display !== 'none') {
        await loadCurrent(true);
      }
    },

    close() {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = 'none';
      return false;
    }
  };

  console.log('[Nova Shipment Timeline] Integrated API ready', VERSION);
})();
