// ═══════════════════════════════════════════
// SecureChat — App Entry Point
// Initializes everything on page load
// ═══════════════════════════════════════════

(async function() {
  'use strict';

  console.log('%c🔐 SecureChat v1.0.0', 'color:#00f5d4;font-size:16px;font-weight:bold;');
  console.log('%c   End-to-end encrypted messaging', 'color:#5a7a96;font-size:11px;');

  const BACKEND_URL = (window.location.port === '3000' || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'))
    ? window.location.origin
    : 'http://localhost:3000';

  async function checkServerConnection() {
    const statusText = document.getElementById('splash-status');
    const progressBar = document.getElementById('splash-progress');

    if (!statusText || !progressBar) return true; // Elements missing, skip check

    // 1. Simulate Progress Bar
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        // Move faster at first, then slower as it reaches 90%
        const step = progress < 45 ? 6 : (progress < 75 ? 2.5 : 0.8);
        progress = Math.min(90, progress + step);
        progressBar.style.width = progress + '%';
      }
    }, 450);

    // 2. Rotate realistic security status messages
    const messages = [
      { delay: 0, text: 'Waking up secure server...' },
      { delay: 3500, text: 'Establishing cryptographic tunnels...' },
      { delay: 8500, text: 'Performing handshake verification...' },
      { delay: 15500, text: 'Resolving security certificates...' },
      { delay: 22500, text: 'Synchronizing local databases...' },
      { delay: 30000, text: 'Finalizing encrypted session...' }
    ];

    const textTimeouts = [];
    messages.forEach(m => {
      textTimeouts.push(setTimeout(() => {
        statusText.textContent = m.text;
      }, m.delay));
    });

    // 3. Poll /health endpoint
    let connected = false;
    let attempts = 0;
    const maxAttempts = 15; // 15 attempts * 3s = 45 seconds total timeout

    while (!connected && attempts < maxAttempts) {
      attempts++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for individual request

        const res = await fetch(BACKEND_URL + '/health', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok') {
            connected = true;
          }
        }
      } catch (e) {
        console.log('[App] Backend connection pending...');
      }

      if (!connected) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    clearInterval(progressInterval);
    textTimeouts.forEach(t => clearTimeout(t));

    if (connected) {
      progressBar.style.width = '100%';
      statusText.textContent = 'Connection secured.';
      await new Promise(resolve => setTimeout(resolve, 400));

      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.style.transition = 'opacity 0.4s ease';
        splash.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 400));
        splash.remove();
      }
      return true;
    } else {
      // Failed to connect after 45 seconds
      progressBar.style.background = 'var(--danger)';
      progressBar.style.boxShadow = '0 0 8px var(--danger)';
      statusText.innerHTML = '<span style="color:var(--danger)">Connection failed. Server offline.</span>';

      const statusBox = document.querySelector('.splash-status-box');
      if (statusBox) {
        const oldBtn = document.getElementById('splash-retry-btn');
        if (oldBtn) oldBtn.remove();

        const btn = document.createElement('button');
        btn.id = 'splash-retry-btn';
        btn.className = 'btn btn-secondary btn-sm';
        btn.style.marginTop = '16px';
        btn.textContent = 'Retry Connection';
        btn.onclick = () => {
          btn.remove();
          progressBar.style.width = '0%';
          progressBar.style.background = 'linear-gradient(90deg, var(--accent), var(--violet))';
          progressBar.style.boxShadow = '0 0 8px var(--accent)';
          statusText.textContent = 'Reconnecting to secure network...';
          checkServerConnection().then(success => {
            if (success) {
              initializeApp();
            }
          });
        };
        statusBox.appendChild(btn);
      }
      return false;
    }
  }

  async function initializeApp() {
    try {
      // 1. Initialize IndexedDB
      await SecureStorage.initDB();
      console.log('[App] Storage initialized');

      // Apply stored theme
      const savedTheme = SecureStorage.getTheme();
      AppState.set('theme', savedTheme);
      document.body.className = 'theme-' + savedTheme;

      AppState.subscribe('theme', (newTheme) => {
        document.body.className = 'theme-' + newTheme;
      });

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
  }

  // Startup: verify connection first, then boot app!
  const isHealthy = await checkServerConnection();
  if (isHealthy) {
    await initializeApp();
  }
})();
