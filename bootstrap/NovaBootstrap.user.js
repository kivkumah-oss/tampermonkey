// ==UserScript==
// @name         Nova Bootstrap
// @namespace    https://github.com/kivkumah-oss
// @version      0.5.4
// @description  Nova Core bootstrap
// @author       Martin
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-theme.js
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/NovaBootstrap.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/NovaBootstrap.user.js
// ==/UserScript==

(function () {
  'use strict';

  NovaTheme.inject();

  console.log('[Nova Bootstrap] Started');
})();

  const modules = [
    {
      id: 'player',
      icon: '🎵',
      name: 'Nova Player',
      status: 'Sandbox',
      description: 'Suno control module. Tests real module behaviour inside Nova.'
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

  function loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (err) {
      console.warn(`Nova: failed to load ${key}`, err);
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  const activeModules = loadJson(ACTIVE_MODULES_KEY, {});
  let currentThemeId = localStorage.getItem(THEME_KEY) || 'violet';

  function getTheme() {
    return themes[currentThemeId] || themes.violet;
  }

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
      <button class="nova-main-btn nova-secondary-btn" id="nova-theme-btn">Theme</button>

      <div id="nova-content">
        <div class="nova-hint">Click Modules to open Nova Module Manager.</div>
      </div>
    </div>
  `;

  const panelArea = document.createElement('div');
  panelArea.id = 'nova-module-panels';

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --nova-primary: #7c4dff;
      --nova-secondary: #00e5ff;
      --nova-glow: rgba(124, 77, 255, 0.65);
      --nova-panel-glow: rgba(0, 229, 255, 0.55);
    }

    #nova-bootstrap {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 340px;
      background: #10101a;
      color: #fff;
      border: 1px solid var(--nova-primary);
      border-radius: 16px;
      box-shadow: 0 0 24px var(--nova-glow);
      font-family: Arial, sans-serif;
      z-index: 999999;
      overflow: hidden;
    }

    #nova-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: linear-gradient(135deg, var(--nova-primary), var(--nova-secondary));
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
      background: var(--nova-primary);
      color: white;
      font-weight: bold;
      cursor: pointer;
      margin-bottom: 10px;
    }

    .nova-secondary-btn {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .nova-module,
    .nova-theme-card {
      padding: 10px;
      margin-top: 8px;
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      transition: 0.15s;
    }

    .nova-module:hover,
    .nova-theme-card:hover {
      background: color-mix(in srgb, var(--nova-primary) 35%, transparent);
      transform: translateY(-1px);
    }

    .nova-module-title,
    .nova-theme-title {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: bold;
      gap: 8px;
    }

    .nova-module-status,
    .nova-theme-status {
      opacity: 0.75;
      font-size: 11px;
      font-weight: normal;
    }

    .nova-module-desc,
    .nova-theme-desc {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.75;
      line-height: 1.35;
    }

    .nova-toggle,
    .nova-theme-apply {
      margin-top: 8px;
      width: 100%;
      padding: 7px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      color: white;
      background: var(--nova-primary);
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
      width: 320px;
      background: #10101a;
      color: white;
      border: 1px solid var(--nova-secondary);
      border-radius: 14px;
      box-shadow: 0 0 20px var(--nova-panel-glow);
      font-family: Arial, sans-serif;
      z-index: 999998;
      overflow: hidden;
    }

    .nova-floating-header {
      padding: 9px 11px;
      background: linear-gradient(135deg, var(--nova-secondary), var(--nova-primary));
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

    .nova-player-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .nova-player-btn {
      padding: 9px;
      border: none;
      border-radius: 10px;
      background: var(--nova-primary);
      color: white;
      font-weight: bold;
      cursor: pointer;
    }

    .nova-player-btn:hover {
      background: var(--nova-secondary);
    }

    .nova-player-status {
      margin-top: 10px;
      padding: 8px;
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      font-size: 11px;
      opacity: 0.85;
    }

    .nova-swatch {
      display: inline-block;
      width: 34px;
      height: 12px;
      border-radius: 999px;
      margin-left: 8px;
      vertical-align: middle;
      border: 1px solid rgba(255,255,255,0.35);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(box);
  document.body.appendChild(panelArea);

  function applyTheme(themeId) {
    currentThemeId = themeId;
    localStorage.setItem(THEME_KEY, themeId);

    const theme = getTheme();
    document.documentElement.style.setProperty('--nova-primary', theme.primary);
    document.documentElement.style.setProperty('--nova-secondary', theme.secondary);
    document.documentElement.style.setProperty('--nova-glow', theme.glow);
    document.documentElement.style.setProperty('--nova-panel-glow', theme.panelGlow);
  }

  function renderHome() {
    const content = document.getElementById('nova-content');
    content.innerHTML = `<div class="nova-hint">Click Modules to open Nova Module Manager.</div>`;
    modulesOpen = false;
  }

  function renderThemes() {
    const content = document.getElementById('nova-content');
    modulesOpen = false;

    content.innerHTML = Object.entries(themes).map(([id, theme]) => `
      <div class="nova-theme-card">
        <div class="nova-theme-title">
          <span>${theme.name}<span class="nova-swatch" style="background: linear-gradient(90deg, ${theme.primary}, ${theme.secondary});"></span></span>
          <span class="nova-theme-status">${id === currentThemeId ? 'Active' : 'Theme'}</span>
        </div>
        <div class="nova-theme-desc">Primary: ${theme.primary} | Secondary: ${theme.secondary}</div>
        <button class="nova-theme-apply" data-theme-id="${id}">${id === currentThemeId ? 'Current Theme' : 'Apply Theme'}</button>
      </div>
    `).join('');

    document.querySelectorAll('.nova-theme-apply').forEach(button => {
      button.onclick = () => {
        applyTheme(button.dataset.themeId);
        renderThemes();
      };
    });
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

    saveJson(ACTIVE_MODULES_KEY, activeModules);
    renderModules();
  }

  function showModule(moduleId) {
    const module = modules.find(item => item.id === moduleId);
    if (!module) return;

    if (document.getElementById(`nova-panel-${moduleId}`)) return;

    const panel = document.createElement('div');
    panel.className = 'nova-floating-module';
    panel.id = `nova-panel-${moduleId}`;

    if (moduleId === 'player') {
      panel.innerHTML = createPlayerPanel(module);
    } else {
      panel.innerHTML = createPlaceholderPanel(module);
    }

    panelArea.appendChild(panel);

    panel.querySelector('.nova-mini-close').onclick = () => {
      activeModules[moduleId] = false;
      saveJson(ACTIVE_MODULES_KEY, activeModules);
      hideModule(moduleId);

      if (modulesOpen) {
        renderModules();
      }
    };

    if (moduleId === 'player') {
      wirePlayerButtons();
    }
  }

  function createPlaceholderPanel(module) {
    return `
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
  }

  function createPlayerPanel(module) {
    return `
      <div class="nova-floating-header">
        <span>${module.icon} ${module.name}</span>
        <button class="nova-mini-close" data-module-id="${module.id}" title="Turn module off">×</button>
      </div>
      <div class="nova-floating-body">
        <strong>Status:</strong> ${module.status}<br>
        Suno control test module.

        <div class="nova-player-grid">
          <button class="nova-player-btn" id="nova-prev">⏮ Prev</button>
          <button class="nova-player-btn" id="nova-play">▶ / ⏸</button>
          <button class="nova-player-btn" id="nova-next">⏭ Next</button>
          <button class="nova-player-btn" id="nova-shuffle">🔀 Shuffle</button>
          <button class="nova-player-btn" id="nova-scan">🔍 Scan</button>
          <button class="nova-player-btn" id="nova-audio">🎧 Audio</button>
        </div>

        <div class="nova-player-status" id="nova-player-status">
          Ready. Open Suno, then test buttons.
        </div>
      </div>
    `;
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

  function getButtonName(button) {
    return (
      button.getAttribute('aria-label') ||
      button.getAttribute('title') ||
      button.textContent ||
      ''
    ).trim();
  }

  function clickSunoButton(possibleNames) {
    const names = Array.isArray(possibleNames) ? possibleNames : [possibleNames];
    const wanted = names.map(name => name.toLowerCase());
    const buttons = [...document.querySelectorAll('button')];

    const btn = buttons.find(button => {
      const buttonName = getButtonName(button).toLowerCase();
      return wanted.some(name => buttonName.includes(name));
    });

    if (!btn) {
      setPlayerStatus(`Button not found: ${names.join(', ')}`);
      console.warn('Nova Player: button not found. Tried:', names);
      console.log('Nova Player: available buttons:', buttons.map(getButtonName).filter(Boolean));
      return false;
    }

    btn.click();
    setPlayerStatus(`Clicked: ${getButtonName(btn)}`);
    return true;
  }

  function findAudio() {
    return document.querySelector('audio');
  }

  function setPlayerStatus(message) {
    const status = document.getElementById('nova-player-status');
    if (status) status.textContent = message;
  }

  function scanSuno() {
    const buttons = [...document.querySelectorAll('button')]
      .map(getButtonName)
      .filter(Boolean);

    const audio = findAudio();

    console.log('Nova Player scan - buttons:', buttons);
    console.log('Nova Player scan - audio:', audio);

    setPlayerStatus(`Scan complete. Buttons found: ${buttons.length}. Audio: ${audio ? 'yes' : 'no'}. Check console.`);
  }

  function wirePlayerButtons() {
    document.getElementById('nova-prev').onclick = () => {
      clickSunoButton(['previous song', 'previous', 'prev']);
    };

    document.getElementById('nova-next').onclick = () => {
      clickSunoButton(['next song', 'next']);
    };

    document.getElementById('nova-shuffle').onclick = () => {
      clickSunoButton(['toggle shuffle', 'shuffle']);
    };

    document.getElementById('nova-play').onclick = () => {
      const audio = findAudio();

      if (audio) {
        if (audio.paused) {
          audio.play();
          setPlayerStatus('Audio play() requested.');
        } else {
          audio.pause();
          setPlayerStatus('Audio pause() requested.');
        }
        return;
      }

      clickSunoButton(['play', 'pause']);
    };

    document.getElementById('nova-scan').onclick = scanSuno;

    document.getElementById('nova-audio').onclick = () => {
      const audio = findAudio();

      if (!audio) {
        setPlayerStatus('No audio element found.');
        return;
      }

      setPlayerStatus(`Audio found. Paused: ${audio.paused}. Time: ${Math.floor(audio.currentTime)}s`);
      console.log('Nova Player audio element:', audio);
    };
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

  document.getElementById('nova-theme-btn').onclick = renderThemes;

  applyTheme(currentThemeId);
  restoreActiveModules();

  console.log(`Nova Bootstrap v${NOVA_VERSION} loaded`);
})();
