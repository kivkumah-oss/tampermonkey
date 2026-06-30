// core/nova-memory-autolearn.js

(function () {
  'use strict';

  if (window.NovaMemoryAutoLearn) {
    console.warn('[Nova Core] NovaMemoryAutoLearn already loaded');
    return;
  }

  const VERSION = '0.1.0';
  const SETTINGS_KEY = 'nova.memory.autolearn.enabled';
  const LAST_LEARN_KEY = 'nova.memory.autolearn.last.';
  const MIN_INTERVAL_MS = 30000;

  const state = {
    enabled: localStorage.getItem(SETTINGS_KEY) !== 'false',
    lastRunAt: null,
    lastSummary: null
  };

  function now() {
    return new Date().toISOString();
  }

  function hostKey() {
    return String(location.hostname || 'unknown').toLowerCase();
  }

  function lastKey() {
    return LAST_LEARN_KEY + hostKey();
  }

  function canRun(force) {
    if (force) return true;
    const previous = Number(localStorage.getItem(lastKey()) || '0');
    return Date.now() - previous > MIN_INTERVAL_MS;
  }

  function safePath(value) {
    return String(value || '').slice(0, 250);
  }

  function rememberSelector(item, reason) {
    if (!window.NovaMemory || !item || !item.path) return null;
    return window.NovaMemory.addSelector(item.path, {
      reason,
      tag: item.tag || '',
      text: item.text || '',
      role: item.role || '',
      ariaLabel: item.ariaLabel || '',
      confidence: 'auto',
      tags: ['auto-learn', reason]
    });
  }

  function learnDom(snapshot) {
    if (!snapshot || !snapshot.elements || !window.NovaMemory) return { selectors: 0, findings: 0 };

    let selectors = 0;
    let findings = 0;
    const elements = snapshot.elements;

    const buttonCandidates = (elements.buttons || [])
      .filter((item) => item.visible && item.path && (item.text || item.ariaLabel || item.role))
      .slice(0, 20);

    buttonCandidates.forEach((item) => {
      rememberSelector(item, 'button');
      selectors += 1;
    });

    const inputCandidates = (elements.inputs || [])
      .filter((item) => item.visible && item.path)
      .slice(0, 20);

    inputCandidates.forEach((item) => {
      rememberSelector(item, 'input');
      selectors += 1;
    });

    const tableCandidates = (elements.tables || [])
      .filter((item) => item.visible && item.path)
      .slice(0, 10);

    tableCandidates.forEach((item) => {
      rememberSelector(item, 'table');
      selectors += 1;
    });

    const counts = snapshot.counts || {};
    if (counts.totalElements || counts.buttons || counts.inputs || counts.tables) {
      window.NovaMemory.addFinding('DOM summary learned for page', {
        confidence: 'auto',
        tags: ['auto-learn', 'dom-summary'],
        counts: {
          totalElements: counts.totalElements || 0,
          buttons: counts.buttons || 0,
          inputs: counts.inputs || 0,
          links: counts.links || 0,
          tables: counts.tables || 0,
          forms: counts.forms || 0
        }
      });
      findings += 1;
    }

    return { selectors, findings };
  }

  function endpointFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin + parsed.pathname;
    } catch (error) {
      return String(url || '').split('?')[0];
    }
  }

  function learnTrace() {
    if (!window.NovaTraceNetwork || !window.NovaMemory || typeof window.NovaTraceNetwork.getLogs !== 'function') {
      return { endpoints: 0 };
    }

    const logs = window.NovaTraceNetwork.getLogs();
    const seen = new Set();
    let endpoints = 0;

    logs.forEach((entry) => {
      if (!entry || !entry.url || !entry.method) return;
      const endpoint = endpointFromUrl(entry.url);
      const key = entry.method + ' ' + endpoint;
      if (seen.has(key)) return;
      seen.add(key);

      window.NovaMemory.addEndpoint(endpoint, {
        method: entry.method,
        status: entry.status || null,
        ok: typeof entry.ok === 'boolean' ? entry.ok : null,
        confidence: 'auto',
        tags: ['auto-learn', 'trace'],
        sourceType: entry.type || ''
      });
      endpoints += 1;
    });

    return { endpoints };
  }

  function learn(options = {}) {
    if (!state.enabled && !options.force) return { skipped: true, reason: 'disabled' };
    if (!canRun(Boolean(options.force))) return { skipped: true, reason: 'rate-limited' };
    if (!window.NovaMemory) return { skipped: true, reason: 'missing-memory' };

    let domResult = { selectors: 0, findings: 0 };
    if (window.NovaDOMInspector && typeof window.NovaDOMInspector.inspect === 'function') {
      const snapshot = window.NovaDOMInspector.inspect({ includeElements: true });
      domResult = learnDom(snapshot);
    }

    const traceResult = learnTrace();

    const summary = {
      learnedAt: now(),
      host: hostKey(),
      selectors: domResult.selectors,
      findings: domResult.findings,
      endpoints: traceResult.endpoints
    };

    state.lastRunAt = summary.learnedAt;
    state.lastSummary = summary;
    localStorage.setItem(lastKey(), String(Date.now()));

    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({
        module: 'memory-autolearn',
        type: 'auto-learn',
        summary: 'Nova Memory auto-learn completed',
        data: summary
      });
    }

    console.log('[Nova Memory AutoLearn] Completed', summary);
    return summary;
  }

  window.NovaMemoryAutoLearn = {
    version: VERSION,
    learn,
    enable() {
      state.enabled = true;
      localStorage.setItem(SETTINGS_KEY, 'true');
      return true;
    },
    disable() {
      state.enabled = false;
      localStorage.setItem(SETTINGS_KEY, 'false');
      return true;
    },
    isEnabled() {
      return state.enabled;
    },
    status() {
      return {
        enabled: state.enabled,
        lastRunAt: state.lastRunAt,
        lastSummary: state.lastSummary,
        host: hostKey()
      };
    }
  };

  setTimeout(() => {
    window.NovaMemoryAutoLearn.learn();
  }, 1500);

  console.log('[Nova Core] NovaMemoryAutoLearn loaded');
})();
