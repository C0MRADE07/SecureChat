// ═══════════════════════════════════════════
// SecureChat — Storage Layer
// IndexedDB for keys & queue, localStorage for settings
// ═══════════════════════════════════════════

window.SecureStorage = (function() {
  let db = null;

  async function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('securechat', 2);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('keys')) {
          database.createObjectStore('keys');
        }
        if (!database.objectStoreNames.contains('queue')) {
          database.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
        if (!database.objectStoreNames.contains('rooms')) {
          database.createObjectStore('rooms', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        db = e.target.result;
        resolve();
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Generic IDB helpers ──
  function idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(store, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = (key === null || key === undefined)
        ? tx.objectStore(store).put(value)
        : tx.objectStore(store).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function idbGetAll(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbDelete(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function idbClear(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ── Key Storage ──
  async function saveKeyPair(publicKeyB64, privateKey) {
    await idbPut('keys', 'publicKey', publicKeyB64);
    await idbPut('keys', 'privateKey', privateKey);
  }

  async function getKeyPair() {
    const publicKey = await idbGet('keys', 'publicKey');
    const privateKey = await idbGet('keys', 'privateKey');
    if (!publicKey || !privateKey) return null;
    return { publicKey, privateKey };
  }

  // ── User Identity (localStorage) ──
  function saveUserId(uuid) { localStorage.setItem('securechat_userId', uuid); }
  function getUserId() { return localStorage.getItem('securechat_userId'); }
  function saveUsername(name) { localStorage.setItem('securechat_username', name); }
  function getUsername() { return localStorage.getItem('securechat_username'); }

  // ── Theme (localStorage) ──
  function saveTheme(theme) { localStorage.setItem('securechat_theme', theme); }
  function getTheme() { return localStorage.getItem('securechat_theme') || 'bioluminescent'; }

  // ── Offline Message Queue ──
  async function queueMessage(roomId, payload) {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add({ roomId, payload, timestamp: Date.now() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getQueuedMessages(roomId) {
    const all = await idbGetAll('queue');
    return all.filter(m => m.roomId === roomId);
  }

  async function clearQueue(roomId) {
    const all = await idbGetAll('queue');
    const tx = db.transaction('queue', 'readwrite');
    const store = tx.objectStore('queue');
    for (const item of all) {
      if (item.roomId === roomId) store.delete(item.id);
    }
    return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
  }

  // ── Room History ──
  async function saveRoom(room) {
    await idbPut('rooms', null, { id: room.id || room.roomId, name: room.name || room.roomName, code: room.code || room.roomCode, lastVisited: Date.now() });
  }

  async function getRooms() {
    const rooms = await idbGetAll('rooms');
    return rooms.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
  }

  async function removeRoom(roomId) {
    await idbDelete('rooms', roomId);
  }

  // ── Clear Everything ──
  async function clearAll() {
    localStorage.removeItem('securechat_userId');
    localStorage.removeItem('securechat_username');
    localStorage.removeItem('securechat_theme');
    if (db) {
      await idbClear('keys');
      await idbClear('queue');
      await idbClear('rooms');
    }
  }

  return {
    initDB, saveKeyPair, getKeyPair,
    saveUserId, getUserId, saveUsername, getUsername,
    saveTheme, getTheme,
    queueMessage, getQueuedMessages, clearQueue,
    saveRoom, getRooms, removeRoom, clearAll,
  };
})();
