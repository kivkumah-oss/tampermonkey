// core/nova-menu.js

(function () {
  'use strict';

  if (window.NovaMenu) return;

  const VERSION = '2.0.0';
  const ORB_ID = 'nova-modules-button';
  const MENU_ID = 'nova-modules-menu';
  const POS_KEY = 'nova.orb.position';

  const state = { open: false, view: 'modules', orb: null, panel: null, dragging: false };

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

  function moduleItems() {
    return modules().filter((m) => m && !m.core && m.enabled !== false);
  }

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({ module: 'menu', type, summary, data: data || {} });
  }

  function btnStyle(accent) {
    return 'background:rgba(255,255,255,.08);color:#fff;border:1px solid ' + (accent || 'rgba(34,211,238,.45)') + ';border-radius:9px;padding:7px 9px;cursor:pointer;font:700 12px Arial,sans-serif;';
  }

  function createOrb() {
    if (state.orb) return state.orb;
    const orb = document.createElement('button');
    orb.id = ORB_ID;
    orb.textContent = 'Nova';
    orb.title = 'Nova';
    orb.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'width:58px',
      'height:38px',
      'border-radius:999px',
      'border:1px solid rgba(34,211,238,.75)',
      'background:rgba(10,10,18,.96)',
      'color:#fff',
      'font:800 13px Arial,sans-serif',
      'box-shadow:0 0 18px rgba(34,211,238,.55)',
      'cursor:pointer',
      'user-select:none',
      'touch-action:none'
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
    let down = false;
    let moved = false;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let st = 0;

    function point(e) {
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }

    function start(e) {
      const p = point(e);
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
      e.preventDefault();
    }

    function move(e) {
      if (!down) return;
      const p = point(e);
      const dx = p.x - sx;
      const dy = p.y - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      const x = Math.max(4, Math.min(window.innerWidth - orb.offsetWidth - 4, sl + dx));
      const y = Math.max(4, Math.min(window.innerHeight - orb.offsetHeight - 4, st + dy));
      orb.style.left = x + 'px';
      orb.style.top = y + 'px';
      orb.style.right = 'auto';
      orb.style.bottom = 'auto';
      if (state.panel) placePanelNearOrb();
      e.preventDefault();
    }

    function end() {
      if (!down) return;
      down = false;
      const rect = orb.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
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
    if (state.panel) return state.panel;
    const panel = document.createElement('div');
    panel.id = MENU_ID;
    panel.style.cssText = [
      'position:fixed',
      'width:min(380px,calc(100vw - 24px))',
      'max-height:min(620px,calc(100vh - 80px))',
      'overflow:hidden',
      'z-index:2147483646',
      'background:rgba(10,10,18,.98)',
      'color:#fff',
      'border:1px solid rgba(34,211,238,.45)',
      'box-shadow:0 0 24px rgba(34,211,238,.38)',
      'border-radius:16px',
      'font:12px Arial,sans-serif',
      'display:none'
    ].join(';');
    document.body.appendChild(panel);
    state.panel = panel;
    return panel;
  }

  function placePanelNearOrb() {
    const panel = createPanel();
    const orb = createOrb();
    const o = orb.getBoundingClientRect();
    const w = panel.offsetWidth || 380;
    const h = panel.offsetHeight || 420;
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
    const items = moduleItems();
    if (!items.length) return '<div style="color:#9ca3af;padding:10px;">No modules registered yet.</div>';
    return items.map((m) => {
      const canLoad = !window.NovaModuleLoader || !window.NovaModuleLoader.canLoad ? true : window.NovaModuleLoader.canLoad(m);
      const loaded = window.NovaModuleLoader && window.NovaModuleLoader.loaded && window.NovaModuleLoader.loaded.has(m.id);
      return `
        <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <div>
              <div style="font-weight:800;color:#fff;">${esc(m.name || m.id)}</div>
              <div style="color:#9ca3af;margin-top:3px;line-height:1.35;">${esc(m.description || '')}</div>
            </div>
            <button data-nova-launch="${esc(m.id)}" style="${btnStyle(canLoad ? 'rgba(34,211,238,.6)' : 'rgba(248,113,113,.5)')}">${loaded ? 'Loaded' : canLoad ? 'Launch' : 'Wrong site'}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function sessionStatus() {
    const active = window.NovaSession && window.NovaSession.isActive && window.NovaSession.isActive();
    return active ? 'ON' : 'OFF';
  }

  function traceStatus() {
    const status = window.NovaTraceNetwork && window.NovaTraceNetwork.getStatus ? window.NovaTraceNetwork.getStatus() : null;
    return status && status.enabled ? 'ON' : 'OFF';
  }

  function renderAdvanced() {
    const build = window.Nova ? window.Nova.build || 'unknown' : 'missing';
    return `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;">
        <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px;text-align:center;"><b>Session</b><br><span style="color:#9ca3af;">${sessionStatus()}</span></div>
        <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px;text-align:center;"><b>Trace</b><br><span style="color:#9ca3af;">${traceStatus()}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button data-nova-act="session-start" style="${btnStyle('rgba(34,197,94,.55)')}">Start Session</button>
        <button data-nova-act="session-stop" style="${btnStyle('rgba(248,113,113,.55)')}">Stop Session</button>
        <button data-nova-act="trace-start" style="${btnStyle('rgba(34,211,238,.55)')}">Start Trace</button>
        <button data-nova-act="trace-stop" style="${btnStyle('rgba(248,113,113,.55)')}">Stop Trace</button>
        <button data-nova-act="memory" style="${btnStyle('rgba(240,171,252,.55)')}">Memory</button>
        <button data-nova-act="bundle-summary" style="${btnStyle('rgba(168,85,247,.55)')}">Copy Bundle</button>
        <button data-nova-act="bundle-extended" style="${btnStyle('rgba(168,85,247,.75)')}">Copy Extended</button>
        <button data-nova-act="refresh" style="${btnStyle('rgba(34,211,238,.55)')}">Refresh Registry</button>
      </div>
      <div style="color:#9ca3af;line-height:1.45;">Build: ${esc(build)}<br>Core modules remain loaded, but advanced controls stay hidden here.</div>
    `;
  }

  function render() {
    const panel = createPanel();
    const isModules = state.view === 'modules';
    panel.innerHTML = `
      <div style="padding:12px;background:linear-gradient(90deg,#22d3ee,#8b5cf6);display:flex;justify-content:space-between;align-items:center;font-weight:900;">
        <span>Nova</span>
        <button data-nova-close style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:4px 8px;cursor:pointer;">×</button>
      </div>
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:8px;">
        <button data-nova-view="modules" style="${btnStyle(isModules ? 'rgba(34,211,238,.9)' : 'rgba(255,255,255,.18)')}">Modules</button>
        <button data-nova-view="advanced" style="${btnStyle(!isModules ? 'rgba(168,85,247,.9)' : 'rgba(255,255,255,.18)')}">Advanced</button>
      </div>
      <div style="padding:10px;overflow:auto;max-height:min(520px,calc(100vh - 180px));">
        ${isModules ? renderModules() : renderAdvanced()}
      </div>
    `;
    bindPanel();
    placePanelNearOrb();
  }

  function bindPanel() {
    const panel = state.panel;
    if (!panel) return;
    const close = panel.querySelector('[data-nova-close]');
    if (close) close.addEventListener('click', () => window.NovaMenu.hide());
    panel.querySelectorAll('[data-nova-view]').forEach((btn) => {
      btn.addEventListener('click', () => { state.view = btn.dataset.novaView; render(); });
    });
    panel.querySelectorAll('[data-nova-launch]').forEach((btn) => {
      btn.addEventListener('click', () => launchModule(btn.dataset.novaLaunch));
    });
    panel.querySelectorAll('[data-nova-act]').forEach((btn) => {
      btn.addEventListener('click', () => advancedAction(btn.dataset.novaAct));
    });
  }

  function launchModule(id) {
    const mod = moduleItems().find((m) => m.id === id);
    if (!mod || !window.NovaModuleLoader) return;
    window.NovaModuleLoader.loadScript(mod);
    emit('module-launch', 'Module launched from Nova menu', { id });
    setTimeout(render, 500);
  }

  function advancedAction(action) {
    if (action === 'session-start' && window.NovaSession) window.NovaSession.start('Nova Investigation');
    if (action === 'session-stop' && window.NovaSession) window.NovaSession.stop();
    if (action === 'trace-start' && window.NovaTraceNetwork) window.NovaTraceNetwork.start();
    if (action === 'trace-stop' && window.NovaTraceNetwork) window.NovaTraceNetwork.stop();
    if (action === 'memory' && window.NovaMemoryPanel) window.NovaMemoryPanel.show();
    if (action === 'bundle-summary' && window.NovaInvestigationExport) window.NovaInvestigationExport.copySummary();
    if (action === 'bundle-extended' && window.NovaInvestigationExport) window.NovaInvestigationExport.copyExtended();
    if (action === 'refresh' && window.Nova && window.Nova.loadRegistry) window.Nova.loadRegistry();
    emit('advanced-action', 'Nova advanced action: ' + action, { action });
    setTimeout(render, 250);
  }

  window.NovaMenu = {
    version: VERSION,
    show() {
      createOrb();
      render();
      state.panel.style.display = 'block';
      state.open = true;
    },
    hide() {
      if (state.panel) state.panel.style.display = 'none';
      state.open = false;
    },
    toggle() {
      if (state.open) this.hide();
      else this.show();
    },
    refresh() {
      if (state.open) render();
    },
    init() {
      createOrb();
      console.log('[Nova Core] NovaMenu UI 2.0 loaded');
    }
  };

  if (document.body) window.NovaMenu.init();
  else document.addEventListener('DOMContentLoaded', () => window.NovaMenu.init(), { once: true });
})();
