// core/nova-trace.js
(function () {
  'use strict';

  if (window.NovaTraceNetwork) return;

  const state = {
    logs: [],
    originalFetch: window.fetch,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send,
    enabled: false
  };

  function sessionAdd(type, data) {
    if (!window.NovaSession || !window.NovaSession.isActive()) return;
    window.NovaSession.addEvent({
      module: 'trace-network',
      type,
      summary: data && data.method && data.url ? data.method + ' ' + data.url : type,
      data: data || {}
    });
  }

  function add(type, data) {
    if (!state.enabled) return;

    const entry = {
      time: new Date().toISOString(),
      type,
      pageUrl: location.href,
      ...data
    };

    state.logs.push(entry);
    sessionAdd(type, entry);
    console.log('[Nova Trace Network]', type, data);
  }

  function hookFetch() {
    if (!window.fetch || window.fetch.__novaTraceNetworkHooked) return;

    window.fetch = async function novaTraceFetch(input, init = {}) {
      const started = performance.now();
      const url = typeof input === 'string'
        ? input
        : input && input.url
          ? input.url
          : String(input);

      const method =
        init.method ||
        (input && input.method) ||
        'GET';

      add('fetch-request', { method, url });

      try {
        const response = await state.originalFetch.apply(this, arguments);

        add('fetch-response', {
          method,
          url,
          status: response.status,
          ok: response.ok,
          durationMs: Math.round(performance.now() - started)
        });

        return response;
      } catch (error) {
        add('fetch-error', {
          method,
          url,
          error: error.message,
          durationMs: Math.round(performance.now() - started)
        });

        throw error;
      }
    };

    window.fetch.__novaTraceNetworkHooked = true;
  }

  function hookXhr() {
    if (XMLHttpRequest.prototype.open.__novaTraceNetworkHooked) return;

    XMLHttpRequest.prototype.open = function novaTraceXhrOpen(method, url) {
      this.__novaTraceNetwork = { method, url, started: 0 };
      return state.originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.open.__novaTraceNetworkHooked = true;

    XMLHttpRequest.prototype.send = function novaTraceXhrSend() {
      const trace = this.__novaTraceNetwork || { method: 'GET', url: 'unknown' };
      trace.started = performance.now();

      add('xhr-request', { method: trace.method, url: trace.url });

      this.addEventListener('loadend', () => {
        add('xhr-response', {
          method: trace.method,
          url: trace.url,
          status: this.status,
          durationMs: Math.round(performance.now() - trace.started)
        });
      });

      return state.originalXhrSend.apply(this, arguments);
    };
  }

  window.NovaTraceNetwork = {
    start(options = {}) {
      if (window.NovaSession && !window.NovaSession.isActive()) {
        window.NovaSession.start({ name: options.sessionName || 'Nova Trace Session' });
      }

      state.enabled = true;
      hookFetch();
      hookXhr();
      sessionAdd('trace-start', { pageUrl: location.href });

      console.log('[Nova Trace Network] Started');
    },

    stop(options = {}) {
      sessionAdd('trace-stop', { pageUrl: location.href, count: state.logs.length });
      state.enabled = false;

      if (options.stopSession && window.NovaSession) {
        window.NovaSession.stop();
      }

      console.log('[Nova Trace Network] Stopped');
    },

    clear() {
      state.logs = [];
      sessionAdd('trace-clear', { pageUrl: location.href });
      console.log('[Nova Trace Network] Cleared');
    },

    getLogs() {
      return state.logs.slice();
    },

    copy() {
      const payload = {
        tool: 'Nova Trace Network',
        version: '0.2.0-session',
        exportedAt: new Date().toISOString(),
        note: 'Metadata only. Headers, bodies, cookies, tokens and secrets are not collected.',
        session: window.NovaSession ? window.NovaSession.current : null,
        logs: state.logs
      };

      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      return payload;
    }
  };

  console.log('[Nova Trace Network] Loaded. Use NovaTraceNetwork.start().');
})();
