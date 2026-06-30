// core/nova-session.js

(function () {
  'use strict';

  if (window.NovaSession) {
    console.warn('[Nova Core] NovaSession already loaded');
    return;
  }

  const VERSION = '0.3.0';
  const STORAGE_KEY = 'nova.session.current';
  const ACTIVE_KEY = 'nova.session.active';
  const SYNC_KEY = 'nova.session.sync';
  const CHANNEL_NAME = 'nova-session-sync';
  const MAX_EVENTS = 5000;
  const SAVE_INTERVAL_MS = 5000;

  const state = {
    current: null,
    saveTimer: null,
    tabId: makeId(),
    channel: null,
    suppressBroadcast: false,
    lastSyncAt: null
  };

  function now() {
    return new Date().toISOString();
  }

  function makeId() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'nova-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('[Nova Session] Failed to read storage', key, error);
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[Nova Session] Failed to write storage', key, error);
      return false;
    }
  }

  function blankStats() {
    return { pages: 0, events: 0, byType: {}, byModule: {}, byHost: {} };
  }

  function createSession(name = 'Nova Session') {
    return {
      id: makeId(),
      version: VERSION,
      name,
      active: true,
      paused: false,
      startedAt: now(),
      stoppedAt: null,
      lastSavedAt: null,
      lastSeenAt: now(),
      pages: [],
      events: [],
      modules: {},
      stats: blankStats()
    };
  }

  function currentPageInfo() {
    return {
      id: makeId(),
      tabId: state.tabId,
      url: location.href,
      host: location.hostname,
      path: location.pathname,
      title: document.title,
      openedAt: now()
    };
  }

  function rebuildStats(session) {
    const stats = blankStats();
    (session.pages || []).forEach((page) => {
      stats.pages += 1;
      stats.byHost[page.host] = (stats.byHost[page.host] || 0) + 1;
    });
    (session.events || []).forEach((event) => {
      stats.events += 1;
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      stats.byModule[event.module] = (stats.byModule[event.module] || 0) + 1;
    });
    session.stats = stats;
    return stats;
  }

  function broadcast(action) {
    if (state.suppressBroadcast) return;
    const message = {
      source: state.tabId,
      action,
      time: now(),
      sessionId: state.current ? state.current.id : null
    };

    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify(message));
    } catch (error) {
      console.warn('[Nova Session] Failed sync write', error);
    }

    if (state.channel) {
      try {
        state.channel.postMessage(message);
      } catch (error) {
        console.warn('[Nova Session] Failed channel sync', error);
      }
    }
  }

  function applyRemoteSync(message) {
    if (!message || message.source === state.tabId) return;
    const saved = readJson(STORAGE_KEY);
    state.suppressBroadcast = true;

    if (!saved || message.action === 'clear') {
      stopAutosave();
      state.current = null;
    } else {
      state.current = saved;
      rebuildStats(state.current);
      if (state.current.active && !state.current.paused) startAutosave();
      else stopAutosave();
    }

    state.lastSyncAt = now();
    state.suppressBroadcast = false;
    console.log('[Nova Session] Synced from another tab', message.action);

    if (window.NovaMenu && typeof window.NovaMenu.refresh === 'function') {
      window.NovaMenu.refresh();
    }
  }

  function initSync() {
    if ('BroadcastChannel' in window) {
      state.channel = new BroadcastChannel(CHANNEL_NAME);
      state.channel.addEventListener('message', (event) => applyRemoteSync(event.data));
    }

    window.addEventListener('storage', (event) => {
      if (event.key !== SYNC_KEY || !event.newValue) return;
      try {
        applyRemoteSync(JSON.parse(event.newValue));
      } catch (error) {
        console.warn('[Nova Session] Failed storage sync parse', error);
      }
    });
  }

  function save(options = {}) {
    if (!state.current) return false;
    state.current.lastSavedAt = now();
    state.current.lastSeenAt = now();
    rebuildStats(state.current);
    localStorage.setItem(ACTIVE_KEY, state.current.active ? 'true' : 'false');
    const ok = writeJson(STORAGE_KEY, state.current);
    if (ok && options.broadcast !== false) broadcast(options.action || 'save');
    return ok;
  }

  function startAutosave() {
    if (state.saveTimer) return;
    state.saveTimer = setInterval(() => save({ action: 'autosave' }), SAVE_INTERVAL_MS);
  }

  function stopAutosave() {
    if (!state.saveTimer) return;
    clearInterval(state.saveTimer);
    state.saveTimer = null;
  }

  function registerPage() {
    if (!state.current) return null;
    const info = currentPageInfo();
    const duplicate = (state.current.pages || []).some((page) => page.tabId === state.tabId && page.url === info.url);
    if (!duplicate) state.current.pages.push(info);
    return info;
  }

  function ensureSession() {
    if (state.current) return state.current;
    return window.NovaSession.load();
  }

  window.NovaSession = {
    get current() { return state.current; },
    get tabId() { return state.tabId; },
    get lastSyncAt() { return state.lastSyncAt; },

    start(options = {}) {
      const sessionName = options.name || 'Nova Session';
      state.current = createSession(sessionName);
      registerPage();
      startAutosave();
      this.addEvent({ module: 'session', type: 'start', summary: 'Session started' });
      save({ action: 'start' });
      console.log('[Nova Session] Started', state.current.id);
      return state.current;
    },

    load() {
      const saved = readJson(STORAGE_KEY);
      if (!saved) return null;
      state.current = saved;
      rebuildStats(state.current);
      if (state.current.active && !state.current.paused) {
        registerPage();
        startAutosave();
        this.addEvent({ module: 'session', type: 'resume', summary: 'Session resumed on page load' });
        save({ action: 'load' });
      }
      console.log('[Nova Session] Loaded', state.current.id);
      return state.current;
    },

    sync() {
      applyRemoteSync({ source: 'manual-sync', action: 'manual' });
      return state.current;
    },

    resume() {
      const session = ensureSession() || this.start({ name: 'Nova Session' });
      session.active = true;
      session.paused = false;
      registerPage();
      startAutosave();
      this.addEvent({ module: 'session', type: 'resume', summary: 'Session resumed' });
      save({ action: 'resume' });
      return session;
    },

    pause() {
      if (!state.current) return null;
      this.addEvent({ module: 'session', type: 'pause', summary: 'Session paused' });
      state.current.paused = true;
      stopAutosave();
      save({ action: 'pause' });
      return state.current;
    },

    stop() {
      if (!state.current) return null;
      this.addEvent({ module: 'session', type: 'stop', summary: 'Session stopped' });
      state.current.active = false;
      state.current.paused = false;
      state.current.stoppedAt = now();
      stopAutosave();
      save({ action: 'stop' });
      console.log('[Nova Session] Stopped', state.current.id);
      return state.current;
    },

    clear() {
      stopAutosave();
      state.current = null;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_KEY);
      broadcast('clear');
      console.log('[Nova Session] Cleared');
    },

    save,

    addPage(page = {}) {
      const session = ensureSession();
      if (!session || !session.active || session.paused) return null;
      const entry = {
        id: makeId(),
        tabId: state.tabId,
        url: page.url || location.href,
        host: page.host || location.hostname,
        path: page.path || location.pathname,
        title: page.title || document.title,
        openedAt: page.openedAt || now(),
        ...page
      };
      session.pages.push(entry);
      save({ action: 'page' });
      return entry;
    },

    addEvent(event = {}) {
      const session = state.current;
      if (!session || !session.active || session.paused) return null;
      const entry = {
        id: makeId(),
        tabId: state.tabId,
        time: now(),
        module: event.module || 'unknown',
        type: event.type || 'event',
        summary: event.summary || '',
        pageUrl: event.pageUrl || location.href,
        host: location.hostname,
        data: event.data || {},
        ...event
      };
      session.events.push(entry);
      if (session.events.length > MAX_EVENTS) session.events.shift();
      rebuildStats(session);
      save({ action: 'event', broadcast: false });
      return entry;
    },

    getStats() {
      if (!state.current) return blankStats();
      return rebuildStats(state.current);
    },

    getSyncStatus() {
      return {
        tabId: state.tabId,
        channel: Boolean(state.channel),
        lastSyncAt: state.lastSyncAt,
        active: this.isActive(),
        sessionId: state.current ? state.current.id : null
      };
    },

    export() {
      const session = ensureSession();
      if (!session) return null;
      rebuildStats(session);
      return { tool: 'Nova Session', exportedAt: now(), sync: this.getSyncStatus(), session };
    },

    copy() {
      const payload = this.export();
      if (!payload) return null;
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      return payload;
    },

    isActive() {
      return Boolean(state.current && state.current.active && !state.current.paused);
    }
  };

  initSync();
  window.NovaSession.load();

  window.addEventListener('beforeunload', () => { if (state.current) save({ action: 'beforeunload', broadcast: false }); });

  console.log('[Nova Core] NovaSession loaded with cross-tab sync');
})();
