// ═══════════════════════════════════════════
// SecureChat — App Entry Point
// Initializes everything on page load
// ═══════════════════════════════════════════

(async function() {
  'use strict';

  console.log('%c🔐 SecureChat v1.0.0', 'color:#00f5d4;font-size:16px;font-weight:bold;');
  console.log('%c   End-to-end encrypted messaging', 'color:#5a7a96;font-size:11px;');

  try {
    // 1. Initialize IndexedDB
    await SecureStorage.initDB();
    console.log('[App] Storage initialized');

    // 2. Check if user exists
    const userId = SecureStorage.getUserId();
    const username = SecureStorage.getUsername();

    if (userId && username) {
      console.log('[App] User found:', username, '(' + userId.substring(0, 8) + '...)');

      // Load user into state
      AppState.set('user', { id: userId, username, hasKeys: false });

      // 3. Check keypair
      const keys = await SecureStorage.getKeyPair();
      if (keys) {
        AppState.update('user', (u) => ({ ...u, hasKeys: true }));
        console.log('[App] Encryption keys loaded');
      } else {
        // Generate new keypair
        console.log('[App] Generating encryption keys...');
        await SecureCrypto.generateKeyPair();
        AppState.update('user', (u) => ({ ...u, hasKeys: true }));
        console.log('[App] Keys generated and stored');
      }

      // 4. Connect to server via Socket.io
      ChatSocket.connect(userId);

      // 5. Load room history
      const rooms = await SecureStorage.getRooms();
      AppState.set('rooms', rooms);
    } else {
      console.log('[App] No user identity found — will show onboarding');
    }

    // 6. Initialize router
    Router.init();
    console.log('[App] Router initialized');

  } catch (err) {
    console.error('[App] Initialization error:', err);
    document.getElementById('app').innerHTML = `
      <div class="page" style="justify-content:center;align-items:center;text-align:center;padding:24px;">
        <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
        <h2 style="margin-bottom:8px;">Something went wrong</h2>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:20px;line-height:1.6;">
          SecureChat failed to initialize. If you have corrupted keys or rate-limited state, reset local data to start fresh.
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:240px;margin:0 auto;">
          <button class="btn btn-primary" onclick="location.reload()">
            Refresh Page
          </button>
          <button class="btn btn-danger" onclick="localStorage.clear(); indexedDB.deleteDatabase('securechat'); location.reload();">
            Reset App Data
          </button>
        </div>
      </div>
    `;
  }
})();
