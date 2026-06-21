const express = require('express');
const router = express.Router();
const { 
  signUp, 
  login, 
  refresh, 
  logout, 
  logoutAll, 
  getActiveSessions,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification
} = require('../controllers/auth.controller');
const rateLimit = require('../middlewares/rateLimit.middleware');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');

// Define validation schemas
const signupSchema = {
  fullName: { required: true, type: 'string', maxLength: 50 },
  email: { 
    required: true, 
    type: 'string', 
    pattern: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address.'
  },
  password: { required: true, type: 'string', minLength: 6 },
  username: { 
    required: true, 
    type: 'string', 
    pattern: /^[a-zA-Z0-9_]{3,30}$/,
    message: 'Username must be between 3 and 30 characters and can only contain letters, numbers, and underscores.'
  }
};

const loginSchema = {
  email: { required: true, type: 'string' },
  password: { required: true, type: 'string' }
};

const refreshSchema = {
  refreshToken: { required: false, type: 'string' }
};

const forgotPasswordSchema = {
  email: { 
    required: true, 
    type: 'string',
    pattern: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address.'
  }
};

const resetPasswordSchema = {
  password: { required: true, type: 'string', minLength: 8 }
};

// Create limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 30, // max 30 login/signup requests per 15 mins
  message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.'
});

// Create limiter for password recovery endpoints
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 5, // max 5 requests per 15 mins per IP
  message: 'Too many password recovery attempts. Please try again after 15 minutes.'
});

// Register endpoints
router.post('/signup', authLimiter, validate(signupSchema), signUp);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);
router.get('/sessions', protect, getActiveSessions);
router.post('/forgot-password', recoveryLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password/:token', recoveryLimiter, validate(resetPasswordSchema), resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

module.exports = router;
