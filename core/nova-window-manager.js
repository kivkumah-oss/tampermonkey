// core/nova-window-manager.js

(function () {
  'use strict';

  if (window.NovaWindowManager) return;

  const VERSION = '0.1.0';
  const PREFIX = 'nova.window.pos.';

  function key(id) {
    return PREFIX + id;
  }

  function readPos(id) {
    try {
      const raw = localStorage.getItem(key(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function savePos(id, pos) {
    try {
      localStorage.setItem(key(id), JSON.stringify(pos));
    } catch (e) {}
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function restore(panel, id) {
    const pos = readPos(id);
    if (!pos) return;
    const w = panel.offsetWidth || 360;
    const h = panel.offsetHeight || 360;
    panel.style.left = clamp(pos.x, 4, window.innerWidth - w - 4) + 'px';
    panel.style.top = clamp(pos.y, 4, window.innerHeight - h - 4) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function makeDraggable(panel, id) {
    if (!panel || panel.__novaDragReady) return;
    panel.__novaDragReady = true;

    const handle = panel.firstElementChild || panel;
    handle.style.cursor = 'move';
    handle.style.userSelect = 'none';

    restore(panel, id);

    let active = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function down(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button,input,textarea,select,a')) return;

      const rect = panel.getBoundingClientRect();
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';

      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      e.preventDefault();
    }

    function move(e) {
      if (!active) return;
      const rect = panel.getBoundingClientRect();
      const x = clamp(startLeft + e.clientX - startX, 4, window.innerWidth - rect.width - 4);
      const y = clamp(startTop + e.clientY - startY, 4, window.innerHeight - rect.height - 4);
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }

    function up() {
      if (!active) return;
      active = false;
      const rect = panel.getBoundingClientRect();
      savePos(id, { x: Math.round(rect.left), y: Math.round(rect.top) });
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
    }

    handle.addEventListener('pointerdown', down, true);
  }

  function scan() {
    makeDraggable(document.getElementById('nova-modules-menu'), 'nova-modules-menu');
    makeDraggable(document.getElementById('nova-memory-panel'), 'nova-memory-panel');
  }

  window.NovaWindowManager = {
    version: VERSION,
    scan,
    reset(id) {
      localStorage.removeItem(key(id || 'nova-modules-menu'));
      if (!id) localStorage.removeItem(key('nova-memory-panel'));
      scan();
    }
  };

  setInterval(scan, 1000);
  scan();

  console.log('[Nova Core] NovaWindowManager loaded');
})();
