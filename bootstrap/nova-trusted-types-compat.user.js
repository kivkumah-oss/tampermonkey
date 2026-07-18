// ==UserScript==
// @name         Nova Trusted Types Compatibility
// @namespace    nova-core
// @version      1.0.0
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

  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (!descriptor || typeof descriptor.set !== 'function' || typeof descriptor.get !== 'function') {
    console.warn('[Nova TT Compat] innerHTML descriptor unavailable');
    return;
  }

  const nativeGet = descriptor.get;
  const nativeSet = descriptor.set;

  function isNovaOwned(element) {
    if (!element || element.nodeType !== 1) return false;
    const id = String(element.id || '');
    if (id.startsWith('nova-')) return true;
    if (element.classList) {
      for (const name of element.classList) {
        if (String(name).startsWith('nova-') || String(name).startsWith('nym-') || String(name).startsWith('nsr-')) {
          return true;
        }
      }
    }
    try {
      return Boolean(element.closest('[id^="nova-"]'));
    } catch (_) {
      return false;
    }
  }

  try {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() {
        return nativeGet.call(this);
      },
      set(value) {
        const next = typeof value === 'string' && isNovaOwned(this)
          ? policy.createHTML(value)
          : value;
        return nativeSet.call(this, next);
      }
    });

    console.log('[Nova TT Compat] Active 1.0.0');
  } catch (error) {
    console.warn('[Nova TT Compat] Failed to install innerHTML bridge', error);
  }
})();
