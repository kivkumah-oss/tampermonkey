// ==UserScript==
// @name         Nova Core Bootstrap
// @namespace    nova-core
// @version      0.3.0
// @description  Nova Core bootstrap loader
// @author       Nova
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-theme.js
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-session.js
// @require      https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/core/nova-trace.js
// ==/UserScript==

(function () {
  'use strict';

  window.Nova = window.Nova || {};
  window.Nova.version = '0.3.0';
  window.Nova.build = 'mission-003-bootstrap';
  window.Nova.loadedAt = new Date().toISOString();

  window.Nova.core = {
    theme: window.NovaTheme || null,
    session: window.NovaSession || null,
    traceNetwork: window.NovaTraceNetwork || null
  };

  function logStatus() {
    console.group('[Nova Core] Bootstrap loaded');
    console.log('Version:', window.Nova.version);
    console.log('Theme:', Boolean(window.NovaTheme));
    console.log('Session:', Boolean(window.NovaSession));
    console.log('Trace Network:', Boolean(window.NovaTraceNetwork));
    console.groupEnd();
  }

  if (window.NovaTheme && typeof window.NovaTheme.inject === 'function') {
    window.NovaTheme.inject();
  }

  if (window.NovaSession && window.NovaSession.isActive()) {
    window.NovaSession.addEvent({
      module: 'bootstrap',
      type: 'load',
      summary: 'Nova Bootstrap loaded',
      data: {
        version: window.Nova.version,
        pageUrl: location.href
      }
    });
  }

  logStatus();
})();
