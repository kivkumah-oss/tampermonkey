// ==UserScript==
// @name         Nova Work Hub
// @namespace    nova-work-hub
// @version      0.1.0
// @description  Personal launcher/catalog for kivkumah work Tampermonkey tools.
// @author       kivkumah / Nova / Cody
// @match        https://*.amazon.com/*
// @match        https://*.amazon.dev/*
// @match        https://*.amazonoperations.app/*
// @match        https://*.a2z.com/*
// @match        http://localhost:*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @connect      raw.githubusercontent.com
// @connect      github.com
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/work-hub/NovaWorkHub.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/work-hub/NovaWorkHub.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.NovaWorkHub) return;

  const VERSION = '0.1.0';
  const REGISTRY_URL = 'https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/work-hub/work.registry.json';
  const PANEL_ID = 'nova-work-hub-panel';
  const ORB_ID = 'nova-work-hub-orb';
  const STYLE_ID = 'nova-work-hub-style';
  const PREF_KEY = 'nova.workhub.prefs.v1';
  const UI_KEY = 'nova.workhub.ui.v1';

  const state = {
    open: false,
    registry: null,
    tools: [],
    prefs: readPrefs(),
    ui: readUi(),
    loading: false,
    error: ''
  };

  function esc(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readJson(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    } catch (error) {}
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function readPrefs() {
    return readJson(PREF_KEY, { enabled: {}, installed: {} });
  }

  function savePrefs() {
    writeJson(PREF_KEY, state.prefs);
  }

  function readUi() {
    return readJson(UI_KEY, { tier: 'must-have', category: 'all', query: '' });
  }

  function saveUi() {
    writeJson(UI_KEY, state.ui);
  }

  function gmRequest(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: 15000,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) resolve(response.responseText);
            else reject(new Error('HTTP ' + response.status));
          },
          onerror: () => reject(new Error('Network error')),
          ontimeout: () => reject(new Error('Request timeout'))
        });
        return;
      }

      fetch(url, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function openUrl(url) {
    if (!url) return;
    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, { active: true, insert: true });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text);
      return Promise.resolve();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error('No clipboard API'));
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ORB_ID}{position:fixed;right:18px;bottom:68px;z-index:2147483647;width:86px;height:38px;border-radius:999px;border:1px solid rgba(245,158,11,.72);background:rgba(12,12,10,.97);color:#fff;font:900 12px Arial,sans-serif;box-shadow:0 0 18px rgba(245,158,11,.42);cursor:pointer;}
      #${PANEL_ID}{position:fixed;right:18px;bottom:114px;z-index:2147483646;width:min(520px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 130px));overflow:hidden;border-radius:16px;border:1px solid rgba(245,158,11,.55);background:rgba(13,13,14,.98);color:#fff;box-shadow:0 0 28px rgba(245,158,11,.32);font:12px Arial,sans-serif;display:none;}
      #${PANEL_ID} *{box-sizing:border-box;}
      #${PANEL_ID} .nwh-head{padding:12px;background:linear-gradient(90deg,#f59e0b,#22d3ee);display:flex;align-items:center;justify-content:space-between;font-weight:900;}
      #${PANEL_ID} .nwh-body{padding:10px;overflow:auto;max-height:min(690px,calc(100vh - 190px));}
      #${PANEL_ID} button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(245,158,11,.45);border-radius:9px;padding:7px 9px;cursor:pointer;font:800 12px Arial,sans-serif;}
      #${PANEL_ID} button:hover{background:rgba(245,158,11,.16);}
      #${PANEL_ID} input,#${PANEL_ID} select{background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:7px;font:12px Arial,sans-serif;}
      #${PANEL_ID} option{color:#000;}
      #${PANEL_ID} .nwh-filters{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;margin-bottom:10px;}
      #${PANEL_ID} .nwh-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px;}
      #${PANEL_ID} .nwh-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;text-align:center;}
      #${PANEL_ID} .nwh-list{display:grid;gap:9px;}
      #${PANEL_ID} .nwh-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:10px;}
      #${PANEL_ID} .nwh-card.off{opacity:.58;}
      #${PANEL_ID} .nwh-title{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;}
      #${PANEL_ID} .nwh-name{font-size:13px;font-weight:900;color:#fff;}
      #${PANEL_ID} .nwh-meta{color:#9ca3af;font-size:11px;margin-top:3px;line-height:1.35;}
      #${PANEL_ID} .nwh-desc{color:#d1d5db;line-height:1.35;margin:8px 0;}
      #${PANEL_ID} .nwh-badge{display:inline-block;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;text-transform:uppercase;border:1px solid rgba(255,255,255,.16);}
      #${PANEL_ID} .nwh-badge.must-have{color:#bbf7d0;border-color:rgba(34,197,94,.45);}
      #${PANEL_ID} .nwh-badge.optional{color:#bfdbfe;border-color:rgba(59,130,246,.45);}
      #${PANEL_ID} .nwh-badge.needs-upload,.nwh-badge.needs-review,.nwh-badge.external-local{color:#fde68a;border-color:rgba(245,158,11,.45);}
      #${PANEL_ID} .nwh-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
      #${PANEL_ID} .nwh-small{font-size:11px;padding:5px 7px;}
      #${PANEL_ID} .nwh-note{color:#fcd34d;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:8px;line-height:1.4;margin-bottom:10px;}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  async function loadRegistry() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const raw = await gmRequest(REGISTRY_URL + '?ts=' + Date.now());
      const registry = JSON.parse(raw);
      state.registry = registry;
      state.tools = Array.isArray(registry.tools) ? registry.tools : [];
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      state.error = String(error && error.message ? error.message : error);
      render();
    }
  }

  function toolEnabled(tool) {
    if (!tool || !tool.id) return true;
    if (Object.prototype.hasOwnProperty.call(state.prefs.enabled, tool.id)) return state.prefs.enabled[tool.id] !== false;
    return tool.tier === 'must-have';
  }

  function toolInstalled(tool) {
    return Boolean(tool && tool.id && state.prefs.installed[tool.id]);
  }

  function categories() {
    const set = new Set(state.tools.map((tool) => tool.category).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }

  function filteredTools() {
    const query = String(state.ui.query || '').toLowerCase().trim();
    return state.tools.filter((tool) => {
      if (state.ui.tier !== 'all' && tool.tier !== state.ui.tier) return false;
      if (state.ui.category !== 'all' && tool.category !== state.ui.category) return false;
      if (!query) return true;
      return [tool.name, tool.description, tool.backupName, tool.category, (tool.tags || []).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  function stats() {
    const total = state.tools.length;
    const enabled = state.tools.filter(toolEnabled).length;
    const installReady = state.tools.filter((tool) => Boolean(tool.installUrl)).length;
    const must = state.tools.filter((tool) => tool.tier === 'must-have').length;
    return { total, enabled, installReady, must };
  }

  function render() {
    injectStyle();
    renderOrb();
    renderPanel();
  }

  function renderOrb() {
    let orb = document.getElementById(ORB_ID);
    if (!orb) {
      orb = document.createElement('button');
      orb.id = ORB_ID;
      orb.addEventListener('click', toggle);
      document.body.appendChild(orb);
    }
    const s = stats();
    orb.textContent = 'Work ' + (s.enabled || 0);
    orb.title = 'Nova Work Hub';
  }

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    panel.style.display = state.open ? 'block' : 'none';
    if (!state.open) return;

    const s = stats();
    const cats = categories().map((cat) => `<option value="${esc(cat)}" ${state.ui.category === cat ? 'selected' : ''}>${esc(cat === 'all' ? 'All categories' : cat)}</option>`).join('');
    const list = state.loading
      ? '<div class="nwh-note">Loading registry...</div>'
      : state.error
        ? `<div class="nwh-note">Registry failed: ${esc(state.error)}</div>`
        : filteredTools().map(renderTool).join('') || '<div class="nwh-note">No tools match this filter.</div>';

    panel.innerHTML = `
      <div class="nwh-head">
        <div>Nova Work Hub <span style="font-weight:700;font-size:11px;opacity:.82;">v${esc(VERSION)}</span></div>
        <div style="display:flex;gap:6px;"><button class="nwh-small" data-nwh="reload">Reload</button><button class="nwh-small" data-nwh="copy">Copy State</button><button class="nwh-small" data-nwh="close">x</button></div>
      </div>
      <div class="nwh-body">
        <div class="nwh-note">Phase 1 hub: launch/catalog/toggle only. Install buttons become active after selected scripts are moved to a safe module source.</div>
        <div class="nwh-stats">
          <div class="nwh-stat"><b>${s.total}</b><br><span style="color:#9ca3af;">Tools</span></div>
          <div class="nwh-stat"><b>${s.enabled}</b><br><span style="color:#9ca3af;">Enabled</span></div>
          <div class="nwh-stat"><b>${s.must}</b><br><span style="color:#9ca3af;">Must</span></div>
          <div class="nwh-stat"><b>${s.installReady}</b><br><span style="color:#9ca3af;">Install URLs</span></div>
        </div>
        <div class="nwh-filters">
          <select data-filter="tier">
            <option value="must-have" ${state.ui.tier === 'must-have' ? 'selected' : ''}>Must-have</option>
            <option value="optional" ${state.ui.tier === 'optional' ? 'selected' : ''}>Optional</option>
            <option value="all" ${state.ui.tier === 'all' ? 'selected' : ''}>All tiers</option>
          </select>
          <select data-filter="category">${cats}</select>
          <input data-filter="query" placeholder="Search tools..." value="${esc(state.ui.query || '')}" />
        </div>
        <div class="nwh-list">${list}</div>
      </div>`;
    bindPanel(panel);
  }

  function renderTool(tool) {
    const enabled = toolEnabled(tool);
    const installed = toolInstalled(tool);
    const launches = Array.isArray(tool.launchUrls) ? tool.launchUrls : [];
    const launchButtons = launches.map((item, index) => `<button data-launch="${esc(tool.id)}" data-launch-index="${index}">${esc(item.label || 'Open')}</button>`).join('');
    const installLabel = tool.installUrl ? (installed ? 'Update/Reinstall' : 'Install') : 'No install URL yet';

    return `
      <div class="nwh-card ${enabled ? '' : 'off'}">
        <div class="nwh-title">
          <div style="min-width:0;">
            <div class="nwh-name">${esc(tool.name)}</div>
            <div class="nwh-meta">${esc(tool.category)} | ${esc(tool.mode)} | ${esc(tool.backupName || 'no backup source')}</div>
          </div>
          <div style="text-align:right;display:grid;gap:4px;justify-items:end;">
            <span class="nwh-badge ${esc(tool.tier)}">${esc(tool.tier)}</span>
            <span class="nwh-badge ${esc(tool.status)}">${esc(tool.status)}</span>
          </div>
        </div>
        <div class="nwh-desc">${esc(tool.description)}</div>
        <div class="nwh-actions">
          <button data-toggle="${esc(tool.id)}">${enabled ? 'Disable in Hub' : 'Enable in Hub'}</button>
          <button data-install="${esc(tool.id)}" ${tool.installUrl ? '' : 'title="Script has not been uploaded yet."'}>${esc(installLabel)}</button>
          <button data-mark="${esc(tool.id)}">${installed ? 'Mark Not Installed' : 'Mark Installed'}</button>
          ${launchButtons}
        </div>
      </div>`;
  }

  function bindPanel(panel) {
    panel.querySelectorAll('[data-nwh]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.nwh;
        if (action === 'close') hide();
        if (action === 'reload') loadRegistry();
        if (action === 'copy') copyState();
      });
    });

    panel.querySelectorAll('[data-filter]').forEach((input) => {
      input.addEventListener('input', () => {
        state.ui[input.dataset.filter] = input.value;
        saveUi();
        renderPanel();
      });
      input.addEventListener('change', () => {
        state.ui[input.dataset.filter] = input.value;
        saveUi();
        renderPanel();
      });
    });

    panel.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', () => toggleTool(button.dataset.toggle)));
    panel.querySelectorAll('[data-install]').forEach((button) => button.addEventListener('click', () => installTool(button.dataset.install)));
    panel.querySelectorAll('[data-mark]').forEach((button) => button.addEventListener('click', () => markInstalled(button.dataset.mark)));
    panel.querySelectorAll('[data-launch]').forEach((button) => button.addEventListener('click', () => launchTool(button.dataset.launch, Number(button.dataset.launchIndex))));
  }

  function findTool(id) {
    return state.tools.find((tool) => tool.id === id);
  }

  function toggleTool(id) {
    const tool = findTool(id);
    if (!tool) return;
    state.prefs.enabled[id] = !toolEnabled(tool);
    savePrefs();
    render();
  }

  function markInstalled(id) {
    state.prefs.installed[id] = !state.prefs.installed[id];
    savePrefs();
    render();
  }

  function installTool(id) {
    const tool = findTool(id);
    if (!tool) return;
    if (!tool.installUrl) {
      alert('No install URL yet for "' + tool.name + '". Next step: move this script to a safe/private GitHub raw URL, then add it to work.registry.json.');
      return;
    }
    openUrl(tool.installUrl);
  }

  function launchTool(id, index) {
    const tool = findTool(id);
    const item = tool && Array.isArray(tool.launchUrls) ? tool.launchUrls[index] : null;
    if (item && item.url) openUrl(item.url);
  }

  function copyState() {
    const payload = {
      tool: 'Nova Work Hub State',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      page: location.href,
      registryVersion: state.registry ? state.registry.version : null,
      prefs: state.prefs,
      visibleTools: filteredTools().map((tool) => ({ id: tool.id, name: tool.name, tier: tool.tier, category: tool.category, status: tool.status, installReady: Boolean(tool.installUrl) }))
    };
    copyText(JSON.stringify(payload, null, 2)).then(() => alert('Nova Work Hub state copied.')).catch(() => alert('Copy failed.'));
  }

  function show() {
    state.open = true;
    render();
    if (!state.registry && !state.loading) loadRegistry();
  }

  function hide() {
    state.open = false;
    render();
  }

  function toggle() {
    if (state.open) hide();
    else show();
  }

  function init() {
    injectStyle();
    render();
    loadRegistry();
    console.log('[Nova Work Hub] loaded');
  }

  window.NovaWorkHub = { version: VERSION, show, hide, toggle, reload: loadRegistry };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
