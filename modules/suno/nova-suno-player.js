// modules/suno/nova-suno-player.js

(function () {
  'use strict';

  if (window.NovaSunoPlayer) return;

  const VERSION = '0.2.0';
  const PANEL_ID = 'nova-suno-player';
  const POS_KEY = 'nova.suno.player.position';

  const state = { panel: null, visible: true, minimized: false, audio: null, lastTitle: '', timer: null };

  function onSuno() { return location.hostname.includes('suno.com'); }
  function emit(type, summary, data) { if (window.NovaSession && window.NovaSession.isActive()) window.NovaSession.addEvent({ module: 'suno-player', type, summary, data: data || {} }); }
  function safeText(value) { return String(value || '').trim().replace(/\s+/g, ' '); }

  function findAudio() {
    const active = document.getElementById('active-audio-play');
    if (active && active.tagName && active.tagName.toLowerCase() === 'audio') return active;
    const audios = Array.from(document.querySelectorAll('audio'));
    return audios.find((a) => !a.paused) || audios[0] || null;
  }

  function scoreButton(button, labels) {
    const text = safeText(button.textContent).toLowerCase();
    const aria = safeText(button.getAttribute('aria-label')).toLowerCase();
    const title = safeText(button.getAttribute('title')).toLowerCase();
    const combined = [text, aria, title].join(' ');
    let score = 0;
    labels.forEach((label) => {
      if (combined === label) score += 100;
      if (combined.includes(label)) score += 50;
      if (aria.includes(label)) score += 40;
      if (title.includes(label)) score += 25;
    });
    return score;
  }

  function findButton(labels) {
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).filter((button) => button && button.offsetParent !== null && !button.disabled);
    return buttons.map((button) => ({ button, score: scoreButton(button, labels) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)[0]?.button || null;
  }

  function clickButton(name, labels) {
    const button = findButton(labels);
    if (!button) { setStatus('Missing: ' + name); emit('control-missing', 'Suno control missing: ' + name, { name, labels }); return false; }
    button.click();
    setStatus('Clicked: ' + name);
    emit('control-click', 'Suno control clicked: ' + name, { name });
    setTimeout(refresh, 350);
    return true;
  }

  function playPause() {
    const audio = findAudio();
    if (audio) {
      state.audio = audio;
      if (audio.paused) {
        const btn = findButton(['play', 'resume']);
        if (btn) return clickButton('Play', ['play', 'resume']);
        audio.play().catch(() => clickButton('Play', ['play', 'resume']));
        setStatus('Audio play requested');
        return true;
      }
      const btn = findButton(['pause']);
      if (btn) return clickButton('Pause', ['pause']);
      audio.pause();
      setStatus('Audio paused');
      return true;
    }
    return clickButton('Play/Pause', ['play', 'pause', 'resume']);
  }

  function next() { return clickButton('Next', ['next', 'skip forward', 'forward']); }
  function previous() { return clickButton('Previous', ['previous', 'prev', 'skip back', 'back']); }
  function shuffle() { return clickButton('Shuffle', ['shuffle']); }
  function lyrics() { return clickButton('Lyrics', ['lyrics', 'show lyrics']); }

  function findTitle() {
    const candidates = Array.from(document.querySelectorAll('[data-testid],h1,h2,h3,a,span,div')).map((el) => safeText(el.textContent)).filter((text) => text && text.length > 2 && text.length < 90).filter((text) => !/play|pause|next|previous|shuffle|create|library|home|search/i.test(text));
    return candidates[0] || document.title || 'Suno';
  }

  function formatTime(seconds) { if (!Number.isFinite(seconds)) return '--:--'; const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return m + ':' + String(s).padStart(2, '0'); }

  function styles() {
    return `
      #${PANEL_ID}{position:fixed;right:18px;bottom:118px;width:300px;z-index:2147483645;background:rgba(10,10,18,.96);color:#fff;border:1px solid rgba(34,211,238,.55);box-shadow:0 0 24px rgba(34,211,238,.35);border-radius:16px;font:12px Arial,sans-serif;overflow:hidden;}
      #${PANEL_ID} .nsp-head{padding:10px 12px;background:linear-gradient(90deg,rgba(34,211,238,.9),rgba(168,85,247,.9));display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:.03em;}
      #${PANEL_ID} .nsp-body{padding:10px;} #${PANEL_ID} .nsp-title{font-weight:700;color:#e5e7eb;line-height:1.3;min-height:32px;margin-bottom:8px;} #${PANEL_ID} .nsp-status{color:#9ca3af;font-size:11px;margin-top:8px;line-height:1.35;} #${PANEL_ID} .nsp-row{display:flex;gap:6px;flex-wrap:wrap;}
      #${PANEL_ID} button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(34,211,238,.45);border-radius:9px;padding:7px 9px;cursor:pointer;font:700 12px Arial,sans-serif;} #${PANEL_ID} button:hover{background:rgba(34,211,238,.18);} #${PANEL_ID} .nsp-small{font-size:11px;padding:5px 7px;border-color:rgba(255,255,255,.25);} #${PANEL_ID} .nsp-progress{height:5px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden;margin-top:8px;} #${PANEL_ID} .nsp-progress > div{height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#a855f7);} #${PANEL_ID}.min .nsp-body{display:none;}
    `;
  }

  function injectStyles() { if (document.getElementById('nova-suno-player-style')) return; const style = document.createElement('style'); style.id = 'nova-suno-player-style'; style.textContent = styles(); document.head.appendChild(style); }

  function createPanel() {
    if (state.panel) return state.panel;
    injectStyles();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="nsp-head"><span>Nova Suno Player</span><span><button class="nsp-small" data-nsp-refresh>↻</button><button class="nsp-small" data-nsp-hide>×</button><button class="nsp-small" data-nsp-min>−</button></span></div>
      <div class="nsp-body"><div class="nsp-title" data-nsp-title>Ready</div><div class="nsp-row"><button data-nsp-prev>⏮</button><button data-nsp-play>▶ / ⏸</button><button data-nsp-next>⏭</button><button data-nsp-shuffle>🔀</button><button data-nsp-lyrics>Lyrics</button></div><div class="nsp-progress"><div data-nsp-bar></div></div><div class="nsp-status" data-nsp-status>Waiting for Suno audio...</div></div>`;
    document.body.appendChild(panel);
    state.panel = panel;
    panel.querySelector('[data-nsp-play]').addEventListener('click', playPause);
    panel.querySelector('[data-nsp-next]').addEventListener('click', next);
    panel.querySelector('[data-nsp-prev]').addEventListener('click', previous);
    panel.querySelector('[data-nsp-shuffle]').addEventListener('click', shuffle);
    panel.querySelector('[data-nsp-lyrics]').addEventListener('click', lyrics);
    panel.querySelector('[data-nsp-refresh]').addEventListener('click', refresh);
    panel.querySelector('[data-nsp-hide]').addEventListener('click', hide);
    panel.querySelector('[data-nsp-min]').addEventListener('click', () => { state.minimized = !state.minimized; panel.classList.toggle('min', state.minimized); });
    makeDraggable(panel);
    emit('load', 'Nova Suno Player loaded', { version: VERSION });
    return panel;
  }

  function show() { if (!onSuno()) return false; const panel = createPanel(); panel.style.display = 'block'; state.visible = true; refresh(); if (!state.timer) state.timer = setInterval(refresh, 1000); return true; }
  function hide() { if (state.panel) state.panel.style.display = 'none'; state.visible = false; return true; }
  function setStatus(text) { const el = state.panel && state.panel.querySelector('[data-nsp-status]'); if (el) el.textContent = text; }

  function refresh() {
    if (!state.panel || !state.visible) return;
    const audio = findAudio(); state.audio = audio;
    const title = findTitle(); state.lastTitle = title;
    const titleEl = state.panel.querySelector('[data-nsp-title]'); if (titleEl) titleEl.textContent = title;
    const bar = state.panel.querySelector('[data-nsp-bar]');
    if (audio) {
      const pct = audio.duration ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
      if (bar) bar.style.width = pct + '%';
      setStatus((audio.paused ? 'Paused' : 'Playing') + ' · ' + formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration));
    } else { if (bar) bar.style.width = '0%'; setStatus('No audio element found yet. Start a Suno track first.'); }
  }

  function makeDraggable(panel) {
    let active = false, sx = 0, sy = 0, sl = 0, st = 0;
    const head = panel.querySelector('.nsp-head'); if (!head) return; head.style.cursor = 'move';
    try { const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (saved) { panel.style.left = saved.x + 'px'; panel.style.top = saved.y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; } } catch (e) {}
    head.addEventListener('mousedown', (e) => { if (e.target && e.target.closest && e.target.closest('button')) return; const rect = panel.getBoundingClientRect(); active = true; sx = e.clientX; sy = e.clientY; sl = rect.left; st = rect.top; document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true); e.preventDefault(); }, true);
    function move(e) { if (!active) return; const x = Math.max(4, Math.min(window.innerWidth - panel.offsetWidth - 4, sl + e.clientX - sx)); const y = Math.max(4, Math.min(window.innerHeight - panel.offsetHeight - 4, st + e.clientY - sy)); panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; }
    function up() { if (!active) return; active = false; const rect = panel.getBoundingClientRect(); localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) })); document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); }
  }

  function init() { if (!onSuno()) return; show(); console.log('[Nova Module] Suno Player loaded'); }

  window.NovaSunoPlayer = { version: VERSION, init, show, hide, refresh, playPause, next, previous, shuffle, lyrics };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
