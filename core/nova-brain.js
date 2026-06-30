// core/nova-brain.js

(function () {
  'use strict';

  if (window.NovaBrain) {
    console.warn('[Nova Core] NovaBrain already loaded');
    return;
  }

  const VERSION = '0.1.0';
  const STORE_KEY = 'nova.brain.v1';
  const MAX_INSIGHTS_PER_HOST = 300;

  function now() {
    return new Date().toISOString();
  }

  function hostKey() {
    return String(location.hostname || 'unknown').toLowerCase();
  }

  function makeId() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'brain-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { version: VERSION, createdAt: now(), updatedAt: now(), hosts: {} };
      const parsed = JSON.parse(raw);
      parsed.version = parsed.version || VERSION;
      parsed.hosts = parsed.hosts || {};
      return parsed;
    } catch (error) {
      console.warn('[Nova Brain] Failed to read store', error);
      return { version: VERSION, createdAt: now(), updatedAt: now(), hosts: {} };
    }
  }

  function writeStore(store) {
    try {
      store.updatedAt = now();
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn('[Nova Brain] Failed to write store', error);
      return false;
    }
  }

  function hostRecord(store, host) {
    const key = String(host || hostKey()).toLowerCase();
    store.hosts[key] = store.hosts[key] || {
      host: key,
      createdAt: now(),
      updatedAt: now(),
      runs: 0,
      insights: [],
      lastAnalysis: null
    };
    return store.hosts[key];
  }

  function safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function getDomSummary() {
    if (!window.NovaDOMInspector || typeof window.NovaDOMInspector.summary !== 'function') return null;
    return safeClone(window.NovaDOMInspector.summary());
  }

  function getTraceStatus() {
    if (!window.NovaTraceNetwork || typeof window.NovaTraceNetwork.getStatus !== 'function') return null;
    return safeClone(window.NovaTraceNetwork.getStatus());
  }

  function getTraceLogs() {
    if (!window.NovaTraceNetwork || typeof window.NovaTraceNetwork.getLogs !== 'function') return [];
    return safeClone(window.NovaTraceNetwork.getLogs()) || [];
  }

  function getMemorySummary() {
    if (!window.NovaMemory || typeof window.NovaMemory.summary !== 'function') return null;
    return safeClone(window.NovaMemory.summary());
  }

  function confidence(score) {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  function addInsight(list, insight) {
    const score = insight.score || 0;
    list.push({
      id: makeId(),
      createdAt: now(),
      host: hostKey(),
      confidence: confidence(score),
      score,
      ...insight
    });
  }

  function analyzeDom(dom, insights) {
    if (!dom || !dom.counts) return;
    const c = dom.counts;

    if ((c.inputs || 0) >= 1 && (c.buttons || 0) >= 1) {
      addInsight(insights, {
        kind: 'page-pattern',
        name: 'form-or-search-page',
        summary: 'Page has visible input and button structure. It may support searching, filtering, submitting, or scanning.',
        score: Math.min(95, 45 + (c.inputs || 0) * 10 + (c.buttons || 0) * 4),
        evidence: { inputs: c.inputs || 0, buttons: c.buttons || 0 }
      });
    }

    if ((c.tables || 0) >= 1 || (c.links || 0) > 50) {
      addInsight(insights, {
        kind: 'page-pattern',
        name: 'results-or-list-page',
        summary: 'Page appears to contain result/list structures. Tables or many links may indicate data output worth turning into a module.',
        score: Math.min(90, 50 + (c.tables || 0) * 20 + Math.min(20, (c.links || 0) / 5)),
        evidence: { tables: c.tables || 0, links: c.links || 0 }
      });
    }

    if ((c.buttons || 0) >= 10) {
      addInsight(insights, {
        kind: 'ui-density',
        name: 'button-heavy-page',
        summary: 'Page has many interactive controls. Useful candidates for hover/selector mapping and click-to-request correlation.',
        score: Math.min(90, 45 + (c.buttons || 0) * 3),
        evidence: { buttons: c.buttons || 0 }
      });
    }
  }

  function endpointFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin + parsed.pathname;
    } catch (error) {
      return String(url || '').split('?')[0];
    }
  }

  function analyzeTrace(traceStatus, logs, insights) {
    if (!traceStatus && (!logs || !logs.length)) return;

    if (traceStatus && traceStatus.enabled) {
      addInsight(insights, {
        kind: 'instrumentation',
        name: 'trace-active',
        summary: 'Trace is active, so future page actions can be correlated with request metadata.',
        score: 85,
        evidence: traceStatus
      });
    }

    const endpoints = new Map();
    (logs || []).forEach((entry) => {
      if (!entry || !entry.url) return;
      const endpoint = endpointFromUrl(entry.url);
      const key = (entry.method || 'GET') + ' ' + endpoint;
      const current = endpoints.get(key) || { method: entry.method || 'GET', endpoint, count: 0, statuses: {} };
      current.count += 1;
      if (entry.status) current.statuses[entry.status] = (current.statuses[entry.status] || 0) + 1;
      endpoints.set(key, current);
    });

    const repeated = Array.from(endpoints.values()).filter((item) => item.count >= 2);
    if (repeated.length) {
      addInsight(insights, {
        kind: 'network-pattern',
        name: 'repeated-endpoints',
        summary: 'Some endpoints repeated during the local trace. These may be polling, refresh, search, or repeated UI actions.',
        score: Math.min(90, 50 + repeated.length * 10),
        evidence: repeated.slice(0, 10)
      });
    }

    const postLike = Array.from(endpoints.values()).filter((item) => ['POST', 'PUT', 'PATCH'].includes(String(item.method).toUpperCase()));
    if (postLike.length) {
      addInsight(insights, {
        kind: 'network-pattern',
        name: 'write-action-candidates',
        summary: 'Trace saw non-GET requests. These may represent actions, form submissions, updates, or workflow steps.',
        score: Math.min(95, 60 + postLike.length * 8),
        evidence: postLike.slice(0, 10)
      });
    }
  }

  function analyzeMemory(memory, insights) {
    if (!memory) return;

    if ((memory.selectors || 0) >= 10) {
      addInsight(insights, {
        kind: 'knowledge-growth',
        name: 'selector-knowledge-growing',
        summary: 'Nova Memory already has multiple selectors for this host. This site is becoming module-ready.',
        score: Math.min(90, 45 + (memory.selectors || 0)),
        evidence: { selectors: memory.selectors }
      });
    }

    if ((memory.endpoints || 0) >= 3) {
      addInsight(insights, {
        kind: 'knowledge-growth',
        name: 'endpoint-knowledge-growing',
        summary: 'Nova Memory has several endpoints for this host. Network Explorer and module generation will benefit from this.',
        score: Math.min(90, 50 + (memory.endpoints || 0) * 5),
        evidence: { endpoints: memory.endpoints }
      });
    }

    if ((memory.findings || 0) >= 1 || (memory.notes || 0) >= 1) {
      addInsight(insights, {
        kind: 'human-context',
        name: 'manual-context-present',
        summary: 'This host has saved notes or findings. Human context exists and should be included in future module planning.',
        score: 70,
        evidence: { notes: memory.notes || 0, findings: memory.findings || 0 }
      });
    }
  }

  function makeRecommendation(insights) {
    const names = new Set(insights.map((item) => item.name));

    if (names.has('form-or-search-page') && names.has('results-or-list-page')) {
      return 'Strong candidate for a search/results module. Next step: use Trace while performing one search, then export bundle.';
    }
    if (names.has('write-action-candidates')) {
      return 'Potential workflow/action page. Next step: capture one safe manual action and compare before/after DOM plus Trace.';
    }
    if (names.has('selector-knowledge-growing') && names.has('endpoint-knowledge-growing')) {
      return 'Host is becoming module-ready. Next step: create a module skeleton from saved selectors/endpoints.';
    }
    if (names.has('button-heavy-page')) {
      return 'Interactive page detected. Next step: use live inspector/DOM tools to map important buttons.';
    }
    return 'Keep collecting DOM, Trace, and Memory. Not enough pattern confidence yet.';
  }

  function analyze(options = {}) {
    const dom = getDomSummary();
    const traceStatus = getTraceStatus();
    const logs = getTraceLogs();
    const memory = getMemorySummary();
    const insights = [];

    analyzeDom(dom, insights);
    analyzeTrace(traceStatus, logs, insights);
    analyzeMemory(memory, insights);

    insights.sort((a, b) => (b.score || 0) - (a.score || 0));

    const analysis = {
      tool: 'Nova Brain',
      version: VERSION,
      analyzedAt: now(),
      host: hostKey(),
      page: {
        url: location.href,
        title: document.title
      },
      recommendation: makeRecommendation(insights),
      inputs: {
        hasDom: Boolean(dom),
        hasTrace: Boolean(traceStatus || logs.length),
        hasMemory: Boolean(memory)
      },
      counts: {
        insights: insights.length,
        traceLogs: logs.length,
        memorySelectors: memory ? memory.selectors || 0 : 0,
        memoryEndpoints: memory ? memory.endpoints || 0 : 0
      },
      insights
    };

    if (options.save !== false) saveAnalysis(analysis);

    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({
        module: 'brain',
        type: 'analysis',
        summary: 'Nova Brain analysis completed',
        data: {
          insights: analysis.counts.insights,
          recommendation: analysis.recommendation
        }
      });
    }

    console.log('[Nova Brain] Analysis completed', analysis);
    return analysis;
  }

  function saveAnalysis(analysis) {
    const store = readStore();
    const record = hostRecord(store, analysis.host);
    record.runs = (record.runs || 0) + 1;
    record.updatedAt = now();
    record.lastAnalysis = analysis;
    record.insights = (record.insights || []).concat(analysis.insights || []);
    if (record.insights.length > MAX_INSIGHTS_PER_HOST) {
      record.insights = record.insights.slice(record.insights.length - MAX_INSIGHTS_PER_HOST);
    }
    writeStore(store);

    if (window.NovaMemory && typeof window.NovaMemory.addFinding === 'function') {
      window.NovaMemory.addFinding('Nova Brain: ' + analysis.recommendation, {
        confidence: 'auto',
        tags: ['brain', 'recommendation'],
        insightCount: analysis.counts.insights
      });
    }

    return analysis;
  }

  window.NovaBrain = {
    version: VERSION,
    analyze,
    get(host) {
      const store = readStore();
      return hostRecord(store, host || hostKey());
    },
    latest(host) {
      return this.get(host).lastAnalysis || null;
    },
    copyLatest(host) {
      const payload = this.latest(host) || analyze();
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      return payload;
    },
    export(host) {
      return host ? this.get(host) : readStore();
    },
    clear(host) {
      if (!host) {
        localStorage.removeItem(STORE_KEY);
        return true;
      }
      const store = readStore();
      delete store.hosts[String(host).toLowerCase()];
      return writeStore(store);
    }
  };

  setTimeout(() => {
    if (window.NovaMemoryAutoLearn && window.NovaMemoryAutoLearn.isEnabled && window.NovaMemoryAutoLearn.isEnabled()) {
      analyze({ save: true });
    }
  }, 2500);

  console.log('[Nova Core] NovaBrain loaded');
})();
