// core/nova-menu.js

(function () {
  'use strict';

  if (window.NovaMenu) return;

  const VERSION = '2.3.5';
  const ORB_ID = 'nova-modules-button';
  const MENU_ID = 'nova-modules-menu';
  const STYLE_ID = 'nova-menu-style';
  const POS_KEY = 'nova.orb.position';
  const LOADED_MODULES_ATTR = 'data-nova-loaded-modules';

  const state = {
    open: false,
    view: 'modules',
    orb: null,
    panel: null,
    repairTimer: null,
    observer: null,
    repairing: false,
    lastRegistrySource: 'none'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function manifestFromBootstrap() {
    try {
      if (window.NovaBootstrap && typeof window.NovaBootstrap.getManifest === 'function') {
        return window.NovaBootstrap.getManifest();
      }
    } catch (_) {}

    try {
      const raw = document.documentElement && document.documentElement.getAttribute('data-nova-manifest');
      if (raw) return JSON.parse(raw);
    } catch (_) {}

    return null;
  }

  function registryInfo() {
    try {
      if (window.Nova && Array.isArray(window.Nova.modulesRegistry) && window.Nova.modulesRegistry.length) {
        state.lastRegistrySource = 'Nova registry';
        return {
          source: state.lastRegistrySource,
          version: window.Nova.version || 'unknown',
          build: window.Nova.build || 'unknown',
          items: window.Nova.modulesRegistry.slice()
        };
      }
    } catch (_) {}

    const manifest = manifestFromBootstrap();
    if (manifest) {
      const core = Array.isArray(manifest.core)
        ? manifest.core.map((item) => ({ ...item, core: true }))
        : [];
      const modules = Array.isArray(manifest.modules)
        ? manifest.modules.map((item) => ({ ...item, core: false }))
        : [];

      state.lastRegistrySource = 'Bootstrap manifest';
      return {
        source: state.lastRegistrySource,
        version: manifest.version || 'unknown',
        build: manifest.build || `manifest-${manifest.version || 'unknown'}`,
        items: [...core, ...modules]
      };
    }

    try {
      if (window.Nova && window.Nova.manifest) {
        const manifest = window.Nova.manifest;
        state.lastRegistrySource = 'Nova manifest';
        return {
          source: state.lastRegistrySource,
          version: manifest.version || 'unknown',
          build: manifest.build || `manifest-${manifest.version || 'unknown'}`,
          items: [
            ...(manifest.core || []).map((item) => ({ ...item, core: true })),
            ...(manifest.modules || []).map((item) => ({ ...item, core: false }))
          ]
        };
      }
    } catch (_) {}

    state.lastRegistrySource = 'none';
    return { source: 'none', version: 'missing', build: 'missing', items: [] };
  }

  function modules() {
    return registryInfo().items;
  }

  function domLoadedModules() {
    try {
      const raw = document.documentElement && document.documentElement.getAttribute(LOADED_MODULES_ATTR);
      const ids = raw && JSON.parse(raw);
      return new Set(Array.isArray(ids) ? ids : []);
    } catch (_) {
      return new Set();
    }
  }

  function userModules() {
    return modules().filter((m) => m && !m.core && m.type !== 'devkit' && m.enabled !== false);
  }

  function coreModules() {
    return modules().filter((m) => m && m.core && m.type !== 'devkit');
  }

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({ module: 'menu', type, summary, data: data || {} });
  }

  function listenForNovaEvent(type, handler) {
    let attached = false;
    try {
      if (typeof window.addEventListener === 'function') {
        window.addEventListener(type, handler);
        attached = true;
      }
    } catch (_) {}

    try {
      if (document && typeof document.addEventListener === 'function') {
        document.addEventListener(type, handler);
        attached = true;
      }
    } catch (_) {}

    return attached;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ORB_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:58px;height:38px;border-radius:999px;border:1px solid var(--nova-border,rgba(34,211,238,.75));background:rgba(10,10,18,.96);color:#fff;font:800 13px Arial,sans-serif;box-shadow:var(--nova-glow,0 0 18px rgba(34,211,238,.55));cursor:pointer;user-select:none;touch-action:none}
      #${MENU_ID}{position:fixed;width:min(430px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 80px));overflow:hidden;z-index:2147483646;background:rgba(10,10,18,.98);color:#fff;border:1px solid var(--nova-border,rgba(34,211,238,.45));box-shadow:var(--nova-glow,0 0 24px rgba(34,211,238,.38));border-radius:16px;font:12px Arial,sans-serif;display:none}
      #${MENU_ID} *{box-sizing:border-box}
      #${MENU_ID} button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:9px;padding:7px 9px;cursor:pointer;font:700 12px Arial,sans-serif}
      #${MENU_ID} button:hover{background:rgba(34,211,238,.16)}
      #${MENU_ID} .nova-menu-head{padding:12px;background:linear-gradient(90deg,var(--nova-accent,#22d3ee),var(--nova-accent-2,#8b5cf6));display:flex;justify-content:space-between;align-items:center;font-weight:900}
      #${MENU_ID} .nova-menu-tabs{padding:10px;border-bottom:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
      #${MENU_ID} .nova-menu-tabs button{padding:7px 4px;white-space:nowrap}
      #${MENU_ID} .nova-menu-body{padding:10px;overflow:auto;max-height:min(640px,calc(100vh - 180px))}
      #${MENU_ID} .nova-card{background:rgba(255,255,255,.045);border:1px solid rgba(34,211,238,.22);border-radius:12px;padding:10px;margin-bottom:10px}
      #${MENU_ID} .nova-muted{color:#9ca3af;line-height:1.35}
      #${MENU_ID} .nova-grid{display:grid;gap:6px}
      #${MENU_ID} .nova-pill{display:inline-block;font-size:11px;margin-top:6px}
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function restoreOrb(orb) {
    try {
      const pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (!pos) return;
      orb.style.left = clamp(Number(pos.x) || 16, 4, window.innerWidth - 62) + 'px';
      orb.style.top = clamp(Number(pos.y) || 16, 4, window.innerHeight - 42) + 'px';
      orb.style.right = 'auto';
      orb.style.bottom = 'auto';
    } catch (_) {}
  }

  function removeDuplicate(id, keep) {
    document.querySelectorAll('#' + CSS.escape(id)).forEach((node) => {
      if (node !== keep) node.remove();
    });
  }

  function createOrb() {
    if (!document.body) return null;
    injectStyle();

    if (state.orb && state.orb.isConnected) {
      removeDuplicate(ORB_ID, state.orb);
      return state.orb;
    }

    removeDuplicate(ORB_ID, null);
    const orb = document.createElement('button');
    orb.id = ORB_ID;
    orb.type = 'button';
    orb.textContent = 'Nova';
    orb.title = 'Nova';
    restoreOrb(orb);
    bindOrbDrag(orb);
    document.body.appendChild(orb);
    state.orb = orb;

    if (window.NovaOrbExtras && typeof window.NovaOrbExtras.scan === 'function') {
      setTimeout(() => window.NovaOrbExtras.scan(), 0);
    }

    return orb;
  }

  function bindOrbDrag(orb) {
    let down = false;
    let moved = false;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let st = 0;

    function point(event) {
      const touch = event.touches && event.touches[0] ? event.touches[0] : event;
      return { x: touch.clientX, y: touch.clientY };
    }

    function start(event) {
      const p = point(event);
      const rect = orb.getBoundingClientRect();
      down = true;
      moved = false;
      sx = p.x;
      sy = p.y;
      sl = rect.left;
      st = rect.top;
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', end, true);
      document.addEventListener('touchmove', move, true);
      document.addEventListener('touchend', end, true);
      event.preventDefault();
    }

    function move(event) {
      if (!down) return;
      const p = point(event);
      const dx = p.x - sx;
      const dy = p.y - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      const x = clamp(sl + dx, 4, window.innerWidth - orb.offsetWidth - 4);
      const y = clamp(st + dy, 4, window.innerHeight - orb.offsetHeight - 4);
      orb.style.left = x + 'px';
      orb.style.top = y + 'px';
      orb.style.right = 'auto';
      orb.style.bottom = 'auto';
      if (state.open) placePanelNearOrb();
      event.preventDefault();
    }

    function end() {
      if (!down) return;
      down = false;
      const rect = orb.getBoundingClientRect();
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
      } catch (_) {}
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', end, true);
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true);
      if (!moved) window.NovaMenu.toggle();
    }

    orb.addEventListener('mousedown', start, true);
    orb.addEventListener('touchstart', start, true);
  }

  function createPanel() {
    if (!document.body) return null;
    injectStyle();

    if (state.panel && state.panel.isConnected) {
      removeDuplicate(MENU_ID, state.panel);
      return state.panel;
    }

    removeDuplicate(MENU_ID, null);
    const panel = document.createElement('div');
    panel.id = MENU_ID;
    panel.addEventListener('click', onPanelClick);
    document.body.appendChild(panel);
    state.panel = panel;
    return panel;
  }

  function placePanelNearOrb() {
    const panel = createPanel();
    const orb = createOrb();
    if (!panel || !orb) return;

    const o = orb.getBoundingClientRect();
    const w = panel.offsetWidth || 430;
    const h = panel.offsetHeight || 520;
    let x = o.left;
    let y = o.bottom + 8;
    if (y + h > window.innerHeight) y = o.top - h - 8;
    if (x + w > window.innerWidth) x = window.innerWidth - w - 8;
    panel.style.left = clamp(x, 8, window.innerWidth - w - 8) + 'px';
    panel.style.top = clamp(y, 8, window.innerHeight - h - 8) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function isLoaded(module) {
    if (!module) return false;
    if (module.api && window[module.api]) return true;
    if (domLoadedModules().has(module.id)) return true;
    return Boolean(
      window.NovaModuleLoader &&
      window.NovaModuleLoader.loaded &&
      window.NovaModuleLoader.loaded.has(module.id)
    );
  }

  function statusLine(loaded, canLoad) {
    if (loaded) return '<span style="color:#22c55e;">loaded</span>';
    if (canLoad) return '<span style="color:#38bdf8;">ready</span>';
    return '<span style="color:#f87171;">not for this page</span>';
  }

  function renderModules() {
    const info = registryInfo();
    const items = info.items.filter((m) => m && !m.core && m.type !== 'devkit' && m.enabled !== false);

    if (!items.length) {
      return `
        <div class="nova-muted" style="padding:10px;">No user modules registered for this page yet.</div>
        <div class="nova-muted" style="padding:0 10px 10px;font-size:10px;">Registry: ${esc(info.source)} · ${esc(info.version)}</div>`;
    }

    const cards = items.map((m) => {
      const api = m.api && window[m.api] ? window[m.api] : null;
      const canLoad = window.NovaModuleLoader && window.NovaModuleLoader.canManuallyLoad
        ? window.NovaModuleLoader.canManuallyLoad(m)
        : true;
      const loaded = isLoaded(m);
      const button = loaded ? 'Open' : canLoad ? 'Launch' : 'Wrong site';

      return `
        <div class="nova-card">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div style="min-width:0;">
              <div style="font-weight:900;font-size:13px;color:#fff;">${esc(m.name || m.id)}</div>
              <div class="nova-muted" style="margin-top:4px;">${esc(m.description || '')}</div>
              <div class="nova-pill">${statusLine(loaded, canLoad)} · v${esc(m.version || 'latest')}</div>
            </div>
            <div style="display:flex;gap:6px;flex-direction:column;">
              <button data-nova-launch="${esc(m.id)}">${button}</button>
              ${loaded && api && api.hide ? `<button data-nova-hide="${esc(m.id)}" style="border-color:rgba(248,113,113,.45);">Hide</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    return cards + `<div class="nova-muted" style="padding:0 2px 2px;font-size:10px;">Registry: ${esc(info.source)} · ${esc(info.version)} · ${items.length} user module${items.length === 1 ? '' : 's'}</div>`;
  }

  function themeCard() {
    const api = window.NovaTheme;
    if (!api || !api.getThemes) {
      return '<div class="nova-card"><b style="color:#f87171;">Themes missing</b><div class="nova-muted">NovaTheme is not loaded.</div></div>';
    }

    const themes = api.getThemes();
    const current = api.getCurrentThemeId
      ? api.getCurrentThemeId()
      : (api.current && api.current().name) || 'default';

    const buttons = Object.entries(themes).map(([id, theme]) => {
      const active = id === current;
      const border = active ? 'rgba(34,197,94,.75)' : theme.border || 'rgba(255,255,255,.18)';
      return `<button data-nova-theme="${esc(id)}" title="${esc(theme.description || '')}" style="border-color:${esc(border)};text-align:left;${active ? 'box-shadow:0 0 12px rgba(34,197,94,.35);' : ''}">${active ? '* ' : ''}${esc(theme.name || id)}</button>`;
    }).join('');

    return `<div class="nova-card"><b style="color:#22d3ee;text-transform:uppercase;letter-spacing:.06em;">Themes</b><div class="nova-muted" style="margin:6px 0;">Current: ${esc(current)}</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;">${buttons}</div></div>`;
  }

  function statBox(value, label) {
    return `<div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:900;">${esc(value)}</div><div class="nova-muted">${esc(label)}</div></div>`;
  }

  function sessionCard() {
    const session = window.NovaSession && window.NovaSession.current ? window.NovaSession.current : null;
    const active = window.NovaSession && window.NovaSession.isActive && window.NovaSession.isActive();
    const stats = window.NovaSession && window.NovaSession.getStats
      ? window.NovaSession.getStats()
      : { pages: 0, events: 0, byHost: {} };
    const status = !session ? 'stopped' : session.paused ? 'paused' : active ? 'recording' : 'stopped';
    const color = status === 'recording' ? '#22c55e' : status === 'paused' ? '#facc15' : '#f87171';
    const hosts = stats && stats.byHost ? Object.keys(stats.byHost).length : 0;

    return `<div class="nova-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#c084fc;text-transform:uppercase;letter-spacing:.06em;">Session</b><b style="color:${color};text-transform:uppercase;">${esc(status)}</b></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">${statBox(stats.pages || 0, 'Pages')}${statBox(stats.events || 0, 'Events')}${statBox(hosts, 'Hosts')}</div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button data-nova-act="session-start">Start Session</button><button data-nova-act="session-pause">Pause</button><button data-nova-act="session-resume">Resume</button><button data-nova-act="session-stop">Stop</button><button data-nova-act="session-clear">Clear</button></div></div>`;
  }

  function traceCard() {
    const hasTrace = Boolean(window.NovaTraceNetwork);
    const s = hasTrace && window.NovaTraceNetwork.getStatus
      ? window.NovaTraceNetwork.getStatus()
      : { enabled: false, persisted: false, pageCount: 0, localEvents: 0 };
    const text = s.enabled ? 'active' : s.persisted ? 'armed' : hasTrace ? 'off' : 'unavailable';

    return `<div class="nova-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#22d3ee;text-transform:uppercase;letter-spacing:.06em;">DevKit / Trace</b><b style="color:${s.enabled ? '#22c55e' : hasTrace ? '#f87171' : '#facc15'};text-transform:uppercase;">${esc(text)}</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button data-nova-act="trace-start">Start Trace</button><button data-nova-act="trace-stop">Stop Trace</button><button data-nova-act="trace-clear">Clear Trace</button><button data-nova-act="trace-copy">Copy Trace</button></div><div class="nova-muted" style="margin-top:8px;">API: ${hasTrace ? 'ready' : 'optional/unavailable'} | Pages: ${s.pageCount || 0} | Events: ${s.localEvents || 0}</div></div>`;
  }

  function domCard() {
    const hasDom = Boolean(window.NovaDOMInspector);
    const summary = hasDom && window.NovaDOMInspector.summary ? window.NovaDOMInspector.summary() : null;
    const c = summary ? summary.counts : { totalElements: 0, buttons: 0, inputs: 0, links: 0, tables: 0 };

    return `<div class="nova-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;">DevKit / DOM Inspector</b><b style="color:${hasDom ? '#22c55e' : '#facc15'};text-transform:uppercase;">${hasDom ? 'ready' : 'optional'}</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><button data-nova-act="dom-summary">Copy DOM Summary</button><button data-nova-act="dom-full">Copy Full DOM</button></div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">${statBox(c.totalElements || 0, 'All')}${statBox(c.buttons || 0, 'Btns')}${statBox(c.inputs || 0, 'Inputs')}${statBox(c.links || 0, 'Links')}${statBox(c.tables || 0, 'Tables')}</div></div>`;
  }

  function bundleCard() {
    const hasBundle = Boolean(window.NovaInvestigationExport);
    return `<div class="nova-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#f0abfc;text-transform:uppercase;letter-spacing:.06em;">Investigation Bundle</b><b style="color:${hasBundle ? '#22c55e' : '#facc15'};text-transform:uppercase;">${hasBundle ? 'ready' : 'optional'}</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button data-nova-act="bundle-summary">Copy Summary Bundle</button><button data-nova-act="bundle-extended">Copy Extended Bundle</button><button data-nova-act="bundle-full">Copy Full Bundle</button></div></div>`;
  }

  function coreCard() {
    const items = coreModules();
    return `<div class="nova-card"><b style="color:#22d3ee;text-transform:uppercase;letter-spacing:.06em;">Core</b><div class="nova-grid" style="margin-top:8px;">${items.map((m) => `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px;"><b>${esc(m.name || m.id)}</b> <span style="color:${m.required === false ? '#facc15' : '#22c55e'};float:right;">${m.required === false ? 'OPTIONAL' : 'REQUIRED'}</span><br><span class="nova-muted">API: ${esc(m.api || 'none')}</span></div>`).join('') || '<div class="nova-muted">Core registry unavailable.</div>'}</div></div>`;
  }

  function renderAdvanced() {
    return sessionCard() + traceCard() + domCard() + bundleCard();
  }

  function renderSettings() {
    return themeCard();
  }

  function renderInfo() {
    const info = registryInfo();
    return `<div class="nova-card"><b style="color:#c084fc;text-transform:uppercase;letter-spacing:.06em;">Info for Nerds</b><div class="nova-muted" style="margin-top:7px;">Build: ${esc(info.build)}<br>Manifest: ${esc(info.version)}<br>Menu: ${VERSION}<br>Registry: ${esc(info.source)}</div></div>` + coreCard();
  }

  function render() {
    const panel = createPanel();
    if (!panel) return;
    const views = [
      { id: 'settings', label: 'Settings', color: 'rgba(34,197,94,.9)' },
      { id: 'modules', label: 'Modules', color: 'rgba(34,211,238,.9)' },
      { id: 'advanced', label: 'Advanced', color: 'rgba(168,85,247,.9)' },
      { id: 'info', label: 'Info', color: 'rgba(244,114,182,.9)' }
    ];
    const content = state.view === 'settings'
      ? renderSettings()
      : state.view === 'advanced'
        ? renderAdvanced()
        : state.view === 'info'
          ? renderInfo()
          : renderModules();
    const tabs = views.map((view) => `<button data-nova-view="${view.id}" style="border-color:${state.view === view.id ? view.color : 'rgba(255,255,255,.18)'};">${view.label}</button>`).join('');

    panel.innerHTML = `<div class="nova-menu-head"><span>Nova</span><button data-nova-close style="background:rgba(0,0,0,.25);border-color:rgba(255,255,255,.25);padding:4px 8px;">x</button></div><div class="nova-menu-tabs">${tabs}</div><div class="nova-menu-body">${content}</div>`;
    placePanelNearOrb();
  }

  function onPanelClick(event) {
    const target = event.target && event.target.closest ? event.target.closest('button') : null;
    if (!target) return;
    if (target.dataset.novaClose !== undefined) window.NovaMenu.hide();
    if (target.dataset.novaView) {
      state.view = target.dataset.novaView;
      render();
      const body = state.panel && state.panel.querySelector('.nova-menu-body');
      if (body) body.scrollTop = 0;
    }
    if (target.dataset.novaLaunch) launchModule(target.dataset.novaLaunch);
    if (target.dataset.novaHide) hideModule(target.dataset.novaHide);
    if (target.dataset.novaAct) advancedAction(target.dataset.novaAct);
    if (target.dataset.novaTheme) setTheme(target.dataset.novaTheme);
  }

  async function launchModule(id) {
    const mod = userModules().find((m) => m.id === id);
    if (!mod) return;

    emitNovaCommand('launch', mod.id);

    emit('module-launch', 'Module launched from Nova menu', { id });
    setTimeout(render, 250);
  }

  function hideModule(id) {
    const mod = userModules().find((m) => m.id === id);
    if (!mod) return;
    emitNovaCommand('hide', mod.id);
    setTimeout(render, 100);
  }

  function emitNovaCommand(action, id) {
    try {
      document.dispatchEvent(new CustomEvent('nova-module-command', { detail: { action, id } }));
    } catch (_) {}
  }

  function setTheme(id) {
    if (!window.NovaTheme || !window.NovaTheme.setActive) return;
    const ok = window.NovaTheme.setActive(id);
    if (ok) emit('theme-change', 'Nova theme changed from menu', { id });
    setTimeout(render, 30);
  }

  function advancedAction(action) {
    if (action === 'session-start' && window.NovaSession) window.NovaSession.start('Nova Investigation');
    if (action === 'session-pause' && window.NovaSession && window.NovaSession.pause) window.NovaSession.pause();
    if (action === 'session-resume' && window.NovaSession && window.NovaSession.resume) window.NovaSession.resume();
    if (action === 'session-stop' && window.NovaSession) window.NovaSession.stop();
    if (action === 'session-clear' && window.NovaSession && window.NovaSession.clear) window.NovaSession.clear();
    if (action === 'trace-start' && window.NovaTraceNetwork) window.NovaTraceNetwork.start();
    if (action === 'trace-stop' && window.NovaTraceNetwork) window.NovaTraceNetwork.stop();
    if (action === 'trace-clear' && window.NovaTraceNetwork && window.NovaTraceNetwork.clear) window.NovaTraceNetwork.clear();
    if (action === 'trace-copy' && window.NovaTraceNetwork && window.NovaTraceNetwork.copy) window.NovaTraceNetwork.copy();
    if (action === 'dom-summary' && window.NovaDOMInspector) window.NovaDOMInspector.copySummary();
    if (action === 'dom-full' && window.NovaDOMInspector) window.NovaDOMInspector.copyFull();
    if (action === 'bundle-summary' && window.NovaInvestigationExport) window.NovaInvestigationExport.copySummary();
    if (action === 'bundle-extended' && window.NovaInvestigationExport) window.NovaInvestigationExport.copyExtended();
    if (action === 'bundle-full' && window.NovaInvestigationExport && window.NovaInvestigationExport.copyFull) window.NovaInvestigationExport.copyFull();
    emit('advanced-action', 'Nova advanced action: ' + action, { action });
    setTimeout(render, 100);
  }

  function repair() {
    if (state.repairing || !document.body) return;
    state.repairing = true;

    try {
      injectStyle();
      if (!document.getElementById(ORB_ID)) {
        state.orb = null;
        createOrb();
      }
      if (state.open && !document.getElementById(MENU_ID)) {
        state.panel = null;
        render();
        if (state.panel) state.panel.style.display = 'block';
      }
      if (state.open && state.panel && state.panel.isConnected) placePanelNearOrb();
    } finally {
      state.repairing = false;
    }
  }

  function startRepairLoop() {
    if (!state.repairTimer) {
      state.repairTimer = setInterval(() => {
        repair();
        if (state.open) render();
      }, 1500);
    }

    if (!state.observer && window.MutationObserver && document.documentElement) {
      let queued = false;
      state.observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
          queued = false;
          repair();
        }, 80);
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  window.NovaMenu = {
    version: VERSION,
    show() {
      createOrb();
      state.open = true;
      render();
      if (state.panel) state.panel.style.display = 'block';
      repair();
    },
    hide() {
      if (state.panel && state.panel.isConnected) state.panel.style.display = 'none';
      state.open = false;
    },
    toggle() {
      if (state.open) this.hide();
      else this.show();
    },
    refresh() {
      repair();
      if (state.open) render();
    },
    getRegistryInfo: registryInfo,
    init() {
      createOrb();
      startRepairLoop();
      console.log('[Nova Core] NovaMenu UI ' + VERSION + ' loaded');
    },
    repair
  };

  ['nova-module-loaded', 'nova-module-command-result', 'nova-watch-ready', 'nova-update-ready'].forEach((eventName) => {
    listenForNovaEvent(eventName, () => {
      if (state.open) render();
    });
  });

  if (document.body) window.NovaMenu.init();
  else document.addEventListener('DOMContentLoaded', () => window.NovaMenu.init(), { once: true });
})();
