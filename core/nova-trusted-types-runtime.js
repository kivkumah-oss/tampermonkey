// core/nova-trusted-types-runtime.js

(function () {
  'use strict';

  if (window.NovaTrustedTypesRuntime) return;

  const VERSION = '1.0.0';
  const tt = window.trustedTypes;
  const policies = new Map();

  function policyFor(name) {
    if (!tt || typeof tt.createPolicy !== 'function') return null;
    if (policies.has(name)) return policies.get(name);
    let policy = null;
    try {
      policy = tt.createPolicy(name, {
        createHTML(value) {
          return String(value == null ? '' : value);
        }
      });
    } catch (_) {
      try {
        policy = tt.getPolicy && tt.getPolicy(name);
      } catch (_) {}
    }
    policies.set(name, policy);
    return policy;
  }

  const policy = policyFor('nova-core-runtime');

  function looksNova(value) {
    const html = String(value == null ? '' : value);
    return /nova-|nym-|nsr-|Nova\s|Nova</i.test(html);
  }

  function isNovaNode(node) {
    if (!node) return false;
    try {
      const id = String(node.id || '');
      if (/^(nova-|nym-|nsr-)/i.test(id)) return true;
      if (node.classList) {
        for (const name of node.classList) {
          if (/^(nova-|nym-|nsr-)/i.test(String(name || ''))) return true;
        }
      }
      if (node.closest && node.closest('[id^="nova-"],[id^="nym-"],[id^="nsr-"]')) return true;
      const host = node.host;
      if (host && isNovaNode(host)) return true;
    } catch (_) {}
    return false;
  }

  function patch(proto, label) {
    if (!proto || !policy) return false;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function') return false;
    if (descriptor.set && descriptor.set.__novaTrustedTypesPatched) return true;

    const nativeGet = descriptor.get;
    const nativeSet = descriptor.set;
    function novaTrustedTypesSetter(value) {
      const next = typeof value === 'string' && (isNovaNode(this) || looksNova(value))
        ? policy.createHTML(value)
        : value;
      return nativeSet.call(this, next);
    }
    novaTrustedTypesSetter.__novaTrustedTypesPatched = true;

    try {
      Object.defineProperty(proto, 'innerHTML', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get() { return nativeGet.call(this); },
        set: novaTrustedTypesSetter
      });
      console.log('[Nova Core] Trusted Types patched', label);
      return true;
    } catch (error) {
      console.warn('[Nova Core] Trusted Types patch failed', label, error);
      return false;
    }
  }

  const elementPatched = patch(typeof Element !== 'undefined' ? Element.prototype : null, 'Element.innerHTML');
  const shadowPatched = patch(typeof ShadowRoot !== 'undefined' ? ShadowRoot.prototype : null, 'ShadowRoot.innerHTML');

  window.NovaTrustedTypesRuntime = {
    version: VERSION,
    active: Boolean(policy),
    elementPatched,
    shadowPatched,
    createHTML(value) {
      return policy ? policy.createHTML(value) : String(value == null ? '' : value);
    }
  };

  console.log('[Nova Core] NovaTrustedTypesRuntime loaded', VERSION, { elementPatched, shadowPatched });
})();
