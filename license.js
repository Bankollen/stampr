/*
 * Stampr Pro licensing via the Lemon Squeezy License API, called straight from the browser
 * (the API allows any origin). Only the license key and an instance id are ever sent — no PDFs,
 * no personal data. The result is remembered in localStorage and re-checked every few days.
 *
 * This is client-side gating: someone determined can get around it. That's an accepted
 * trade-off for a tool with no server; it keeps honest users honest.
 */
(function () {
  'use strict';

  const API = 'https://api.lemonsqueezy.com/v1/licenses/';
  const STORE_KEY = 'stampr.license.v1';
  const RECHECK_MS = 3 * 24 * 3600 * 1000; // re-validate every 3 days
  const GRACE_MS = 30 * 24 * 3600 * 1000; // keep Pro for 30 days if Lemon Squeezy can't be reached

  const cfg = () => (window.STAMPR_CONFIG && window.STAMPR_CONFIG.lemonSqueezy) || {};
  const listeners = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function save(v) {
    try {
      if (v) localStorage.setItem(STORE_KEY, JSON.stringify(v));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* private mode */ }
    listeners.forEach((fn) => fn());
  }

  async function call(endpoint, params) {
    let res;
    try {
      res = await fetch(API + endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
    } catch (e) {
      const err = new Error('Could not reach the license server. Check your internet connection and try again.');
      err.network = true;
      throw err;
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
    return data;
  }

  function isOurs(meta) {
    const c = cfg();
    if (!meta || !c.storeId) return false;
    if (Number(meta.store_id) !== Number(c.storeId)) return false;
    const ids = (c.productIds || []).map(Number);
    return !ids.length || ids.includes(Number(meta.product_id));
  }

  function describe(data) {
    const lk = data.license_key || {};
    return {
      status: lk.status,
      expiresAt: lk.expires_at || null,
      product: (data.meta && (data.meta.variant_name && data.meta.variant_name !== 'Default'
        ? `${data.meta.product_name} (${data.meta.variant_name})` : data.meta.product_name)) || 'Stampr Pro',
    };
  }

  function instanceName() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
    return `wstampr.com – ${browser}${os ? ' on ' + os : ''}`;
  }

  const License = {
    configured() { return !!cfg().storeId; },

    isPro() {
      const l = load();
      return !!(l && l.valid);
    },

    info() { return load(); },

    onChange(fn) { listeners.push(fn); },

    async activate(rawKey) {
      const key = String(rawKey || '').trim();
      if (!key) throw new Error('Enter your license key.');
      if (!this.configured()) throw new Error('Stampr Pro is not on sale yet.');
      const data = await call('activate', { license_key: key, instance_name: instanceName() });
      if (!data.activated) {
        const msg = data.error || 'This license key could not be activated.';
        throw new Error(/not found/i.test(msg) ? 'That license key was not found. Check for typos.' :
          /limit/i.test(msg) ? 'This key is already active on the maximum number of devices. Remove it from another browser first.' : msg);
      }
      if (!isOurs(data.meta)) {
        // Free the activation again — the key belongs to some other product.
        call('deactivate', { license_key: key, instance_id: data.instance && data.instance.id }).catch(() => {});
        throw new Error('That license key is not for Stampr Pro.');
      }
      save(Object.assign({ key, instanceId: data.instance.id, valid: true, checkedAt: Date.now() }, describe(data)));
      return load();
    },

    // Re-checks the stored license every few days. Network trouble never locks out a paying user
    // right away; only an explicit "not valid" answer (or 30 days without contact) does.
    async refresh(force) {
      const l = load();
      if (!l || !l.key) return;
      if (!force && Date.now() - (l.checkedAt || 0) < RECHECK_MS) return;
      try {
        const data = await call('validate', { license_key: l.key, instance_id: l.instanceId });
        const ok = data.valid === true && isOurs(data.meta) &&
          (!data.license_key || data.license_key.status === 'active');
        save(Object.assign({}, l, describe(data), { valid: ok, checkedAt: Date.now(),
          reason: ok ? null : (data.license_key && data.license_key.status === 'expired'
            ? 'Your Pro subscription has ended.' : (data.error || 'This license is no longer valid.')) }));
      } catch (e) {
        if (e.network && Date.now() - (l.checkedAt || 0) > GRACE_MS) {
          save(Object.assign({}, l, { valid: false, reason: 'The license could not be checked for 30 days.' }));
        }
      }
    },

    async deactivate() {
      const l = load();
      if (l && l.key && l.instanceId) {
        try { await call('deactivate', { license_key: l.key, instance_id: l.instanceId }); } catch (e) { /* offline: forget locally anyway */ }
      }
      save(null);
    },
  };

  window.StamprLicense = License;
})();
