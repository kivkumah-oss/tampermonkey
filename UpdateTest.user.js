// ==UserScript==
// @name         Nova Bootstrap
// @namespace    https://github.com/kivkumah-oss
// @version      0.1.0
// @description  Nova Core bootstrap - one script to load Nova modules
// @author       Martin
// @match        *://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NOVA_VERSION = '0.1.0';

  if (document.getElementById('nova-bootstrap')) return;

  const box = document.createElement('div');
  box.id = 'nova-bootstrap';
  box.innerHTML = `
    <div id="nova-header">
      <span>⚡ Nova</span>
      <button id="nova-close">×</button>
    </div>

    <div id="nova-body">
      <div class="nova-status">Bootstrap v${NOVA_VERSION}</div>

      <button class="nova-main-btn" id="nova-modules-btn">Modules</button>

      <div id="nova-modules" style="display:none;">
        <div class="nova-module">🎵 Nova Player <span>Sandbox</span></div>
        <div class="nova-module">📦 SPP Recovery <span>Planned</span></div>
        <div class="nova-module">🧭 Floor Mismatch <span>Planned</span></div>
        <div class="nova-module">👁 Eagle Eye <span>Planned</span></div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #nova-bootstrap {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 280px;
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

    .nova-status {
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
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }

    .nova-module span {
      opacity: 0.7;
      font-size: 11px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(box);

  document.getElementById('nova-close').onclick = () => {
    box.remove();
  };

  document.getElementById('nova-modules-btn').onclick = () => {
    const modules = document.getElementById('nova-modules');
    modules.style.display = modules.style.display === 'none' ? 'block' : 'none';
  };

  console.log(`Nova Bootstrap v${NOVA_VERSION} loaded`);
})();
