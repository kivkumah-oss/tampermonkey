// core/nova-trace.js
(function () {
  'use strict';

  if (window.NovaTraceNetwork) return;

  const TRACE_ACTIVE_KEY = 'nova.trace.active';
  const TRACE_STARTED_AT_KEY = 'nova.trace.startedAt';
  const TRACE_PAGE_COUNT_KEY = 'nova.trace.pageCount';

  const state = {
    logs: [],
    originalFetch: window.fetch,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send,
    enabled: false,
    autoResumed: false
  };

  function readFlag(key) {
    return localStorage.getItem(key) === 'true';
  }

  function writeFlag(key, value) {
    localStorage.setItem(key, value ? 'true' : 'false');
  }

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

      const method = init.method || (input && input.method) || 'GET';

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

  function incrementPageCount() {
    const current = Number(localStorage.getItem(TRACE_PAGE_COUNT_KEY) || '0');
    const next = current + 1;
    localStorage.setItem(TRACE_PAGE_COUNT_KEY, String(next));
    return next;
  }

  function enable(options = {}) {
    if (window.NovaSession && !window.NovaSession.isActive()) {
      window.NovaSession.resume();
      if (!window.NovaSession.isActive()) {
        window.NovaSession.start({ name: options.sessionName || 'Nova Trace Session' });
      }
    }

    state.enabled = true;
    hookFetch();
    hookXhr();

    if (!options.autoResume) {
      writeFlag(TRACE_ACTIVE_KEY, true);
      localStorage.setItem(TRACE_STARTED_AT_KEY, new Date().toISOString());
      localStorage.setItem(TRACE_PAGE_COUNT_KEY, '1');
      sessionAdd('trace-start', { pageUrl: location.href, mode: 'manual' });
    } else {
      const pages = incrementPageCount();
      sessionAdd('trace-resume', { pageUrl: location.href, mode: 'auto', pages });
    }
  }

  window.NovaTraceNetwork = {
    start(options = {}) {
      enable(options);
      console.log('[Nova Trace Network] Started');
    },

    stop(options = {}) {
      sessionAdd('trace-stop', { pageUrl: location.href, count: state.logs.length });
      state.enabled = false;
      writeFlag(TRACE_ACTIVE_KEY, false);

      if (options.stopSession && window.NovaSession) {
        window.NovaSession.stop();
      }

      console.log('[Nova Trace Network] Stopped');
    },

    clear() {
      state.logs = [];
      localStorage.removeItem(TRACE_STARTED_AT_KEY);
      localStorage.removeItem(TRACE_PAGE_COUNT_KEY);
      sessionAdd('trace-clear', { pageUrl: location.href });
      console.log('[Nova Trace Network] Cleared');
    },

    isActive() {
      return state.enabled;
    },

    getStatus() {
      return {
        enabled: state.enabled,
        persisted: readFlag(TRACE_ACTIVE_KEY),
        autoResumed: state.autoResumed,
        startedAt: localStorage.getItem(TRACE_STARTED_AT_KEY),
        pageCount: Number(localStorage.getItem(TRACE_PAGE_COUNT_KEY) || '0'),
        localEvents: state.logs.length
      };
    },

    getLogs() {
      return state.logs.slice();
    },

    copy() {
      const payload = {
        tool: 'Nova Trace Network',
        version: '0.3.0-auto-resume',
        exportedAt: new Date().toISOString(),
        note: 'Metadata only. Headers, bodies, cookies, tokens and secrets are not collected.',
        status: this.getStatus(),
        session: window.NovaSession ? window.NovaSession.current : null,
        logs: state.logs
      };

      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      return payload;
    }
  };

  if (readFlag(TRACE_ACTIVE_KEY)) {
    state.autoResumed = true;
    setTimeout(() => {
      if (!state.enabled) {
        enable({ autoResume: true, sessionName: 'Nova Trace Session' });
        console.log('[Nova Trace Network] Auto-resumed');
      }
    }, 0);
  }

  console.log('[Nova Trace Network] Loaded. Use NovaTraceNetwork.start().');
})();
