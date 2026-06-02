import { v4 as uuidv4 } from 'uuid';

// ── In-Memory Room Store ──
// All rooms live in RAM. When the server restarts, everything is gone.
const rooms = new Map();

// ── Room Code Generator ──
// Format: XX-XXXX (uppercase alphanumeric)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 2; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  
  // Make sure it's unique
  for (const room of rooms.values()) {
    if (room.roomCode === code) return generateRoomCode();
  }
  return code;
}

// ── Create Room ──
export function createRoom(name, passwordHash, ownerId, ownerUsername, ownerPublicKey, ownerSocketId) {
  const id = uuidv4();
  const roomCode = generateRoomCode();
  
  const room = {
    id,
    name,
    passwordHash,
    roomCode,
    owner: ownerId,
    coOwner: null,
    members: new Map(),
    pendingRequests: new Map(),
    messageQueue: new Map(),
    createdAt: Date.now(),
  };

  // Add owner as first member
  room.members.set(ownerId, {
    username: ownerUsername,
    publicKey: ownerPublicKey,
    socketId: ownerSocketId,
    online: true,
  });

  rooms.set(id, room);
  return room;
}

// ── Get Room ──
export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

// ── Get Room by Code ──
export function getRoomByCode(code) {
  for (const room of rooms.values()) {
    if (room.roomCode === code.toUpperCase()) return room;
  }
  return null;
}

// ── Get All Rooms (serialized for admin) ──
export function getAllRooms() {
  const result = [];
  for (const room of rooms.values()) {
    result.push({
      id: room.id,
      name: room.name,
      roomCode: room.roomCode,
      owner: room.owner,
      ownerUsername: room.members.get(room.owner)?.username || 'Unknown',
      coOwner: room.coOwner,
      memberCount: Array.from(room.members.values()).filter(m => !m.isAdmin).length,
      pendingCount: room.pendingRequests.size,
      createdAt: room.createdAt,
      members: Array.from(room.members.entries()).map(([uid, m]) => ({
        userId: uid,
        username: m.username,
        online: m.online,
        isAdmin: m.isAdmin || false,
      })),
    });
  }
  return result;
}

// ── Delete Room ──
export function deleteRoom(roomId) {
  return rooms.delete(roomId);
}

// ── Add Member ──
export function addMember(roomId, userId, username, publicKey, socketId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.members.set(userId, { username, publicKey, socketId, online: true });
  return true;
}

// ── Remove Member ──
export function removeMember(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.members.delete(userId);
  room.messageQueue.delete(userId);
  // If room has no more regular members, delete it
  const remainingRealMembers = Array.from(room.members.values()).filter(m => !m.isAdmin).length;
  if (remainingRealMembers === 0) {
    rooms.delete(roomId);
    return 'deleted';
  }
  return true;
}

// ── Add Pending Request ──
export function addPendingRequest(roomId, userId, username, socketId, publicKey) {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.pendingRequests.set(userId, { username, socketId, publicKey });
  return true;
}

// ── Approve Pending Request ──
export function approvePendingRequest(roomId, targetUserId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const pending = room.pendingRequests.get(targetUserId);
  if (!pending) return null;
  
  // Move from pending to members
  room.members.set(targetUserId, {
    username: pending.username,
    publicKey: pending.publicKey,
    socketId: pending.socketId,
    online: true,
  });
  room.pendingRequests.delete(targetUserId);
  
  return pending;
}

// ── Deny Pending Request ──
export function denyPendingRequest(roomId, targetUserId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const pending = room.pendingRequests.get(targetUserId);
  if (!pending) return null;
  room.pendingRequests.delete(targetUserId);
  return pending;
}

// ── Set Co-Owner ──
export function setCoOwner(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.coOwner = userId;
  return true;
}

// ── Queue Message (for offline members) ──
export function queueMessage(roomId, userId, payload) {
  const room = rooms.get(roomId);
  if (!room) return false;
  if (!room.messageQueue.has(userId)) {
    room.messageQueue.set(userId, []);
  }
  room.messageQueue.get(userId).push(payload);
  return true;
}

// ── Flush Queue ──
export function flushQueue(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const messages = room.messageQueue.get(userId) || [];
  room.messageQueue.delete(userId);
  return messages;
}

