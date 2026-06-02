import { Router } from 'express';
import { savePushToken } from '../db.js';

const router = Router();

// POST /api/push/register — Store push notification token
router.post('/register', (req, res) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ error: 'userId and token are required.' });
    }
    savePushToken(userId, token);
    res.json({ success: true });
  } catch (err) {
    console.error('Push register error:', err);
    res.status(500).json({ error: 'Failed to register push token.' });
  }
});

export default router;
