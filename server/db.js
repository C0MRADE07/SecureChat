import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'securechat.db'));

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL');

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_tokens (
    user_id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ban_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    admin_note TEXT,
    timestamp INTEGER NOT NULL
  );
`);

// ── Prepared Statements ──
const stmts = {
  getUser: db.prepare('SELECT * FROM users WHERE uuid = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  createUser: db.prepare('INSERT INTO users (uuid, username, created_at) VALUES (?, ?, ?)'),
  banUser: db.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE uuid = ?'),
  unbanUser: db.prepare('UPDATE users SET banned = 0, ban_reason = NULL WHERE uuid = ?'),
  renameUser: db.prepare('UPDATE users SET username = ? WHERE uuid = ?'),
  getAllUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC'),
  addBanLog: db.prepare('INSERT INTO ban_log (user_id, action, reason, admin_note, timestamp) VALUES (?, ?, ?, ?, ?)'),
  getBanLog: db.prepare(`
    SELECT ban_log.*, users.username 
    FROM ban_log 
    LEFT JOIN users ON ban_log.user_id = users.uuid 
    ORDER BY ban_log.timestamp DESC
  `),
  savePushToken: db.prepare('INSERT OR REPLACE INTO push_tokens (user_id, token, updated_at) VALUES (?, ?, ?)'),
  getPushToken: db.prepare('SELECT token FROM push_tokens WHERE user_id = ?'),
};

// ── Export Helpers ──
export function getUser(uuid) {
  return stmts.getUser.get(uuid);
}

export function getUserByUsername(username) {
  return stmts.getUserByUsername.get(username);
}

export function createUser(uuid, username) {
  return stmts.createUser.run(uuid, username, Date.now());
}

export function banUser(uuid, reason, adminNote) {
  stmts.banUser.run(reason, uuid);
  stmts.addBanLog.run(uuid, 'ban', reason, adminNote, Date.now());
}

export function unbanUser(uuid, adminNote) {
  stmts.unbanUser.run(uuid);
  stmts.addBanLog.run(uuid, 'unban', null, adminNote, Date.now());
}

export function renameUser(uuid, newUsername) {
  return stmts.renameUser.run(newUsername, uuid);
}

export function getAllUsers() {
  return stmts.getAllUsers.all();
}

export function getBanLog() {
  return stmts.getBanLog.all();
}

export function savePushToken(userId, token) {
  return stmts.savePushToken.run(userId, token, Date.now());
}

export function getPushToken(userId) {
  const row = stmts.getPushToken.get(userId);
  return row ? row.token : null;
}

export default db;
