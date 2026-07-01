// core/nova-menu.js

(function () {
  'use strict';

  if (window.NovaMenu) return;

  const VERSION = '2.1.1';
  const ORB_ID = 'nova-modules-button';
  const MENU_ID = 'nova-modules-menu';
  const POS_KEY = 'nova.orb.position';
  const state = { open: false, view: 'modules', orb: null, panel: null };

  function esc(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function modules() {
    return window.Nova && Array.isArray(window.Nova.modulesRegistry) ? window.Nova.modulesRegistry : [];
  }

  function userModules() {
    return modules().filter((m) => m && !m.core && m.type !== 'devkit' && m.enabled !== false);
  }

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({ module: 'menu', type, summary, data: data || {} });
  }

  function btnStyle(accent) {
    return 'background:rgba(255,255,255,.08);color:#fff;border:1px solid ' + (accent || 'rgba(34,211,238,.45)') + ';border-radius:9px;padding:7px 9px;cursor:pointer;font:700 12px Arial,sans-serif;';
  }

  function cardStyle(accent) {
    return 'background:rgba(255,255,255,.045);border:1px solid ' + (accent || 'rgba(255,255,255,.08)') + ';border-radius:12px;padding:10px;margin-bottom:10px;';
  }

  function createOrb() {
    if (state.orb) return state.orb;
    const orb = document.createElement('button');
    orb.id = ORB_ID;
    orb.textContent = 'Nova';
    orb.title = 'Nova';
    orb.style.cssText = [
      'position:fixed','right:16px','bottom:16px','z-index:2147483647','width:58px','height:38px',
      'border-radius:999px','border:1px solid rgba(34,211,238,.75)','background:rgba(10,10,18,.96)',
      'color:#fff','font:800 13px Arial,sans-serif','box-shadow:0 0 18px rgba(34,211,238,.55)',
      'cursor:pointer','user-select:none','touch-action:none'
    ].join(';');
    restoreOrb(orb);
    bindOrbDrag(orb);
    document.body.appendChild(orb);
    state.orb = orb;
    return orb;
  }

  function restoreOrb(orb) {
    try {
      const pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (!pos) return;
      orb.style.left = Math.max(4, Math.min(window.innerWidth - 62, pos.x)) + 'px';
      orb.style.top = Math.max(4, Math.min(window.innerHeight - 42, pos.y)) + 'px';
      orb.style.right = 'auto';
      orb.style.bottom = 'auto';
    } catch (e) {}
  }

  function bindOrbDrag(orb) {
    let down = false, moved = false, sx = 0, sy = 0, sl = 0, st = 0;
    function point(e) { const t = e.touches && e.touches[0] ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; }
    function start(e) {
      const p = point(e); const rect = orb.getBoundingClientRect();
      down = true; moved = false; sx = p.x; sy = p.y; sl = rect.left; st = rect.top;
      document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', end, true);
      document.addEventListener('touchmove', move, true); document.addEventListener('touchend', end, true);
      e.preventDefault();
    }
    function move(e) {
      if (!down) return;
      const p = point(e); const dx = p.x - sx; const dy = p.y - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      const x = Math.max(4, Math.min(window.innerWidth - orb.offsetWidth - 4, sl + dx));
      const y = Math.max(4, Math.min(window.innerHeight - orb.offsetHeight - 4, st + dy));
      orb.style.left = x + 'px'; orb.style.top = y + 'px'; orb.style.right = 'auto'; orb.style.bottom = 'auto';
      if (state.open) placePanelNearOrb();
      e.preventDefault();
    }
    function end() {
      if (!down) return;
      down = false;
      const rect = orb.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
      document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', end, true);
      document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', end, true);
      if (!moved) window.NovaMenu.toggle();
    }
    orb.addEventListener('mousedown', start, true);
    orb.addEventListener('touchstart', start, true);
  }

  function createPanel() {
    if (state.panel) return state.panel;
    const panel = document.createElement('div');
    panel.id = MENU_ID;
    panel.style.cssText = [
      'position:fixed','width:min(430px,calc(100vw - 24px))','max-height:min(760px,calc(100vh - 80px))',
      'overflow:hidden','z-index:2147483646','background:rgba(10,10,18,.98)','color:#fff',
      'border:1px solid rgba(34,211,238,.45)','box-shadow:0 0 24px rgba(34,211,238,.38)',
      'border-radius:16px','font:12px Arial,sans-serif','display:none'
    ].join(';');
    document.body.appendChild(panel);
    state.panel = panel;
    return panel;
  }

  function placePanelNearOrb() {
    const panel = createPanel();
    const orb = createOrb();
    const o = orb.getBoundingClientRect();
    const w = panel.offsetWidth || 430;
    const h = panel.offsetHeight || 520;
    let x = o.left;
    let y = o.bottom + 8;
    if (y + h > window.innerHeight) y = o.top - h - 8;
    if (x + w > window.innerWidth) x = window.innerWidth - w - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function renderModules() {
    const items = userModules();
    if (!items.length) {
      return '<div style="color:#9ca3af;padding:10px;line-height:1.5;">No user modules registered for this page yet.<br><br>When modules are added, this page stays friendly: launch, open, hide.</div>';
    }
    return items.map((m) => {
      const api = m.api && window[m.api] ? window[m.api] : null;
      const canLoad = window.NovaModuleLoader && window.NovaModuleLoader.canLoad ? window.NovaModuleLoader.canLoad(m) : true;
      const loaded = window.NovaModuleLoader && window.NovaModuleLoader.loaded && window.NovaModuleLoader.loaded.has(m.id);
      const button = loaded ? 'Open' : canLoad ? 'Launch' : 'Wrong site';
      return `
        <div style="${cardStyle('rgba(34,211,238,.22)')}">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div style="min-width:0;">
              <div style="font-weight:900;font-size:13px;color:#fff;">${esc(m.name || m.id)}</div>
              <div style="color:#9ca3af;margin-top:4px;line-height:1.35;">${esc(m.description || '')}</div>
              <div style="color:${loaded ? '#22c55e' : canLoad ? '#38bdf8' : '#f87171'};font-size:11px;margin-top:6px;">● ${loaded ? 'loaded' : canLoad ? 'ready' : 'not for this page'}</div>
            </div>
            <div style="display:flex;gap:6px;flex-direction:column;">
              <button data-nova-launch="${esc(m.id)}" style="${btnStyle(canLoad ? 'rgba(34,211,238,.65)' : 'rgba(248,113,113,.5)')}">${button}</button>
              ${loaded && api && api.hide ? `<button data-nova-hide="${esc(m.id)}" style="${btnStyle('rgba(248,113,113,.45)')}">Hide</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function getSessionInfo() {
    const session = window.NovaSession && window.NovaSession.current ? window.NovaSession.current : null;
    const active = window.NovaSession && window.NovaSession.isActive && window.NovaSession.isActive();
    const stats = window.NovaSession && window.NovaSession.getStats ? window.NovaSession.getStats() : { pages: 0, events: 0, byHost: {} };
    const sync = window.NovaSession && window.NovaSession.getSyncStatus ? window.NovaSession.getSyncStatus() : null;
    const status = !session ? 'stopped' : session.paused ? 'paused' : active ? 'recording' : 'stopped';
    return { session, active, stats, sync, status, hosts: stats && stats.byHost ? Object.keys(stats.byHost).length : 0 };
  }

  function statBox(value, label) {
    return `<div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:900;">${esc(value)}</div><div style="color:#9ca3af;">${esc(label)}</div></div>`;
  }

  function renderThemeCard() {
    const api = window.NovaTheme;
    if (!api || !api.getThemes) {
      return `
        <div style="${cardStyle('rgba(250,204,21,.25)')}">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#facc15;text-transform:uppercase;letter-spacing:.06em;">Themes</b><b style="color:#f87171;text-transform:uppercase;">● missing</b></div>
          <div style="color:#9ca3af;line-height:1.4;">NovaTheme is not loaded yet.</div>
        </div>`;
    }

    const themes = api.getThemes();
    const current = api.getCurrentThemeId ? api.getCurrentThemeId() : api.current().name;
    const currentTheme = themes[current] || {};
    const buttons = Object.entries(themes).map(([id, theme]) => {
      const active = id === current;
      const border = active ? 'rgba(34,197,94,.7)' : theme.border || 'rgba(255,255,255,.18)';
      return `
        <button data-nova-theme="${esc(id)}" title="${esc(theme.description || '')}" style="${btnStyle(border)}display:flex;align-items:center;gap:7px;justify-content:flex-start;min-height:34px;${active ? 'box-shadow:0 0 12px rgba(34,197,94,.35);' : ''}">
          <span style="display:inline-block;width:24px;height:10px;border-radius:99px;border:1px solid rgba(255,255,255,.35);background:linear-gradient(90deg,${esc(theme.accent)},${esc(theme.accent2)});"></span>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${active ? '✓ ' : ''}${esc(theme.name || id)}</span>
        </button>`;
    }).join('');

    return `
      <div style="${cardStyle('rgba(34,211,238,.25)')}">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#22d3ee;text-transform:uppercase;letter-spacing:.06em;">Themes</b><b style="color:#22c55e;text-transform:uppercase;">● ${esc(current)}</b></div>
        <div style="color:#d1d5db;margin-bottom:8px;line-height:1.35;">${esc(currentTheme.description || 'Pick Nova style.')}</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;">${buttons}</div>
      </div>`;
  }

  function renderSessionCard() {
    const info = getSessionInfo();
    const color = info.status === 'recording' ? '#22c55e' : info.status === 'paused' ? '#facc15' : '#f87171';
    const session = info.session;
    const id = session && session.id ? session.id.slice(0, 8) : 'none';
    const name = session && session.name ? session.name : 'No active session';
    const sync = info.sync || { tabId: 'unknown', channel: false, sessionId: null, lastSyncAt: null };
    const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString() : 'none yet';
    return `
      <div style="${cardStyle('rgba(168,85,247,.25)')}">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#c084fc;text-transform:uppercase;letter-spacing:.06em;">Session</b><b style="color:${color};text-transform:uppercase;">● ${esc(info.status)}</b></div>
        <div style="color:#d1d5db;margin-bottom:8px;">${esc(name)} <span style="color:#6b7280;">#${esc(id)}</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">${statBox(info.stats.pages || 0, 'Pages')}${statBox(info.stats.events || 0, 'Events')}${statBox(info.hosts, 'Hosts')}</div>
        <div style="background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.25);border-radius:10px;padding:8px;line-height:1.45;color:#d1d5db;margin-bottom:8px;">
          <b style="color:#c084fc;text-transform:uppercase;font-size:10px;letter-spacing:.06em;">Cross-tab sync</b><br>
          Tab: ${esc(sync.tabId || 'unknown').slice(0,8)} · Channel: <span style="color:${sync.channel ? '#22c55e' : '#facc15'};">${sync.channel ? 'ON' : 'fallback'}</span><br>
          Sync session: ${esc(sync.sessionId || 'none').slice(0,8)} · Last sync: ${esc(lastSync)}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-nova-act="session-start" style="${btnStyle('rgba(34,197,94,.55)')}">Start Session</button>
          <button data-nova-act="session-pause" style="${btnStyle('rgba(250,204,21,.55)')}">Pause</button>
          <button data-nova-act="session-resume" style="${btnStyle('rgba(34,197,94,.55)')}">Resume</button>
          <button data-nova-act="session-stop" style="${btnStyle('rgba(248,113,113,.55)')}">Stop</button>
          <button data-nova-act="session-clear" style="${btnStyle('rgba(248,113,113,.35)')}">Clear</button>
        </div>
      </div>`;
  }

  function renderTraceCard() {
    const hasTrace = Boolean(window.NovaTraceNetwork);
    const s = hasTrace && window.NovaTraceNetwork.getStatus ? window.NovaTraceNetwork.getStatus() : { enabled: false, persisted: false, pageCount: 0, localEvents: 0, startedAt: null };
    const color = s.enabled ? '#22c55e' : s.persisted ? '#facc15' : '#f87171';
    const text = s.enabled ? 'active' : s.persisted ? 'armed' : 'off';
    const started = s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : 'not started';
    return `
      <div style="${cardStyle('rgba(34,211,238,.25)')}">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#22d3ee;text-transform:uppercase;letter-spacing:.06em;">DevKit / Trace</b><b style="color:${color};text-transform:uppercase;">● ${esc(text)}</b></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-nova-act="trace-start" style="${btnStyle('rgba(34,211,238,.55)')}">Start Trace</button>
          <button data-nova-act="trace-stop" style="${btnStyle('rgba(248,113,113,.55)')}">Stop Trace</button>
          <button data-nova-act="trace-clear" style="${btnStyle('rgba(250,204,21,.55)')}">Clear Trace</button>
          <button data-nova-act="trace-copy" style="${btnStyle('rgba(168,85,247,.55)')}">Copy Trace</button>
        </div>
        <div style="color:#9ca3af;margin-top:8px;line-height:1.35;">API: ${hasTrace ? '<span style="color:#22c55e;">ready</span>' : '<span style="color:#f87171;">missing</span>'} · Persistent: ${s.persisted ? 'ON' : 'OFF'} · Pages: ${s.pageCount || 0} · Events: ${s.localEvents || 0} · Started: ${esc(started)}</div>
      </div>`;
  }

  function renderDomCard() {
    const hasDom = Boolean(window.NovaDOMInspector);
    const summary = hasDom && window.NovaDOMInspector.summary ? window.NovaDOMInspector.summary() : null;
    const c = summary ? summary.counts : { totalElements: 0, buttons: 0, inputs: 0, links: 0, tables: 0 };
    return `
      <div style="${cardStyle('rgba(56,189,248,.25)')}">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;">DevKit / DOM Inspector</b><b style="color:${hasDom ? '#22c55e' : '#f87171'};text-transform:uppercase;">● ${hasDom ? 'ready' : 'missing'}</b></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><button data-nova-act="dom-summary" style="${btnStyle('rgba(56,189,248,.55)')}">Copy DOM Summary</button><button data-nova-act="dom-full" style="${btnStyle('rgba(168,85,247,.55)')}">Copy Full DOM</button></div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">${statBox(c.totalElements || 0, 'All')}${statBox(c.buttons || 0, 'Btns')}${statBox(c.inputs || 0, 'Inputs')}${statBox(c.links || 0, 'Links')}${statBox(c.tables || 0, 'Tables')}</div>
      </div>`;
  }

  function renderBundleCard() {
    const hasBundle = Boolean(window.NovaInvestigationExport);
    const summary = hasBundle && window.NovaInvestigationExport.summary ? window.NovaInvestigationExport.summary() : null;
    const traceEvents = summary && summary.traceStatus ? summary.traceStatus.localEvents || 0 : 0;
    const domElements = summary && summary.domCounts ? summary.domCounts.totalElements || 0 : 0;
    const sessionEvents = summary && summary.sessionStats ? summary.sessionStats.events || 0 : 0;
    return `
      <div style="${cardStyle('rgba(240,171,252,.25)')}">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b style="color:#f0abfc;text-transform:uppercase;letter-spacing:.06em;">Investigation Bundle</b><b style="color:${hasBundle ? '#22c55e' : '#f87171'};text-transform:uppercase;">● ${hasBundle ? 'ready' : 'missing'}</b></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;"><button data-nova-act="bundle-summary" style="${btnStyle('rgba(240,171,252,.55)')}">Copy Summary Bundle</button><button data-nova-act="bundle-extended" style="${btnStyle('rgba(168,85,247,.65)')}">Copy Extended Bundle</button></div>
        <div style="color:#9ca3af;margin-top:8px;line-height:1.35;">Bundle: session ${sessionEvents} events · trace ${traceEvents} local events · DOM ${domElements} elements</div>
      </div>`;
  }

  function renderCoreCard() {
    const core = modules().filter((m) => m && (m.core || m.type === 'devkit'));
    return `<div style="${cardStyle('rgba(255,255,255,.1)')}"><b style="color:#22d3ee;text-transform:uppercase;letter-spacing:.06em;">Core</b><div style="margin-top:8px;display:grid;gap:6px;">${core.map((m) => `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px;"><b>${esc(m.name || m.id)}</b> <span style="color:#22c55e;float:right;">ENABLED</span><br><span style="color:#9ca3af;">API: ${esc(m.api || 'none')}</span></div>`).join('')}</div></div>`;
  }

  function renderAdvanced() {
    const build = window.Nova ? window.Nova.build || 'unknown' : 'missing';
    return renderThemeCard() + renderSessionCard() + renderTraceCard() + renderDomCard() + renderBundleCard() + `<div style="color:#9ca3af;margin:8px 0 10px;line-height:1.35;">Build: ${esc(build)}</div>` + renderCoreCard();
  }

  function render() {
    const panel = createPanel();
    const isModules = state.view === 'modules';
    panel.innerHTML = `
      <div style="padding:12px;background:linear-gradient(90deg,#22d3ee,#8b5cf6);display:flex;justify-content:space-between;align-items:center;font-weight:900;">
        <span>Nova</span><button data-nova-close style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:4px 8px;cursor:pointer;">×</button>
      </div>
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:8px;">
        <button data-nova-view="modules" style="${btnStyle(isModules ? 'rgba(34,211,238,.9)' : 'rgba(255,255,255,.18)')}">Modules</button>
        <button data-nova-view="advanced" style="${btnStyle(!isModules ? 'rgba(168,85,247,.9)' : 'rgba(255,255,255,.18)')}">Advanced</button>
      </div>
      <div style="padding:10px;overflow:auto;max-height:min(640px,calc(100vh - 180px));">${isModules ? renderModules() : renderAdvanced()}</div>`;
    bindPanel();
    placePanelNearOrb();
  }

  function bindPanel() {
    const panel = state.panel;
    if (!panel) return;
    const close = panel.querySelector('[data-nova-close]');
    if (close) close.addEventListener('click', () => window.NovaMenu.hide());
    panel.querySelectorAll('[data-nova-view]').forEach((btn) => btn.addEventListener('click', () => { state.view = btn.dataset.novaView; render(); }));
    panel.querySelectorAll('[data-nova-launch]').forEach((btn) => btn.addEventListener('click', () => launchModule(btn.dataset.novaLaunch)));
    panel.querySelectorAll('[data-nova-hide]').forEach((btn) => btn.addEventListener('click', () => hideModule(btn.dataset.novaHide)));
    panel.querySelectorAll('[data-nova-act]').forEach((btn) => btn.addEventListener('click', () => advancedAction(btn.dataset.novaAct)));
    panel.querySelectorAll('[data-nova-theme]').forEach((btn) => btn.addEventListener('click', () => setTheme(btn.dataset.novaTheme)));
  }

  async function launchModule(id) {
    const mod = userModules().find((m) => m.id === id);
    if (!mod || !window.NovaModuleLoader) return;
    if (window.NovaModuleLoader.loaded && window.NovaModuleLoader.loaded.has(id) && mod.api && window[mod.api] && window[mod.api].show) {
      window[mod.api].show();
    } else {
      await window.NovaModuleLoader.loadScript(mod);
      if (mod.api && window[mod.api] && window[mod.api].show) window[mod.api].show();
    }
    emit('module-launch', 'Module launched from Nova menu', { id });
    setTimeout(render, 500);
  }

  function hideModule(id) {
    const mod = userModules().find((m) => m.id === id);
    if (mod && mod.api && window[mod.api] && window[mod.api].hide) window[mod.api].hide();
    setTimeout(render, 250);
  }

  function setTheme(id) {
    if (!window.NovaTheme || !window.NovaTheme.setActive) return;
    const ok = window.NovaTheme.setActive(id);
    if (ok) emit('theme-change', 'Nova theme changed from menu', { id });
    setTimeout(render, 50);
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
    if (action === 'memory' && window.NovaMemoryPanel) window.NovaMemoryPanel.show();
    if (action === 'bundle-summary' && window.NovaInvestigationExport) window.NovaInvestigationExport.copySummary();
    if (action === 'bundle-extended' && window.NovaInvestigationExport) window.NovaInvestigationExport.copyExtended();
    emit('advanced-action', 'Nova advanced action: ' + action, { action });
    setTimeout(render, 250);
  }

  window.NovaMenu = {
    version: VERSION,
    show() { createOrb(); render(); state.panel.style.display = 'block'; state.open = true; },
    hide() { if (state.panel) state.panel.style.display = 'none'; state.open = false; },
    toggle() { if (state.open) this.hide(); else this.show(); },
    refresh() { if (state.open) render(); },
    init() { createOrb(); console.log('[Nova Core] NovaMenu UI 2.1.1 loaded'); }
  };

  if (document.body) window.NovaMenu.init();
  else document.addEventListener('DOMContentLoaded', () => window.NovaMenu.init(), { once: true });
})();
