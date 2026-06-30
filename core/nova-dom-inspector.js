// core/nova-dom-inspector.js

(function () {
  'use strict';

  if (window.NovaDOMInspector) {
    console.warn('[Nova Core] NovaDOMInspector already loaded');
    return;
  }

  const MAX_TEXT = 80;
  const MAX_ELEMENTS = 300;

  function now() {
    return new Date().toISOString();
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT);
  }

  function cssPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += '#' + current.id;
        parts.unshift(part);
        break;
      }
      const className = String(current.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (className) part += '.' + className;
      const siblings = Array.from(current.parentElement ? current.parentElement.children : []);
      const sameTag = siblings.filter((node) => node.tagName === current.tagName);
      if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(current) + 1) + ')';
      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  function elementSummary(element) {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || '',
      classes: String(element.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 8),
      role: element.getAttribute('role') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      name: element.getAttribute('name') || '',
      type: element.getAttribute('type') || '',
      href: element.tagName === 'A' ? element.getAttribute('href') || '' : '',
      text: cleanText(element.innerText || element.textContent || ''),
      path: cssPath(element),
      visible: Boolean(rect.width || rect.height),
      box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function countSelectors() {
    const selectors = {
      forms: 'form',
      buttons: 'button,[role="button"],input[type="button"],input[type="submit"]',
      inputs: 'input,textarea,select',
      links: 'a[href]',
      tables: 'table',
      dialogs: 'dialog,[role="dialog"],[aria-modal="true"]',
      lists: 'ul,ol,[role="list"]',
      headings: 'h1,h2,h3,h4,h5,h6',
      images: 'img',
      iframes: 'iframe'
    };

    return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, document.querySelectorAll(selector).length]));
  }

  function collect(selector, limit = 50) {
    return Array.from(document.querySelectorAll(selector)).slice(0, limit).map(elementSummary);
  }

  function inspect(options = {}) {
    const includeElements = options.includeElements !== false;
    const snapshot = {
      tool: 'Nova DOM Inspector',
      version: '0.1.0',
      capturedAt: now(),
      page: {
        url: location.href,
        host: location.hostname,
        title: document.title,
        readyState: document.readyState
      },
      counts: {
        totalElements: document.querySelectorAll('*').length,
        ...countSelectors()
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      },
      meta: Array.from(document.querySelectorAll('meta')).slice(0, 30).map((meta) => ({
        name: meta.getAttribute('name') || '',
        property: meta.getAttribute('property') || '',
        content: cleanText(meta.getAttribute('content') || '')
      })),
      elements: {}
    };

    if (includeElements) {
      snapshot.elements = {
        headings: collect('h1,h2,h3,h4,h5,h6', 60),
        buttons: collect('button,[role="button"],input[type="button"],input[type="submit"]', 80),
        inputs: collect('input,textarea,select', 80),
        links: collect('a[href]', 80),
        tables: collect('table', 30),
        dialogs: collect('dialog,[role="dialog"],[aria-modal="true"]', 30),
        landmarks: collect('main,nav,header,footer,section,aside,[role="main"],[role="navigation"]', 80),
        sample: collect('body *', MAX_ELEMENTS)
      };
    }

    if (window.NovaSession && window.NovaSession.isActive()) {
      window.NovaSession.addEvent({
        module: 'dom-inspector',
        type: 'snapshot',
        summary: 'DOM snapshot captured',
        data: {
          totalElements: snapshot.counts.totalElements,
          buttons: snapshot.counts.buttons,
          inputs: snapshot.counts.inputs,
          links: snapshot.counts.links,
          tables: snapshot.counts.tables
        }
      });
    }

    return snapshot;
  }

  window.NovaDOMInspector = {
    inspect,
    copy(options = {}) {
      const snapshot = inspect(options);
      navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      return snapshot;
    },
    summary() {
      return inspect({ includeElements: false });
    }
  };

  console.log('[Nova Core] NovaDOMInspector loaded');
})();
