// ═══════════════════════════════════════════
// SecureChat — Reactive State Management
// ═══════════════════════════════════════════

window.AppState = (function() {
  const state = {
    user: { id: null, username: null, hasKeys: false },
    currentRoom: null,
    rooms: [],
    connected: false,
    theme: 'bioluminescent',
    banned: false,
    banReason: '',
  };

  const listeners = {};

  function get(key) {
    return state[key];
  }

  function set(key, value) {
    state[key] = value;
    notify(key);
  }

  function update(key, updaterFn) {
    state[key] = updaterFn(state[key]);
    notify(key);
  }

  function subscribe(key, callback) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(callback);
    return function unsubscribe() {
      listeners[key] = listeners[key].filter(cb => cb !== callback);
    };
  }

  function notify(key) {
    if (listeners[key]) {
      listeners[key].forEach(cb => {
        try { cb(state[key]); } catch(e) { console.error('State listener error:', e); }
      });
    }
  }

  return { get, set, update, subscribe };
})();
