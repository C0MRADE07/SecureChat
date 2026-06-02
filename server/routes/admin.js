import { Router } from 'express';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import os from 'os';
import { verifyAdmin, generateTokens, verifyRefreshToken } from '../middleware/auth.js';
import { adminLoginLimiter } from '../middleware/rateLimit.js';
import { getAllUsers, getUser, banUser, unbanUser, renameUser, getBanLog } from '../db.js';
import * as rm from '../roomManager.js';

const router = Router();

// Store for admin TOTP secret (in production, use env var)
let totpSecret = process.env.ADMIN_TOTP_SECRET || null;

// ── POST /api/admin/login ──
router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { password, totpCode, totp } = req.body;
    const code = totpCode || totp;

    if (!password || !code) {
      return res.status(400).json({ error: 'Password and TOTP code are required.' });
    }

    // Verify password
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminHash) {
      // Dev mode: accept 'admin' as password
      if (password !== 'admin') {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
    } else {
      const valid = await bcrypt.compare(password, adminHash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
    }

    // Verify TOTP
    if (totpSecret) {
      const verified = speakeasy.totp.verify({
        secret: totpSecret,
        encoding: 'base32',
        token: code,
        window: 1,
      });
      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code.' });
      }
    }
    // If no TOTP secret set (dev mode), skip TOTP verification

    const { accessToken, refreshToken } = generateTokens();

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ success: true, accessToken });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ── POST /api/admin/refresh ──
router.post('/refresh', (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token.' });
    }

    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const { accessToken, refreshToken } = generateTokens();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(401).json({ error: 'Refresh failed.' });
  }
});

// ── GET /api/admin/setup — First-run 2FA setup ──
router.get('/setup', (req, res) => {
  try {
    // Only allow if no TOTP secret is configured
    if (totpSecret) {
      return res.json({ configured: true });
    }

    const secret = speakeasy.generateSecret({
      name: 'SecureChat Admin',
      issuer: 'SecureChat',
    });

    // Store the secret
    totpSecret = secret.base32;

    QRCode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate QR code.' });
      }
      res.json({
        configured: false,
        secret: secret.base32,
        qrCode: dataUrl,
      });
    });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Setup failed.' });
  }
});

// ── POST /api/admin/setup/verify — Verify first-run 2FA ──
router.post('/setup/verify', (req, res) => {
  try {
    const { totp } = req.body;
    if (!totp) {
      return res.status(400).json({ error: 'Verification code is required.' });
    }

    if (!totpSecret) {
      return res.status(400).json({ error: 'TOTP setup not initialized. Request GET /setup first.' });
    }

    const verified = speakeasy.totp.verify({
      secret: totpSecret,
      encoding: 'base32',
      token: totp,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code. Please check your phone clock.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Setup verify error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ── GET /api/admin/users ──
router.get('/users', verifyAdmin, (req, res) => {
  try {
    const users = getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ── PUT /api/admin/users/:uuid/ban ──
router.put('/users/:uuid/ban', verifyAdmin, (req, res) => {
  try {
    const { uuid } = req.params;
    const { reason, adminNote } = req.body;

    const user = getUser(uuid);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    banUser(uuid, reason || 'No reason provided', adminNote || '');
    res.json({ success: true, message: `${user.username} has been banned.` });
  } catch (err) {
    console.error('Ban error:', err);
    res.status(500).json({ error: 'Ban failed.' });
  }
});

// ── PUT /api/admin/users/:uuid/unban ──
router.put('/users/:uuid/unban', verifyAdmin, (req, res) => {
  try {
    const { uuid } = req.params;
    const { adminNote } = req.body;

    const user = getUser(uuid);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    unbanUser(uuid, adminNote || '');
    res.json({ success: true, message: `${user.username} has been unbanned.` });
  } catch (err) {
    console.error('Unban error:', err);
    res.status(500).json({ error: 'Unban failed.' });
  }
});

// ── PUT /api/admin/users/:uuid/rename ──
router.put('/users/:uuid/rename', verifyAdmin, (req, res) => {
  try {
    const { uuid } = req.params;
    const { newUsername } = req.body;

    if (!newUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    const user = getUser(uuid);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    renameUser(uuid, newUsername);
    res.json({ success: true, message: `Renamed to ${newUsername}.` });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username already taken.' });
    }
    console.error('Rename error:', err);
    res.status(500).json({ error: 'Rename failed.' });
  }
});

// ── GET /api/admin/rooms ──
router.get('/rooms', verifyAdmin, (req, res) => {
  try {
    const rooms = rm.getAllRooms();
    res.json({ rooms });
  } catch (err) {
    console.error('Get rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// ── DELETE /api/admin/rooms/:id — Force-close room ──
router.delete('/rooms/:id', verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const room = rm.getRoom(id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    // io reference will be set by the main server file
    if (router.io) {
      // Notify all members
      for (const [uid, member] of room.members) {
        if (member.socketId && member.online) {
          router.io.to(member.socketId).emit('room:closed', { roomId: id });
        }
      }
    }

    rm.deleteRoom(id);
    res.json({ success: true, message: 'Room force-closed.' });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ error: 'Failed to close room.' });
  }
});

// ── POST /api/admin/broadcast ──
router.post('/broadcast', verifyAdmin, (req, res) => {
  try {
    const { roomIds, message } = req.body;

    if (!roomIds || !message) {
      return res.status(400).json({ error: 'roomIds and message are required.' });
    }

    if (router.io) {
      for (const roomId of roomIds) {
        const room = rm.getRoom(roomId);
        if (!room) continue;

        const systemPayload = {
          type: 'system',
          message,
          timestamp: Date.now(),
        };

        for (const [uid, member] of room.members) {
          if (member.socketId && member.online) {
            router.io.to(member.socketId).emit('room:message', {
              payload: systemPayload,
              senderId: '__SYSTEM__',
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    res.json({ success: true, message: 'Broadcast sent.' });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: 'Broadcast failed.' });
  }
});

// ── GET /api/admin/ban-log ──
router.get('/ban-log', verifyAdmin, (req, res) => {
  try {
    const log = getBanLog();
    res.json({ log });
  } catch (err) {
    console.error('Ban log error:', err);
    res.status(500).json({ error: 'Failed to fetch ban log.' });
  }
});

// ── GET /api/admin/stats ──
router.get('/stats', verifyAdmin, (req, res) => {
  try {
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, c) => acc + c.times.idle, 0);
    const totalTick = cpus.reduce((acc, c) => acc + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq, 0);
    const cpuPercent = Math.round((1 - totalIdle / totalTick) * 100);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    res.json({
      cpu: cpuPercent,
      ramUsed: Math.round(usedMem / 1024 / 1024), // MB
      ramTotal: Math.round(totalMem / 1024 / 1024), // MB
      uptime: Math.floor(process.uptime()),
      roomCount: rm.getRoomCount(),
      userCount: rm.getOnlineUserCount(),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

export default router;