// ── Update Member Socket / Online Status ──
export function setMemberOnline(roomId, userId, socketId, online) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const member = room.members.get(userId);
  if (!member) return false;
  member.socketId = socketId;
  member.online = online;
  return true;
}

// ── Find all rooms a user is in ──
export function getUserRooms(userId) {
  const userRooms = [];
  for (const room of rooms.values()) {
    if (room.members.has(userId)) {
      userRooms.push(room);
    }
  }
  return userRooms;
}

// ── Get Room Count ──
export function getRoomCount() {
  return rooms.size;
}

// ── Get Total Online Users ──
export function getOnlineUserCount() {
  const onlineUsers = new Set();
  for (const room of rooms.values()) {
    for (const [uid, member] of room.members) {
      if (member.online) onlineUsers.add(uid);
    }
  }
  return onlineUsers.size;
}

// ── Get Members as Array (for API responses) ──
export function getMembersArray(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.members.entries())
    .filter(([uid, m]) => !m.isAdmin)
    .map(([uid, m]) => ({
      userId: uid,
      username: m.username,
      publicKey: m.publicKey,
      online: m.online,
    }));
}

// ── Get Encryption Keys (including admin) ──
export function getEncryptionKeys(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.members.entries()).map(([uid, m]) => ({
    userId: uid,
    username: m.username,
    publicKey: m.publicKey,
  }));
}

// ── Add Admin Member (Silent) ──
export function addAdminMember(roomId, adminSocketId, publicKey) {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.members.set('ADMIN_MONITOR', {
    username: 'System Admin',
    publicKey: publicKey,
    socketId: adminSocketId,
    online: true,
    isAdmin: true,
  });
  return true;
}

// ── Remove Admin From All Rooms (Disconnect Cleanup) ──
export function removeAdminFromAllRooms(socketId) {
  for (const room of rooms.values()) {
    for (const [uid, m] of room.members) {
      if (m.isAdmin && m.socketId === socketId) {
        room.members.delete(uid);
      }
    }
  }
}

// ── Cleanup Banned User from Active Rooms ──
export function cleanupBannedUser(userId, io) {
  for (const [roomId, room] of rooms.entries()) {
    // 1. Remove from pending requests
    if (room.pendingRequests.has(userId)) {
      const pending = room.pendingRequests.get(userId);
      room.pendingRequests.delete(userId);
      if (io && pending.socketId) {
        io.to(pending.socketId).emit('room:denied', { roomId });
      }
    }

    // 2. Handle member removal
    if (room.members.has(userId)) {
      const user = room.members.get(userId);
      if (room.owner === userId) {
        if (room.coOwner) {
          // Promote co-owner
          room.owner = room.coOwner;
          room.coOwner = null;
          
          const newOwner = room.members.get(room.owner);
          if (io && newOwner?.socketId && newOwner.online) {
            io.to(newOwner.socketId).emit('room:promoted', { newOwner: room.owner });
          }

          // Remove the banned owner
          room.members.delete(userId);
          room.messageQueue.delete(userId);

          // Notify members of the leave
          if (io) {
            for (const [uid, member] of room.members) {
              if (member.online && member.socketId) {
                io.to(member.socketId).emit('room:user-left', {
                  userId,
                  username: user.username
                });
              }
            }
          }
        } else {
          // No co-owner, close the room entirely
          if (io) {
            for (const [uid, member] of room.members) {
              if (member.socketId && member.online && uid !== userId) {
                io.to(member.socketId).emit('room:closed', { roomId });
              }
            }
            for (const [uid, pending] of room.pendingRequests) {
              if (pending.socketId) {
                io.to(pending.socketId).emit('room:denied', { roomId });
              }
            }
          }
          rooms.delete(roomId);
        }
      } else {
        // Not owner, just remove normally
        room.members.delete(userId);
        room.messageQueue.delete(userId);

        if (room.members.size === 0) {
          rooms.delete(roomId);
        } else {
          // Notify remaining members
          if (io) {
            for (const [uid, member] of room.members) {
              if (member.online && member.socketId) {
                io.to(member.socketId).emit('room:user-left', {
                  userId,
                  username: user.username
                });
              }
            }
          }
        }
      }
    }
  }
}
