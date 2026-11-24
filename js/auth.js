/* Client-side lock gate — uses identical SHA-256 hash as legacy Travel-app */
(function (global) {
  'use strict';

  var PASS_HASH = '9ec8c077bf2147c14ef21892937115fda5fe00708948308505a227725006f771';
  var SESSION_KEY = 'ryan_travel_unlocked_v1';
  var started = false;

  function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function sha256(text) {
    if (!global.crypto || !global.crypto.subtle) {
      return Promise.reject(new Error('Web Crypto unavailable'));
    }
    return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(toHex);
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function setUnlocked(on) {
    try {
      if (on) sessionStorage.setItem(SESSION_KEY, '1');
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function showGate() {
    var gate = document.getElementById('lockGate');
    if (gate) gate.hidden = false;
    document.body.classList.add('locked');
  }

  function hideGate() {
    var gate = document.getElementById('lockGate');
    if (gate) gate.hidden = true;
    document.body.classList.remove('locked');
  }

  function lock() {
    setUnlocked(false);
    showGate();
    var input = document.getElementById('lockPassword');
    var err = document.getElementById('lockError');
    if (err) { err.hidden = true; err.textContent = ''; }
    if (input) {
      input.value = '';
      setTimeout(function () { input.focus(); }, 50);
    }
  }

  function tryUnlock(password) {
    var err = document.getElementById('lockError');
    return sha256(password).then(function (h) {
      if (h === PASS_HASH) {
        setUnlocked(true);
        hideGate();
        if (err) { err.hidden = true; err.textContent = ''; }
        return true;
      }
      if (err) { err.hidden = false; err.textContent = '密碼不正確，請重新輸入'; }
      return false;
    }).catch(function () {
      if (err) { err.hidden = false; err.textContent = '瀏覽器環境不支援加密驗證（請使用 localhost 或 HTTPS）'; }
      return false;
    });
  }

  function requireUnlock(thenStart) {
    var form = document.getElementById('lockForm');
    var input = document.getElementById('lockPassword');
    function startOnce() {
      if (started) return;
      started = true;
      thenStart();
    }
    if (form && !form.__bound) {
      form.__bound = true;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        tryUnlock((input && input.value) || '').then(function (ok) {
          if (ok) startOnce();
        });
      });
    }
    if (isUnlocked()) {
      hideGate();
      startOnce();
      return;
    }
    showGate();
    if (input) setTimeout(function () { input.focus(); }, 50);
  }

  global.TravelAuth = {
    isUnlocked: isUnlocked,
    lock: lock,
    tryUnlock: tryUnlock,
    requireUnlock: requireUnlock
  };
})(window);
