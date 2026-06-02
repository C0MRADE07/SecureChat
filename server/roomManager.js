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
      memberCount: room.members.size,
      pendingCount: room.pendingRequests.size,
      createdAt: room.createdAt,
      members: Array.from(room.members.entries()).map(([uid, m]) => ({
        userId: uid,
        username: m.username,
        online: m.online,
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
  // If room is empty, delete it
  if (room.members.size === 0) {
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
  return Array.from(room.members.entries()).map(([uid, m]) => ({
    userId: uid,
    username: m.username,
    publicKey: m.publicKey,
    online: m.online,
  }));
}
