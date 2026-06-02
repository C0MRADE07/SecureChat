import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'dev-refresh-secret-change-in-production';

// ── Generate Token Pair ──
export function generateTokens() {
  const accessToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ role: 'admin' }, REFRESH_SECRET, { expiresIn: '24h' });
  return { accessToken, refreshToken };
}

// ── Verify Admin Middleware ──
export function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Verify Refresh Token ──
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch {
    return null;
  }
}
