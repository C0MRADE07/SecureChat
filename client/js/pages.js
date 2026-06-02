// ═══════════════════════════════════════════
// SecureChat — Page Renderers
// Each function renders a full page into #app
// ═══════════════════════════════════════════

window.Pages = (function() {
  const app = () => document.getElementById('app');

  function clear() {
    app().innerHTML = '';
  }

  // ── Dynamic Backend URL Detection ──
  const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.port === '3000' ? window.location.origin : 'http://localhost:3000')
    : 'https://securechat-7t0n.onrender.com';

  // ── API Helper ──
  async function api(path, opts = {}) {
    const res = await fetch(BACKEND_URL + path, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
    return res.json();
  }

  // ═══ WELCOME PAGE ═══
  function welcome() {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    const container = document.createElement('div');
    container.className = 'welcome-container';

    // Logo
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = '🔐';
    container.appendChild(logo);

    // Title
    const title = document.createElement('h1');
    title.className = 'app-title';
    title.innerHTML = 'Secure<span>Chat</span>';
    container.appendChild(title);

    // Subtitle
    const sub = document.createElement('div');
    sub.className = 'app-subtitle';
    sub.textContent = '// end-to-end encrypted messaging';
    container.appendChild(sub);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'welcome-actions';

    actions.appendChild(Components.button('+ Create Room', 'btn-primary', () => Router.navigate('create'), 'btn-create'));

    const divider = document.createElement('div');
    divider.className = 'divider';
    const span = document.createElement('span');
    span.textContent = 'or';
    divider.appendChild(span);
    actions.appendChild(divider);

    actions.appendChild(Components.button('→ Join Room', 'btn-secondary', () => Router.navigate('join'), 'btn-join'));

    container.appendChild(actions);
    page.appendChild(container);

    // Version badge
    const version = document.createElement('div');
    version.className = 'version-badge';
    version.textContent = 'v1.0.0 · encrypted · private';
    page.appendChild(version);

    app().appendChild(page);
  }

  // ═══ ONBOARDING PAGE ═══
  function onboarding() {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.style.margin = '40px auto 24px';
    logo.textContent = '🔐';
    page.appendChild(logo);

    const title = document.createElement('h2');
    title.textContent = 'Choose Your Identity';
    title.style.textAlign = 'center';
    title.style.marginBottom = '8px';
    page.appendChild(title);

    const sub = document.createElement('div');
    sub.style.cssText = 'text-align:center;font-size:13px;color:var(--text-dim);margin-bottom:32px;line-height:1.6;';
    sub.textContent = 'Pick a username. This is permanent and visible to everyone in your rooms.';
    page.appendChild(sub);

    const inputGroup = Components.input('Username', 'Enter username...', 'text', 'username-input', {
      maxlength: 20,
      hint: '3-20 characters, letters, numbers, underscores',
    });
    page.appendChild(inputGroup);

    const charCount = document.createElement('div');
    charCount.style.cssText = 'font-size:11px;color:var(--text-muted);font-family:var(--font-mono);text-align:right;margin-top:-12px;margin-bottom:16px;';
    charCount.textContent = '0 / 20';
    page.appendChild(charCount);

    const continueBtn = Components.button('Continue →', 'btn-primary', null, 'btn-continue');
    continueBtn.disabled = true;
    page.appendChild(continueBtn);

    app().appendChild(page);

    // ── Logic ──
    const inp = document.getElementById('username-input');
    const hint = document.getElementById('username-input-hint');
    let checkTimeout;
    let available = false;

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && available && !continueBtn.disabled) {
        continueBtn.click();
      }
    });

    inp.addEventListener('input', () => {
      const val = inp.value.trim();
      charCount.textContent = val.length + ' / 20';

      if (checkTimeout) clearTimeout(checkTimeout);

      if (val.length < 3) {
        hint.textContent = 'At least 3 characters needed';
        hint.className = 'input-hint';
        continueBtn.disabled = true;
        available = false;
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(val)) {
        hint.textContent = 'Only letters, numbers, and underscores';
        hint.className = 'input-hint error';
        continueBtn.disabled = true;
        available = false;
        return;
      }

      hint.textContent = 'Checking...';
      hint.className = 'input-hint';

      checkTimeout = setTimeout(async () => {
        try {
          const res = await api('/api/users/check/' + val);
          if (res.available) {
            hint.textContent = '✓ Username is available';
            hint.className = 'input-hint success';
            available = true;
            continueBtn.disabled = false;
          } else {
            hint.textContent = '✕ Username is taken';
            hint.className = 'input-hint error';
            available = false;
            continueBtn.disabled = true;
          }
        } catch (e) {
          hint.textContent = 'Could not check availability';
          hint.className = 'input-hint error';
        }
      }, 400);
    });

    continueBtn.addEventListener('click', async () => {
      if (!available) return;
      const username = inp.value.trim();
      continueBtn.disabled = true;
      continueBtn.textContent = 'Setting up...';

      try {
        // 1. Generate UUID
        const uuid = SecureCrypto.generateUUID();

        // 2. Generate RSA keypair
        const keys = await SecureCrypto.generateKeyPair();

        // 3. Register with server FIRST
        const res = await api('/api/users/register', {
          method: 'POST',
          body: JSON.stringify({ uuid, username }),
        });

        if (res.error) {
          Components.toast(res.error, 'error');
          continueBtn.disabled = false;
          continueBtn.textContent = 'Continue →';
          return;
        }

        // 4. Save identity ONLY after successful registration
        SecureStorage.saveUserId(uuid);
        SecureStorage.saveUsername(username);

        // 5. Update state
        AppState.set('user', { id: uuid, username, hasKeys: true });

        // 6. Connect socket
        ChatSocket.connect(uuid);

        // 7. Navigate to home
        Components.toast('Welcome, @' + username + '!', 'success');
        Router.navigate('home');
      } catch (e) {
        console.error('Onboarding error:', e);
        Components.toast('Setup failed. Try again.', 'error');
        continueBtn.disabled = false;
        continueBtn.textContent = 'Continue →';
      }
    });
  }

  // ═══ HOME PAGE ═══
  async function home() {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    // Header
    const hdr = Components.header('SecureChat', [
      { icon: '⚙', title: 'Settings', onClick: () => Router.navigate('settings') },
    ]);
    page.appendChild(hdr);

    // Encryption badge
    page.appendChild(Components.encryptionBadge());

    // Welcome text
    const welcome = document.createElement('div');
    welcome.style.cssText = 'font-size:13px;color:var(--text-dim);margin-bottom:20px;';
    welcome.textContent = 'Hello, @' + (AppState.get('user').username || 'user');
    page.appendChild(welcome);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;margin-bottom:8px;';

    const createBtn = Components.button('+ Create', 'btn-primary', () => Router.navigate('create'));
    createBtn.style.flex = '1';
    actions.appendChild(createBtn);

    const joinBtn = Components.button('→ Join', 'btn-secondary', () => Router.navigate('join'));
    joinBtn.style.flex = '1';
    actions.appendChild(joinBtn);

    page.appendChild(actions);

    // Room history
    try {
      const rooms = await SecureStorage.getRooms();
      if (rooms.length > 0) {
        const title = document.createElement('div');
        title.className = 'rooms-list-title';
        title.textContent = 'Recent Rooms';
        page.appendChild(title);

        rooms.forEach(room => {
          const card = Components.roomCard(room, (r) => {
            // Try to rejoin
            Router.navigate('join');
            // Pre-fill the code after a tick
            setTimeout(() => {
              const codeInput = document.getElementById('room-code-input');
              if (codeInput) codeInput.value = r.code || '';
            }, 100);
          });
          page.appendChild(card);
        });
      } else {
        page.appendChild(Components.emptyState('💬', 'No rooms yet. Create or join one!'));
      }
    } catch (e) {
      page.appendChild(Components.emptyState('💬', 'No rooms yet. Create or join one!'));
    }

    app().appendChild(page);
  }

  // ═══ CREATE ROOM PAGE ═══
  function createRoom() {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    page.appendChild(Components.backButton());

    const title = document.createElement('h2');
    title.textContent = 'Create Room';
    title.style.marginBottom = '24px';
    page.appendChild(title);

    page.appendChild(Components.input('Room Name', 'e.g. Alpha Team', 'text', 'room-name-input'));
    page.appendChild(Components.input('Room Password', 'Choose a strong password...', 'password', 'room-password-input', { toggleable: true }));

    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text-dim);line-height:1.6;margin-bottom:20px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);';
    info.textContent = 'Share the room code and password with people you want in. Anyone with both can request to join — you approve who gets in.';
    page.appendChild(info);

    const createBtn = Components.button('Create & Enter →', 'btn-primary', null, 'btn-create-room');
    page.appendChild(createBtn);

    app().appendChild(page);

    // ── Logic ──
    createBtn.addEventListener('click', async () => {
      const name = document.getElementById('room-name-input').value.trim();
      const password = document.getElementById('room-password-input').value;

      if (!name) return Components.toast('Enter a room name', 'error');
      if (!password || password.length < 4) return Components.toast('Password must be at least 4 characters', 'error');

      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';

      try {
        const userId = AppState.get('user').id;
        const keys = await SecureStorage.getKeyPair();
        const passwordHash = await SecureCrypto.deriveRoomKey(password, 'securechat-room');

        const res = await api('/api/rooms/create', {
          method: 'POST',
          body: JSON.stringify({
            userId,
            name,
            passwordHash,
            publicKey: keys.publicKey,
          }),
        });

        if (res.error) {
          Components.toast(res.error, 'error');
          createBtn.disabled = false;
          createBtn.textContent = 'Create & Enter →';
          return;
        }

        // Set as current room (owner)
        AppState.set('currentRoom', {
          id: res.roomId,
          name: res.roomName || name,
          code: res.roomCode,
          members: [{
            userId,
            username: AppState.get('user').username,
            publicKey: keys.publicKey,
            online: true,
          }],
          messages: [],
          isOwner: true,
          isCoOwner: false,
          owner: userId,
          coOwner: null,
        });

        // Save to history
        SecureStorage.saveRoom({ id: res.roomId, name, code: res.roomCode });

        // Join via socket
        ChatSocket.emit('room:join', {
          roomId: res.roomId,
          publicKey: keys.publicKey,
        });

        // Show room code briefly, then go to chat
        clear();
        const codePage = document.createElement('div');
        codePage.className = 'page';
        codePage.style.justifyContent = 'center';
        codePage.style.alignItems = 'center';

        const successIcon = document.createElement('div');
        successIcon.style.cssText = 'font-size:48px;margin-bottom:20px;';
        successIcon.textContent = '✓';
        codePage.appendChild(successIcon);

        const roomTitle = document.createElement('h2');
        roomTitle.textContent = 'Room Created!';
        roomTitle.style.marginBottom = '8px';
        codePage.appendChild(roomTitle);

        const codeSub = document.createElement('div');
        codeSub.style.cssText = 'font-size:13px;color:var(--text-dim);margin-bottom:20px;text-align:center;';
        codeSub.textContent = 'Share this code with your people:';
        codePage.appendChild(codeSub);

        const codeBox = document.createElement('div');
        codeBox.className = 'room-code-box';
        const codeLabel = document.createElement('div');
        codeLabel.className = 'room-code-label';
        codeLabel.textContent = 'Room Code';
        codeBox.appendChild(codeLabel);
        const codeVal = document.createElement('div');
        codeVal.className = 'room-code-value';
        codeVal.textContent = res.roomCode;
        codeBox.appendChild(codeVal);
        codePage.appendChild(codeBox);

        const enterBtn = Components.button('Enter Chat →', 'btn-primary', () => {
          Router.navigate('chat/' + res.roomId);
        });
        enterBtn.style.maxWidth = '300px';
        enterBtn.style.marginTop = '20px';
        codePage.appendChild(enterBtn);

        app().appendChild(codePage);

      } catch (e) {
        console.error('Create room error:', e);
        Components.toast('Failed to create room', 'error');
        createBtn.disabled = false;
        createBtn.textContent = 'Create & Enter →';
      }
    });
  }

  // ═══ JOIN ROOM PAGE ═══
  function joinRoom() {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    page.appendChild(Components.backButton());

    const title = document.createElement('h2');
    title.textContent = 'Join Room';
    title.style.marginBottom = '24px';
    page.appendChild(title);

    page.appendChild(Components.input('Room Code', 'XX-XXXX', 'text', 'room-code-input', { maxlength: 7 }));
    page.appendChild(Components.input('Room Password', 'Enter room password...', 'password', 'room-password-join', { toggleable: true }));

    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text-dim);line-height:1.6;margin-bottom:20px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);';
    info.textContent = 'Enter the code and password you received. If correct, the room owner will be asked to approve your join request.';
    page.appendChild(info);

    const joinBtn = Components.button('Join Room →', 'btn-primary', null, 'btn-join-room');
    page.appendChild(joinBtn);

    app().appendChild(page);

    // Auto-format room code
    const codeInput = document.getElementById('room-code-input');
    codeInput.addEventListener('input', () => {
      let val = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 2) val = val.slice(0, 2) + '-' + val.slice(2);
      codeInput.value = val.slice(0, 7);
    });

    // ── Logic ──
    joinBtn.addEventListener('click', async () => {
      const roomCode = codeInput.value.trim();
      const password = document.getElementById('room-password-join').value;

      if (!roomCode || roomCode.length < 6) return Components.toast('Enter a valid room code', 'error');
      if (!password) return Components.toast('Enter the room password', 'error');

      joinBtn.disabled = true;
      joinBtn.textContent = 'Joining...';

      try {
        const userId = AppState.get('user').id;
        const keys = await SecureStorage.getKeyPair();

        // Use fixed salt so create and join derive the same hash from the same password
        const passwordHash = await SecureCrypto.deriveRoomKey(password, 'securechat-room');

        const res = await api('/api/rooms/join', {
          method: 'POST',
          body: JSON.stringify({
            userId,
            roomCode,
            passwordHash,
            publicKey: keys.publicKey,
          }),
        });

        if (res.error) {
          Components.toast(res.error, 'error');
          joinBtn.disabled = false;
          joinBtn.textContent = 'Join Room →';
          return;
        }

        if (res.status === 'already_member') {
          // Rejoin directly
          ChatSocket.emit('room:join', {
            roomId: res.roomId,
            publicKey: keys.publicKey,
          });
          return;
        }

        if (res.status === 'pending') {
          // Notify the owner via socket
          ChatSocket.emit('room:notify-pending', { roomId: res.roomId });
          Router.navigate('waiting/' + roomCode);
        }
      } catch (e) {
        console.error('Join error:', e);
        Components.toast('Failed to join room', 'error');
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Room →';
      }
    });
  }

  // ═══ WAITING ROOM PAGE ═══
  function waitingRoom(roomCode) {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    const container = document.createElement('div');
    container.className = 'waiting-container';

    // Animated ring
    const ring = document.createElement('div');
    ring.className = 'waiting-ring';
    const inner = document.createElement('div');
    inner.className = 'waiting-ring-inner';
    inner.textContent = '🔐';
    ring.appendChild(inner);
    container.appendChild(ring);

    const title = document.createElement('div');
    title.className = 'waiting-title';
    title.textContent = 'Awaiting Approval';
    container.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'waiting-sub';
    sub.textContent = 'Your join request has been sent to the room owner. Please wait for them to approve you.';
    container.appendChild(sub);

    // Room code badge
    const codeBox = document.createElement('div');
    codeBox.className = 'room-code-box';
    codeBox.style.marginBottom = '24px';
    codeBox.style.width = '100%';
    codeBox.style.maxWidth = '240px';
    const codeLabel = document.createElement('div');
    codeLabel.className = 'room-code-label';
    codeLabel.textContent = 'Requested Room';
    codeBox.appendChild(codeLabel);
    const codeVal = document.createElement('div');
    codeVal.className = 'room-code-value';
    codeVal.style.fontSize = '22px';
    codeVal.textContent = roomCode || '—';
    codeBox.appendChild(codeVal);
    container.appendChild(codeBox);

    const cancelBtn = Components.button('Cancel Request', 'btn-danger', () => {
      Router.navigate('home');
    });
    cancelBtn.style.maxWidth = '240px';
    container.appendChild(cancelBtn);

    page.appendChild(container);
    app().appendChild(page);
  }

  // ═══ CHAT PAGE ═══
  function chat(roomId) {
    clear();
    const room = AppState.get('currentRoom');
    if (!room) {
      // Try to rejoin via socket
      ChatSocket.emit('room:join', { roomId });
      // Show loading while waiting for room:approved
      const page = document.createElement('div');
      page.className = 'page';
      page.appendChild(Components.loadingSpinner('Connecting to room...'));
      app().appendChild(page);
      return;
    }

    const page = document.createElement('div');
    page.className = 'chat-page';

    // ── Chat Header ──
    const header = document.createElement('div');
    header.className = 'chat-header';

    const roomInfo = document.createElement('div');
    roomInfo.className = 'chat-room-info';

    const roomName = document.createElement('div');
    roomName.className = 'chat-room-name';
    roomName.textContent = room.name;
    roomInfo.appendChild(roomName);

    // Copyable Room Code Badge
    const roomCodeBadge = document.createElement('div');
    roomCodeBadge.className = 'room-code-badge';
    roomCodeBadge.style.cssText = 'font-size: 12px; color: var(--accent); font-family: var(--font-mono); margin-top: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--accent-glow); border: 1px dashed var(--border); border-radius: 6px; width: fit-content; transition: all 0.2s ease;';
    roomCodeBadge.innerHTML = '<span>🔑</span> ' + room.code + ' <span style="font-size:10px; opacity:0.7;">(click to copy)</span>';
    roomCodeBadge.title = 'Click to copy room code';
    roomCodeBadge.addEventListener('click', () => {
      navigator.clipboard.writeText(room.code);
      Components.toast('Room code copied to clipboard!', 'success');
    });
    roomCodeBadge.addEventListener('mouseenter', () => {
      roomCodeBadge.style.borderColor = 'var(--accent)';
      roomCodeBadge.style.boxShadow = '0 0 8px var(--accent-glow)';
    });
    roomCodeBadge.addEventListener('mouseleave', () => {
      roomCodeBadge.style.borderColor = 'var(--border)';
      roomCodeBadge.style.boxShadow = 'none';
    });
    roomInfo.appendChild(roomCodeBadge);

    const onlineBadge = document.createElement('div');
    onlineBadge.className = 'online-badge';
    onlineBadge.id = 'online-count';
    const onlineDot = document.createElement('div');
    onlineDot.className = 'online-dot';
    onlineBadge.appendChild(onlineDot);
    const onlineText = document.createElement('span');
    const onlineCount = room.members.filter(m => m.online !== false).length;
    onlineText.textContent = onlineCount + ' online · E2E encrypted';
    onlineBadge.appendChild(onlineText);
    roomInfo.appendChild(onlineBadge);

    header.appendChild(roomInfo);

    const headerActions = document.createElement('div');
    headerActions.className = 'chat-header-actions';

    // Members button
    const membersBtn = document.createElement('button');
    membersBtn.className = 'icon-btn';
    membersBtn.textContent = '👥';
    membersBtn.title = 'Members';
    membersBtn.addEventListener('click', () => showMemberList(room));
    headerActions.appendChild(membersBtn);

    // Leave/Close button
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'icon-btn icon-btn-danger';
    leaveBtn.textContent = room.isOwner ? '✕' : '→';
    leaveBtn.title = room.isOwner ? 'Close Room' : 'Leave Room';
    leaveBtn.addEventListener('click', () => {
      if (room.isOwner) {
        Components.modal('Close Room?', 'This will disconnect all members and permanently delete all messages.', [
          { text: 'Cancel', className: 'btn-secondary' },
          { text: 'Close Room', className: 'btn-danger', onClick: () => {
            ChatSocket.emit('room:close', { roomId: room.id });
            AppState.set('currentRoom', null);
            SecureStorage.removeRoom(room.id);
            Router.navigate('home');
          }},
        ]);
      } else {
        ChatSocket.emit('room:leave', { roomId: room.id });
        AppState.set('currentRoom', null);
        Router.navigate('home');
      }
    });
    headerActions.appendChild(leaveBtn);

    header.appendChild(headerActions);
    page.appendChild(header);

    // ── Encryption Badge ──
    const badgeRow = document.createElement('div');
    badgeRow.style.padding = '8px 20px 0';
    badgeRow.appendChild(Components.encryptionBadge());
    page.appendChild(badgeRow);

    // ── Messages Area ──
    const messages = document.createElement('div');
    messages.className = 'chat-messages';
    messages.id = 'chat-messages';

    // Render existing messages
    if (room.messages.length === 0) {
      const sys = Components.systemMessage('Room created. Messages are end-to-end encrypted.');
      messages.appendChild(sys);
    }
    room.messages.forEach(msg => {
      messages.appendChild(Components.messageBubble(msg));
    });

    page.appendChild(messages);

    // ── Input Bar ──
    const inputBar = document.createElement('div');
    inputBar.className = 'chat-input-bar';

    const chatInput = document.createElement('input');
    chatInput.className = 'chat-input';
    chatInput.type = 'text';
    chatInput.placeholder = 'Message...';
    chatInput.id = 'chat-message-input';
    inputBar.appendChild(chatInput);

    const sendBtn = document.createElement('button');
    sendBtn.className = 'send-btn';
    sendBtn.textContent = '↑';
    sendBtn.id = 'send-btn';
    inputBar.appendChild(sendBtn);

    page.appendChild(inputBar);
    app().appendChild(page);

    // Auto-scroll
    scrollToBottom();

    // ── Send Message Logic ──
    async function sendMessage() {
      const text = chatInput.value.trim();
      if (!text) return;

      chatInput.value = '';

      const currentRoom = AppState.get('currentRoom');
      if (!currentRoom) return;

      // Build public keys map for encryption
      const memberKeys = {};
      for (const member of currentRoom.members) {
        if (member.publicKey) {
          memberKeys[member.userId] = member.publicKey;
        }
      }

      try {
        const payload = await SecureCrypto.encryptMessage(text, memberKeys);

        // Add to local messages immediately
        AppState.update('currentRoom', (r) => {
          if (!r) return r;
          r.messages.push({
            text,
            senderId: AppState.get('user').id,
            senderName: AppState.get('user').username,
            timestamp: Date.now(),
            isMine: true,
          });
          return { ...r };
        });

        // Send via socket
        ChatSocket.emit('room:message', {
          roomId: currentRoom.id,
          payload,
        });
      } catch (e) {
        console.error('Send error:', e);
        Components.toast('Failed to send message', 'error');
      }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Focus input
    chatInput.focus();

    // ── Subscribe to state changes to re-render messages ──
    const unsub = AppState.subscribe('currentRoom', (r) => {
      if (!r) return;
      const msgContainer = document.getElementById('chat-messages');
      if (!msgContainer) return;

      // Re-render messages
      msgContainer.innerHTML = '';
      if (r.messages.length === 0) {
        msgContainer.appendChild(Components.systemMessage('Room created. Messages are end-to-end encrypted.'));
      }
      r.messages.forEach(msg => {
        msgContainer.appendChild(Components.messageBubble(msg));
      });
      scrollToBottom();

      // Update online count
      const badge = document.getElementById('online-count');
      if (badge) {
        const count = r.members.filter(m => m.online !== false).length;
        badge.querySelector('span').textContent = count + ' online · E2E encrypted';
      }
    });

    // Flush offline queue
    ChatSocket.emit('queue:flush', { roomId });
  }

  function scrollToBottom() {
    setTimeout(() => {
      const msgs = document.getElementById('chat-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  function showMemberList(room) {
    const content = document.createElement('div');

    room.members.forEach(member => {
      const isOwner = room.isOwner && member.userId !== AppState.get('user').id;
      const callbacks = isOwner ? {
        onPromote: (userId) => {
          ChatSocket.emit('room:promote', { roomId: room.id, targetUserId: userId });
          Components.toast('Promoted!', 'success');
        }
      } : null;

      content.appendChild(Components.memberItem(
        member,
        room.owner,
        room.coOwner,
        callbacks
      ));
    });

    Components.modal('Members (' + room.members.length + ')', content, [
      { text: 'Close', className: 'btn-secondary' },
    ]);
  }

  // ═══ SETTINGS PAGE ═══
  function settings() {
    clear();
    const page = document.createElement('div');
    page.className = 'page';

    page.appendChild(Components.backButton());

    const title = document.createElement('h2');
    title.textContent = 'Settings';
    title.style.marginBottom = '24px';
    page.appendChild(title);

    // Profile section
    const profileSection = document.createElement('div');
    profileSection.className = 'settings-section';
    const profileTitle = document.createElement('div');
    profileTitle.className = 'settings-section-title';
    profileTitle.textContent = 'Profile';
    profileSection.appendChild(profileTitle);

    const user = AppState.get('user');

    const usernameItem = document.createElement('div');
    usernameItem.className = 'settings-item';
    usernameItem.innerHTML = '<div class="settings-label">Username</div><div class="settings-value">@' + (user.username || '—') + '</div>';
    profileSection.appendChild(usernameItem);

    const uuidItem = document.createElement('div');
    uuidItem.className = 'settings-item';
    const uuidVal = (user.id || '—').substring(0, 12) + '...';
    uuidItem.innerHTML = '<div class="settings-label">Device ID</div><div class="settings-value">' + uuidVal + '</div>';
    profileSection.appendChild(uuidItem);

    page.appendChild(profileSection);

    // Theme section
    const themeSection = document.createElement('div');
    themeSection.className = 'settings-section';
    const themeTitle = document.createElement('div');
    themeTitle.className = 'settings-section-title';
    themeTitle.textContent = 'Theme';
    themeSection.appendChild(themeTitle);

    const themes = [
      { id: 'bioluminescent', name: 'Bioluminescent', color: '#00f5d4', active: true },
      { id: 'softglass', name: 'Soft Glass', color: '#7c5cbf', active: false },
      { id: 'terminal', name: 'Terminal', color: '#00c832', active: false },
    ];

    themes.forEach(theme => {
      const option = document.createElement('div');
      option.className = 'theme-option' + (theme.active ? ' active' : ' disabled');

      const dot = document.createElement('div');
      dot.className = 'theme-dot';
      dot.style.borderColor = theme.color;
      if (theme.active) dot.style.background = theme.color;
      option.appendChild(dot);

      const name = document.createElement('div');
      name.className = 'theme-name';
      name.textContent = theme.name;
      option.appendChild(name);

      if (!theme.active) {
        const tag = document.createElement('span');
        tag.className = 'theme-tag';
        tag.textContent = 'COMING SOON';
        option.appendChild(tag);
      }

      themeSection.appendChild(option);
    });

    page.appendChild(themeSection);

    // Data section
    const dataSection = document.createElement('div');
    dataSection.className = 'settings-section';
    const dataTitle = document.createElement('div');
    dataTitle.className = 'settings-section-title';
    dataTitle.textContent = 'Data';
    dataSection.appendChild(dataTitle);

    const clearBtn = Components.button('Clear All Data', 'btn-danger', () => {
      Components.modal(
        'Clear All Data?',
        'This will delete your identity, encryption keys, and room history. You will need to create a new identity. This cannot be undone.',
        [
          { text: 'Cancel', className: 'btn-secondary' },
          { text: 'Delete Everything', className: 'btn-danger', onClick: async () => {
            await SecureStorage.clearAll();
            ChatSocket.disconnect();
            AppState.set('user', { id: null, username: null, hasKeys: false });
            AppState.set('currentRoom', null);
            AppState.set('rooms', []);
            Router.navigate('welcome');
            Components.toast('All data cleared', 'info');
          }},
        ]
      );
    });
    dataSection.appendChild(clearBtn);
    page.appendChild(dataSection);

    // About
    const aboutSection = document.createElement('div');
    aboutSection.className = 'settings-section';
    const aboutTitle = document.createElement('div');
    aboutTitle.className = 'settings-section-title';
    aboutTitle.textContent = 'About';
    aboutSection.appendChild(aboutTitle);

    const aboutItems = [
      { label: 'Version', value: '1.0.0' },
      { label: 'Encryption', value: 'RSA-2048 + AES-256-GCM' },
      { label: 'Server Storage', value: 'RAM only (ephemeral)' },
    ];

    aboutItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'settings-item';
      el.innerHTML = '<div class="settings-label">' + item.label + '</div><div class="settings-value">' + item.value + '</div>';
      aboutSection.appendChild(el);
    });

    page.appendChild(aboutSection);
    app().appendChild(page);
  }

  return { welcome, onboarding, home, createRoom, joinRoom, waitingRoom, chat, settings };
})();
