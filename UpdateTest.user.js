
// ==UserScript==Nova Bootstrap v0.3.1

Fixes included:
- Skips v0.3.0.
- Modules button now toggles open/closed.
- X still closes Nova completely.
- Module ON/OFF buttons show/hide placeholder module panels.
- Active module state saves in localStorage.
- Active modules restore after page refresh.

Paste everything below into:
UpdateTest.user.js

============================================================
SOURCE CODE
============================================================

// ==UserScript==
// @name         Nova Bootstrap
// @namespace    https://github.com/kivkumah-oss
// @version      0.3.1
// @description  Nova Core bootstrap - one script to load Nova modules
// @author       Martin
// @match        *://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NOVA_VERSION = '0.3.1';
  const STORAGE_KEY = 'nova.activeModules';

  if (document.getElementById('nova-bootstrap')) return;

  const modules = [
    {
      id: 'player',
      icon: '🎵',
      name: 'Nova Player',
      status: 'Sandbox',
      description: 'Test module for player UI, controls, playlists and remote ideas.'
    },
    {
      id: 'spp',
      icon: '📦',
      name: 'SPP Recovery',
      status: 'Planned',
      description: 'Future module for SPP jam recovery, SP00 printing and condition logic.'
    },
    {
      id: 'floor',
      icon: '🧭',
      name: 'Floor Mismatch',
      status: 'Planned',
      description: 'Future module for Rodeo, FCResearch and floor/pod mismatch checks.'
    },
    {
      id: 'collection',
      icon: '🧺',
      name: 'Collection',
      status: 'Planned',
      description: 'Future module for collection visibility, scans and workflow support.'
    },
    {
      id: 'eagle',
      icon: '👁',
      name: 'Eagle Eye',
      status: 'Planned',
      description: 'Future module for Eagle Eye lookups, carts, hierarchy and shipment checks.'
    }
  ];

  let modulesOpen = false;

  function loadActiveModules() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (err) {
      console.warn('Nova: failed to load active modules', err);
      return {};
    }
  }

  function saveActiveModules() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeModules));
  }

  const activeModules = loadActiveModules();

  const box = document.createElement('div');
  box.id = 'nova-bootstrap';
  box.innerHTML = `
    <div id="nova-header">
      <span>⚡ Nova</span>
      <button id="nova-close" title="Close Nova">×</button>
    </div>

    <div id="nova-body">
      <div class="nova-status">Nova v${NOVA_VERSION}</div>
      <button class="nova-main-btn" id="nova-modules-btn">Modules</button>
      <div id="nova-content">
        <div class="nova-hint">Click Modules to open Nova Module Manager.</div>
      </div>
    </div>
  `;

  const panelArea = document.createElement('div');
  panelArea.id = 'nova-module-panels';

  const style = document.createElement('style');
  style.textContent = `
    #nova-bootstrap {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 340px;
      background: #10101a;
      color: #fff;
      border: 1px solid #7c4dff;
      border-radius: 16px;
      box-shadow: 0 0 24px rgba(124, 77, 255, 0.65);
      font-family: Arial, sans-serif;
      z-index: 999999;
      overflow: hidden;
    }

    #nova-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: linear-gradient(135deg, #7c4dff, #00e5ff);
      font-weight: bold;
    }

    #nova-close {
      border: none;
      background: rgba(0,0,0,0.25);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-size: 18px;
      width: 28px;
      height: 28px;
    }

    #nova-body {
      padding: 12px;
    }

    .nova-status,
    .nova-hint {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 10px;
    }

    .nova-main-btn {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 10px;
      background: #7c4dff;
      color: white;
      font-weight: bold;
      cursor: pointer;
      margin-bottom: 10px;
    }

    .nova-module {
      padding: 10px;
      margin-top: 8px;
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      transition: 0.15s;
    }

    .nova-module:hover {
      background: rgba(124,77,255,0.35);
      transform: translateY(-1px);
    }

    .nova-module-title {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: bold;
      gap: 8px;
    }

    .nova-module-status {
      opacity: 0.75;
      font-size: 11px;
      font-weight: normal;
    }

    .nova-module-desc {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.75;
      line-height: 1.35;
    }

    .nova-toggle {
      margin-top: 8px;
      width: 100%;
      padding: 7px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      color: white;
    }

    .nova-toggle-on {
      background: #00c853;
    }

    .nova-toggle-off {
      background: #ff3d71;
    }

    .nova-floating-module {
      position: fixed;
      left: 24px;
      top: 120px;
      width: 300px;
      background: #10101a;
      color: white;
      border: 1px solid #00e5ff;
      border-radius: 14px;
      box-shadow: 0 0 20px rgba(0,229,255,0.55);
      font-family: Arial, sans-serif;
      z-index: 999998;
      overflow: hidden;
    }

    .nova-floating-header {
      padding: 9px 11px;
      background: linear-gradient(135deg, #00e5ff, #7c4dff);
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .nova-floating-body {
      padding: 12px;
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.9;
    }

    .nova-mini-close {
      border: none;
      background: rgba(0,0,0,0.25);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      width: 24px;
      height: 24px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(box);
  document.body.appendChild(panelArea);

  function renderHome() {
    const content = document.getElementById('nova-content');
    content.innerHTML = `<div class="nova-hint">Click Modules to open Nova Module Manager.</div>`;
    modulesOpen = false;
  }

  function renderModules() {
    const content = document.getElementById('nova-content');
    modulesOpen = true;

    content.innerHTML = modules.map(module => {
      const isActive = !!activeModules[module.id];
      return `
        <div class="nova-module">
          <div class="nova-module-title">
            <span>${module.icon} ${module.name}</span>
            <span class="nova-module-status">${isActive ? 'Active' : module.status}</span>
          </div>
          <div class="nova-module-desc">${module.description}</div>
          <button class="nova-toggle ${isActive ? 'nova-toggle-off' : 'nova-toggle-on'}" data-module-id="${module.id}">
            ${isActive ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.nova-toggle').forEach(button => {
      button.onclick = () => toggleModule(button.dataset.moduleId);
    });
  }

  function toggleModule(moduleId) {
    if (activeModules[moduleId]) {
      activeModules[moduleId] = false;
      hideModule(moduleId);
    } else {
      activeModules[moduleId] = true;
      showModule(moduleId);
    }

    saveActiveModules();
    renderModules();
  }

  function showModule(moduleId) {
    const module = modules.find(item => item.id === moduleId);
    if (!module) return;

    if (document.getElementById(`nova-panel-${moduleId}`)) return;

    const panel = document.createElement('div');
    panel.className = 'nova-floating-module';
    panel.id = `nova-panel-${moduleId}`;
    panel.innerHTML = `
      <div class="nova-floating-header">
        <span>${module.icon} ${module.name}</span>
        <button class="nova-mini-close" data-module-id="${module.id}" title="Turn module off">×</button>
      </div>
      <div class="nova-floating-body">
        <strong>Status:</strong> ${module.status}<br><br>
        ${module.description}<br><br>
        This is a live placeholder panel. Later this will become the real ${module.name} module.
      </div>
    `;

    panelArea.appendChild(panel);

    panel.querySelector('.nova-mini-close').onclick = () => {
      activeModules[moduleId] = false;
      saveActiveModules();
      hideModule(moduleId);

      if (modulesOpen) {
        renderModules();
      }
    };
  }

  function hideModule(moduleId) {
    const panel = document.getElementById(`nova-panel-${moduleId}`);
    if (panel) panel.remove();
  }

  function restoreActiveModules() {
    modules.forEach(module => {
      if (activeModules[module.id]) {
        showModule(module.id);
      }
    });
  }

  document.getElementById('nova-close').onclick = () => {
    box.remove();
  };

  document.getElementById('nova-modules-btn').onclick = () => {
    if (modulesOpen) {
      renderHome();
      return;
    }

    renderModules();
  };

  restoreActiveModules();

  console.log(`Nova Bootstrap v${NOVA_VERSION} loaded`);
})();
