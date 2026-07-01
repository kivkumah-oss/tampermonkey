// core/nova-memory-panel.js

(function () {
  'use strict';

  if (window.NovaMemoryPanel) {
    console.warn('[Nova Core] NovaMemoryPanel already loaded');
    return;
  }

  const PANEL_ID = 'nova-memory-panel';

  const state = {
    open: false,
    panel: null
  };

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function buttonStyle(accent) {
    return [
      'background:rgba(255,255,255,.08)',
      'color:#fff',
      'border:1px solid ' + (accent || 'rgba(34,211,238,.45)'),
      'border-radius:8px',
      'padding:6px 8px',
      'cursor:pointer',
      'font:12px Arial,sans-serif'
    ].join(';');
  }

  function emit(type, summary, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({
      module: 'memory-panel',
      type,
      summary,
      data: data || {}
    });
  }

  function createPanel() {
    if (state.panel) return state.panel;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:64px',
      'width:min(390px,calc(100vw - 32px))',
      'max-height:min(540px,calc(100vh - 96px))',
      'overflow:hidden',
      'z-index:2147483646',
      'background:rgba(10,10,18,.97)',
      'color:#fff',
      'border:1px solid rgba(240,171,252,.5)',
      'box-shadow:0 0 22px rgba(240,171,252,.4)',
      'border-radius:14px',
      'font:12px Arial,sans-serif',
      'display:none'
    ].join(';');

    document.body.appendChild(panel);
    state.panel = panel;
    return panel;
  }

  function getSummary() {
    if (!window.NovaMemory || typeof window.NovaMemory.summary !== 'function') {
      return { host: location.hostname, visits: 0, pages: 0, notes: 0, selectors: 0, endpoints: 0, modules: 0, findings: 0 };
    }
    return window.NovaMemory.summary();
  }

  function render() {
    const panel = createPanel();
    const hasMemory = Boolean(window.NovaMemory);
    const summary = getSummary();

    panel.innerHTML = `
      <div style="padding:10px 12px;font-weight:700;background:linear-gradient(90deg,#ec4899,#8b5cf6);display:flex;justify-content:space-between;align-items:center;">
        <span>Nova Memory</span>
        <button data-nova-memory-close style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:4px 7px;cursor:pointer;">×</button>
      </div>
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">
          <div style="font-weight:700;color:#f0abfc;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">${escapeHtml(summary.host || location.hostname)}</div>
          <div style="font-weight:700;color:${hasMemory ? '#22c55e' : '#f87171'};text-transform:uppercase;font-size:11px;">● ${hasMemory ? 'ready' : 'missing'}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;">
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.visits || 0}</div><div style="color:#9ca3af;">Visits</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.pages || 0}</div><div style="color:#9ca3af;">Pages</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.notes || 0}</div><div style="color:#9ca3af;">Notes</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.findings || 0}</div><div style="color:#9ca3af;">Finds</div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.selectors || 0}</div><div style="color:#9ca3af;">Selectors</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.endpoints || 0}</div><div style="color:#9ca3af;">Endpoints</div></div>
          <div style="background:rgba(255,255,255,.05);border-radius:9px;padding:7px;text-align:center;"><div style="font-size:15px;font-weight:700;">${summary.modules || 0}</div><div style="color:#9ca3af;">Modules</div></div>
        </div>
      </div>
      <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);">
        <textarea data-nova-memory-note placeholder="Quick note for this website..." style="width:100%;height:72px;box-sizing:border-box;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(240,171,252,.35);border-radius:10px;padding:8px;resize:vertical;font:12px Arial,sans-serif;"></textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <button data-nova-memory-add-note style="${buttonStyle('rgba(34,197,94,.55)')}">Save Note</button>
          <button data-nova-memory-add-finding style="${buttonStyle('rgba(240,171,252,.55)')}">Save Finding</button>
          <button data-nova-memory-copy style="${buttonStyle('rgba(168,85,247,.55)')}">Copy Host Memory</button>
          <button data-nova-memory-clear-host style="${buttonStyle('rgba(248,113,113,.55)')}">Clear Host</button>
        </div>
      </div>
      <div style="padding:10px;">
        <input data-nova-memory-search placeholder="Search local memory..." style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(240,171,252,.35);border-radius:10px;padding:8px;font:12px Arial,sans-serif;" />
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <button data-nova-memory-search-button style="${buttonStyle('rgba(56,189,248,.55)')}">Search</button>
          <button data-nova-memory-copy-all style="${buttonStyle('rgba(240,171,252,.55)')}">Copy All Memory</button>
        </div>
        <pre data-nova-memory-results style="white-space:pre-wrap;max-height:130px;overflow:auto;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;margin:8px 0 0;color:#d1d5db;font:11px monospace;">Ready.</pre>
      </div>
    `;

    bind('[data-nova-memory-close]', () => window.NovaMemoryPanel.hide());
    bind('[data-nova-memory-add-note]', () => saveText('note'));
    bind('[data-nova-memory-add-finding]', () => saveText('finding'));
    bind('[data-nova-memory-copy]', () => {
      if (window.NovaMemory) {
        window.NovaMemory.copy(location.hostname);
        setResults('Host memory copied.');
        emit('memory-copy-host', 'Host memory copied from panel');
      }
    });
    bind('[data-nova-memory-copy-all]', () => {
      if (window.NovaMemory) {
        window.NovaMemory.copy();
        setResults('All memory copied.');
        emit('memory-copy-all', 'All memory copied from panel');
      }
    });
    bind('[data-nova-memory-clear-host]', () => {
      if (window.NovaMemory && confirm('Clear Nova Memory for this website?')) {
        window.NovaMemory.clear(location.hostname);
        setResults('Host memory cleared.');
        emit('memory-clear-host', 'Host memory cleared from panel');
        render();
      }
    });
    bind('[data-nova-memory-search-button]', () => {
      const input = state.panel.querySelector('[data-nova-memory-search]');
      const query = input ? input.value : '';
      if (window.NovaMemory) {
        const results = window.NovaMemory.search(query, location.hostname).slice(0, 20);
        setResults(JSON.stringify(results, null, 2));
        emit('memory-search', 'Memory searched from panel', { query, results: results.length });
      }
    });
  }

  function bind(selector, handler) {
    const el = state.panel && state.panel.querySelector(selector);
    if (el) el.addEventListener('click', handler);
  }

  function setResults(text) {
    const results = state.panel && state.panel.querySelector('[data-nova-memory-results]');
    if (results) results.textContent = text;
  }

  function saveText(type) {
    if (!window.NovaMemory) return;
    const input = state.panel && state.panel.querySelector('[data-nova-memory-note]');
    const text = input ? input.value.trim() : '';
    if (!text) {
      setResults('Nothing to save.');
      return;
    }

    if (type === 'note') window.NovaMemory.addNote(text, { tags: ['manual'] });
    else window.NovaMemory.addFinding(text, { tags: ['manual'] });

    if (input) input.value = '';
    setResults(type === 'note' ? 'Note saved.' : 'Finding saved.');
    emit(type === 'note' ? 'memory-note-save' : 'memory-finding-save', 'Memory text saved from panel', { type });
    render();
  }

  window.NovaMemoryPanel = {
    show() {
      render();
      state.panel.style.display = 'block';
      state.open = true;
      emit('memory-panel-open', 'Nova Memory panel opened');
    },
    hide() {
      if (state.panel) state.panel.style.display = 'none';
      state.open = false;
      emit('memory-panel-close', 'Nova Memory panel closed');
    },
    toggle() {
      if (state.open) this.hide();
      else this.show();
    },
    refresh() {
      if (state.open) render();
    },
    init() {
      console.log('[Nova Core] NovaMemoryPanel initialized');
    }
  };

  window.NovaMemoryPanel.init();
})();
