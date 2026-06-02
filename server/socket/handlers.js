import os from 'os';
import { getUser } from '../db.js';
import * as rm from '../roomManager.js';

// ── Socket-to-User mapping ──
const socketToUser = new Map(); // socketId -> userId
const userToSocket = new Map(); // userId -> socketId

export default function setupSocketHandlers(io) {
  // ── Connection Middleware ──
  io.use(async (socket, next) => {
    const userId = socket.handshake.auth?.userId;
    const isAdmin = socket.handshake.auth?.admin;

    if (isAdmin) {
      socket.isAdmin = true;
      return next();
    }

    if (!userId) {
      return next(new Error('Authentication required'));
    }

    try {
      const user = await getUser(userId);
      if (!user) {
        return next(new Error('User not found'));
      }
      if (user.banned) {
        const err = new Error('User is banned');
        err.data = { reason: user.ban_reason || 'Violating platform guidelines' };
        return next(err);
      }

      socket.userId = userId;
      socket.username = user.username;
      next();
    } catch (err) {
      return next(new Error('Database connection error'));
    }
  });

  // ── Admin Stats Broadcast ──
  setInterval(() => {
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((a, c) => a + c.times.idle, 0);
    const totalTick = cpus.reduce((a, c) => a + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq, 0);
    const cpuPercent = Math.round((1 - totalIdle / totalTick) * 100);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const stats = {
      cpu: cpuPercent,
      ramUsed: Math.round((totalMem - freeMem) / 1024 / 1024),
      ramTotal: Math.round(totalMem / 1024 / 1024),
      uptime: Math.floor(process.uptime()),
      roomCount: rm.getRoomCount(),
      userCount: rm.getOnlineUserCount(),
    };

    // Send to all admin sockets
    for (const [, socket] of io.sockets.sockets) {
      if (socket.isAdmin) {
        socket.emit('server:stats', stats);
      }
    }
  }, 5000);

  // ── Connection Handler ──
  io.on('connection', (socket) => {
    if (socket.isAdmin) {
      console.log(`[Socket] Admin connected: ${socket.id}`);

      // Silent room monitoring join
      socket.on('admin:join-room', ({ roomId, publicKey }) => {
        const room = rm.getRoom(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found' });

        rm.addAdminMember(roomId, socket.id, publicKey);
        socket.join(roomId);

        console.log(`[Socket] Admin ${socket.id} joined room ${roomId} silently.`);

        socket.emit('admin:room-joined', {
          roomId: room.id,
          roomName: room.name,
          roomCode: room.roomCode,
        });
      });

      // Silent room monitoring leave
      socket.on('admin:leave-room', ({ roomId }) => {
        const room = rm.getRoom(roomId);
        if (room) {
          room.members.delete('ADMIN_MONITOR');
        }
        socket.leave(roomId);
        console.log(`[Socket] Admin ${socket.id} left room ${roomId}.`);
        socket.emit('admin:room-left', { roomId });
      });

      socket.on('disconnect', () => {
        console.log(`[Socket] Admin disconnected: ${socket.id}`);
        rm.removeAdminFromAllRooms(socket.id);
      });

      return;
    }

    console.log(`[Socket] User connected: ${socket.username} (${socket.userId})`);
    socketToUser.set(socket.id, socket.userId);
    userToSocket.set(socket.userId, socket.id);

    // Mark user online in all their rooms
    const userRooms = rm.getUserRooms(socket.userId);
    for (const room of userRooms) {
      rm.setMemberOnline(room.id, socket.userId, socket.id, true);
    }

    // ── room:join — Rejoin a room (already approved member) ──
    socket.on('room:join', ({ roomId, publicKey }) => {
      const room = rm.getRoom(roomId);
      if (!room) return socket.emit('error', { message: 'Room not found' });

      const member = room.members.get(socket.userId);
      if (member) {
        // Already a member — update socket and mark online
        rm.setMemberOnline(roomId, socket.userId, socket.id, true);
        member.publicKey = publicKey || member.publicKey;

        // Send current room state
        socket.emit('room:approved', {
          roomId: room.id,
          roomName: room.name,
          roomCode: room.roomCode,
          members: rm.getMembersArray(roomId),
          isOwner: room.owner === socket.userId,
          isCoOwner: room.coOwner === socket.userId,
          owner: room.owner,
          coOwner: room.coOwner,
        });

        // Notify others
        for (const [uid, m] of room.members) {
          if (uid !== socket.userId && m.online && m.socketId) {
            io.to(m.socketId).emit('room:user-joined', {
              userId: socket.userId,
              username: socket.username,
              publicKey: publicKey || member.publicKey,
            });
          }
        }
      }
    });

    // ── room:message — Send encrypted message ──
    socket.on('room:message', ({ roomId, payload }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;
      if (!room.members.has(socket.userId)) return;

      const messageData = {
        payload,
        senderId: socket.userId,
        senderName: socket.username,
        timestamp: Date.now(),
      };

      // Send to all online members, queue for offline
      for (const [uid, member] of room.members) {
        if (uid === socket.userId) continue;

        if (member.online && member.socketId) {
          io.to(member.socketId).emit('room:message', messageData);
        } else {
          rm.queueMessage(roomId, uid, messageData);
        }
      }
    });

    // ── room:leave — Leave room ──
    socket.on('room:leave', ({ roomId }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;

      // If owner and members exist, must promote first
      if (room.owner === socket.userId && room.members.size > 1 && !room.coOwner) {
        return socket.emit('error', { message: 'Promote a co-owner before leaving.' });
      }

      // If owner leaving and co-owner exists, transfer ownership
      if (room.owner === socket.userId && room.coOwner) {
        room.owner = room.coOwner;
        room.coOwner = null;
        // Notify new owner
        const newOwner = room.members.get(room.owner);
        if (newOwner?.socketId && newOwner.online) {
          io.to(newOwner.socketId).emit('room:promoted', { newOwner: room.owner });
        }
      }

      const result = rm.removeMember(roomId, socket.userId);

      // Notify remaining members
      if (result !== 'deleted') {
        for (const [uid, member] of room.members) {
          if (member.online && member.socketId) {
            io.to(member.socketId).emit('room:user-left', {
              userId: socket.userId,
              username: socket.username,
            });
          }
        }
      }
    });

    // ── room:close — Owner closes room ──
    socket.on('room:close', ({ roomId }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;
      if (room.owner !== socket.userId) {
        return socket.emit('error', { message: 'Only the owner can close the room.' });
      }

      // Notify all members
      for (const [uid, member] of room.members) {
        if (member.socketId && member.online) {
          io.to(member.socketId).emit('room:closed', { roomId });
        }
      }

      // Also notify pending users
      for (const [uid, pending] of room.pendingRequests) {
        if (pending.socketId) {
          io.to(pending.socketId).emit('room:denied', { roomId });
        }
      }

      rm.deleteRoom(roomId);
    });

    // ── room:promote — Set co-owner ──
    socket.on('room:promote', ({ roomId, targetUserId }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;
      if (room.owner !== socket.userId) {
        return socket.emit('error', { message: 'Only the owner can promote.' });
      }
      if (!room.members.has(targetUserId)) {
        return socket.emit('error', { message: 'User is not a member.' });
      }

      rm.setCoOwner(roomId, targetUserId);

      // Notify all members
      for (const [uid, member] of room.members) {
        if (member.online && member.socketId) {
          io.to(member.socketId).emit('room:promoted', { newCoOwner: targetUserId });
        }
      }
    });

    // ── room:approve-user — Approve pending join request ──
    socket.on('room:approve-user', ({ roomId, targetUserId }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;

      // Only owner or co-owner can approve
      if (room.owner !== socket.userId && room.coOwner !== socket.userId) {
        return socket.emit('error', { message: 'Not authorized to approve.' });
      }

      const approved = rm.approvePendingRequest(roomId, targetUserId);
      if (!approved) return;

      // Update the approved user's socket ID from our mapping
      const approvedSocketId = userToSocket.get(targetUserId);
      if (approvedSocketId) {
        rm.setMemberOnline(roomId, targetUserId, approvedSocketId, true);

        // Notify the approved user
        io.to(approvedSocketId).emit('room:approved', {
          roomId: room.id,
          roomName: room.name,
          roomCode: room.roomCode,
          members: rm.getMembersArray(roomId),
          isOwner: false,
          isCoOwner: false,
        });
      }

      // Notify existing members about new user
      for (const [uid, member] of room.members) {
        if (uid !== targetUserId && member.online && member.socketId) {
          io.to(member.socketId).emit('room:user-joined', {
            userId: targetUserId,
            username: approved.username,
            publicKey: approved.publicKey,
          });
        }
      }
    });

    // ── room:deny-user — Deny pending join request ──
    socket.on('room:deny-user', ({ roomId, targetUserId }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;

      if (room.owner !== socket.userId && room.coOwner !== socket.userId) {
        return socket.emit('error', { message: 'Not authorized to deny.' });
      }

      const denied = rm.denyPendingRequest(roomId, targetUserId);
      if (!denied) return;

      // Notify the denied user
      const deniedSocketId = userToSocket.get(targetUserId);
      if (deniedSocketId) {
        io.to(deniedSocketId).emit('room:denied', { roomId });
      }
    });

    // ── queue:flush — Flush offline message queue ──
    socket.on('queue:flush', ({ roomId }) => {
      const messages = rm.flushQueue(roomId, socket.userId);
      for (const msg of messages) {
        socket.emit('queue:message', msg);
      }
    });

    // ── Notify room owners about pending request (after REST join) ──
    socket.on('room:notify-pending', ({ roomId }) => {
      const room = rm.getRoom(roomId);
      if (!room) return;

      const pending = room.pendingRequests.get(socket.userId);
      if (!pending) return;

      // Update pending with current socket ID
      pending.socketId = socket.id;

      // Notify owner
      const ownerSocketId = userToSocket.get(room.owner);
      if (ownerSocketId) {
        io.to(ownerSocketId).emit('room:join-request', {
          roomId,
          userId: socket.userId,
          username: socket.username,
          publicKey: pending.publicKey,
        });
      }

      // Also notify co-owner
      if (room.coOwner) {
        const coOwnerSocketId = userToSocket.get(room.coOwner);
        if (coOwnerSocketId) {
          io.to(coOwnerSocketId).emit('room:join-request', {
            roomId,
            userId: socket.userId,
            username: socket.username,
            publicKey: pending.publicKey,
          });
        }
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${socket.username} (${socket.userId})`);
      socketToUser.delete(socket.id);
      userToSocket.delete(socket.userId);

      // Mark offline in all rooms (but keep as member for queue)
      const userRooms = rm.getUserRooms(socket.userId);
      for (const room of userRooms) {
        rm.setMemberOnline(room.id, socket.userId, null, false);

        // Notify other members
        for (const [uid, member] of room.members) {
          if (uid !== socket.userId && member.online && member.socketId) {
            io.to(member.socketId).emit('room:user-left', {
              userId: socket.userId,
              username: socket.username,
              offline: true, // distinguish from actual leave
            });
          }
        }
      }
    });
  });
}
