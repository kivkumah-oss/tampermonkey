// core/nova-trace-network.js
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

  function add(type, data) {
    if (!state.enabled) return;

    state.logs.push({
      time: new Date().toISOString(),
      type,
      pageUrl: location.href,
      ...data
    });

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

      add('fetch-request', {
        method,
        url
      });

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
      this.__novaTraceNetwork = {
        method,
        url,
        started: 0
      };

      return state.originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.open.__novaTraceNetworkHooked = true;

    XMLHttpRequest.prototype.send = function novaTraceXhrSend() {
      const trace = this.__novaTraceNetwork || {
        method: 'GET',
        url: 'unknown'
      };

      trace.started = performance.now();

      add('xhr-request', {
        method: trace.method,
        url: trace.url
      });

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
    start() {
      state.enabled = true;
      hookFetch();
      hookXhr();

      console.log('[Nova Trace Network] Started');
    },

    stop() {
      state.enabled = false;
      console.log('[Nova Trace Network] Stopped');
    },

    clear() {
      state.logs = [];
      console.log('[Nova Trace Network] Cleared');
    },

    getLogs() {
      return state.logs.slice();
    },

    copy() {
      const payload = {
        tool: 'Nova Trace Network',
        version: '0.1.0-safe',
        exportedAt: new Date().toISOString(),
        note: 'Metadata only. Headers, bodies, cookies, tokens and secrets are not collected.',
        logs: state.logs
      };

      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      return payload;
    }
  };

  console.log('[Nova Trace Network] Loaded. Use NovaTraceNetwork.start().');
})();
