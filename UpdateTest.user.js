// ==UserScript==
// @name         Nova Bootstrap
// @namespace    https://github.com/kivkumah-oss
// @version      0.2.0
// @description  Nova Core bootstrap - one script to load Nova modules
// @author       Martin
// @match        *://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NOVA_VERSION = '0.2.0';

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

  const box = document.createElement('div');
  box.id = 'nova-bootstrap';
  box.innerHTML = `
    <div id="nova-header">
      <span>⚡ Nova</span>
      <button id="nova-close">×</button>
    </div>

    <div id="nova-body">
      <div class="nova-status">Nova v${NOVA_VERSION}</div>

      <button class="nova-main-btn" id="nova-modules-btn">Modules</button>

      <div id="nova-content">
        <div class="nova-hint">Click Modules to open Nova Module Manager.</div>
      </div>
    </div>
  `;

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
      cursor: pointer;
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

    .nova-back {
      margin-bottom: 10px;
      background: rgba(255,255,255,0.12);
    }

    .nova-panel-title {
      font-weight: bold;
      margin-bottom: 8px;
    }

    .nova-panel-text {
      font-size: 12px;
      opacity: 0.82;
      line-height: 1.4;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(box);

  function renderModules() {
    const content = document.getElementById('nova-content');

    content.innerHTML = modules.map(module => `
      <div class="nova-module" data-module-id="${module.id}">
        <div class="nova-module-title">
          <span>${module.icon} ${module.name}</span>
          <span class="nova-module-status">${module.status}</span>
        </div>
        <div class="nova-module-desc">${module.description}</div>
      </div>
    `).join('');

    document.querySelectorAll('.nova-module').forEach(card => {
      card.onclick = () => openModule(card.dataset.moduleId);
    });
  }

  function openModule(moduleId) {
    const module = modules.find(item => item.id === moduleId);
    const content = document.getElementById('nova-content');

    if (!module) {
      content.innerHTML = `<div class="nova-panel-text">Module not found.</div>`;
      return;
    }

    content.innerHTML = `
      <button class="nova-main-btn nova-back" id="nova-back-btn">← Back to Modules</button>
      <div class="nova-panel-title">${module.icon} ${module.name}</div>
      <div class="nova-panel-text">
        <strong>Status:</strong> ${module.status}<br><br>
        ${module.description}<br><br>
        This is only a placeholder screen. Later this button click will load the real module.
      </div>
    `;

    document.getElementById('nova-back-btn').onclick = renderModules;
  }

  document.getElementById('nova-close').onclick = () => {
    box.remove();
  };

  document.getElementById('nova-modules-btn').onclick = renderModules;

  console.log(`Nova Bootstrap v${NOVA_VERSION} loaded`);
})();
