// core/nova-menu-emergency-cleanup.js

(function () {
  'use strict';

  const VERSION = '1.0.0';
  const MENU_ID = 'nova-modules-menu';

  function clean(panel) {
    if (!panel) return;

    panel.querySelectorAll('[data-nova-special-view], [data-nova-private-devkit]').forEach((node) => node.remove());
    delete panel.dataset.novaDevkitHtml;
    delete panel.dataset.novaCoreHtml;
    delete panel.dataset.novaDevkitGateBound;

    const body = panel.querySelector('.nova-menu-body');
    const modules = panel.querySelector('[data-nova-view="modules"]');
    const advanced = panel.querySelector('[data-nova-view="advanced"]');

    if (body && !body.querySelector('.nova-card') && window.NovaMenu && typeof window.NovaMenu.refresh === 'function') {
      try { window.NovaMenu.refresh(); } catch (_) {}
    }

    if (modules) modules.style.display = '';
    if (advanced) advanced.style.display = '';
  }

  function run() {
    clean(document.getElementById(MENU_ID));
  }

  window.NovaMenuEmergencyCleanup = {
    version: VERSION,
    run
  };

  run();
  setTimeout(run, 100);
  setTimeout(run, 500);
  console.log('[Nova Core] Nova menu emergency cleanup ' + VERSION + ' loaded');
})();
