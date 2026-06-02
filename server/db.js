import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamic database configuration (Turso Cloud vs Local SQLite File)
const databaseUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'securechat.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || '';

const client = createClient({
  url: databaseUrl,
  authToken: authToken,
});

// ── Schema Initialization ──
export async function initDb() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      banned INTEGER DEFAULT 0,
      ban_reason TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      user_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ban_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      admin_note TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Seed default configurations on first-run
  const countRes = await client.execute("SELECT COUNT(*) as count FROM admin_config");
  const configCount = countRes.rows[0]?.count || 0;
  if (Number(configCount) === 0) {
    const defaultHash = bcrypt.hashSync('admin', 10);
    await client.execute({
      sql: "INSERT INTO admin_config (key, value) VALUES ('admin_password_hash', ?)",
      args: [defaultHash]
    });
    await client.execute({
      sql: "INSERT INTO admin_config (key, value) VALUES ('admin_totp_secret', '')",
      args: []
    });
    await client.execute({
      sql: "INSERT INTO admin_totp_enabled (key, value) VALUES ('admin_totp_enabled', '0')", // Typo in table name from original? Ah, no, let's fix to admin_config
      sql: "INSERT INTO admin_config (key, value) VALUES ('admin_totp_enabled', '0')",
      args: []
    });
  }
}

// ── Export Helpers ──
export async function getUser(uuid) {
  const res = await client.execute({
    sql: 'SELECT * FROM users WHERE uuid = ?',
    args: [uuid]
  });
  return res.rows[0];
}

export async function getUserByUsername(username) {
  const res = await client.execute({
    sql: 'SELECT * FROM users WHERE username = ? COLLATE NOCASE',
    args: [username]
  });
  return res.rows[0];
}

export async function createUser(uuid, username) {
  return await client.execute({
    sql: 'INSERT INTO users (uuid, username, created_at) VALUES (?, ?, ?)',
    args: [uuid, username, Date.now()]
  });
}

export async function banUser(uuid, reason, adminNote) {
  await client.execute({
    sql: 'UPDATE users SET banned = 1, ban_reason = ? WHERE uuid = ?',
    args: [reason, uuid]
  });
  await client.execute({
    sql: 'INSERT INTO ban_log (user_id, action, reason, admin_note, timestamp) VALUES (?, ?, ?, ?, ?)',
    args: [uuid, 'ban', reason, adminNote, Date.now()]
  });
}

export async function unbanUser(uuid, adminNote) {
  await client.execute({
    sql: 'UPDATE users SET banned = 0, ban_reason = NULL WHERE uuid = ?',
    args: [uuid]
  });
  await client.execute({
    sql: 'INSERT INTO ban_log (user_id, action, reason, admin_note, timestamp) VALUES (?, ?, ?, ?, ?)',
    args: [uuid, 'unban', null, adminNote, Date.now()]
  });
}

export async function renameUser(uuid, newUsername) {
  return await client.execute({
    sql: 'UPDATE users SET username = ? WHERE uuid = ?',
    args: [newUsername, uuid]
  });
}

export async function getAllUsers() {
  const res = await client.execute('SELECT * FROM users ORDER BY created_at DESC');
  return res.rows;
}

export async function getBanLog() {
  const res = await client.execute(`
    SELECT ban_log.*, users.username 
    FROM ban_log 
    LEFT JOIN users ON ban_log.user_id = users.uuid 
    ORDER BY ban_log.timestamp DESC
  `);
  return res.rows;
}

export async function savePushToken(userId, token) {
  return await client.execute({
    sql: 'INSERT OR REPLACE INTO push_tokens (user_id, token, updated_at) VALUES (?, ?, ?)',
    args: [userId, token, Date.now()]
  });
}

export async function getPushToken(userId) {
  const res = await client.execute({
    sql: 'SELECT token FROM push_tokens WHERE user_id = ?',
    args: [userId]
  });
  return res.rows[0] ? res.rows[0].token : null;
}

export async function getConfig(key) {
  const res = await client.execute({
    sql: 'SELECT value FROM admin_config WHERE key = ?',
    args: [key]
  });
  return res.rows[0] ? res.rows[0].value : null;
}

export async function setConfig(key, value) {
  return await client.execute({
    sql: 'INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)',
    args: [key, value]
  });
}

export default client;
