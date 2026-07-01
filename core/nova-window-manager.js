// core/nova-window-manager.js

(function () {
  'use strict';

  if (window.NovaWindowManager) return;

  const VERSION = '0.4.0';
  const PREFIX = 'nova.window.pos.';
  const HANDLE_CLASS = 'nova-drag-handle';
  let scanTimer = null;

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
    const maxX = Math.max(4, window.innerWidth - w - 4);
    const maxY = Math.max(4, window.innerHeight - h - 4);

    panel.style.left = clamp(pos.x || 16, 4, maxX) + 'px';
    panel.style.top = clamp(pos.y || 64, 4, maxY) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function ensurePanelBase(panel) {
    panel.style.position = 'fixed';
    if (getComputedStyle(panel).position !== 'fixed') panel.style.position = 'fixed';
  }

  function ensureHandle(panel, id) {
    let handle = panel.querySelector('.' + HANDLE_CLASS);
    if (handle) return handle;

    handle = document.createElement('div');
    handle.className = HANDLE_CLASS;
    handle.textContent = '↕ drag';
    handle.dataset.novaWindowId = id;
    handle.style.cssText = [
      'position:absolute',
      'top:8px',
      'right:42px',
      'z-index:2147483647',
      'padding:3px 7px',
      'border-radius:999px',
      'border:1px solid rgba(255,255,255,.28)',
      'background:rgba(0,0,0,.38)',
      'color:#fff',
      'font:700 10px Arial,sans-serif',
      'line-height:1',
      'cursor:move',
      'user-select:none',
      'pointer-events:auto'
    ].join(';');

    panel.appendChild(handle);
    return handle;
  }

  function attachDrag(handle, panel, id) {
    if (!handle || handle.__novaDragAttached) return;
    handle.__novaDragAttached = true;

    let active = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function point(e) {
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }

    function down(e) {
      const p = point(e);
      const rect = panel.getBoundingClientRect();
      active = true;
      startX = p.x;
      startY = p.y;
      startLeft = rect.left;
      startTop = rect.top;

      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';

      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      document.addEventListener('touchmove', move, true);
      document.addEventListener('touchend', up, true);
      e.preventDefault();
      e.stopPropagation();
    }

    function move(e) {
      if (!active) return;
      const p = point(e);
      const rect = panel.getBoundingClientRect();
      const maxX = Math.max(4, window.innerWidth - rect.width - 4);
      const maxY = Math.max(4, window.innerHeight - rect.height - 4);
      const x = clamp(startLeft + p.x - startX, 4, maxX);
      const y = clamp(startTop + p.y - startY, 4, maxY);
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      e.preventDefault();
    }

    function up() {
      if (!active) return;
      active = false;
      const rect = panel.getBoundingClientRect();
      savePos(id, { x: Math.round(rect.left), y: Math.round(rect.top) });
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', up, true);
    }

    handle.addEventListener('mousedown', down, true);
    handle.addEventListener('touchstart', down, true);
  }

  function makeDraggable(panel, id) {
    if (!panel) return;
    ensurePanelBase(panel);
    restore(panel, id);
    const handle = ensureHandle(panel, id);
    attachDrag(handle, panel, id);
  }

  function scan() {
    makeDraggable(document.getElementById('nova-modules-menu'), 'nova-modules-menu');
    makeDraggable(document.getElementById('nova-memory-panel'), 'nova-memory-panel');
  }

  function start() {
    scan();
    if (!scanTimer) scanTimer = setInterval(scan, 500);
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

  start();

  console.log('[Nova Core] NovaWindowManager loaded');
})();
