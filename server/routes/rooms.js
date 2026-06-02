import { Router } from 'express';
import { getUser } from '../db.js';
import * as rm from '../roomManager.js';
import { createRoomLimiter, joinRoomLimiter } from '../middleware/rateLimit.js';

const router = Router();

// POST /api/rooms/create — Create a new room
router.post('/create', createRoomLimiter, async (req, res) => {
  try {
    const { userId, name, passwordHash, publicKey } = req.body;

    if (!userId || !name || !passwordHash) {
      return res.status(400).json({ error: 'userId, name, and passwordHash are required.' });
    }

    // Validate room name
    if (name.length < 1 || name.length > 50) {
      return res.status(400).json({ error: 'Room name must be 1-50 characters.' });
    }

    // Verify user exists and not banned
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.banned) return res.status(403).json({ error: 'You are banned.' });

    const room = rm.createRoom(name, passwordHash, userId, user.username, publicKey || '', '');
    
    // Broadcast notification to all active admin sockets
    const io = router.io;
    if (io) {
      for (const [id, socket] of io.sockets.sockets) {
        if (socket.isAdmin) {
          socket.emit('admin:room-created', {
            id: room.id,
            name: room.name,
            code: room.roomCode,
            ownerUsername: user.username,
            createdAt: room.createdAt,
          });
        }
      }
    }
    
    res.json({
      success: true,
      roomId: room.id,
      roomCode: room.roomCode,
      roomName: room.name,
    });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Failed to create room.' });
  }
});

// POST /api/rooms/join — Request to join a room
router.post('/join', joinRoomLimiter, async (req, res) => {
  try {
    const { userId, roomCode, passwordHash, publicKey } = req.body;

    if (!userId || !roomCode || !passwordHash) {
      return res.status(400).json({ error: 'userId, roomCode, and passwordHash are required.' });
    }

    // Verify user
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.banned) return res.status(403).json({ error: 'You are banned.' });

    // Find room by code
    const room = rm.getRoomByCode(roomCode);
    if (!room || room.passwordHash !== passwordHash) {
      return res.status(403).json({ error: 'Invalid room code or password.' });
    }

    // Check if already a member
    if (room.members.has(userId)) {
      return res.json({
        success: true,
        status: 'already_member',
        roomId: room.id,
        roomName: room.name,
      });
    }

    // Check if already pending
    if (room.pendingRequests.has(userId)) {
      return res.json({
        success: true,
        status: 'pending',
        roomId: room.id,
        roomName: room.name,
      });
    }

    // Add to pending requests — owner must approve
    rm.addPendingRequest(room.id, userId, user.username, '', publicKey || '');

    res.json({
      success: true,
      status: 'pending',
      roomId: room.id,
      roomName: room.name,
    });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Failed to join room.' });
  }
});

// GET /api/rooms/:id/keys — Get all members' public keys
router.get('/:id/keys', (req, res) => {
  try {
    const { id } = req.params;
    const room = rm.getRoom(id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const members = rm.getEncryptionKeys(id);
    res.json({ members });
  } catch (err) {
    console.error('Get keys error:', err);
    res.status(500).json({ error: 'Failed to get keys.' });
  }
});

export default router;
