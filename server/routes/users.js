import { Router } from 'express';
import { getUser, getUserByUsername, createUser } from '../db.js';
import { registerLimiter } from '../middleware/rateLimit.js';

const router = Router();

// POST /api/users/register — Register username + UUID
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { uuid, username } = req.body;

    if (!uuid || !username) {
      return res.status(400).json({ error: 'UUID and username are required.' });
    }

    // Validate username: 3-20 chars, alphanumeric + underscores
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters.' });
    }

    // Check if UUID already registered
    const existingUser = await getUser(uuid);
    if (existingUser) {
      return res.status(409).json({ error: 'This device is already registered.', username: existingUser.username });
    }

    // Check if username is taken
    const nameTaken = await getUserByUsername(username);
    if (nameTaken) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    await createUser(uuid, username);
    res.json({ success: true, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// GET /api/users/check/:username — Check if username is available
router.get('/check/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const existing = await getUserByUsername(username);
    res.json({ available: !existing });
  } catch (err) {
    console.error('Check username error:', err);
    res.status(500).json({ error: 'Check failed.' });
  }
});

export default router;
