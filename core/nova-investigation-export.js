// core/nova-investigation-export.js

(function () {
  'use strict';

  if (window.NovaInvestigationExport) {
    console.warn('[Nova Core] NovaInvestigationExport already loaded');
    return;
  }

  function now() {
    return new Date().toISOString();
  }

  function safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function writeClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function sessionPayload() {
    if (!window.NovaSession || typeof window.NovaSession.export !== 'function') return null;
    return safeClone(window.NovaSession.export());
  }

  function tracePayload() {
    if (!window.NovaTraceNetwork) return null;
    return {
      status: typeof window.NovaTraceNetwork.getStatus === 'function'
        ? safeClone(window.NovaTraceNetwork.getStatus())
        : null,
      logs: typeof window.NovaTraceNetwork.getLogs === 'function'
        ? safeClone(window.NovaTraceNetwork.getLogs())
        : []
    };
  }

  function domPayload(options = {}) {
    if (!window.NovaDOMInspector) return null;
    if (options.fullDom && typeof window.NovaDOMInspector.inspect === 'function') {
      return safeClone(window.NovaDOMInspector.inspect());
    }
    if (typeof window.NovaDOMInspector.summary === 'function') {
      return safeClone(window.NovaDOMInspector.summary());
    }
    return null;
  }

  function build(options = {}) {
    const payload = {
      tool: 'Nova Investigation Export',
      version: '0.2.0-devkit-copy-restore',
      exportedAt: now(),
      intent: 'AI-ready website investigation package',
      privacy: {
        note: 'Designed to include safe metadata only. Network bodies, headers, cookies, and tokens are not intentionally collected by Nova Trace.',
        fullDomIncluded: Boolean(options.fullDom)
      },
      page: {
        url: location.href,
        host: location.hostname,
        title: document.title,
        readyState: document.readyState
      },
      nova: {
        version: window.Nova ? window.Nova.version : null,
        build: window.Nova ? window.Nova.build : null,
        loadedAt: window.Nova ? window.Nova.loadedAt : null,
        modules: window.Nova && typeof window.Nova.getModules === 'function'
          ? safeClone(window.Nova.getModules())
          : []
      },
      session: sessionPayload(),
      trace: tracePayload(),
      dom: domPayload(options),
      guide: {
        howToUse: 'Paste this JSON into ChatGPT and ask it to explain what happened, identify useful selectors/endpoints, or help build a Nova module.',
        goodQuestions: [
          'What changed on this page?',
          'Which buttons, inputs, or tables look important?',
          'Which requests look related to the action I performed?',
          'Can you draft a Nova module skeleton from this investigation?'
        ]
      }
    };

    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({
        module: 'investigation-export',
        type: 'export-build',
        summary: 'AI-ready investigation package built',
        data: {
          fullDom: Boolean(options.fullDom),
          traceEvents: payload.trace && payload.trace.logs ? payload.trace.logs.length : 0,
          domElements: payload.dom && payload.dom.counts ? payload.dom.counts.totalElements : null
        }
      });
    }

    return payload;
  }

  function copy(options = {}) {
    const payload = build(options);
    const text = JSON.stringify(payload, null, 2);
    writeClipboard(text).then(() => {
      console.log('[Nova Investigation Export] Copied', options.fullDom ? 'extended bundle' : 'summary bundle');
    }).catch((error) => {
      console.warn('[Nova Investigation Export] Clipboard copy failed', error);
    });
    return payload;
  }

  window.NovaInvestigationExport = {
    build,
    copy,

    copySummary() {
      return copy({ fullDom: false });
    },

    copyExtended() {
      return copy({ fullDom: true });
    },

    copyFull() {
      return copy({ fullDom: true });
    },

    summary() {
      const payload = build({ fullDom: false });
      return {
        exportedAt: payload.exportedAt,
        page: payload.page,
        nova: payload.nova,
        sessionStats: payload.session && payload.session.session ? payload.session.session.stats : null,
        traceStatus: payload.trace ? payload.trace.status : null,
        domCounts: payload.dom ? payload.dom.counts : null
      };
    }
  };

  console.log('[Nova Core] NovaInvestigationExport loaded');
})();
