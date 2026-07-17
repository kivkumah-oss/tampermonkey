// core/nova-menu-scroll-guard.js

(function () {
  'use strict';

  if (window.NovaMenuScrollGuard) return;

  const VERSION = '1.0.0';
  const MENU_ID = 'nova-modules-menu';
  const BODY_SELECTOR = '.nova-menu-body';

  let panel = null;
  let observer = null;
  let savedScrollTop = 0;
  let restoring = false;

  function currentBody() {
    return panel && panel.querySelector ? panel.querySelector(BODY_SELECTOR) : null;
  }

  function rememberScroll(event) {
    const target = event && event.target;
    if (!target || !target.matches || !target.matches(BODY_SELECTOR)) return;
    if (restoring) return;
    savedScrollTop = Math.max(0, Number(target.scrollTop) || 0);
  }

  function restoreScroll() {
    const body = currentBody();
    if (!body) return;

    const max = Math.max(0, body.scrollHeight - body.clientHeight);
    const next = Math.min(savedScrollTop, max);

    restoring = true;
    body.scrollTop = next;
    requestAnimationFrame(() => {
      const latest = currentBody();
      if (latest) latest.scrollTop = Math.min(savedScrollTop, Math.max(0, latest.scrollHeight - latest.clientHeight));
      restoring = false;
    });
  }

  function attach(nextPanel) {
    if (!nextPanel || nextPanel === panel) return;

    if (observer) observer.disconnect();
    if (panel) panel.removeEventListener('scroll', rememberScroll, true);

    panel = nextPanel;
    panel.addEventListener('scroll', rememberScroll, true);

    observer = new MutationObserver(() => {
      const oldBody = currentBody();
      if (oldBody && !restoring && oldBody.scrollTop > 0) {
        savedScrollTop = oldBody.scrollTop;
      }
      setTimeout(restoreScroll, 0);
    });

    observer.observe(panel, { childList: true, subtree: true });
    restoreScroll();
  }

  function scan() {
    const nextPanel = document.getElementById(MENU_ID);
    if (nextPanel) attach(nextPanel);
  }

  const documentObserver = new MutationObserver(scan);
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  window.NovaMenuScrollGuard = {
    version: VERSION,
    scan,
    getScrollTop: () => savedScrollTop,
    reset: () => {
      savedScrollTop = 0;
      restoreScroll();
    }
  };

  console.log('[Nova Core] NovaMenuScrollGuard loaded', VERSION);
})();
