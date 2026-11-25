(function (root) {
  'use strict';

  const KEY = 'baufi.v1';

  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function laden() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const z = JSON.parse(raw);
      if (!z || typeof z !== 'object' || !Array.isArray(z.szenarien)) return null;
      return z;
    } catch (e) {
      return null;
    }
  }

  function speichern(zustand) {
    try {
      localStorage.setItem(KEY, JSON.stringify(zustand));
    } catch (e) {
      // Speicher voll oder gesperrt: bewusst ignoriert
    }
  }

  function exportieren(zustand) {
    const blob = new Blob([JSON.stringify(zustand, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baufinanzierung-szenarien.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function importieren(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Datei konnte nicht gelesen werden.')); };
      reader.onload = function () {
        let z;
        try {
          z = JSON.parse(String(reader.result));
        } catch (e) {
          reject(new Error('Die Datei ist kein gültiges JSON.'));
          return;
        }
        if (!z || z.version !== 1) {
          reject(new Error('Unbekannte oder fehlende Version.'));
          return;
        }
        if (!Array.isArray(z.szenarien) || z.szenarien.length < 1) {
          reject(new Error('Keine Szenarien in der Datei gefunden.'));
          return;
        }
        resolve(z);
      };
      reader.readAsText(file);
    });
  }

  function teilenLink(szenario) {
    const base = typeof location !== 'undefined' ? location.href.split('#')[0] : '';
    return base + '#s=' + toBase64Url(JSON.stringify(szenario));
  }

  function ausLink(hash) {
    try {
      const h = String(hash || '').replace(/^#/, '');
      const m = /(?:^|&)s=([^&]*)/.exec(h);
      if (!m) return null;
      const s = JSON.parse(fromBase64Url(m[1]));
      return s && typeof s === 'object' ? s : null;
    } catch (e) {
      return null;
    }
  }

  const api = {
    KEY,
    laden,
    speichern,
    exportieren,
    importieren,
    teilenLink,
    ausLink
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BaufiStorage = api;
})(typeof self !== 'undefined' ? self : this);
