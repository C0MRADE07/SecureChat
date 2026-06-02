/* ═══════════════════════════════════════════════════════════════════
   SecureChat Admin — Complete Dashboard Application
   Pure JS • No frameworks • Bioluminescent theme
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.port === '3000' ? window.location.origin : 'http://localhost:3000')
    : 'https://securechat-7t0n.onrender.com';

  // ── State ────────────────────────────────────────────────────────
  const state = {
    authenticated: false,
    accessToken: null,
    currentPage: 'login',
    users: [],
    rooms: [],
    banLog: [],
    stats: {
      cpu: 0,
      ram: 0,
      ramTotal: 0,
      uptime: 0,
      roomCount: 0,
      userCount: 0
    },
    statsHistory: {
      cpu: [],   // last 30 data points
      ram: []    // last 30 data points
    },
    socket: null,
    setupRequired: false,
    setupData: null,
    refreshTimer: null,
    sidebarOpen: false
  };

  // ── DOM References ───────────────────────────────────────────────
  const root = document.getElementById('admin-app');

  // ── API Helper ───────────────────────────────────────────────────
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.accessToken) {
      headers['Authorization'] = `Bearer ${state.accessToken}`;
    }
    try {
      const res = await fetch(BACKEND_URL + path, {
        ...options,
        headers: { ...headers, ...options.headers },
        credentials: 'include'
      });

      // Handle 401 — attempt token refresh unless this IS the login call
      if (res.status === 401 && path !== '/api/admin/login') {
        const refreshed = await refreshToken();
        if (refreshed) {
          // Retry original request with new token
          headers['Authorization'] = `Bearer ${state.accessToken}`;
          const retry = await fetch(BACKEND_URL + path, {
            ...options,
            headers: { ...headers, ...options.headers },
            credentials: 'include'
          });
          return await retry.json();
        }
        logout();
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error('[API Error]', path, err);
      showToast('Network error — check connection', 'error');
      return null;
    }
  }

  // ── Authentication ───────────────────────────────────────────────

  /**
   * Attempt to refresh the access token using the HTTP-only refresh cookie.
   * Returns true if refresh succeeded.
   */
  async function refreshToken() {
    try {
      const res = await fetch(BACKEND_URL + '/api/admin/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data && data.accessToken) {
        state.accessToken = data.accessToken;
        scheduleTokenRefresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Schedule automatic token refresh ~1 minute before expiry (14 min).
   */
  function scheduleTokenRefresh() {
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(async () => {
      const ok = await refreshToken();
      if (!ok) logout();
    }, 14 * 60 * 1000); // 14 minutes
  }

  /**
   * Attempt login with password and TOTP code.
   */
  async function login(password, totp) {
    const data = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password, totp })
    });

    if (!data) return false;

    if (data.error) {
      return { error: data.error };
    }

    if (data.accessToken) {
      state.accessToken = data.accessToken;
      state.authenticated = true;
      scheduleTokenRefresh();
      connectSocket();
      navigate('dashboard');
      return true;
    }

    return { error: 'Unexpected response' };
  }

  /**
   * Log out: clear tokens, disconnect socket, return to login.
   */
  function logout() {
    state.accessToken = null;
    state.authenticated = false;
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    state.users = [];
    state.rooms = [];
    state.banLog = [];
    state.statsHistory = { cpu: [], ram: [] };
    navigate('login');
  }

  /**
   * Check if first-run setup is required (TOTP hasn't been configured yet).
   */
  async function checkSetup() {
    try {
      const res = await fetch(BACKEND_URL + '/api/admin/setup', { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data && data.qrCode) {
        state.setupRequired = true;
        state.setupData = data;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Socket.io ────────────────────────────────────────────────────

  function connectSocket() {
    if (state.socket) state.socket.disconnect();

    state.socket = io(BACKEND_URL, {
      auth: {
        admin: true,
        token: state.accessToken
      }
    });

    state.socket.on('connect', () => {
      console.log('[Socket] Admin connected');
      updateConnectionIndicator(true);
    });

    state.socket.on('disconnect', () => {
      console.log('[Socket] Admin disconnected');
      updateConnectionIndicator(false);
    });

    // Real-time server stats (pushed every ~5s by server)
    state.socket.on('server:stats', (data) => {
      state.stats = { ...state.stats, ...data };

      // Push to history, cap at 30
      state.statsHistory.cpu.push(data.cpu || 0);
      if (state.statsHistory.cpu.length > 30) state.statsHistory.cpu.shift();

      state.statsHistory.ram.push(data.ram || 0);
      if (state.statsHistory.ram.length > 30) state.statsHistory.ram.shift();

      // Re-render dashboard stats if currently on dashboard
      if (state.currentPage === 'dashboard') {
        updateDashboardStats();
      }
    });

    // Room events — keep rooms page updated
    state.socket.on('room:closed', (data) => {
      state.rooms = state.rooms.filter(r => r.id !== data.roomId);
      if (state.currentPage === 'rooms') renderRoomsTable();
    });

    state.socket.on('room:user-joined', (data) => {
      const room = state.rooms.find(r => r.id === data.roomId);
      if (room) {
        room.memberCount = (room.memberCount || 0) + 1;
        if (state.currentPage === 'rooms') renderRoomsTable();
      }
    });

    state.socket.on('room:user-left', (data) => {
      const room = state.rooms.find(r => r.id === data.roomId);
      if (room) {
        room.memberCount = Math.max(0, (room.memberCount || 1) - 1);
        if (state.currentPage === 'rooms') renderRoomsTable();
      }
    });
  }

  function updateConnectionIndicator(online) {
    const dot = document.querySelector('.connection-dot');
    const label = document.querySelector('.connection-label');
    if (dot) {
      dot.className = `connection-dot ${online ? 'online' : 'offline'}`;
    }
    if (label) {
      label.textContent = online ? 'Connected' : 'Disconnected';
    }
  }

  // ── Navigation ───────────────────────────────────────────────────

  const PAGES = ['login', 'setup', 'dashboard', 'rooms', 'users', 'broadcast', 'ban-log'];

  function navigate(page) {
    if (!PAGES.includes(page)) page = 'dashboard';

    // If not authenticated and page != login/setup, redirect to login
    if (!state.authenticated && page !== 'login' && page !== 'setup') {
      page = 'login';
    }

    state.currentPage = page;
    window.location.hash = `#/${page}`;
    render();
  }

  /**
   * Listen for hash changes (back/forward browser navigation).
   */
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#/', '') || 'login';
    if (hash !== state.currentPage) {
      navigate(hash);
    }
  });

  // ── Render Engine ────────────────────────────────────────────────

  function render() {
    const page = state.currentPage;

    switch (page) {
      case 'login':
        renderLogin();
        break;
      case 'setup':
        renderSetup();
        break;
      case 'dashboard':
        renderDashboard();
        break;
      case 'rooms':
        renderRooms();
        break;
      case 'users':
        renderUsers();
        break;
      case 'broadcast':
        renderBroadcast();
        break;
      case 'ban-log':
        renderBanLog();
        break;
      default:
        renderDashboard();
    }
  }

  /**
   * Build the full layout shell (sidebar + main content area).
   * Returns the .content-body element for page content injection.
   */
  function renderLayout(title) {
    const navItems = [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { id: 'rooms', icon: '💬', label: 'Rooms' },
      { id: 'users', icon: '👥', label: 'Users' },
      { id: 'broadcast', icon: '📢', label: 'Broadcast' },
      { id: 'ban-log', icon: '🚫', label: 'Ban Log' }
    ];

    root.innerHTML = `
      <button class="hamburger" id="hamburger-btn">☰</button>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="admin-layout">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-logo">
              <div class="sidebar-logo-icon">🛡️</div>
              <div class="sidebar-logo-info">
                <div class="sidebar-logo-text">SecureChat</div>
                <div class="sidebar-logo-sub">Admin Panel</div>
              </div>
            </div>
          </div>
          <nav class="sidebar-nav">
            ${navItems.map(item => `
              <div class="nav-item ${state.currentPage === item.id ? 'active' : ''}" data-page="${item.id}">
                <span class="nav-item-icon">${item.icon}</span>
                <span>${item.label}</span>
              </div>
            `).join('')}
          </nav>
          <div class="sidebar-footer">
            <div style="margin-bottom:8px;cursor:pointer;color:var(--text-dim);font-size:11px;" id="logout-btn">⏻ Logout</div>
            <div>SecureChat Admin v1.0</div>
            <div style="margin-top:4px;">© ${new Date().getFullYear()} Encrypted</div>
          </div>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="top-bar-title">${title}</div>
            <div class="connection-indicator">
              <span class="connection-dot ${state.socket && state.socket.connected ? 'online' : 'offline'}"></span>
              <span class="connection-label">${state.socket && state.socket.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          <div class="content-body" id="content-body"></div>
        </main>
      </div>
    `;

    // Bind sidebar nav clicks
    root.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        closeSidebar();
        navigate(page);
      });
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        logout();
      });
    }

    // Hamburger toggle
    const hamburger = document.getElementById('hamburger-btn');
    const overlay = document.getElementById('sidebar-overlay');
    if (hamburger) {
      hamburger.addEventListener('click', toggleSidebar);
    }
    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }

    return document.getElementById('content-body');
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
      state.sidebarOpen = !state.sidebarOpen;
      sidebar.classList.toggle('open', state.sidebarOpen);
      if (overlay) overlay.style.display = state.sidebarOpen ? 'block' : 'none';
    }
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    state.sidebarOpen = false;
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
  }

  // ── Render: Login ────────────────────────────────────────────────

  function renderLogin() {
    root.innerHTML = `
      <div class="login-container">
        <div class="login-card">
          <div class="login-icon">🛡️</div>
          <h1 class="login-title">Admin Access</h1>
          <p class="login-subtitle">// restricted — credentials required</p>

          <div class="login-error" id="login-error"></div>

          <form id="login-form" autocomplete="off">
            <div class="form-group">
              <label class="form-label">Password</label>
              <input
                type="password"
                class="form-input"
                id="login-password"
                placeholder="Enter admin password"
                autocomplete="current-password"
                required
              >
            </div>

            <div class="totp-label">TOTP Authentication Code</div>
            <div class="totp-row" id="totp-row">
              <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="0" autocomplete="off">
              <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="1" autocomplete="off">
              <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="2" autocomplete="off">
              <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="3" autocomplete="off">
              <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="4" autocomplete="off">
              <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="5" autocomplete="off">
            </div>

            <button type="submit" class="btn btn-violet" style="width:100%;margin-top:8px;" id="login-submit-btn">
              Verify & Enter →
            </button>
          </form>
        </div>
      </div>
    `;

    // Bind TOTP digit inputs
    setupTOTPInputs('totp-row', handleLoginSubmit);

    // Form submit
    const form = document.getElementById('login-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginSubmit();
    });
  }

  /**
   * Wire up the 6 TOTP digit inputs with auto-advance, backspace handling,
   * and paste support. Calls onComplete when all 6 digits are filled.
   */
  function setupTOTPInputs(containerId, onComplete) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const digits = container.querySelectorAll('.totp-digit');

    digits.forEach((digit, i) => {
      // Only allow numeric input
      digit.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val.charAt(0) || '';
        e.target.classList.toggle('filled', !!e.target.value);

        if (val && i < 5) {
          digits[i + 1].focus();
        }

        // Check if all 6 filled
        const code = Array.from(digits).map(d => d.value).join('');
        if (code.length === 6) {
          onComplete();
        }
      });

      // Handle backspace: clear current and go back
      digit.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (!digit.value && i > 0) {
            digits[i - 1].value = '';
            digits[i - 1].classList.remove('filled');
            digits[i - 1].focus();
          } else {
            digit.value = '';
            digit.classList.remove('filled');
          }
        }
        // Arrow keys
        if (e.key === 'ArrowLeft' && i > 0) digits[i - 1].focus();
        if (e.key === 'ArrowRight' && i < 5) digits[i + 1].focus();
      });

      // Handle paste: distribute digits across inputs
      digit.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '');
        for (let j = 0; j < 6 && j < pasted.length; j++) {
          digits[j].value = pasted[j];
          digits[j].classList.toggle('filled', true);
        }
        const focusIdx = Math.min(pasted.length, 5);
        digits[focusIdx].focus();

        if (pasted.length >= 6) {
          onComplete();
        }
      });

      // Focus styling
      digit.addEventListener('focus', () => digit.select());
    });
  }

  /**
   * Gather credentials and attempt login.
   */
  async function handleLoginSubmit() {
    const password = document.getElementById('login-password').value.trim();
    const digits = document.querySelectorAll('#totp-row .totp-digit');
    const totp = Array.from(digits).map(d => d.value).join('');
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');

    if (!password) {
      showLoginError('Password is required');
      return;
    }
    if (totp.length !== 6) {
      showLoginError('Enter all 6 TOTP digits');
      return;
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> Verifying...';

    const result = await login(password, totp);

    if (result && result.error) {
      showLoginError(result.error);
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Verify & Enter →';
      // Clear TOTP
      digits.forEach(d => {
        d.value = '';
        d.classList.remove('filled');
      });
      digits[0].focus();
    } else if (result === false) {
      showLoginError('Connection failed — try again');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Verify & Enter →';
    }
    // If result === true, navigate() already happened inside login()
  }

  function showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) {
      el.textContent = msg;
      el.classList.add('visible');
    }
  }

  // ── Render: Setup (First-Run TOTP Config) ────────────────────────

  function renderSetup() {
    const data = state.setupData;
    if (!data) {
      navigate('login');
      return;
    }

    root.innerHTML = `
      <div class="login-container">
        <div class="login-card" style="max-width:480px;">
          <div class="login-icon">🔐</div>
          <h1 class="login-title">First-Time Setup</h1>
          <p class="login-subtitle">// scan QR code with authenticator app</p>

          <div class="setup-qr">
            <img src="${data.qrCode}" alt="TOTP QR Code" width="200" height="200">
          </div>

          <div class="section-heading" style="text-align:center;">Manual Entry Key</div>
          <div class="setup-secret">${data.secret || ''}</div>

          <p style="font-size:12px;color:var(--text-dim);text-align:center;margin-bottom:20px;line-height:1.6;">
            Scan the QR code above with Google Authenticator, Authy, or any TOTP-compatible app.
            Then enter a code below to verify setup.
          </p>

          <div class="totp-label">Verify TOTP Code</div>
          <div class="totp-row" id="setup-totp-row">
            <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="0" autocomplete="off">
            <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="1" autocomplete="off">
            <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="2" autocomplete="off">
            <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="3" autocomplete="off">
            <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="4" autocomplete="off">
            <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" data-index="5" autocomplete="off">
          </div>

          <div class="login-error" id="setup-error"></div>

          <button class="btn btn-violet" style="width:100%;" id="setup-verify-btn">
            Verify & Complete Setup →
          </button>
        </div>
      </div>
    `;

    setupTOTPInputs('setup-totp-row', handleSetupVerify);

    document.getElementById('setup-verify-btn').addEventListener('click', handleSetupVerify);
  }

  async function handleSetupVerify() {
    const digits = document.querySelectorAll('#setup-totp-row .totp-digit');
    const totp = Array.from(digits).map(d => d.value).join('');
    const errorEl = document.getElementById('setup-error');
    const btn = document.getElementById('setup-verify-btn');

    if (totp.length !== 6) {
      if (errorEl) { errorEl.textContent = 'Enter all 6 digits'; errorEl.classList.add('visible'); }
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Verifying...';

    try {
      const res = await fetch(BACKEND_URL + '/api/admin/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ totp })
      });
      const data = await res.json();

      if (data.error) {
        if (errorEl) { errorEl.textContent = data.error; errorEl.classList.add('visible'); }
        btn.disabled = false;
        btn.innerHTML = 'Verify & Complete Setup →';
        digits.forEach(d => { d.value = ''; d.classList.remove('filled'); });
        digits[0].focus();
      } else {
        state.setupRequired = false;
        state.setupData = null;
        showToast('TOTP setup complete! You can now log in.', 'success');
        navigate('login');
      }
    } catch {
      if (errorEl) { errorEl.textContent = 'Network error'; errorEl.classList.add('visible'); }
      btn.disabled = false;
      btn.innerHTML = 'Verify & Complete Setup →';
    }
  }

  // ── Render: Dashboard ────────────────────────────────────────────

  function renderDashboard() {
    const body = renderLayout('Dashboard');

    body.innerHTML = `
      <div class="stat-grid" id="stat-grid">
        ${renderStatCards()}
      </div>
      <div class="chart-grid">
        <div class="chart-container">
          <div class="chart-title">⚡ CPU Usage (last 30 readings)</div>
          <div class="chart-bars" id="cpu-chart">
            ${renderChartBars(state.statsHistory.cpu, 'teal')}
          </div>
        </div>
        <div class="chart-container">
          <div class="chart-title">🧠 RAM Usage (last 30 readings)</div>
          <div class="chart-bars" id="ram-chart">
            ${renderChartBars(state.statsHistory.ram, 'violet')}
          </div>
        </div>
      </div>
      <div class="uptime-card" id="uptime-card">
        <div class="uptime-dot"></div>
        <div>
          <div class="uptime-value" id="uptime-value">${formatUptime(state.stats.uptime)}</div>
          <div class="uptime-label">System Uptime</div>
        </div>
      </div>
    `;

    // Fetch initial stats if we don't have history yet
    fetchStats();
  }

  function renderStatCards() {
    const { cpu, ram, ramTotal, roomCount, userCount } = state.stats;
    const ramGB = (ram / 1024).toFixed(1);
    const ramTotalGB = (ramTotal / 1024).toFixed(1);
    const ramDisplay = ramTotal > 1024 ? `${ramGB}` : `${Math.round(ram)}`;
    const ramSuffix = ramTotal > 1024 ? 'GB' : 'MB';

    return `
      <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-value">${cpu.toFixed(1)}<span class="stat-suffix">%</span></div>
        <div class="stat-label">CPU Usage</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧠</div>
        <div class="stat-value">${ramDisplay}<span class="stat-suffix">${ramSuffix}</span></div>
        <div class="stat-label">RAM ${ramTotal > 1024 ? `/ ${ramTotalGB} GB` : `/ ${ramTotal} MB`}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💬</div>
        <div class="stat-value">${roomCount}</div>
        <div class="stat-label">Active Rooms</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👤</div>
        <div class="stat-value">${userCount}</div>
        <div class="stat-label">Users Online</div>
      </div>
    `;
  }

  function renderChartBars(data, type) {
    if (!data.length) {
      // Render 30 placeholder bars at minimal height
      return Array(30).fill('').map(() =>
        `<div class="chart-bar ${type === 'violet' ? 'violet' : ''}" style="height:2px;" data-value="0"></div>`
      ).join('');
    }

    const max = Math.max(...data, 1);
    return data.map(val => {
      const pct = Math.max((val / max) * 100, 2);
      return `<div class="chart-bar ${type === 'violet' ? 'violet' : ''}" style="height:${pct}%;" data-value="${val.toFixed(1)}%"></div>`;
    }).join('');
  }

  /**
   * Update just the stats section without re-rendering the whole page.
   */
  function updateDashboardStats() {
    const grid = document.getElementById('stat-grid');
    if (grid) grid.innerHTML = renderStatCards();

    const cpuChart = document.getElementById('cpu-chart');
    if (cpuChart) cpuChart.innerHTML = renderChartBars(state.statsHistory.cpu, 'teal');

    const ramChart = document.getElementById('ram-chart');
    if (ramChart) ramChart.innerHTML = renderChartBars(state.statsHistory.ram, 'violet');

    const uptimeEl = document.getElementById('uptime-value');
    if (uptimeEl) uptimeEl.textContent = formatUptime(state.stats.uptime);
  }

  async function fetchStats() {
    const data = await api('/api/admin/stats');
    if (data && !data.error) {
      state.stats = { ...state.stats, ...data };
      if (state.currentPage === 'dashboard') updateDashboardStats();
    }
  }

  // ── Render: Rooms ────────────────────────────────────────────────

  async function renderRooms() {
    const body = renderLayout('Active Rooms');
    body.innerHTML = `
      <div class="loading-state">
        <div class="spinner spinner-lg"></div>
        <div class="loading-state-text">Loading rooms...</div>
      </div>
    `;

    await fetchRooms();
    renderRoomsTable();
  }

  async function fetchRooms() {
    const data = await api('/api/admin/rooms');
    if (data && Array.isArray(data)) {
      state.rooms = data;
    } else if (data && data.rooms) {
      state.rooms = data.rooms;
    }
  }

  function renderRoomsTable() {
    const body = document.getElementById('content-body');
    if (!body || state.currentPage !== 'rooms') return;

    if (!state.rooms.length) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-text">No active rooms</div>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Room Name</th>
              <th>Code</th>
              <th>Members</th>
              <th>Owner</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.rooms.map(room => `
              <tr>
                <td>${escapeHtml(room.name || 'Unnamed')}</td>
                <td class="mono">${escapeHtml(room.code || room.id || '')}</td>
                <td>${room.memberCount || room.members?.length || 0}</td>
                <td>${escapeHtml(room.owner || room.ownerName || '—')}</td>
                <td class="mono">${formatDate(room.createdAt || room.created)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm room-view-btn" data-room-id="${room.id}">View</button>
                  <button class="btn btn-danger btn-sm room-close-btn" data-room-id="${room.id}" data-room-name="${escapeHtml(room.name || '')}">Close</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind view buttons
    body.querySelectorAll('.room-view-btn').forEach(btn => {
      btn.addEventListener('click', () => viewRoomDetails(btn.dataset.roomId));
    });

    // Bind close buttons
    body.querySelectorAll('.room-close-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmCloseRoom(btn.dataset.roomId, btn.dataset.roomName));
    });
  }

  function viewRoomDetails(roomId) {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return;

    const members = room.members || [];
    const memberHtml = members.length
      ? `<ul class="member-list">${members.map(m => `
          <li>
            <div class="member-avatar">👤</div>
            <span>${escapeHtml(m.username || m.name || 'Anonymous')}</span>
            <span class="mono" style="margin-left:auto;font-size:10px;">${truncateUUID(m.uuid || m.id || '')}</span>
          </li>
        `).join('')}</ul>`
      : '<p style="color:var(--text-dim);font-size:13px;">No member data available</p>';

    showModal(
      `Room: ${escapeHtml(room.name || 'Unnamed')}`,
      `
        <div style="margin-bottom:12px;">
          <span class="mono" style="font-size:11px;color:var(--text-dim);">Code: ${escapeHtml(room.code || room.id || '')}</span>
        </div>
        <div class="section-heading">Members (${members.length})</div>
        ${memberHtml}
      `,
      [{ label: 'Close', class: 'btn-secondary', action: 'close' }]
    );
  }

  function confirmCloseRoom(roomId, roomName) {
    showModal(
      'Force Close Room',
      `<p class="modal-text">Force close <strong>"${escapeHtml(roomName)}"</strong>? All members will be disconnected.</p>`,
      [
        { label: 'Cancel', class: 'btn-secondary', action: 'close' },
        {
          label: 'Force Close',
          class: 'btn-danger',
          action: async (closeModal) => {
            const result = await api(`/api/admin/rooms/${roomId}`, { method: 'DELETE' });
            closeModal();
            if (result && !result.error) {
              showToast('Room closed successfully', 'success');
              state.rooms = state.rooms.filter(r => r.id !== roomId);
              renderRoomsTable();
            } else {
              showToast(result?.error || 'Failed to close room', 'error');
            }
          }
        }
      ]
    );
  }

  // ── Render: Users ────────────────────────────────────────────────

  async function renderUsers() {
    const body = renderLayout('User Registry');
    body.innerHTML = `
      <div class="loading-state">
        <div class="spinner spinner-lg"></div>
        <div class="loading-state-text">Loading users...</div>
      </div>
    `;

    await fetchUsers();
    renderUsersPage();
  }

  async function fetchUsers() {
    const data = await api('/api/admin/users');
    if (data && Array.isArray(data)) {
      state.users = data;
    } else if (data && data.users) {
      state.users = data.users;
    }
  }

  function renderUsersPage() {
    const body = document.getElementById('content-body');
    if (!body || state.currentPage !== 'users') return;

    body.innerHTML = `
      <div class="search-bar">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="user-search" placeholder="Search by username...">
        </div>
      </div>
      <div id="users-table-wrapper"></div>
    `;

    renderUsersTable(state.users);

    // Search handler with debounce
    const searchInput = document.getElementById('user-search');
    searchInput.addEventListener('input', debounce((e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = q
        ? state.users.filter(u =>
          (u.username || u.name || '').toLowerCase().includes(q) ||
          (u.uuid || u.id || '').toLowerCase().includes(q)
        )
        : state.users;
      renderUsersTable(filtered);
    }, 250));
  }

  function renderUsersTable(users) {
    const wrapper = document.getElementById('users-table-wrapper');
    if (!wrapper) return;

    if (!users.length) {
      wrapper.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <div class="empty-state-text">No users found</div>
        </div>
      `;
      return;
    }

    wrapper.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>UUID</th>
              <th>Registered</th>
              <th>Last Seen</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => {
      const uuid = user.uuid || user.id || '';
      const status = user.banned ? 'banned' : (user.online ? 'active' : 'offline');
      const statusLabel = user.banned ? '🚫 Banned' : (user.online ? '● Active' : '○ Offline');
      return `
                <tr>
                  <td>${escapeHtml(user.username || user.name || 'Anonymous')}</td>
                  <td class="mono">${truncateUUID(uuid)}</td>
                  <td class="mono">${formatDate(user.createdAt || user.registered)}</td>
                  <td class="mono">${formatDate(user.lastSeen || user.lastActive)}</td>
                  <td><span class="status-badge status-${status}">${statusLabel}</span></td>
                  <td>
                    ${user.banned
          ? `<button class="btn btn-secondary btn-sm user-unban-btn" data-uuid="${uuid}" data-name="${escapeHtml(user.username || user.name || '')}">Unban</button>`
          : `<button class="btn btn-danger btn-sm user-ban-btn" data-uuid="${uuid}" data-name="${escapeHtml(user.username || user.name || '')}">Ban</button>`
        }
                    <button class="btn btn-secondary btn-sm user-rename-btn" data-uuid="${uuid}" data-name="${escapeHtml(user.username || user.name || '')}">Rename</button>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind action buttons
    wrapper.querySelectorAll('.user-ban-btn').forEach(btn => {
      btn.addEventListener('click', () => showBanModal(btn.dataset.uuid, btn.dataset.name));
    });

    wrapper.querySelectorAll('.user-unban-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmUnban(btn.dataset.uuid, btn.dataset.name));
    });

    wrapper.querySelectorAll('.user-rename-btn').forEach(btn => {
      btn.addEventListener('click', () => showRenameModal(btn.dataset.uuid, btn.dataset.name));
    });
  }

  function showBanModal(uuid, username) {
    showModal(
      `Ban User: ${escapeHtml(username)}`,
      `
        <p class="modal-text">This will immediately disconnect the user and prevent them from joining any rooms.</p>
        <div class="form-group">
          <label class="form-label">Reason</label>
          <textarea class="form-input" id="ban-reason" placeholder="Reason for ban..." rows="2"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Admin Note (private)</label>
          <textarea class="form-input" id="ban-note" placeholder="Internal note..." rows="2"></textarea>
        </div>
      `,
      [
        { label: 'Cancel', class: 'btn-secondary', action: 'close' },
        {
          label: 'Confirm Ban',
          class: 'btn-danger',
          action: async (closeModal) => {
            const reason = document.getElementById('ban-reason').value.trim();
            const note = document.getElementById('ban-note').value.trim();
            const result = await api(`/api/admin/users/${uuid}/ban`, {
              method: 'PUT',
              body: JSON.stringify({ reason, note })
            });
            closeModal();
            if (result && !result.error) {
              showToast(`${username} has been banned`, 'success');
              await fetchUsers();
              renderUsersPage();
            } else {
              showToast(result?.error || 'Failed to ban user', 'error');
            }
          }
        }
      ]
    );
  }

  function confirmUnban(uuid, username) {
    showModal(
      `Unban User: ${escapeHtml(username)}`,
      `<p class="modal-text">Remove the ban from <strong>${escapeHtml(username)}</strong>? They will be able to join rooms again.</p>`,
      [
        { label: 'Cancel', class: 'btn-secondary', action: 'close' },
        {
          label: 'Confirm Unban',
          class: 'btn-primary',
          action: async (closeModal) => {
            const result = await api(`/api/admin/users/${uuid}/unban`, {
              method: 'PUT'
            });
            closeModal();
            if (result && !result.error) {
              showToast(`${username} has been unbanned`, 'success');
              await fetchUsers();
              renderUsersPage();
            } else {
              showToast(result?.error || 'Failed to unban user', 'error');
            }
          }
        }
      ]
    );
  }

  function showRenameModal(uuid, currentName) {
    showModal(
      `Rename User`,
      `
        <p class="modal-text">Current username: <strong>${escapeHtml(currentName)}</strong></p>
        <div class="form-group">
          <label class="form-label">New Username</label>
          <input type="text" class="form-input" id="rename-input" placeholder="Enter new username" value="${escapeHtml(currentName)}" maxlength="32">
        </div>
      `,
      [
        { label: 'Cancel', class: 'btn-secondary', action: 'close' },
        {
          label: 'Confirm Rename',
          class: 'btn-primary',
          action: async (closeModal) => {
            const newName = document.getElementById('rename-input').value.trim();
            if (!newName) {
              showToast('Username cannot be empty', 'warning');
              return;
            }
            const result = await api(`/api/admin/users/${uuid}/rename`, {
              method: 'PUT',
              body: JSON.stringify({ username: newName })
            });
            closeModal();
            if (result && !result.error) {
              showToast(`User renamed to "${newName}"`, 'success');
              await fetchUsers();
              renderUsersPage();
            } else {
              showToast(result?.error || 'Failed to rename user', 'error');
            }
          }
        }
      ]
    );

    // Auto-focus and select the input
    setTimeout(() => {
      const input = document.getElementById('rename-input');
      if (input) { input.focus(); input.select(); }
    }, 100);
  }

  // ── Render: Broadcast ────────────────────────────────────────────

  async function renderBroadcast() {
    const body = renderLayout('Broadcast');
    body.innerHTML = `
      <div class="loading-state">
        <div class="spinner spinner-lg"></div>
        <div class="loading-state-text">Loading rooms...</div>
      </div>
    `;

    await fetchRooms();
    renderBroadcastPage();
  }

  function renderBroadcastPage() {
    const body = document.getElementById('content-body');
    if (!body || state.currentPage !== 'broadcast') return;

    body.innerHTML = `
      <div style="max-width:700px;">
        <div class="section-heading">Select Target Rooms</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <button class="btn btn-secondary btn-sm" id="broadcast-select-all">Select All</button>
          <button class="btn btn-secondary btn-sm" id="broadcast-clear-all">Clear All</button>
        </div>
        <div class="broadcast-tags" id="broadcast-tags">
          ${state.rooms.length
        ? state.rooms.map(room => `
              <div class="room-tag" data-room-id="${room.id}">${escapeHtml(room.name || room.code || room.id)}</div>
            `).join('')
        : '<span style="font-size:12px;color:var(--text-dim);">No active rooms available</span>'
      }
        </div>

        <div class="section-heading" style="margin-top:24px;">Message</div>
        <textarea class="broadcast-textarea" id="broadcast-message" placeholder="Type your broadcast message here..."></textarea>

        <div class="broadcast-actions">
          <button class="btn btn-violet" id="broadcast-send-btn">📢 Send Broadcast</button>
        </div>
        <div class="broadcast-note">Sent as [SYSTEM] — not linked to any user identity.</div>
      </div>
    `;

    // Room tag toggle
    const tagsContainer = document.getElementById('broadcast-tags');
    tagsContainer.addEventListener('click', (e) => {
      const tag = e.target.closest('.room-tag');
      if (tag) tag.classList.toggle('selected');
    });

    // Select All
    document.getElementById('broadcast-select-all').addEventListener('click', () => {
      tagsContainer.querySelectorAll('.room-tag').forEach(t => t.classList.add('selected'));
    });

    // Clear All
    document.getElementById('broadcast-clear-all').addEventListener('click', () => {
      tagsContainer.querySelectorAll('.room-tag').forEach(t => t.classList.remove('selected'));
    });

    // Send Broadcast
    document.getElementById('broadcast-send-btn').addEventListener('click', handleBroadcast);
  }

  async function handleBroadcast() {
    const selectedTags = document.querySelectorAll('#broadcast-tags .room-tag.selected');
    const roomIds = Array.from(selectedTags).map(t => t.dataset.roomId);
    const message = document.getElementById('broadcast-message').value.trim();
    const btn = document.getElementById('broadcast-send-btn');

    if (!roomIds.length) {
      showToast('Select at least one room', 'warning');
      return;
    }
    if (!message) {
      showToast('Message cannot be empty', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Sending...';

    const result = await api('/api/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ roomIds, message })
    });

    btn.disabled = false;
    btn.innerHTML = '📢 Send Broadcast';

    if (result && !result.error) {
      showToast(`Broadcast sent to ${roomIds.length} room(s)`, 'success');
      // Clear form
      document.getElementById('broadcast-message').value = '';
      document.querySelectorAll('#broadcast-tags .room-tag.selected').forEach(t => t.classList.remove('selected'));
    } else {
      showToast(result?.error || 'Failed to send broadcast', 'error');
    }
  }

  // ── Render: Ban Log ──────────────────────────────────────────────

  async function renderBanLog() {
    const body = renderLayout('Ban Log');
    body.innerHTML = `
      <div class="loading-state">
        <div class="spinner spinner-lg"></div>
        <div class="loading-state-text">Loading ban log...</div>
      </div>
    `;

    await fetchBanLog();
    renderBanLogTable();
  }

  async function fetchBanLog() {
    const data = await api('/api/admin/ban-log');
    if (data && Array.isArray(data)) {
      state.banLog = data;
    } else if (data && data.logs) {
      state.banLog = data.logs;
    }
  }

  function renderBanLogTable() {
    const body = document.getElementById('content-body');
    if (!body || state.currentPage !== 'ban-log') return;

    if (!state.banLog.length) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">No ban records yet</div>
        </div>
      `;
      return;
    }

    // Sort newest first
    const sorted = [...state.banLog].sort((a, b) => {
      const dateA = new Date(a.date || a.timestamp || a.createdAt || 0);
      const dateB = new Date(b.date || b.timestamp || b.createdAt || 0);
      return dateB - dateA;
    });

    body.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Username</th>
              <th>Action</th>
              <th>Reason</th>
              <th>Admin Note</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(entry => {
      const actionClass = entry.action === 'ban' ? 'status-banned' : 'status-active';
      const actionLabel = entry.action === 'ban' ? '🚫 Ban' : '✅ Unban';
      return `
                <tr>
                  <td class="mono">${formatDate(entry.date || entry.timestamp || entry.createdAt)}</td>
                  <td>${escapeHtml(entry.username || entry.name || '—')}</td>
                  <td><span class="status-badge ${actionClass}">${actionLabel}</span></td>
                  <td>${escapeHtml(entry.reason || '—')}</td>
                  <td style="color:var(--text-dim);font-size:12px;">${escapeHtml(entry.note || entry.adminNote || '—')}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Modal System ─────────────────────────────────────────────────

  /**
   * Shows a modal dialog.
   * @param {string} title - Modal title
   * @param {string} contentHtml - HTML content for the modal body
   * @param {Array} actions - Array of { label, class, action } objects.
   *   action can be 'close' or an async function(closeModal).
   * @returns {{ close: Function }}
   */
  function showModal(title, contentHtml, actions = []) {
    // Remove any existing modals
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const actionsHtml = actions.map((a, i) => `
      <button class="btn ${a.class || 'btn-secondary'}" data-modal-action="${i}">${a.label}</button>
    `).join('');

    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${contentHtml}</div>
        <div class="modal-actions">${actionsHtml}</div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      overlay.style.animation = 'fadeOut 0.2s ease forwards';
      setTimeout(() => overlay.remove(), 200);
    };

    // Bind action buttons
    overlay.querySelectorAll('[data-modal-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.modalAction);
        const action = actions[idx];
        if (!action) return;

        if (action.action === 'close') {
          closeModal();
        } else if (typeof action.action === 'function') {
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner spinner-sm"></span>';
          await action.action(closeModal);
        }
      });
    });

    // Close on overlay click (outside the card)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    return { close: closeModal };
  }

  // ── Toast Notifications ──────────────────────────────────────────

  function ensureToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} type
   */
  function showToast(message, type = 'info') {
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto-remove after 4s
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4000);
  }

  // ── Utility Functions ────────────────────────────────────────────

  /**
   * Format seconds into "Xd Xh Xm" string.
   */
  function formatUptime(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return '0m';

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);

    return parts.join(' ');
  }

  /**
   * Format a timestamp into a readable date string.
   */
  function formatDate(timestamp) {
    if (!timestamp) return '—';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '—';

      const now = new Date();
      const diff = now - date;

      // If less than 24 hours, show relative time
      if (diff < 86400000 && diff >= 0) {
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return `${Math.floor(diff / 3600000)}h ago`;
      }

      // Otherwise show full date
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  }

  /**
   * Truncate UUID to first 8 chars + "..."
   */
  function truncateUUID(uuid) {
    if (!uuid) return '—';
    return uuid.length > 8 ? uuid.substring(0, 8) + '...' : uuid;
  }

  /**
   * Escape HTML special characters to prevent XSS.
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Debounce helper — delays fn execution until after `delay` ms of inactivity.
   */
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ── Initialization ───────────────────────────────────────────────

  async function init() {
    console.log('[SecureChat Admin] Initializing...');

    // 1. Check if first-run setup is needed
    const needsSetup = await checkSetup();
    if (needsSetup) {
      navigate('setup');
      return;
    }

    // 2. Try to restore session via refresh token
    const restored = await refreshToken();
    if (restored) {
      state.authenticated = true;
      connectSocket();
      // Navigate to the hash route or dashboard
      const hash = window.location.hash.replace('#/', '') || 'dashboard';
      navigate(PAGES.includes(hash) && hash !== 'login' && hash !== 'setup' ? hash : 'dashboard');
      return;
    }

    // 3. No valid session — show login
    navigate('login');
  }

  // Start the app
  init();

})();
