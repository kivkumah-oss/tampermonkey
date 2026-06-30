// core/nova-trace.js

(function () {
  'use strict';

  if (window.NovaTrace) return;

  const MAX_LOGS = 500;
  const state = {
    recording: false,
    logs: [],
    hooksInstalled: false,
    panel: null,
    list: null,
    status: null,
    originalPushState: history.pushState,
    originalReplaceState: history.replaceState,
    observer: null
  };

  const time = () => new Date().toISOString();

  function log(type, summary, details = {}) {
    if (!state.recording && type !== 'system') return;
    const entry = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2),
      time: time(),
      type,
      summary,
      pageUrl: location.href,
      details
    };
    state.logs.push(entry);
    if (state.logs.length > MAX_LOGS) state.logs.shift();
    render(entry);
  }

  function selector(el) {
    if (!el || el === document) return 'document';
    const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
    const label = el.getAttribute && (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('name') ||
      el.textContent
    );
    const clean = label ? String(label).trim().replace(/\s+/g, ' ').slice(0, 70) : '';
    return tag + id + cls + (clean ? ' "' + clean + '"' : '');
  }

  function render(entry) {
    if (!state.list) return;
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    row.textContent = entry.time.split('T')[1].slice(0, 8) + ' ' + entry.type.toUpperCase() + ' ' + entry.summary;
    row.title = JSON.stringify(entry, null, 2);
    state.list.prepend(row);
  }

  function rerender() {
    if (!state.list) return;
    state.list.innerHTML = '';
    state.logs.slice().reverse().forEach(render);
  }

  function setStatus() {
    if (!state.status) return;
    state.status.textContent = state.recording ? 'Recording' : 'Stopped';
    state.status.style.color = state.recording ? '#22c55e' : '#f87171';
  }

  function panel() {
    if (state.panel) return state.panel;
    const box = document.createElement('div');
    box.id = 'nova-trace-panel';
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;width:min(440px,calc(100vw - 32px));max-height:min(580px,calc(100vh - 32px));overflow:hidden;background:rgba(10,10,18,.96);color:#fff;border:1px solid rgba(34,211,238,.5);box-shadow:0 0 18px rgba(34,211,238,.55);border-radius:14px;z-index:2147483647;font-family:Arial,sans-serif;font-size:12px;';
    box.innerHTML = '<div style="padding:10px 12px;font-weight:700;background:linear-gradient(90deg,#22d3ee,#a855f7);display:flex;justify-content:space-between"><span>Nova Trace</span><span id="nova-trace-status">Stopped</span></div><div style="padding:10px;display:flex;gap:6px;flex-wrap:wrap"><button data-a="start">Start</button><button data-a="stop">Stop</button><button data-a="clear">Clear</button><button data-a="copy">Copy JSON</button><button data-a="hide">Hide</button></div><div style="padding:0 10px 8px;color:#9ca3af;line-height:1.35">Local recorder: clicks, inputs metadata, URL changes, and DOM changes.</div><div id="nova-trace-list" style="padding:8px 10px;overflow:auto;max-height:420px;border-top:1px solid rgba(255,255,255,.12)"></div>';
    box.querySelectorAll('button').forEach((button) => {
      button.style.cssText = 'background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:8px;padding:6px 8px;cursor:pointer;';
    });
    box.addEventListener('click', (e) => {
      const a = e.target && e.target.dataset && e.target.dataset.a;
      if (!a) return;
      e.stopPropagation();
      if (a === 'start') window.NovaTrace.start();
      if (a === 'stop') window.NovaTrace.stop();
      if (a === 'clear') window.NovaTrace.clear();
      if (a === 'copy') window.NovaTrace.copy();
      if (a === 'hide') window.NovaTrace.hide();
    }, true);
    document.body.appendChild(box);
    state.panel = box;
    state.list = box.querySelector('#nova-trace-list');
    state.status = box.querySelector('#nova-trace-status');
    setStatus();
    rerender();
    return box;
  }

  function installHooks() {
    if (state.hooksInstalled) return;
    state.hooksInstalled = true;

    history.pushState = function novaTracePushState() {
      const out = state.originalPushState.apply(this, arguments);
      log('url', 'pushState ' + location.href);
      return out;
    };

    history.replaceState = function novaTraceReplaceState() {
      const out = state.originalReplaceState.apply(this, arguments);
      log('url', 'replaceState ' + location.href);
      return out;
    };

    window.addEventListener('popstate', () => log('url', 'popstate ' + location.href));
    window.addEventListener('hashchange', () => log('url', 'hashchange ' + location.href));

    document.addEventListener('click', (e) => {
      if (state.panel && state.panel.contains(e.target)) return;
      log('click', selector(e.target), { selector: selector(e.target), x: e.clientX, y: e.clientY });
    }, true);

    document.addEventListener('input', (e) => {
      if (state.panel && state.panel.contains(e.target)) return;
      const v = e.target && e.target.value ? String(e.target.value) : '';
      log('input', selector(e.target), { selector: selector(e.target), inputType: e.target && e.target.type, hasValue: Boolean(v), valueLength: v.length });
    }, true);

    state.observer = new MutationObserver((mutations) => {
      const added = mutations.reduce((s, m) => s + m.addedNodes.length, 0);
      const removed = mutations.reduce((s, m) => s + m.removedNodes.length, 0);
      const attr = mutations.filter((m) => m.type === 'attributes').length;
      if (added || removed || attr) log('dom', 'changed +' + added + ' -' + removed + ' attr:' + attr, { added, removed, attributes: attr });
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled'] });
  }

  window.NovaTrace = {
    start() {
      panel();
      installHooks();
      state.logs = [];
      state.recording = true;
      setStatus();
      log('system', 'Trace started', { page: location.href });
    },
    stop() {
      log('system', 'Trace stopped', { count: state.logs.length });
      state.recording = false;
      setStatus();
    },
    clear() {
      state.logs = [];
      rerender();
      log('system', 'Trace cleared');
    },
    show() { panel(); },
    hide() {
      if (state.panel) state.panel.remove();
      state.panel = null;
      state.list = null;
      state.status = null;
    },
    getLogs() { return state.logs.slice(); },
    copy() {
      const payload = { tool: 'Nova Trace', version: '0.1.0', page: location.href, exportedAt: time(), logs: state.logs };
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      log('system', 'Copied trace JSON to clipboard');
      return payload;
    }
  };

  console.log('[Nova Core] NovaTrace loaded. Use NovaTrace.show() or NovaTrace.start().');
})();
