// core/nova-menu.js

(function () {
  'use strict';

  if (window.NovaMenu) {
    console.warn('[Nova Core] NovaMenu already loaded');
    return;
  }

  const MENU_ID = 'nova-modules-menu';
  const BUTTON_ID = 'nova-modules-button';
  const state = { open: false, button: null, panel: null, refreshTimer: null };

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function buttonStyle(accent) {
    return `background:rgba(255,255,255,.08);color:#fff;border:1px solid ${accent || 'rgba(34,211,238,.45)'};border-radius:8px;padding:6px 8px;cursor:pointer;`;
  }

  function getModules() {
    if (window.Nova && typeof window.Nova.getModules === 'function') return window.Nova.getModules();
    if (window.Nova && Array.isArray(window.Nova.modulesRegistry)) return window.Nova.modulesRegistry;
    return [];
  }

  function groupModules(modules) {
    return modules.reduce((groups, module) => {
      const type = module.type || 'module';
      groups[type] = groups[type] || [];
      groups[type].push(module);
      return groups;
    }, {});
  }

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({ module: 'menu', type, summary, data: data || {} });
  }

  function createButton() {
    if (state.button) return state.button;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = 'Nova';
    button.title = 'Open Nova Modules';
    button.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483646',
      'padding:10px 14px', 'border-radius:999px', 'border:1px solid rgba(34,211,238,.55)',
      'background:rgba(10,10,18,.96)', 'color:#fff', 'font:700 13px Arial,sans-serif',
      'box-shadow:0 0 18px rgba(34,211,238,.45)', 'cursor:pointer'
    ].join(';');
    button.addEventListener('click', () => window.NovaMenu.toggle());
    document.body.appendChild(button);
    state.button = button;
    return button;
  }

  function createPanel() {
    if (state.panel) return state.panel;
    const panel = document.createElement('div');
    panel.id = MENU_ID;
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:64px', 'width:min(420px,calc(100vw - 32px))',
      'max-height:min(720px,calc(100vh - 96px))', 'overflow:hidden', 'z-index:2147483646',
      'background:rgba(10,10,18,.97)', 'color:#fff', 'border:1px solid rgba(168,85,247,.5)',
      'box-shadow:0 0 22px rgba(168,85,247,.5)', 'border-radius:14px', 'font:12px Arial,sans-serif',
      'display:none'
    ].join(';');
    document.body.appendChild(panel);
    state.panel = panel;
    return panel;
  }

  function getSessionInfo() {
    const session = window.NovaSession && window.NovaSession.current ? window.NovaSession.current : null;
    const active = window.NovaSession && window.NovaSession.isActive && window.NovaSession.isActive();
    const stats = window.NovaSession && window.NovaSession.getStats ? window.NovaSession.getStats() : { pages: 0, events: 0, byHost: {} };
    const sync = window.NovaSession && window.NovaSession.getSyncStatus ? window.NovaSession.getSyncStatus() : null;
    const status = !session ? 'stopped' : session.paused ? 'paused' : active ? 'recording' : 'stopped';
    return { session, active, stats, sync, status, hosts: stats && stats.byHost ? Object.keys(stats.byHost).length : 0 };
  }

  function renderSessionStatus() {
    const info = getSessionInfo();
    const color = info.status === 'recording' ? '#22c55e' : info.status === 'paused' ? '#facc15' : '#f87171';
    const session = info.session;
    const sync = info.sync || { tabId: 'unknown', channel: false, lastSyncAt: null, sessionId: null };
    const id = session && session.id ? session.id.slice(0, 8) : 'none';
    const name = session && session.name ? session.name : 'No active session';
    const tabId = sync.tabId ? sync.tabId.slice(0, 8) : 'unknown';
    const syncSessionId = sync.sessionId ? sync.sessionId.slice(0, 8) : 'none';
    const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString() : 'none yet';

    return `
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
          <div style="font-weight:700;color:#a855f7;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">Session</div>
          <div style="font-weight:700;color:${color};text-transform:uppercase;font-size:11px;">● ${escapeHtml(info.status)}</div>
        </div>
        <div style="color:#d1d5db;margin-bottom:8px;line-height:1.35;">${escapeHtml(name)} <span style="color:#6b7280;">#${escapeHtml(id)}</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:700;">${info.stats.pages || 0}</div><div style="color:#9ca3af;">Pages</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:700;">${info.stats.events || 0}</div><div style="color:#9ca3af;">Events</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:700;">${info.hosts}</div><div style="color:#9ca3af;">Hosts</div></div>
        </div>
        <div style="background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.25);border-radius:10px;padding:8px;margin-bottom:8px;line-height:1.45;color:#d1d5db;">
          <div style="font-weight:700;color:#c084fc;margin-bottom:4px;text-transform:uppercase;font-size:10px;letter-spacing:.06em;">Cross-tab sync</div>
          Tab: <span style="color:#fff;">${escapeHtml(tabId)}</span> · Channel: <span style="color:${sync.channel ? '#22c55e' : '#facc15'};">${sync.channel ? 'ON' : 'fallback'}</span><br>
          Sync session: <span style="color:#fff;">${escapeHtml(syncSessionId)}</span> · Last sync: <span style="color:#fff;">${escapeHtml(lastSync)}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-nova-session-pause style="${buttonStyle('rgba(250,204,21,.55)')}">Pause</button>
          <button data-nova-session-resume style="${buttonStyle('rgba(34,197,94,.55)')}">Resume</button>
          <button data-nova-session-stop style="${buttonStyle('rgba(248,113,113,.55)')}">Stop</button>
          <button data-nova-session-clear style="${buttonStyle('rgba(248,113,113,.35)')}">Clear</button>
          <button data-nova-session-sync style="${buttonStyle('rgba(168,85,247,.55)')}">Sync Now</button>
        </div>
      </div>
    `;
  }

  function renderTraceControls() {
    const hasTrace = Boolean(window.NovaTraceNetwork);
    const status = hasTrace && typeof window.NovaTraceNetwork.getStatus === 'function'
      ? window.NovaTraceNetwork.getStatus()
      : { enabled: false, persisted: false, autoResumed: false, startedAt: null, pageCount: 0, localEvents: 0 };
    const statusColor = status.enabled ? '#22c55e' : status.persisted ? '#facc15' : '#f87171';
    const statusText = status.enabled ? 'active' : status.persisted ? 'armed' : 'off';
    const startedAt = status.startedAt ? new Date(status.startedAt).toLocaleTimeString() : 'not started';

    return `
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
          <div style="font-weight:700;color:#22d3ee;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">DevKit / Trace</div>
          <div style="font-weight:700;color:${statusColor};text-transform:uppercase;font-size:11px;">● ${escapeHtml(statusText)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-nova-trace-start style="${buttonStyle('rgba(34,211,238,.55)')}">Start Trace</button>
          <button data-nova-trace-stop style="${buttonStyle('rgba(248,113,113,.55)')}">Stop Trace</button>
          <button data-nova-trace-clear style="${buttonStyle('rgba(250,204,21,.55)')}">Clear Trace</button>
          <button data-nova-trace-copy style="${buttonStyle('rgba(168,85,247,.55)')}">Copy Trace</button>
        </div>
        <div style="color:#9ca3af;margin-top:8px;line-height:1.35;">
          API: ${hasTrace ? '<span style="color:#22c55e;">ready</span>' : '<span style="color:#f87171;">missing</span>'} · Persistent: ${status.persisted ? 'ON' : 'OFF'} · Pages: ${status.pageCount || 0} · Events: ${status.localEvents || 0} · Started: ${escapeHtml(startedAt)}
        </div>
      </div>
    `;
  }

  function renderDomControls() {
    const hasDom = Boolean(window.NovaDOMInspector);
    const summary = hasDom && typeof window.NovaDOMInspector.summary === 'function'
      ? window.NovaDOMInspector.summary()
      : null;
    const counts = summary ? summary.counts : { totalElements: 0, buttons: 0, inputs: 0, links: 0, tables: 0 };

    return `
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
          <div style="font-weight:700;color:#38bdf8;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">DevKit / DOM Inspector</div>
          <div style="font-weight:700;color:${hasDom ? '#22c55e' : '#f87171'};text-transform:uppercase;font-size:11px;">● ${hasDom ? 'ready' : 'missing'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-nova-dom-summary style="${buttonStyle('rgba(56,189,248,.55)')}">Copy DOM Summary</button>
          <button data-nova-dom-full style="${buttonStyle('rgba(168,85,247,.55)')}">Copy Full DOM</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px;">
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${counts.totalElements || 0}</div><div style="color:#9ca3af;">All</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${counts.buttons || 0}</div><div style="color:#9ca3af;">Btns</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${counts.inputs || 0}</div><div style="color:#9ca3af;">Inputs</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${counts.links || 0}</div><div style="color:#9ca3af;">Links</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${counts.tables || 0}</div><div style="color:#9ca3af;">Tables</div></div>
        </div>
      </div>
    `;
  }

  function moduleRow(module) {
    const enabled = module.enabled !== false;
    const api = module.api ? `<div style="color:#9ca3af;margin-top:3px;">API: ${escapeHtml(module.api)}</div>` : '';
    const description = module.description ? `<div style="color:#d1d5db;margin-top:4px;line-height:1.35;">${escapeHtml(module.description)}</div>` : '';
    return `<div style="padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.04);margin-bottom:8px;"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><div style="font-weight:700;">${escapeHtml(module.name || module.id || 'Unnamed module')}</div><div style="font-size:10px;color:${enabled ? '#22c55e' : '#f87171'};text-transform:uppercase;">${enabled ? 'enabled' : 'disabled'}</div></div><div style="color:#9ca3af;margin-top:3px;">ID: ${escapeHtml(module.id || 'unknown')}</div>${api}${description}</div>`;
  }

  function bind(selector, handler) {
    const el = state.panel && state.panel.querySelector(selector);
    if (el) el.addEventListener('click', handler);
  }

  function render() {
    const panel = createPanel();
    const modules = getModules();
    const groups = groupModules(modules);
    const groupNames = Object.keys(groups);
    const body = groupNames.length
      ? groupNames.map((group) => `<div style="margin:0 0 12px;"><div style="font-weight:700;color:#22d3ee;margin:0 0 8px;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">${escapeHtml(group)}</div>${groups[group].map(moduleRow).join('')}</div>`).join('')
      : '<div style="color:#9ca3af;line-height:1.45;">No modules registered yet. Add entries to <b>modules/modules.registry.json</b>.</div>';

    panel.innerHTML = `
      <div style="padding:10px 12px;font-weight:700;background:linear-gradient(90deg,#a855f7,#22d3ee);display:flex;justify-content:space-between;align-items:center;">
        <span>Nova Modules</span>
        <button data-nova-menu-close style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:4px 7px;cursor:pointer;">×</button>
      </div>
      <div style="padding:10px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.08);">
        <button data-nova-menu-refresh style="${buttonStyle()}">Refresh Registry</button>
        <button data-nova-session-start style="${buttonStyle()}">Start Session</button>
        <button data-nova-session-copy style="${buttonStyle()}">Copy Session</button>
      </div>
      ${renderSessionStatus()}
      ${renderTraceControls()}
      ${renderDomControls()}
      <div style="padding:10px;overflow:auto;max-height:160px;">
        <div style="color:#9ca3af;margin-bottom:10px;">Build: ${escapeHtml((window.Nova && window.Nova.build) || 'unknown')}</div>
        ${body}
      </div>
    `;

    bind('[data-nova-menu-close]', () => window.NovaMenu.hide());
    bind('[data-nova-menu-refresh]', async () => { if (window.Nova && window.Nova.loadRegistry) { await window.Nova.loadRegistry(); emit('registry-refresh', 'Module registry refreshed', { count: getModules().length }); render(); } });
    bind('[data-nova-session-start]', () => { if (window.NovaSession && !window.NovaSession.isActive()) { window.NovaSession.start({ name: 'Nova Manual Session' }); emit('session-start', 'Session started from menu'); render(); } });
    bind('[data-nova-session-copy]', () => { if (window.NovaSession) { window.NovaSession.copy(); emit('session-copy', 'Session copied from menu'); } });
    bind('[data-nova-session-pause]', () => { if (window.NovaSession) { window.NovaSession.pause(); render(); } });
    bind('[data-nova-session-resume]', () => { if (window.NovaSession) { window.NovaSession.resume(); render(); } });
    bind('[data-nova-session-stop]', () => { if (window.NovaSession) { window.NovaSession.stop(); render(); } });
    bind('[data-nova-session-clear]', () => { if (window.NovaSession) { window.NovaSession.clear(); render(); } });
    bind('[data-nova-session-sync]', () => { if (window.NovaSession && window.NovaSession.sync) { window.NovaSession.sync(); emit('session-sync', 'Manual session sync from menu'); render(); } });
    bind('[data-nova-trace-start]', () => { if (window.NovaTraceNetwork) { window.NovaTraceNetwork.start({ sessionName: 'Nova Trace Session' }); emit('trace-start', 'Trace started from menu'); render(); } });
    bind('[data-nova-trace-stop]', () => { if (window.NovaTraceNetwork) { window.NovaTraceNetwork.stop(); emit('trace-stop', 'Trace stopped from menu'); render(); } });
    bind('[data-nova-trace-clear]', () => { if (window.NovaTraceNetwork) { window.NovaTraceNetwork.clear(); emit('trace-clear', 'Trace cleared from menu'); render(); } });
    bind('[data-nova-trace-copy]', () => { if (window.NovaTraceNetwork) { window.NovaTraceNetwork.copy(); emit('trace-copy', 'Trace copied from menu'); } });
    bind('[data-nova-dom-summary]', () => { if (window.NovaDOMInspector) { const snapshot = window.NovaDOMInspector.summary(); navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2)); emit('dom-summary-copy', 'DOM summary copied from menu', snapshot.counts); render(); } });
    bind('[data-nova-dom-full]', () => { if (window.NovaDOMInspector) { window.NovaDOMInspector.copy(); emit('dom-full-copy', 'Full DOM snapshot copied from menu'); render(); } });
  }

  function startLiveRefresh() {
    if (state.refreshTimer) return;
    state.refreshTimer = setInterval(() => { if (state.open) render(); }, 3000);
  }

  window.NovaMenu = {
    show() { createButton(); render(); state.panel.style.display = 'block'; state.open = true; startLiveRefresh(); emit('open', 'Nova menu opened', { modules: getModules().length }); },
    hide() { if (state.panel) state.panel.style.display = 'none'; state.open = false; emit('close', 'Nova menu closed'); },
    toggle() { if (state.open) this.hide(); else this.show(); },
    refresh() { render(); },
    init() { createButton(); console.log('[Nova Core] NovaMenu initialized'); }
  };

  window.NovaMenu.init();
})();
