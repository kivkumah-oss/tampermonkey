// ==UserScript==
// @name         Nova Trusted Types Compatibility
// @namespace    nova-core
// @version      1.1.0
// @description  Allows Nova-owned UI elements to render on strict Trusted Types websites such as YouTube Music.
// @author       Martins + Nova
// @match        https://music.youtube.com/*
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @noframes
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-trusted-types-compat.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-trusted-types-compat.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__NOVA_TRUSTED_TYPES_COMPAT__) return;
  window.__NOVA_TRUSTED_TYPES_COMPAT__ = true;

  const VERSION = '1.1.0';
  const tt = window.trustedTypes;
  if (!tt || typeof tt.createPolicy !== 'function') {
    console.log('[Nova TT Compat] Trusted Types not required on this page');
    return;
  }

  let policy;
  try {
    policy = tt.createPolicy('nova-ui-compat', {
      createHTML(value) {
        return String(value == null ? '' : value);
      }
    });
  } catch (error) {
    console.warn('[Nova TT Compat] Could not create policy', error);
    return;
  }

  function hasNovaClass(element) {
    if (!element || !element.classList) return false;
    try {
      for (const name of element.classList) {
        const value = String(name || '');
        if (value.startsWith('nova-') || value.startsWith('nym-') || value.startsWith('nsr-')) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function isNovaOwned(element, htmlValue) {
    const html = typeof htmlValue === 'string' ? htmlValue : '';

    // Detached Nova nodes can receive innerHTML before being attached to the page,
    // so inspect both the target and the incoming template.
    if (/\b(?:nova-|nym-|nsr-)/i.test(html) || /Nova(?:\s|&nbsp;)/i.test(html)) return true;

    if (!element) return false;
    try {
      const id = String(element.id || '');
      if (id.startsWith('nova-') || id.startsWith('nym-') || id.startsWith('nsr-')) return true;
    } catch (_) {}

    if (hasNovaClass(element)) return true;

    try {
      if (element.closest && element.closest('[id^="nova-"],[id^="nym-"],[id^="nsr-"]')) return true;
    } catch (_) {}

    return false;
  }

  function patchInnerHtml(prototype, label) {
    if (!prototype) return false;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'innerHTML');
    if (!descriptor || typeof descriptor.set !== 'function' || typeof descriptor.get !== 'function') {
      return false;
    }

    const nativeGet = descriptor.get;
    const nativeSet = descriptor.set;

    try {
      Object.defineProperty(prototype, 'innerHTML', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get() {
          return nativeGet.call(this);
        },
        set(value) {
          const next = typeof value === 'string' && isNovaOwned(this, value)
            ? policy.createHTML(value)
            : value;
          return nativeSet.call(this, next);
        }
      });
      console.log('[Nova TT Compat] Patched', label);
      return true;
    } catch (error) {
      console.warn('[Nova TT Compat] Failed to patch ' + label, error);
      return false;
    }
  }

  const elementPatched = patchInnerHtml(window.Element && window.Element.prototype, 'Element.innerHTML');
  const shadowPatched = patchInnerHtml(window.ShadowRoot && window.ShadowRoot.prototype, 'ShadowRoot.innerHTML');

  if (elementPatched || shadowPatched) {
    console.log('[Nova TT Compat] Active', VERSION);
  } else {
    console.warn('[Nova TT Compat] No compatible innerHTML sink found');
  }
})();
