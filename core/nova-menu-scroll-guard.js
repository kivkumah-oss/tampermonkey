// core/nova-menu-scroll-guard.js

(function () {
  'use strict';

  if (window.NovaMenuScrollGuard) return;

  const VERSION = '1.1.0';
  const MENU_ID = 'nova-modules-menu';
  const BODY_SELECTOR = '.nova-menu-body';

  let panel = null;
  let documentObserver = null;
  let savedScrollTop = 0;
  let savedView = 'modules';
  let restoring = false;
  let originalInnerHtml = null;

  function findInnerHtmlDescriptor() {
    let proto = Element.prototype;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
      if (descriptor && descriptor.get && descriptor.set) return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function currentBody() {
    return panel && panel.querySelector ? panel.querySelector(BODY_SELECTOR) : null;
  }

  function currentView() {
    if (!panel) return savedView;
    const advanced = panel.querySelector('[data-nova-view="advanced"]');
    if (advanced && String(advanced.getAttribute('style') || '').includes('168,85,247')) return 'advanced';
    return 'modules';
  }

  function capture() {
    const body = currentBody();
    if (body && !restoring) savedScrollTop = Math.max(0, Number(body.scrollTop) || 0);
    savedView = currentView();
  }

  function restore() {
    const body = currentBody();
    if (!body) return;

    const max = Math.max(0, body.scrollHeight - body.clientHeight);
    const next = Math.min(savedScrollTop, max);
    restoring = true;
    body.scrollTop = next;

    requestAnimationFrame(() => {
      const latest = currentBody();
      if (latest) {
        const latestMax = Math.max(0, latest.scrollHeight - latest.clientHeight);
        latest.scrollTop = Math.min(savedScrollTop, latestMax);
      }
      restoring = false;
    });
  }

  function rememberScroll(event) {
    const target = event && event.target;
    if (!target || !target.matches || !target.matches(BODY_SELECTOR) || restoring) return;
    savedScrollTop = Math.max(0, Number(target.scrollTop) || 0);
    savedView = currentView();
  }

  function protectRenderBoundary(nextPanel) {
    if (!nextPanel || nextPanel.__novaScrollBoundaryProtected) return;

    const descriptor = findInnerHtmlDescriptor();
    if (!descriptor) return;
    originalInnerHtml = descriptor;

    try {
      Object.defineProperty(nextPanel, 'innerHTML', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          capture();
          descriptor.set.call(this, value);
          restore();
        }
      });
      nextPanel.__novaScrollBoundaryProtected = true;
    } catch (error) {
      console.warn('[Nova Menu Scroll Guard] Could not protect render boundary:', error);
    }
  }

  function attach(nextPanel) {
    if (!nextPanel) return;

    if (panel && panel !== nextPanel) panel.removeEventListener('scroll', rememberScroll, true);
    panel = nextPanel;
    protectRenderBoundary(panel);
    panel.removeEventListener('scroll', rememberScroll, true);
    panel.addEventListener('scroll', rememberScroll, true);
    restore();
  }

  function scan() {
    const nextPanel = document.getElementById(MENU_ID);
    if (nextPanel) attach(nextPanel);
  }

  documentObserver = new MutationObserver(scan);
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  window.NovaMenuScrollGuard = {
    version: VERSION,
    scan,
    capture,
    restore,
    getScrollTop: () => savedScrollTop,
    reset: () => {
      savedScrollTop = 0;
      restore();
    }
  };

  console.log('[Nova Core] NovaMenuScrollGuard loaded', VERSION);
})();