// core/nova-menu.js

(function () {
  'use strict';

  if (window.NovaMenu) {
    console.warn('[Nova Core] NovaMenu already loaded');
    return;
  }

  const MENU_ID = 'nova-modules-menu';
  const BUTTON_ID = 'nova-modules-button';

  const state = {
    open: false,
    button: null,
    panel: null
  };

  function getModules() {
    if (window.Nova && typeof window.Nova.getModules === 'function') {
      return window.Nova.getModules();
    }
    if (window.Nova && Array.isArray(window.Nova.modulesRegistry)) {
      return window.Nova.modulesRegistry;
    }
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
    window.NovaSession.addEvent({
      module: 'menu',
      type,
      summary,
      data: data || {}
    });
  }

  function createButton() {
    if (state.button) return state.button;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = 'Nova';
    button.title = 'Open Nova Modules';
    button.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483646',
      'padding:10px 14px',
      'border-radius:999px',
      'border:1px solid rgba(34,211,238,.55)',
      'background:rgba(10,10,18,.96)',
      'color:#fff',
      'font:700 13px Arial,sans-serif',
      'box-shadow:0 0 18px rgba(34,211,238,.45)',
      'cursor:pointer'
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
      'position:fixed',
      'right:16px',
      'bottom:64px',
      'width:min(380px,calc(100vw - 32px))',
      'max-height:min(520px,calc(100vh - 96px))',
      'overflow:hidden',
      'z-index:2147483646',
      'background:rgba(10,10,18,.97)',
      'color:#fff',
      'border:1px solid rgba(168,85,247,.5)',
      'box-shadow:0 0 22px rgba(168,85,247,.5)',
      'border-radius:14px',
      'font:12px Arial,sans-serif',
      'display:none'
    ].join(';');

    document.body.appendChild(panel);
    state.panel = panel;
    return panel;
  }

  function moduleRow(module) {
    const enabled = module.enabled !== false;
    const status = enabled ? 'enabled' : 'disabled';
    const api = module.api ? `<div style="color:#9ca3af;margin-top:3px;">API: ${escapeHtml(module.api)}</div>` : '';
    const description = module.description ? `<div style="color:#d1d5db;margin-top:4px;line-height:1.35;">${escapeHtml(module.description)}</div>` : '';

    return `
      <div style="padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.04);margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <div style="font-weight:700;">${escapeHtml(module.name || module.id || 'Unnamed module')}</div>
          <div style="font-size:10px;color:${enabled ? '#22c55e' : '#f87171'};text-transform:uppercase;">${status}</div>
        </div>
        <div style="color:#9ca3af;margin-top:3px;">ID: ${escapeHtml(module.id || 'unknown')}</div>
        ${api}
        ${description}
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function render() {
    const panel = createPanel();
    const modules = getModules();
    const groups = groupModules(modules);
    const groupNames = Object.keys(groups);

    const body = groupNames.length
      ? groupNames.map((group) => `
          <div style="margin:0 0 12px;">
            <div style="font-weight:700;color:#22d3ee;margin:0 0 8px;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">${escapeHtml(group)}</div>
            ${groups[group].map(moduleRow).join('')}
          </div>
        `).join('')
      : '<div style="color:#9ca3af;line-height:1.45;">No modules registered yet. Add entries to <b>modules/modules.registry.json</b>.</div>';

    panel.innerHTML = `
      <div style="padding:10px 12px;font-weight:700;background:linear-gradient(90deg,#a855f7,#22d3ee);display:flex;justify-content:space-between;align-items:center;">
        <span>Nova Modules</span>
        <button data-nova-menu-close style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:4px 7px;cursor:pointer;">×</button>
      </div>
      <div style="padding:10px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.08);">
        <button data-nova-menu-refresh style="background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:8px;padding:6px 8px;cursor:pointer;">Refresh Registry</button>
        <button data-nova-session-start style="background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:8px;padding:6px 8px;cursor:pointer;">Start Session</button>
        <button data-nova-session-copy style="background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:8px;padding:6px 8px;cursor:pointer;">Copy Session</button>
      </div>
      <div style="padding:10px;overflow:auto;max-height:390px;">
        <div style="color:#9ca3af;margin-bottom:10px;">Build: ${escapeHtml((window.Nova && window.Nova.build) || 'unknown')}</div>
        ${body}
      </div>
    `;

    panel.querySelector('[data-nova-menu-close]').addEventListener('click', () => window.NovaMenu.hide());
    panel.querySelector('[data-nova-menu-refresh]').addEventListener('click', async () => {
      if (window.Nova && typeof window.Nova.loadRegistry === 'function') {
        await window.Nova.loadRegistry();
        render();
        emit('registry-refresh', 'Module registry refreshed', { count: getModules().length });
      }
    });
    panel.querySelector('[data-nova-session-start]').addEventListener('click', () => {
      if (window.NovaSession && !window.NovaSession.isActive()) {
        window.NovaSession.start({ name: 'Nova Manual Session' });
        emit('session-start', 'Session started from menu');
      }
    });
    panel.querySelector('[data-nova-session-copy]').addEventListener('click', () => {
      if (window.NovaSession) {
        window.NovaSession.copy();
        emit('session-copy', 'Session copied from menu');
      }
    });
  }

  window.NovaMenu = {
    show() {
      createButton();
      render();
      state.panel.style.display = 'block';
      state.open = true;
      emit('open', 'Nova menu opened', { modules: getModules().length });
    },

    hide() {
      if (state.panel) state.panel.style.display = 'none';
      state.open = false;
      emit('close', 'Nova menu closed');
    },

    toggle() {
      if (state.open) this.hide();
      else this.show();
    },

    refresh() {
      render();
    },

    init() {
      createButton();
      console.log('[Nova Core] NovaMenu initialized');
    }
  };

  window.NovaMenu.init();
})();
