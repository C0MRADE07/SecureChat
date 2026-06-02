// ═══════════════════════════════════════════
// SecureChat — Socket.io Client Wrapper
// Handles all real-time communication
// ═══════════════════════════════════════════

window.ChatSocket = (function() {
  let socket = null;

  const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.port === '3000' ? window.location.origin : 'http://localhost:3000')
    : 'https://securechat-7t0n.onrender.com';

  function connect(userId) {
    if (socket && socket.connected) return;

    socket = io(BACKEND_URL, {
      auth: { userId },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    // ── Connection Events ──
    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      AppState.set('connected', true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      AppState.set('connected', false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      AppState.set('connected', false);
    });

    // ── Room Events ──

    // Incoming message — decrypt and add to current room
    socket.on('room:message', async (data) => {
      const room = AppState.get('currentRoom');
      if (!room) return;

      let text;
      // System messages don't need decryption
      if (data.senderId === '__SYSTEM__') {
        text = data.payload.message;
        AppState.update('currentRoom', (r) => {
          if (!r) return r;
          r.messages.push({
            type: 'system',
            text: text,
            timestamp: data.timestamp,
          });
          return { ...r };
        });
        return;
      }

      // Decrypt the message
      try {
        const keys = await SecureStorage.getKeyPair();
        if (!keys) return;
        text = await SecureCrypto.decryptMessage(data.payload, keys.privateKey, AppState.get('user').id);
      } catch (e) {
        console.error('Decrypt error:', e);
        text = '[Decryption failed]';
      }

      AppState.update('currentRoom', (r) => {
        if (!r) return r;
        r.messages.push({
          text,
          senderId: data.senderId,
          senderName: data.senderName,
          timestamp: data.timestamp,
          isMine: false,
        });
        return { ...r };
      });
    });

    // Queued message (on reconnect flush)
    socket.on('queue:message', async (data) => {
      const room = AppState.get('currentRoom');
      if (!room) return;

      let text;
      try {
        const keys = await SecureStorage.getKeyPair();
        if (!keys) return;
        text = await SecureCrypto.decryptMessage(data.payload, keys.privateKey, AppState.get('user').id);
      } catch (e) {
        text = '[Decryption failed]';
      }

      AppState.update('currentRoom', (r) => {
        if (!r) return r;
        r.messages.push({
          text,
          senderId: data.senderId,
          senderName: data.senderName,
          timestamp: data.timestamp,
          isMine: false,
        });
        return { ...r };
      });
    });

    // User joined room
    socket.on('room:user-joined', (data) => {
      AppState.update('currentRoom', (r) => {
        if (!r) return r;
        // Add member if not already present
        const exists = r.members.find(m => m.userId === data.userId);
        if (!exists) {
          r.members.push({
            userId: data.userId,
            username: data.username,
            publicKey: data.publicKey,
            online: true,
          });
        } else {
          exists.online = true;
        }
        r.messages.push({
          type: 'system',
          text: data.username + ' joined the room',
          timestamp: Date.now(),
        });
        return { ...r };
      });
      Components.toast(data.username + ' joined', 'success');
    });

    // User left room
    socket.on('room:user-left', (data) => {
      AppState.update('currentRoom', (r) => {
        if (!r) return r;
        if (data.offline) {
          // Just went offline, keep in members
          const member = r.members.find(m => m.userId === data.userId);
          if (member) member.online = false;
          r.messages.push({
            type: 'system',
            text: data.username + ' went offline',
            timestamp: Date.now(),
          });
        } else {
          // Actually left
          r.members = r.members.filter(m => m.userId !== data.userId);
          r.messages.push({
            type: 'system',
            text: data.username + ' left the room',
            timestamp: Date.now(),
          });
        }
        return { ...r };
      });
    });

    // Join request (owner/co-owner sees this)
    socket.on('room:join-request', (data) => {
      Components.joinRequestPopup(
        data.username,
        data.userId,
        (userId) => {
          socket.emit('room:approve-user', { roomId: data.roomId, targetUserId: userId });
        },
        (userId) => {
          socket.emit('room:deny-user', { roomId: data.roomId, targetUserId: userId });
        }
      );
    });

    // Approved — navigate to chat
    socket.on('room:approved', (data) => {
      AppState.set('currentRoom', {
        id: data.roomId,
        name: data.roomName,
        code: data.roomCode,
        members: data.members || [],
        messages: [],
        isOwner: data.isOwner || false,
        isCoOwner: data.isCoOwner || false,
        owner: data.owner,
        coOwner: data.coOwner,
      });

      // Save to room history
      SecureStorage.saveRoom({ id: data.roomId, name: data.roomName, code: data.roomCode });

      Router.navigate('chat/' + data.roomId);
      Components.toast('Joined ' + data.roomName, 'success');
    });

    // Denied
    socket.on('room:denied', (data) => {
      Components.toast('Join request denied', 'error');
      Router.navigate('home');
    });

    // Room closed
    socket.on('room:closed', (data) => {
      const room = AppState.get('currentRoom');
      if (room && room.id === data.roomId) {
        AppState.set('currentRoom', null);
        SecureStorage.removeRoom(data.roomId);
        Components.toast('Room has been closed', 'error');
        Router.navigate('home');
      }
    });

    // Promoted
    socket.on('room:promoted', (data) => {
      AppState.update('currentRoom', (r) => {
        if (!r) return r;
        if (data.newCoOwner) {
          r.coOwner = data.newCoOwner;
          if (data.newCoOwner === AppState.get('user').id) {
            r.isCoOwner = true;
            Components.toast('You were promoted to co-owner!', 'success');
          }
        }
        if (data.newOwner) {
          r.owner = data.newOwner;
          r.coOwner = null;
          if (data.newOwner === AppState.get('user').id) {
            r.isOwner = true;
            r.isCoOwner = false;
            Components.toast('You are now the room owner!', 'success');
          }
        }
        return { ...r };
      });
    });

    // Error
    socket.on('error', (data) => {
      Components.toast(data.message || 'An error occurred', 'error');
    });

    return socket;
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  function emit(event, data) {
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn('[Socket] Not connected. Cannot emit:', event);
    }
  }

  function on(event, callback) {
    if (socket) socket.on(event, callback);
  }

  function off(event, callback) {
    if (socket) socket.off(event, callback);
  }

  function isConnected() {
    return socket && socket.connected;
  }

  return { connect, disconnect, emit, on, off, isConnected };
})();
