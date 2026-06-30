// core/nova-memory.js

(function () {
  'use strict';

  if (window.NovaMemory) {
    console.warn('[Nova Core] NovaMemory already loaded');
    return;
  }

  const VERSION = '0.1.0';
  const STORAGE_KEY = 'nova.memory.v1';
  const MAX_ITEMS_PER_HOST = 500;

  function now() {
    return new Date().toISOString();
  }

  function makeId() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'memory-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function safeHost(host) {
    return String(host || location.hostname || 'unknown').toLowerCase();
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: VERSION, createdAt: now(), updatedAt: now(), hosts: {} };
      const parsed = JSON.parse(raw);
      parsed.version = parsed.version || VERSION;
      parsed.hosts = parsed.hosts || {};
      return parsed;
    } catch (error) {
      console.warn('[Nova Memory] Failed to read memory store', error);
      return { version: VERSION, createdAt: now(), updatedAt: now(), hosts: {} };
    }
  }

  function writeStore(store) {
    try {
      store.updatedAt = now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn('[Nova Memory] Failed to write memory store', error);
      return false;
    }
  }

  function blankHost(host) {
    return {
      host,
      createdAt: now(),
      updatedAt: now(),
      visits: 0,
      pages: {},
      notes: [],
      selectors: [],
      endpoints: [],
      modules: [],
      findings: []
    };
  }

  function getHostRecord(store, host) {
    const key = safeHost(host);
    store.hosts[key] = store.hosts[key] || blankHost(key);
    return store.hosts[key];
  }

  function trimList(list) {
    if (!Array.isArray(list)) return [];
    if (list.length <= MAX_ITEMS_PER_HOST) return list;
    return list.slice(list.length - MAX_ITEMS_PER_HOST);
  }

  function normalizeItem(type, item) {
    return {
      id: item.id || makeId(),
      type,
      createdAt: item.createdAt || now(),
      updatedAt: now(),
      pageUrl: item.pageUrl || location.href,
      title: item.title || document.title || '',
      confidence: item.confidence || 'unknown',
      tags: Array.isArray(item.tags) ? item.tags : [],
      ...item
    };
  }

  function add(type, item = {}, host = location.hostname) {
    const store = readStore();
    const record = getHostRecord(store, host);
    const normalized = normalizeItem(type, item);

    if (type === 'page') {
      const key = item.url || location.href;
      record.pages[key] = {
        url: key,
        title: item.title || document.title || '',
        firstSeenAt: record.pages[key] ? record.pages[key].firstSeenAt : now(),
        lastSeenAt: now(),
        visits: record.pages[key] ? (record.pages[key].visits || 0) + 1 : 1,
        tags: Array.isArray(item.tags) ? item.tags : []
      };
    } else if (record[type + 's'] && Array.isArray(record[type + 's'])) {
      record[type + 's'].push(normalized);
      record[type + 's'] = trimList(record[type + 's']);
    } else if (type === 'module') {
      record.modules.push(normalized);
      record.modules = trimList(record.modules);
    } else {
      record.findings.push(normalized);
      record.findings = trimList(record.findings);
    }

    record.updatedAt = now();
    writeStore(store);

    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({
        module: 'memory',
        type: 'memory-add',
        summary: 'Memory item saved: ' + type,
        data: { host: safeHost(host), itemType: type, id: normalized.id }
      });
    }

    return normalized;
  }

  function rememberVisit() {
    const store = readStore();
    const record = getHostRecord(store, location.hostname);
    record.visits = (record.visits || 0) + 1;
    record.updatedAt = now();
    const url = location.href;
    record.pages[url] = record.pages[url] || {
      url,
      title: document.title || '',
      firstSeenAt: now(),
      lastSeenAt: now(),
      visits: 0,
      tags: []
    };
    record.pages[url].title = document.title || record.pages[url].title || '';
    record.pages[url].lastSeenAt = now();
    record.pages[url].visits = (record.pages[url].visits || 0) + 1;
    writeStore(store);
    return record;
  }

  function get(host = location.hostname) {
    const store = readStore();
    return getHostRecord(store, host);
  }

  function search(query, host) {
    const q = String(query || '').toLowerCase();
    const store = readStore();
    const hosts = host ? [safeHost(host)] : Object.keys(store.hosts);
    const results = [];

    hosts.forEach((hostKey) => {
      const record = store.hosts[hostKey];
      if (!record) return;
      ['notes', 'selectors', 'endpoints', 'modules', 'findings'].forEach((bucket) => {
        (record[bucket] || []).forEach((item) => {
          const text = JSON.stringify(item).toLowerCase();
          if (!q || text.includes(q)) results.push({ host: hostKey, bucket, item });
        });
      });
      Object.values(record.pages || {}).forEach((page) => {
        const text = JSON.stringify(page).toLowerCase();
        if (!q || text.includes(q)) results.push({ host: hostKey, bucket: 'pages', item: page });
      });
    });

    return results;
  }

  function summary(host = location.hostname) {
    const record = get(host);
    return {
      host: record.host,
      visits: record.visits || 0,
      pages: Object.keys(record.pages || {}).length,
      notes: (record.notes || []).length,
      selectors: (record.selectors || []).length,
      endpoints: (record.endpoints || []).length,
      modules: (record.modules || []).length,
      findings: (record.findings || []).length,
      updatedAt: record.updatedAt
    };
  }

  window.NovaMemory = {
    version: VERSION,
    rememberVisit,
    add,
    addNote(text, options = {}) {
      return add('note', { text, ...options });
    },
    addSelector(selector, options = {}) {
      return add('selector', { selector, ...options });
    },
    addEndpoint(url, options = {}) {
      return add('endpoint', { url, ...options });
    },
    addFinding(text, options = {}) {
      return add('finding', { text, ...options });
    },
    addModule(moduleInfo, options = {}) {
      return add('module', { moduleInfo, ...options });
    },
    get,
    search,
    summary,
    export(host) {
      return host ? get(host) : readStore();
    },
    copy(host) {
      const payload = this.export(host);
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      return payload;
    },
    clear(host) {
      if (!host) {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      }
      const store = readStore();
      delete store.hosts[safeHost(host)];
      return writeStore(store);
    }
  };

  window.NovaMemory.rememberVisit();
  console.log('[Nova Core] NovaMemory loaded');
})();
