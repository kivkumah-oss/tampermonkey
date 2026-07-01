// core/nova-window-manager.js

(function () {
  'use strict';

  if (window.NovaWindowManager) return;

  const VERSION = '0.5.0';
  const PREFIX = 'nova.window.pos.';
  const HANDLE_CLASS = 'nova-drag-handle';
  let scanTimer = null;

  function key(id) { return PREFIX + id; }
  function readPos(id) { try { const raw = localStorage.getItem(key(id)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function savePos(id, pos) { try { localStorage.setItem(key(id), JSON.stringify(pos)); } catch (e) {} }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function restore(panel, id) {
    const pos = readPos(id);
    if (!pos) return;
    const w = panel.offsetWidth || 360;
    const h = panel.offsetHeight || 360;
    panel.style.left = clamp(pos.x || 16, 4, Math.max(4, window.innerWidth - w - 4)) + 'px';
    panel.style.top = clamp(pos.y || 64, 4, Math.max(4, window.innerHeight - h - 4)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function ensureHandle(panel, id) {
    let handle = panel.querySelector('.' + HANDLE_CLASS);
    if (handle) return handle;
    handle = document.createElement('div');
    handle.className = HANDLE_CLASS;
    handle.textContent = '↕ drag';
    handle.dataset.novaWindowId = id;
    handle.style.cssText = [
      'position:absolute','top:8px','right:42px','z-index:2147483647','padding:3px 7px','border-radius:999px',
      'border:1px solid rgba(255,255,255,.28)','background:rgba(0,0,0,.38)','color:#fff','font:700 10px Arial,sans-serif',
      'line-height:1','cursor:move','user-select:none','pointer-events:auto'
    ].join(';');
    panel.appendChild(handle);
    return handle;
  }

  function attachDrag(handle, panel, id) {
    if (!handle || handle.__novaDragAttached) return;
    handle.__novaDragAttached = true;
    let active = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    function point(e) { const t = e.touches && e.touches[0] ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; }
    function down(e) {
      const p = point(e); const rect = panel.getBoundingClientRect();
      active = true; startX = p.x; startY = p.y; startLeft = rect.left; startTop = rect.top;
      panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
      document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true);
      document.addEventListener('touchmove', move, true); document.addEventListener('touchend', up, true);
      e.preventDefault(); e.stopPropagation();
    }
    function move(e) {
      if (!active) return;
      const p = point(e); const rect = panel.getBoundingClientRect();
      const x = clamp(startLeft + p.x - startX, 4, Math.max(4, window.innerWidth - rect.width - 4));
      const y = clamp(startTop + p.y - startY, 4, Math.max(4, window.innerHeight - rect.height - 4));
      panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
      e.preventDefault();
    }
    function up() {
      if (!active) return;
      active = false; const rect = panel.getBoundingClientRect();
      savePos(id, { x: Math.round(rect.left), y: Math.round(rect.top) });
      document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true);
      document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', up, true);
    }
    handle.addEventListener('mousedown', down, true); handle.addEventListener('touchstart', down, true);
  }

  function makeDraggable(panel, id) {
    if (!panel) return;
    panel.style.position = 'fixed';
    restore(panel, id);
    attachDrag(ensureHandle(panel, id), panel, id);
  }

  function scan() {
    // Main Nova menu controls its own orb/menu placement. Do not touch it here.
    makeDraggable(document.getElementById('nova-memory-panel'), 'nova-memory-panel');
    makeDraggable(document.getElementById('nova-suno-player'), 'nova-suno-player');
  }

  function start() { scan(); if (!scanTimer) scanTimer = setInterval(scan, 1000); }

  window.NovaWindowManager = {
    version: VERSION,
    scan,
    reset(id) {
      if (id) localStorage.removeItem(key(id));
      else {
        localStorage.removeItem(key('nova-memory-panel'));
        localStorage.removeItem(key('nova-suno-player'));
      }
      scan();
    }
  };

  start();
  console.log('[Nova Core] NovaWindowManager loaded');
})();
