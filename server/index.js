import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import usersRouter from './routes/users.js';
import roomsRouter from './routes/rooms.js';
import adminRouter from './routes/admin.js';
import pushRouter from './routes/push.js';
import { generalLimiter } from './middleware/rateLimit.js';
import setupSocketHandlers from './socket/handlers.js';
import { getRoomCount, getOnlineUserCount } from './roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

// ── Socket.io ──
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
});

// ── Middleware ──
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for dev (CDN scripts)
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(generalLimiter);

// ── API Routes ──
app.use('/api/users', usersRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/push', pushRouter);

// Give admin routes access to io for broadcasting
adminRouter.io = io;

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    roomCount: getRoomCount(),
    userCount: getOnlineUserCount(),
  });
});

// ── Serve Static Files ──
// Admin dashboard (customizable path to protect against Gobuster/directory busting)
const adminPath = process.env.ADMIN_PATH || '/admin';
app.use(adminPath, express.static(path.join(__dirname, '..', 'admin')));
// Client app (default)
app.use(express.static(path.join(__dirname, '..', 'client')));
// SPA fallback — serve index.html for any non-API, non-file route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith(adminPath)) {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
  }
});

// ── Socket.io Handlers ──
setupSocketHandlers(io);

// ── Start Server ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║        🔐 SecureChat Server           ║');
  console.log('  ╠═══════════════════════════════════════╣');
  console.log(`  ║  Client:  http://localhost:${PORT}        ║`);
  console.log(`  ║  Admin:   http://localhost:${PORT}${adminPath.padEnd(6, ' ')}  ║`);
  console.log(`  ║  Health:  http://localhost:${PORT}/health ║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
});
