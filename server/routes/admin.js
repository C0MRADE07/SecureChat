import { Router } from 'express';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import os from 'os';
import { verifyAdmin, generateTokens, verifyRefreshToken } from '../middleware/auth.js';
import { adminLoginLimiter } from '../middleware/rateLimit.js';
import { getAllUsers, getUser, banUser, unbanUser, renameUser, getBanLog, getConfig, setConfig } from '../db.js';
import * as rm from '../roomManager.js';

const router = Router();

// ── POST /api/admin/login ──
router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { password, totpCode, totp } = req.body;
    const code = totpCode || totp;

    const dbPasswordHash = await getConfig('admin_password_hash');
    const totpEnabled = (await getConfig('admin_totp_enabled')) === '1';
    const dbTotpSecret = await getConfig('admin_totp_secret');

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    if (totpEnabled && !code) {
      return res.status(400).json({ error: 'TOTP code is required.' });
    }

    // Verify password
    let valid = false;
    if (dbPasswordHash) {
      valid = await bcrypt.compare(password, dbPasswordHash);
    } else {
      // Fallback to env or default 'admin'
      const adminEnvHash = process.env.ADMIN_PASSWORD_HASH;
      if (adminEnvHash) {
        valid = await bcrypt.compare(password, adminEnvHash);
      } else {
        valid = (password === 'admin');
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Verify TOTP
    if (totpEnabled && dbTotpSecret) {
      const verified = speakeasy.totp.verify({
        secret: dbTotpSecret,
        encoding: 'base32',
        token: code,
        window: 1,
      });
      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code.' });
      }
    }

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

// ── GET /api/admin/setup — Setup status & Dynamic 2FA check ──
router.get('/setup', async (req, res) => {
  try {
    const totpEnabled = (await getConfig('admin_totp_enabled')) === '1';
    res.json({
      configured: true,
      totpRequired: totpEnabled
    });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Setup failed.' });
  }
});

// ── POST /api/admin/setup/verify — Verify first-run 2FA (Legacy) ──
router.post('/setup/verify', (req, res) => {
  try {
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ── POST /api/admin/settings/password ──
router.post('/settings/password', verifyAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const currentHash = await getConfig('admin_password_hash');
    let valid = false;
    if (currentHash) {
      valid = await bcrypt.compare(currentPassword, currentHash);
    } else {
      const adminEnvHash = process.env.ADMIN_PASSWORD_HASH;
      if (adminEnvHash) {
        valid = await bcrypt.compare(currentPassword, adminEnvHash);
      } else {
        valid = (currentPassword === 'admin');
      }
    }

    if (!valid) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    if (newPassword.length < 5) {
      return res.status(400).json({ error: 'New password must be at least 5 characters long.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await setConfig('admin_password_hash', newHash);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ── GET /api/admin/settings/2fa/setup ──
router.get('/settings/2fa/setup', verifyAdmin, (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: 'SecureChat Admin',
      issuer: 'SecureChat',
    });

    QRCode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate QR code.' });
      }
      res.json({
        secret: secret.base32,
        qrCode: dataUrl,
      });
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to initialize 2FA setup.' });
  }
});

// ── POST /api/admin/settings/2fa/enable ──
router.post('/settings/2fa/enable', verifyAdmin, async (req, res) => {
  try {
    const { secret, totpCode } = req.body;
    if (!secret || !totpCode) {
      return res.status(400).json({ error: 'Secret and verification code are required.' });
    }

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code. Please check your authenticator app.' });
    }

    await setConfig('admin_totp_secret', secret);
    await setConfig('admin_totp_enabled', '1');
    res.json({ success: true, message: '2FA enabled successfully.' });
  } catch (err) {
    console.error('2FA enable error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA.' });
  }
});

// ── POST /api/admin/settings/2fa/disable ──
router.post('/settings/2fa/disable', verifyAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable 2FA.' });
    }

    const currentHash = await getConfig('admin_password_hash');
    let valid = false;
    if (currentHash) {
      valid = await bcrypt.compare(password, currentHash);
    } else {
      const adminEnvHash = process.env.ADMIN_PASSWORD_HASH;
      if (adminEnvHash) {
        valid = await bcrypt.compare(password, adminEnvHash);
      } else {
        valid = (password === 'admin');
      }
    }

    if (!valid) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }

    await setConfig('admin_totp_enabled', '0');
    res.json({ success: true, message: '2FA disabled successfully.' });
  } catch (err) {
    console.error('2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
});

// ── GET /api/admin/users ──
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ── PUT /api/admin/users/:uuid/ban ──
router.put('/users/:uuid/ban', verifyAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { reason, adminNote } = req.body;

    const user = await getUser(uuid);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await banUser(uuid, reason || 'No reason provided', adminNote || '');

    // Disconnect user's active sockets immediately
    const io = router.io;
    if (io) {
      for (const [id, socket] of io.sockets.sockets) {
        if (socket.userId === uuid) {
          socket.emit('server:banned', { reason: reason || 'No reason provided' });
          socket.disconnect(true);
        }
      }
    }

    // Clean up room members/pending requests and notify room members
    rm.cleanupBannedUser(uuid, io);

    res.json({ success: true, message: `${user.username} has been banned.` });
  } catch (err) {
    console.error('Ban error:', err);
    res.status(500).json({ error: 'Ban failed.' });
  }
});

// ── PUT /api/admin/users/:uuid/unban ──
router.put('/users/:uuid/unban', verifyAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { adminNote } = req.body;

    const user = await getUser(uuid);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await unbanUser(uuid, adminNote || '');
    res.json({ success: true, message: `${user.username} has been unbanned.` });
  } catch (err) {
    console.error('Unban error:', err);
    res.status(500).json({ error: 'Unban failed.' });
  }
});

// ── PUT /api/admin/users/:uuid/rename ──
router.put('/users/:uuid/rename', verifyAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const newUsername = req.body.newUsername || req.body.username;

    if (!newUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    const user = await getUser(uuid);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await renameUser(uuid, newUsername);
    res.json({ success: true, message: `Renamed to ${newUsername}.` });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
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
router.get('/ban-log', verifyAdmin, async (req, res) => {
  try {
    const log = await getBanLog();
    res.json({ logs: log, log });
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
