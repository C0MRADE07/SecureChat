import rateLimit from 'express-rate-limit';

// 100 requests per IP per hour — user registration (relaxed for testing)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Too many registration attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 50 per IP per hour — room creation (relaxed for testing)
export const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Too many rooms created. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 30 per IP per minute — room joining
export const joinRoomLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many join attempts. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 30 per IP per 15 minutes — admin login
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 100 per IP per minute — general
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});
