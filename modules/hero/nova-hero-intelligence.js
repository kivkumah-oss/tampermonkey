// modules/hero/nova-hero-intelligence.js
(function () {
  'use strict';

  const MODULE_ID = 'nova-hero-intelligence';
  const MODULE_VERSION = '0.1.0';
  const PANEL_ID = 'hero-tooltips-top-panel';
  const STYLE_ID = 'nova-hero-intelligence-style';

  if (window.NovaHeroIntelligence) {
    if (typeof window.NovaHeroIntelligence.show === 'function') {
      window.NovaHeroIntelligence.show();
    }
    return;
  }

  class NovaDomCollection {
    constructor(nodes) {
      this.nodes = Array.from(nodes || []).filter(Boolean);
      this.length = this.nodes.length;
    }

    text(value) {
      if (value === undefined) return this.nodes[0]?.textContent || '';
      this.nodes.forEach((node) => { node.textContent = String(value ?? ''); });
      return this;
    }

    html(value) {
      if (value === undefined) return this.nodes[0]?.innerHTML || '';
      this.nodes.forEach((node) => { node.innerHTML = String(value ?? ''); });
      return this;
    }

    prop(name, value) {
      if (value === undefined) return this.nodes[0]?.[name];
      this.nodes.forEach((node) => { node[name] = value; });
      return this;
    }

    addClass(...names) {
      const tokens = names.flatMap((name) => String(name || '').split(/\s+/)).filter(Boolean);
      this.nodes.forEach((node) => node.classList?.add(...tokens));
      return this;
    }

    removeClass(...names) {
      const tokens = names.flatMap((name) => String(name || '').split(/\s+/)).filter(Boolean);
      this.nodes.forEach((node) => node.classList?.remove(...tokens));
      return this;
    }

    toggleClass(name, force) {
      const token = String(name || '').trim();
      if (!token) return this;
      this.nodes.forEach((node) => {
        if (!node.classList) return;
        if (force === undefined) node.classList.toggle(token);
        else node.classList.toggle(token, Boolean(force));
      });
      return this;
    }

    attr(name, value) {
      if (value === undefined) return this.nodes[0]?.getAttribute?.(name);
      this.nodes.forEach((node) => node.setAttribute?.(name, String(value)));
      return this;
    }

    ready(callback) {
      if (typeof callback !== 'function') return this;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
      } else {
        callback();
      }
      return this;
    }
  }

  function $(selector) {
    if (selector instanceof NovaDomCollection) return selector;
    if (typeof selector === 'function') return new NovaDomCollection([document]).ready(selector);
    if (typeof selector === 'string') return new NovaDomCollection(document.querySelectorAll(selector));
    if (selector && typeof selector.length === 'number' && !selector.nodeType && selector !== window) {
      return new NovaDomCollection(selector);
    }
    return new NovaDomCollection(selector ? [selector] : []);
  }

  function addStyle(cssText) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = String(cssText || '');
    return style;
  }

  function isHeroHost() {
    return /^hero\.[^.]+\.picking\.aft\.a2z\.com$/i.test(location.hostname);
  }

  if (!isHeroHost()) return;

  var _region, _fcname, _CustomerShipment;
  var bridgingReason = "No bridging reason detected";

  function parseHeroUrl(url) {
    let m = url.match(/https:\/\/hero\.([^.]+)\.picking\.aft\.a2z\.com\/fc\/([^/]+)\/pick-events\/customer-shipment\/([^/?#]+)/i);
    if (m) return { region: m[1], fc: m[2], shipment: m[3] };

    m = url.match(/https:\/\/hero\.([^.]+)\.picking\.aft\.a2z\.com\/fc\/([^/]+)\/.*customer-shipment\/([^/?#]+)/i);
    if (m) return { region: m[1], fc: m[2], shipment: m[3] };

    return null;
  }

  function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString('en-GB', { timeZone: 'Europe/London' });
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
    if (!document.getElementById(PANEL_ID)) return;

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
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const shipment = _CustomerShipment || '—';
    const shipmentElement = panel.querySelector('.heroTopShipment');
    const fcElement = panel.querySelector('.heroTopFc');

    if (shipmentElement) shipmentElement.textContent = shipment;
    if (fcElement) fcElement.textContent = _fcname || '—';
  }

  function refreshData() {
    if (!_CustomerShipment || !_fcname) return;

    const panel = document.getElementById(PANEL_ID);
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

    getDatas(_CustomerShipment);
    fetchTicket(_CustomerShipment);
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
              <strong>NOVA // HERO INTELLIGENCE <em class="heroModuleBadge">BOOTSTRAP MODULE</em></strong>
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
            <button type="button" class="heroCopyShipment" title="Copy shipment ID">COPY ID</button>
            <button type="button" class="heroTopRefresh" title="Refresh HERO data">↻ REFRESH</button>
            <button type="button" class="heroTopCollapse" title="Minimise console">−</button>
          </div>
        </header>

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
    if (document.getElementById(PANEL_ID)) return;

    document.body.insertAdjacentHTML('afterbegin', renderTopPanelHtml());
    const panel = document.getElementById(PANEL_ID);
    const state = loadUiState();

    if (state.panelCollapsed) panel.classList.add('is-collapsed');

    panel.querySelectorAll('.novaCard').forEach(card => {
      const cardId = card.dataset.cardId;
      if (state.cards?.[cardId]) {
        card.classList.add('is-card-collapsed');
        const button = card.querySelector('.novaCardToggle');
        if (button) button.textContent = '+';
      }
    });

    const topToggle = panel.querySelector('.heroTopCollapse');
    if (topToggle && state.panelCollapsed) topToggle.textContent = '+';

    panel.addEventListener('click', async event => {
      const stage = event.target.closest('.novaStage');
      if (stage) {
        const targetId = stage.dataset.stage === 'dwell' ? 'ps' : stage.dataset.stage;
        const target = panel.querySelector(`.novaCard[data-card-id="${targetId}"]`);
        if (target) {
          target.classList.remove('is-card-collapsed');
          const toggle = target.querySelector('.novaCardToggle');
          if (toggle) toggle.textContent = '−';
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.remove('nova-stage-focus');
          void target.offsetWidth;
          target.classList.add('nova-stage-focus');
          setTimeout(() => target.classList.remove('nova-stage-focus'), 1400);
        }
        return;
      }

      const refresh = event.target.closest('.heroTopRefresh');
      if (refresh) {
        refreshData();
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

    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = false;

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

  function fetchTicket(shipment) {
    const rodeoUrl = `https://rodeo-dub.amazon.com/${encodeURIComponent(_fcname)}/Search?_enabledColumns=on&enabledColumns=ASIN_TITLES&enabledColumns=OUTER_CONTAINER_TYPE&enabledColumns=OUTER_SCANNABLE_ID&searchKey=${encodeURIComponent(shipment)}`;
    $('.BridgingTT').html(`<a target="_blank" rel="noopener noreferrer" href="${rodeoUrl}">OPEN RODEO</a>`);
  }

  async function getDatas(shipment) {
    try {
      const response = await fetch(
        `/api/fcs/${encodeURIComponent(_fcname)}/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipment)}/events`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error(`HERO events HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.EventList) throw new Error('HERO EventList missing');

      const seen = {};

      for (let i = data.EventList.length - 1; i >= 0; i--) {
        const e = data.EventList[i];
        const type = e.eventType;
        const ts = e.timeStamp;

        if (type === 'SHIPMENT_STAGED' && !seen.SHIPMENT_STAGED) {
          $('.PickEventName').text('PICK_COMPLETE');
          $('.PickEventTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.SHIPMENT_STAGED = true;
        }

        if (type === 'CREATE_PACKAGE' && !seen.CREATE_PACKAGE) {
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.CREATE_PACKAGE = true;
        }

        if (type === 'COMPLETE_PACKAGE' && !seen.COMPLETE_PACKAGE) {
          $('.PackEventName').text('COMPLETE_PACKAGE');
          $('.packEventTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.COMPLETE_PACKAGE = true;
        }

        if (type === 'SLAM_VALIDATIONS_CACHING_PROCESSING_FAILURE' && !seen.SLAM_FAILURE) {
          $('.KOEventName').text('SLAM_VALIDATIONS_FAILURE');
          $('.KOEventTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.SLAM_FAILURE = true;
        }

        if ((type === 'PackageShipStarted' || type === 'PackageShipCompleted') && !seen.PACKAGE_SHIP) {
          $('.KOEventName').text(type === 'PackageShipCompleted' ? 'SLAM_SUCCESS' : 'SLAM_KICKOUT');
          $('.KOEventTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.PACKAGE_SHIP = true;
        }

        if (type === 'GET_SHIPPING_LABEL_REALTIME_CALL_FAILURE' && !seen.GET_LABEL_FAILURE) {
          $('.KOEventName').text('GET_SHIPPING_LABEL_FAILURE');
          $('.KOEventTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.GET_LABEL_FAILURE = true;
        }

        if ((type === 'ReportDefect' || type === 'FAIL_SHIPMENT') && !seen.PROBLEM) {
          $('.time').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.PROBLEM = true;
        }

        if (type === 'Categorize' && !seen.CATEGORIZE) {
          $('.CatEventTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          seen.CATEGORIZE = true;
        }

        if (type === 'SendRunnerRequest' && !seen.SENDRUNNER) {
          $('.SRTime').text(formatTime(ts));
          getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
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
            getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          }

          seen.AUTO_DWELL = true;
        }

        if (type === 'ReportDwellingShipment' && !seen.MANUAL_DWELL) {
          $('.manualDwelled').text('YES').addClass('is-yes');
          $('.manualDwellTime').text(formatTime(ts));

          const actor = String(e.metaData?.userId || '').trim();
          setDwellActor('manual', actor);
          if (!actor && e.requestId && e.eventDetailsKey) {
            getEventDetail(type, shipment, e.requestId, e.eventDetailsKey);
          }

          seen.MANUAL_DWELL = true;
        }
      }

      updateStatusRail();
      document.getElementById(PANEL_ID)?.classList.remove('is-loading');
    } catch (error) {
      console.error('[Nova HERO] Failed to read HERO events', error);
      document.getElementById(PANEL_ID)?.classList.remove('is-loading');
      $('.BridgingTT').text($('.BridgingTT').text() || 'HERO read failed');
    }
  }

  async function getEventDetail(type, shipment, reqId, key) {
    if (!reqId || !key) return;

    try {
      const response = await fetch(
        `/api/fcs/${encodeURIComponent(_fcname)}/entities/type/CUSTOMER_SHIPMENT/id/${encodeURIComponent(shipment)}/events/id/${encodeURIComponent(reqId)}/details/key/${encodeURIComponent(key)}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error(`HERO event details HTTP ${response.status}`);
      }

      const json = await response.json();
      let msg = json?.eventDetails?.message || JSON.stringify(json);

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
            $('.ASIN').html(`<a target="_blank" href="http://fcresearch-eu.aka.amazon.com/${_fcname}/results?s=${encodeURIComponent(asin)}">${asin}</a>`);
          }
          if (tote) {
            $('.pickTote').html(`<a target="_blank" href="http://fcresearch-eu.aka.amazon.com/${_fcname}/results?s=${encodeURIComponent(tote)}">${tote}</a>`);
          }
          break;
        }

        case 'CREATE_PACKAGE': {
          const aa = extract(/owner=(.*?),/);
          const station = extract(/locationScannableId=(.*?),/);
          const box = extract(/boxRecommendation=(.*?),/);

          if (aa) {
            $('.packAA').html(`<a target="_blank" href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId=${_fcname}&employeeId=${encodeURIComponent(aa)}">${aa}</a>`);
          }
          if (station) $('.packStation').text(station);
          if (box) $('.boxRec').text(box);
          break;
        }

        case 'COMPLETE_PACKAGE': {
          const spoo = extract(/data=(.*?),/);
          if (spoo) {
            $('.Spoo').html(`<a target="_blank" href="http://fcresearch-eu.aka.amazon.com/${_fcname}/results?s=${encodeURIComponent(spoo)}">${spoo}</a>`);
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
    } catch (error) {
      console.warn('[Nova HERO] Event detail read failed', type, error);
    }
  }

  let routeTimer = null;
  let lastHref = location.href;

  function startRouteWatch() {
    if (routeTimer) return;
    routeTimer = setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      injectPanel();
    }, 500);
  }

  function stopRouteWatch() {
    if (!routeTimer) return;
    clearInterval(routeTimer);
    routeTimer = null;
  }

  function show() {
    ensureTopPanelExists();
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = false;
    injectPanel();
    startRouteWatch();
    return true;
  }

  function hide() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = true;
    return true;
  }

  function destroy() {
    stopRouteWatch();
    statusObserver?.disconnect();
    statusObserver = null;
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    return true;
  }

  function refresh() {
    injectPanel();
    return true;
  }

  function getStatus() {
    return {
      id: MODULE_ID,
      version: MODULE_VERSION,
      active: Boolean(document.getElementById(PANEL_ID)),
      visible: Boolean(document.getElementById(PANEL_ID) && !document.getElementById(PANEL_ID).hidden),
      fc: _fcname || null,
      shipment: _CustomerShipment || null,
      href: location.href
    };
  }

  window.NovaHeroIntelligence = {
    id: MODULE_ID,
    version: MODULE_VERSION,
    show,
    hide,
    destroy,
    refresh,
    getStatus
  };

  addStyle(`
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

    #hero-tooltips-top-panel[hidden] {
      display: none !important;
    }

    #hero-tooltips-top-panel .heroModuleBadge {
      margin-left: 8px;
      padding: 3px 7px;
      display: inline-flex;
      vertical-align: middle;
      border: 1px solid rgba(89,255,177,.34);
      border-radius: 999px;
      color: var(--nova-green);
      background: rgba(89,255,177,.08);
      font-style: normal;
      font-size: 8px;
      letter-spacing: .85px;
    }

    #hero-tooltips-top-panel .novaStage {
      cursor: pointer;
      user-select: none;
    }

    #hero-tooltips-top-panel .novaStage:hover {
      transform: translateY(-1px);
      filter: brightness(1.10);
    }

    #hero-tooltips-top-panel .novaCard.nova-stage-focus {
      animation: novaHeroStageFocus 1.35s ease;
    }

    @keyframes novaHeroStageFocus {
      0%, 100% {
        box-shadow: 0 10px 26px rgba(0,0,0,.30);
      }
      30%, 65% {
        box-shadow:
          0 0 0 2px rgba(89,255,177,.85),
          0 0 34px rgba(89,255,177,.42),
          0 16px 38px rgba(0,0,0,.42);
      }
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
        linear-gradient(145deg, var(--nova-bg-0), var(--nova-bg-1) 58%, #050b12);
      border-bottom: 1px solid var(--nova-line-hot);
      box-shadow: 0 14px 40px rgba(0,0,0,.38);
      font-family: "Amazon Ember", Inter, "Segoe UI", Arial, sans-serif;
    }

    .heroTopPanel::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: .23;
      background-image:
        linear-gradient(rgba(89,255,177,.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(89,255,177,.04) 1px, transparent 1px);
      background-size: 28px 28px;
      mask-image: linear-gradient(to bottom, black, transparent 78%);
    }

    .heroTopPanel::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      z-index: 5;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--nova-green), var(--nova-blue), transparent);
      box-shadow: 0 0 18px var(--nova-green);
    }

    .heroTopPanel.is-loading .heroLiveDot {
      background: var(--nova-orange);
      box-shadow: 0 0 12px var(--nova-orange);
    }

    .heroTopPanel.is-collapsed .novaStatusRail,
    .heroTopPanel.is-collapsed .heroTopContent {
      display: none;
    }

    .heroTopHeader,
    .novaStatusRail,
    .heroTopContent {
      position: relative;
      z-index: 1;
    }

    .heroTopHeader {
      min-height: 68px;
      padding: 11px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      border-bottom: 1px solid var(--nova-line);
      background: rgba(4,10,16,.74);
      backdrop-filter: blur(13px);
    }

    .heroTopBrand {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .heroTopLogo {
      width: 43px;
      height: 43px;
      flex: 0 0 43px;
      display: grid;
      place-items: center;
      border: 1px solid var(--nova-line-hot);
      border-radius: 12px;
      color: #03110a;
      background: linear-gradient(145deg, #9cffcf, var(--nova-green-dark));
      box-shadow:
        0 0 0 3px rgba(89,255,177,.07),
        0 0 26px rgba(89,255,177,.22);
      font-size: 21px;
      font-weight: 1000;
      transform: skew(-4deg);
    }

    .heroTopTitle {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .heroTopTitle strong {
      color: var(--nova-text);
      font-size: 15px;
      letter-spacing: 1px;
    }

    .heroTopSub {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      color: var(--nova-muted);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .7px;
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
      box-shadow: 0 0 11px var(--nova-green);
      animation: novaHeroPulse 1.8s ease-in-out infinite;
    }

    @keyframes novaHeroPulse {
      0%, 100% { opacity: .42; transform: scale(.77); }
      50% { opacity: 1; transform: scale(1.13); }
    }

    .heroTopActions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .heroTopPanel button {
      min-height: 36px;
      padding: 8px 12px;
      border: 1px solid rgba(89,255,177,.45);
      border-radius: 9px;
      color: #04120b;
      background: linear-gradient(135deg, #85ffc2, var(--nova-green-dark));
      box-shadow: 0 7px 18px rgba(37,202,124,.15);
      cursor: pointer;
      font-size: 10px;
      font-weight: 1000;
      letter-spacing: .55px;
      transition: transform .15s ease, filter .15s ease, border-color .15s ease;
    }

    .heroTopPanel button:hover:not(:disabled) {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    .heroTopPanel button:disabled {
      cursor: not-allowed;
      filter: grayscale(.8);
      opacity: .38;
      transform: none;
    }

    .heroTopCollapse,
    .novaCardToggle {
      width: 36px;
      padding: 0 !important;
      color: var(--nova-text) !important;
      background: rgba(255,255,255,.055) !important;
      border-color: rgba(255,255,255,.15) !important;
      box-shadow: none !important;
    }

    .novaStatusRail {
      padding: 9px 18px;
      display: grid;
      grid-template-columns: repeat(5, minmax(0,1fr));
      gap: 7px;
      border-bottom: 1px solid var(--nova-line);
      background: rgba(3,8,13,.66);
    }

    .novaStage {
      position: relative;
      overflow: hidden;
      min-height: 39px;
      padding: 7px 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
      border: 1px solid rgba(255,255,255,.095);
      border-radius: 8px;
      background: rgba(255,255,255,.027);
    }

    .novaStage::before {
      content: "";
      position: absolute;
      inset: auto 0 0;
      height: 2px;
      background: var(--stage-colour, rgba(255,255,255,.17));
      box-shadow: 0 0 13px var(--stage-colour, transparent);
    }

    .novaStage span {
      color: var(--nova-muted);
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .72px;
    }

    .novaStage b {
      color: var(--stage-colour, var(--nova-muted));
      font-size: 9px;
      letter-spacing: .55px;
    }

    .novaStage[data-state="success"] { --stage-colour: var(--nova-green); background: rgba(89,255,177,.055); }
    .novaStage[data-state="info"] { --stage-colour: var(--nova-blue); background: rgba(92,168,255,.055); }
    .novaStage[data-state="warning"] { --stage-colour: var(--nova-orange); background: rgba(255,189,89,.065); }
    .novaStage[data-state="danger"] { --stage-colour: var(--nova-red); background: rgba(255,100,120,.09); animation: novaDangerStage 1.3s ease-in-out infinite; }

    @keyframes novaDangerStage {
      0%, 100% { border-color: rgba(255,100,120,.22); }
      50% { border-color: rgba(255,100,120,.68); box-shadow: 0 0 17px rgba(255,100,120,.15); }
    }

    .heroTopContent {
      padding: 12px 18px 18px;
    }

    .novaConsoleGrid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0,1fr));
      gap: 10px;
    }

    .novaCard {
      --card-colour: var(--nova-green);
      position: relative;
      overflow: hidden;
      min-width: 0;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 11px;
      background: linear-gradient(155deg, var(--nova-card), var(--nova-card-deep));
      box-shadow: 0 10px 26px rgba(0,0,0,.27);
    }

    .novaCard::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: var(--card-colour);
      box-shadow: 0 0 15px var(--card-colour);
    }

    .novaCard.is-card-collapsed .novaCardBody {
      display: none;
    }

    .novaPickCard { --card-colour: var(--nova-blue); grid-column: span 3; }
    .novaPackCard { --card-colour: var(--nova-purple); grid-column: span 3; }
    .novaSlamCard { --card-colour: var(--nova-red); grid-column: span 6; }
    .novaBridgeCard { --card-colour: var(--nova-orange); grid-column: span 3; }
    .novaRunnerCard { --card-colour: var(--nova-cyan); grid-column: span 3; }
    .novaPsCard { --card-colour: var(--nova-green); grid-column: span 6; }
    .novaCategorizeCard { --card-colour: #62e7dc; grid-column: span 12; }

    .novaCardHeader {
      min-height: 42px;
      padding: 8px 9px 7px 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      background: linear-gradient(90deg, color-mix(in srgb, var(--card-colour) 7%, transparent), transparent 54%);
    }

    .novaCardIdentity {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .novaCardIndex {
      min-width: 27px;
      color: var(--card-colour);
      font-family: Consolas, monospace;
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .65px;
    }

    .novaCardIcon {
      color: var(--card-colour);
      font-size: 15px;
      filter: drop-shadow(0 0 5px color-mix(in srgb, var(--card-colour) 45%, transparent));
    }

    .novaCardHeader h3 {
      margin: 0;
      overflow: hidden;
      color: var(--nova-text);
      font-size: 11px;
      font-weight: 1000;
      letter-spacing: .8px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .novaCardBody {
      padding: 9px 11px 11px 14px;
    }

    .novaDataRow {
      min-height: 28px;
      padding: 5px 0;
      display: grid;
      grid-template-columns: minmax(92px,.78fr) minmax(0,1.22fr);
      align-items: start;
      gap: 9px;
      border-bottom: 1px solid rgba(255,255,255,.045);
    }

    .novaDataRow:last-child {
      border-bottom: 0;
    }

    .novaDataLabel {
      color: var(--nova-muted);
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .48px;
      text-transform: uppercase;
    }

    .novaDataValue {
      min-width: 0;
      color: #dcebe5;
      font-family: Consolas, "Courier New", monospace;
      font-size: 10px;
      font-weight: 700;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .novaDataValue:empty::after {
      content: "—";
      color: rgba(142,168,160,.42);
      font-family: inherit;
    }

    .novaDataValue a {
      color: var(--card-colour);
      font-weight: 900;
      text-decoration: none;
    }

    .novaDataValue a:hover {
      text-decoration: underline;
    }

    .novaSlamMeta {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      column-gap: 17px;
    }

    .novaRiskFlags {
      margin-top: 9px;
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 7px;
    }

    .novaRiskFlag {
      min-height: 39px;
      padding: 7px 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      background: rgba(255,255,255,.026);
    }

    .novaRiskFlag span {
      color: var(--nova-muted);
      font-size: 9px;
      font-weight: 1000;
      letter-spacing: .6px;
    }

    .novaRiskFlag b {
      color: var(--nova-green);
      font-size: 10px;
      letter-spacing: .55px;
    }

    .novaRiskFlag b.is-alert {
      color: var(--nova-red);
      text-shadow: 0 0 10px rgba(255,100,120,.58);
    }

    .novaAlertPreview {
      margin-top: 8px;
      min-height: 54px;
      padding: 9px;
      display: flex;
      align-items: flex-start;
      gap: 9px;
      border: 1px solid rgba(255,100,120,.23);
      border-radius: 9px;
      background: linear-gradient(100deg, rgba(255,100,120,.08), rgba(255,255,255,.018));
    }

    .novaAlertGlyph {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,100,120,.40);
      border-radius: 8px;
      color: var(--nova-red);
      background: rgba(255,100,120,.07);
      box-shadow: 0 0 15px rgba(255,100,120,.08);
      font-weight: 1000;
    }

    .novaAlertText {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .novaAlertText > span {
      color: var(--nova-red);
      font-size: 8px;
      font-weight: 1000;
      letter-spacing: .72px;
    }

    .KickoutReasonPreview {
      color: #f5d7dc;
      font-family: Consolas, "Courier New", monospace;
      font-size: 9px;
      font-weight: 650;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .KickoutReasonPreview.is-empty {
      color: var(--nova-muted);
      font-family: inherit;
      font-weight: 700;
    }

    .novaReasonActions {
      margin-top: 7px;
      display: flex;
      gap: 7px;
    }

    .novaReasonActions button {
      flex: 1;
      min-height: 32px;
      color: #fce8eb;
      background: linear-gradient(135deg, rgba(180,36,56,.90), rgba(100,13,29,.94));
      border-color: rgba(255,100,120,.45);
      box-shadow: 0 6px 16px rgba(255,60,80,.08);
    }

    .novaReasonDrawer {
      margin-top: 8px;
      padding: 9px;
      border: 1px solid rgba(255,100,120,.22);
      border-radius: 9px;
      background: #02070c;
    }

    .novaReasonDrawer[hidden] {
      display: none;
    }

    .novaReasonDrawerTitle {
      margin-bottom: 7px;
      color: var(--nova-red);
      font-size: 8px;
      font-weight: 1000;
      letter-spacing: .78px;
    }

    .KickoutReason {
      max-height: 310px;
      margin: 0;
      overflow: auto;
      color: #d8e8e1;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 9px/1.45 Consolas, "Courier New", monospace;
      scrollbar-color: rgba(255,100,120,.46) rgba(255,255,255,.04);
    }

    .BridgingReason.is-alert {
      color: var(--nova-orange);
      font-weight: 1000;
    }

    .novaPsLayout {
      display: grid;
      grid-template-columns: minmax(0,.9fr) minmax(0,1.1fr);
      gap: 12px;
    }

    .novaDwellGrid {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 8px;
    }

    .novaDwellUnit {
      position: relative;
      overflow: hidden;
      min-height: 125px;
      padding: 9px;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 9px;
      background: rgba(255,255,255,.025);
    }

    .novaDwellUnit::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: var(--dwell-colour);
      box-shadow: 0 0 13px var(--dwell-colour);
    }

    .novaAutoDwell { --dwell-colour: var(--nova-blue); }
    .novaManualDwell { --dwell-colour: var(--nova-orange); }

    .novaDwellUnitHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
    }

    .novaDwellUnitHead span {
      color: var(--dwell-colour);
      font-size: 8px;
      font-weight: 1000;
      letter-spacing: .7px;
    }

    .novaDwellUnitHead b {
      color: var(--nova-muted);
      font-size: 9px;
    }

    .novaDwellUnitHead b.is-yes {
      color: var(--dwell-colour);
      text-shadow: 0 0 8px color-mix(in srgb, var(--dwell-colour) 48%, transparent);
    }

    .autoDwellBy,
    .manualDwellBy {
      margin-top: 12px;
      display: block;
      color: var(--nova-text);
      font-family: Consolas, "Courier New", monospace;
      font-size: 13px;
      font-weight: 1000;
      overflow-wrap: anywhere;
    }

    .autoDwellBy.is-system,
    .manualDwellBy.is-system {
      color: var(--nova-blue);
    }

    .autoDwellBy.is-unknown,
    .manualDwellBy.is-unknown {
      color: var(--nova-muted);
      font-family: inherit;
      font-size: 11px;
    }

    .novaActorBadge {
      margin-top: 6px;
      padding: 3px 6px;
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      color: var(--nova-muted);
      background: rgba(255,255,255,.035);
      font-size: 7px;
      font-weight: 1000;
      letter-spacing: .62px;
    }

    .novaActorBadge[data-type="system"] {
      color: var(--nova-blue);
      border-color: rgba(92,168,255,.25);
      background: rgba(92,168,255,.06);
    }

    .novaActorBadge[data-type="user"] {
      color: var(--nova-orange);
      border-color: rgba(255,189,89,.25);
      background: rgba(255,189,89,.06);
    }

    .novaDwellTime {
      margin-top: 9px;
      padding-top: 7px;
      display: flex;
      justify-content: space-between;
      gap: 7px;
      border-top: 1px solid rgba(255,255,255,.055);
    }

    .novaDwellTime span {
      color: var(--nova-muted);
      font-size: 7px;
      font-weight: 1000;
      letter-spacing: .6px;
    }

    .novaDwellTime b {
      color: #dcebe5;
      font: 8px/1.35 Consolas, monospace;
      text-align: right;
    }

    @media (max-width: 1220px) {
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
      .heroTopActions { display: grid; grid-template-columns: 1fr 1fr 37px; }
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

  function boot() {
    show();
    console.log('[Nova HERO] Bootstrap module loaded', MODULE_VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

})();
