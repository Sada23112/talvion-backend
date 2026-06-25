const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user.model');
const UserSession = require('../models/userSession.model');
const connectDB = require('../config/db');
const { mockUserRepo, mockUserSessionRepo } = require('../models/mock.db');

// Helper to choose the right session repo
const getSessionRepo = () => {
  return connectDB.isDbOffline() ? mockUserSessionRepo : UserSession;
};

// Generate SHA256 hash of a string
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Parse User-Agent for device information
const parseUserAgent = (userAgentString) => {
  let deviceName = 'Unknown Device';
  let deviceType = 'Unknown';

  if (!userAgentString) return { deviceName, deviceType };

  const ua = userAgentString.toLowerCase();

  if (ua.includes('ipad')) {
    deviceType = 'Tablet';
    deviceName = 'iPad';
  } else if (ua.includes('iphone')) {
    deviceType = 'Mobile';
    deviceName = 'iPhone';
  } else if (ua.includes('android')) {
    deviceType = 'Mobile';
    deviceName = 'Android Device';
    if (ua.includes('tablet')) {
      deviceType = 'Tablet';
    }
  } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
    deviceType = 'Desktop';
    deviceName = 'Macintosh';
  } else if (ua.includes('windows')) {
    deviceType = 'Desktop';
    deviceName = 'Windows PC';
  } else if (ua.includes('linux')) {
    deviceType = 'Desktop';
    deviceName = 'Linux PC';
  }

  if (ua.includes('dart') || ua.includes('flutter')) {
    deviceName = 'Talvion Mobile App';
    deviceType = 'Mobile';
  }

  return { deviceName, deviceType };
};

// Create access and refresh tokens and save user session
const createUserSession = async (user, req) => {
  const userAgent = req.headers['user-agent'] || '';
  const parsedUA = parseUserAgent(userAgent);
  
  const deviceName = req.headers['x-device-name'] || parsedUA.deviceName;
  const deviceType = req.headers['x-device-type'] || parsedUA.deviceType;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '';
  const location = req.headers['x-login-location'] || 'Unknown Location';

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const refreshTokenHash = hashToken(refreshToken);
  
  // 30 days expiration
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const sessionRepo = getSessionRepo();
  const session = await sessionRepo.create({
    user: user._id,
    refreshTokenHash,
    deviceName,
    deviceType,
    ipAddress,
    location,
    expiresAt
  });

  const secret = process.env.JWT_SECRET || 'fallback_secret_talvion_key';
  // Access token includes user ID and session ID, expires based on environment setting or defaults to 7 days
  const accessToken = jwt.sign(
    { id: user._id, sessionId: session._id },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/signup
 * @access  Public
 */
const signUp = async (req, res, next) => {
  try {
    const { fullName, email, password, username, artistName, dateOfBirth } = req.body;

    // 1. Basic field presence checks
    if (!fullName || !email || !password || !username || !artistName || !dateOfBirth) {
      const error = new Error('Please fill in all required fields (fullName, email, password, username, artistName, dateOfBirth)');
      error.statusCode = 400;
      return next(error);
    }

    if (password.length < 6) {
      const error = new Error('Password must be at least 6 characters long');
      error.statusCode = 400;
      return next(error);
    }

    // 2. Email & Username uniqueness checks
    const existingUser = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({ email })
      : await User.findOne({ email });
    if (existingUser) {
      const error = new Error('Email address is already registered');
      error.statusCode = 400;
      return next(error);
    }

    const usernameLower = username.trim().toLowerCase();
    // Enforce URL-friendly alphanumeric / no-spaces format matching updateProfile
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(usernameLower)) {
      const error = new Error('Username must be between 3 and 30 characters and can only contain letters, numbers, and underscores');
      error.statusCode = 400;
      return next(error);
    }

    const existingUsername = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({ username: usernameLower })
      : await User.findOne({ username: usernameLower });
    if (existingUsername) {
      const error = new Error('Username is already taken');
      error.statusCode = 400;
      return next(error);
    }

    // 3. Create new user
    const user = connectDB.isDbOffline()
      ? await mockUserRepo.create({ fullName, email, password, username: usernameLower, artistName, dateOfBirth })
      : await User.create({
          fullName,
          email,
          password,
          username: usernameLower,
          artistName,
          dateOfBirth
        });

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = hashToken(verificationToken);
    
    user.emailVerificationToken = hashedVerificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Send verification email
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${verificationToken}`;
    const verificationMessage = `Welcome to Talvion! Please verify your email address by clicking the link below:\n\nVerification Link:\n${verificationUrl}\n\nThis link is valid for 24 hours.`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Verify your Talvion Email Address',
        message: verificationMessage
      });
    } catch (err) {
      const logger = require('../config/logger');
      logger.error('Failed to send verification email on signup', err);
    }

    // 4. Create session and generate tokens
    const { accessToken, refreshToken } = await createUserSession(user, req);

    // 5. Send structured response (omit password)
    res.status(201).json({
      status: 'success',
      message: 'User registered successfully. A verification link has been sent to your email.',
      accessToken,
      token: accessToken, // backward compatibility
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        bio: user.bio,
        location: user.location,
        category: user.category,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        totalStars: user.totalStars,
        walletBalance: user.walletBalance,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Basic field presence checks
    if (!email || !password) {
      const error = new Error('Please provide email and password');
      error.statusCode = 400;
      return next(error);
    }

    // 2. Fetch user (explicitly request password field)
    const user = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({ email })
      : await User.findOne({ email }).select('+password');
    if (!user) {
      const error = new Error('Invalid email or password credentials');
      error.statusCode = 401;
      return next(error);
    }

    // 3. Check password match
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const error = new Error('Invalid email or password credentials');
      error.statusCode = 401;
      return next(error);
    }

    // 4. Create session and generate tokens
    const { accessToken, refreshToken } = await createUserSession(user, req);

    // If administrative user, log audit
    if (['support_staff', 'moderator', 'admin', 'super_admin'].includes(user.role)) {
      const { logAdminAction } = require('../services/admin.service');
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
      await logAdminAction({
        adminId: user._id || user.id,
        actionType: 'login',
        targetModel: 'User',
        targetId: user._id || user.id,
        description: `Administrator @${user.username} logged in successfully.`,
        ipAddress
      });
    }

    // 5. Return success payload
    res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      accessToken,
      token: accessToken, // backward compatibility
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        bio: user.bio,
        location: user.location,
        category: user.category,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        totalStars: user.totalStars,
        walletBalance: user.walletBalance,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Rotate access & refresh tokens
 * @route   POST /api/v1/auth/refresh
 * @access  Public
 */
const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'] || req.cookies?.refreshToken;
    
    if (!refreshToken) {
      const error = new Error('Refresh token is required');
      error.statusCode = 400;
      return next(error);
    }

    const hash = hashToken(refreshToken);
    const sessionRepo = getSessionRepo();

    // Find active session
    const session = await sessionRepo.findOne({ refreshTokenHash: hash, isRevoked: false });

    if (!session) {
      // Refresh Token Rotation (RTR) reuse check
      const compromisedSession = await sessionRepo.findOne({ oldTokenHashes: hash });
      if (compromisedSession) {
        // Revoke all sessions for this user for security
        await sessionRepo.updateMany(
          { user: compromisedSession.user },
          { isRevoked: true }
        );
        const error = new Error('Compromised refresh token used. All sessions revoked for security.');
        error.statusCode = 403;
        return next(error);
      }

      const error = new Error('Invalid or expired refresh token');
      error.statusCode = 401;
      return next(error);
    }

    // Check expiration
    if (session.expiresAt && session.expiresAt < new Date()) {
      session.isRevoked = true;
      await session.save();
      const error = new Error('Refresh token has expired');
      error.statusCode = 401;
      return next(error);
    }

    // Generate new rotated refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const newHash = hashToken(newRefreshToken);

    if (!session.oldTokenHashes) {
      session.oldTokenHashes = [];
    }
    session.oldTokenHashes.push(session.refreshTokenHash);
    session.refreshTokenHash = newHash;
    session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Extend 30 days
    session.lastActive = new Date();
    await session.save();

    // Generate new short-lived access token
    const secret = process.env.JWT_SECRET || 'fallback_secret_talvion_key';
    const accessToken = jwt.sign(
      { id: session.user, sessionId: session._id },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(200).json({
      status: 'success',
      accessToken,
      token: accessToken, // backward compatibility
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Revoke current user session
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    const sessionId = req.userSessionId;
    if (!sessionId) {
      const error = new Error('No active session found to logout');
      error.statusCode = 400;
      return next(error);
    }

    const sessionRepo = getSessionRepo();
    const session = await sessionRepo.findById(sessionId);
    if (session) {
      session.isRevoked = true;
      await session.save();
    }

    // If administrative user, log audit
    if (req.user && ['support_staff', 'moderator', 'admin', 'super_admin'].includes(req.user.role)) {
      const { logAdminAction } = require('../services/admin.service');
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
      await logAdminAction({
        adminId: req.user._id || req.user.id,
        actionType: 'logout',
        targetModel: 'User',
        targetId: req.user._id || req.user.id,
        description: `Administrator @${req.user.username} logged out successfully.`,
        ipAddress
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully from current device'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Revoke all sessions for authenticated user
 * @route   POST /api/v1/auth/logout-all
 * @access  Private
 */
const logoutAll = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const sessionRepo = getSessionRepo();

    // Invalidate all active sessions for the user
    await sessionRepo.updateMany(
      { user: userId, isRevoked: false },
      { isRevoked: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully from all devices'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Revoke a specific session for authenticated user
 * @route   DELETE /api/v1/auth/sessions/:sessionId
 * @access  Private
 */
const revokeSession = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;
    const sessionRepo = getSessionRepo();

    const session = await sessionRepo.findOne({ _id: sessionId, user: userId });
    
    if (!session) {
      const error = new Error('Session not found');
      error.statusCode = 404;
      return next(error);
    }

    if (session.isRevoked) {
      return res.status(200).json({
        status: 'success',
        message: 'Session is already revoked'
      });
    }

    session.isRevoked = true;
    await session.save();

    res.status(200).json({
      status: 'success',
      message: 'Session revoked successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get active sessions for user
 * @route   GET /api/v1/auth/sessions
 * @access  Private
 */
const getActiveSessions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const currentSessionId = req.userSessionId ? req.userSessionId.toString() : null;
    const sessionRepo = getSessionRepo();

    const sessions = await sessionRepo.find({ user: userId, isRevoked: false });

    const activeSessions = sessions.map(s => ({
      id: s._id,
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      ipAddress: s.ipAddress,
      location: s.location,
      lastActive: s.lastActive,
      isCurrent: currentSessionId ? s._id.toString() === currentSessionId : false
    }));

    res.status(200).json({
      status: 'success',
      results: activeSessions.length,
      sessions: activeSessions
    });
  } catch (error) {
    next(error);
  }
};

const sendEmail = require('../utils/email');

/**
 * @desc    Forgot Password - request password reset link
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      const error = new Error('Please provide email address');
      error.statusCode = 400;
      return next(error);
    }

    // Query user
    const user = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({ email })
      : await User.findOne({ email });

    // Success response should be identical to protect against email enumeration attacks
    const successResponse = {
      status: 'success',
      message: 'If a matching user account is registered, a password reset email has been sent.'
    };

    if (!user) {
      return res.status(200).json(successResponse);
    }

    // Generate token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = hashToken(resetToken);

    // Save hashed token and expiry to user document
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // Construct reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/reset-password/${resetToken}`;
    
    // Email body
    const message = `Forgot your password? Please use the link below to reset it. This link is valid for 15 minutes only.\n\nReset Link:\n${resetUrl}\n\nIf you did not make this request, please ignore this email.`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Talvion Password Reset Request (Valid for 15 minutes)',
        message
      });

      return res.status(200).json(successResponse);
    } catch (err) {
      // Clear fields if email sending fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      const error = new Error('There was an error sending the email. Please try again later.');
      error.statusCode = 500;
      return next(error);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset Password using token
 * @route   POST /api/v1/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      const error = new Error('Please provide a new password');
      error.statusCode = 400;
      return next(error);
    }

    // OWASP Strength validation: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordStrengthRegex.test(password)) {
      const error = new Error('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.');
      error.statusCode = 400;
      return next(error);
    }

    const hashedToken = hashToken(req.params.token);
    const user = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({
          passwordResetToken: hashedToken,
          passwordResetExpires: { $gt: Date.now() }
        })
      : await User.findOne({
          passwordResetToken: hashedToken,
          passwordResetExpires: { $gt: Date.now() }
        });

    if (!user) {
      const error = new Error('Token is invalid or has expired');
      error.statusCode = 400;
      return next(error);
    }

    // Set new password (pre-save hook hashes it)
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Revoke all active sessions of this user for security
    const sessionRepo = getSessionRepo();
    await sessionRepo.updateMany(
      { user: user._id, isRevoked: false },
      { isRevoked: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Password reset successfully. All active sessions have been revoked. Please log in with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify user email
 * @route   GET/POST /api/v1/auth/verify-email/:token
 * @access  Public
 */
const verifyEmail = async (req, res, next) => {
  try {
    const hashedToken = hashToken(req.params.token);
    const user = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({
          emailVerificationToken: hashedToken,
          emailVerificationExpires: { $gt: Date.now() }
        })
      : await User.findOne({
          emailVerificationToken: hashedToken,
          emailVerificationExpires: { $gt: Date.now() }
        });

    if (!user) {
      const error = new Error('Verification token is invalid or has expired.');
      error.statusCode = 400;
      return next(error);
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Email address verified successfully! You now have access to all protected features.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend email verification token
 * @route   POST /api/v1/auth/resend-verification
 * @access  Public
 */
const resendVerification = async (req, res, next) => {
  try {
    const email = req.body.email || req.user?.email;

    if (!email) {
      const error = new Error('Please provide email address');
      error.statusCode = 400;
      return next(error);
    }

    const user = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({ email })
      : await User.findOne({ email });

    // Return generic success to protect against email enumeration
    const genericSuccess = {
      status: 'success',
      message: 'If a matching user account is registered and unverified, a verification email has been sent.'
    };

    if (!user) {
      return res.status(200).json(genericSuccess);
    }

    if (user.emailVerified) {
      const error = new Error('This email address is already verified.');
      error.statusCode = 400;
      return next(error);
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = hashToken(verificationToken);

    user.emailVerificationToken = hashedVerificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${verificationToken}`;
    const verificationMessage = `Please verify your email address by clicking the link below:\n\nVerification Link:\n${verificationUrl}\n\nThis link is valid for 24 hours.`;

    await sendEmail({
      email: user.email,
      subject: 'Verify your Talvion Email Address',
      message: verificationMessage
    });

    res.status(200).json({
      status: 'success',
      message: 'A fresh verification email has been sent successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Render Reset Password HTML Page
 * @route   GET /api/v1/auth/reset-password/:token
 * @access  Public
 */
const getResetPasswordPage = async (req, res, next) => {
  try {
    const hashedToken = hashToken(req.params.token);
    const user = connectDB.isDbOffline()
      ? await mockUserRepo.findOne({
          passwordResetToken: hashedToken,
          passwordResetExpires: { $gt: Date.now() }
        })
      : await User.findOne({
          passwordResetToken: hashedToken,
          passwordResetExpires: { $gt: Date.now() }
        });

    if (!user) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Token - Talvion</title>
          <style>
            body { background: #1a1515; color: #f5ede4; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: #2c2222; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
            h1 { color: #d38e8e; font-size: 24px; margin-bottom: 16px; }
            p { font-size: 16px; color: #a67c6b; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Link Expired or Invalid</h1>
            <p>The password reset link is invalid or has expired. Please request a new link from the app.</p>
          </div>
        </body>
        </html>
      `);
    }

    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reset Password - Talvion</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { background: #1a1515; color: #f5ede4; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .card { background: #2c2222; padding: 40px; border-radius: 20px; width: 100%; max-width: 400px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); box-sizing: border-box; }
          h1 { color: #d38e8e; font-size: 26px; margin: 0 0 8px 0; text-align: center; }
          p.subtitle { text-align: center; color: #a67c6b; font-size: 14px; margin: 0 0 28px 0; }
          .form-group { margin-bottom: 20px; }
          label { display: block; font-size: 13px; color: #a67c6b; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          input { width: 100%; padding: 14px; background: #3d2f2f; border: 1px solid #4d3d3d; border-radius: 10px; color: #f5ede4; font-size: 16px; outline: none; box-sizing: border-box; transition: border-color 0.2s; }
          input:focus { border-color: #d38e8e; }
          .btn { width: 100%; padding: 16px; background: #d38e8e; border: none; border-radius: 12px; color: #1a1515; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.2s; margin-top: 10px; }
          .btn:hover { background: #e59f9f; }
          .error-msg { color: #ff7878; font-size: 13px; margin-top: 8px; display: none; }
          .success-container { display: none; text-align: center; }
          .success-container h1 { color: #8ec899; }
          .success-container p { color: #a67c6b; }
        </style>
      </head>
      <body>
        <div class="card">
          <div id="resetFormContainer">
            <h1>Reset Password</h1>
            <p class="subtitle">Enter your new password below</p>
            <form id="resetForm">
              <div class="form-group">
                <label for="password">New Password</label>
                <input type="password" id="password" required placeholder="Minimum 8 characters">
                <div id="strengthError" class="error-msg">Password must be at least 8 characters and contain uppercase, lowercase, a number, and a special character.</div>
              </div>
              <div class="form-group">
                <label for="confirmPassword">Confirm Password</label>
                <input type="password" id="confirmPassword" required placeholder="Re-enter new password">
                <div id="matchError" class="error-msg">Passwords do not match.</div>
              </div>
              <div id="generalError" class="error-msg"></div>
              <button type="submit" class="btn">Reset Password</button>
            </form>
          </div>
          
          <div id="successContainer" class="success-container">
            <h1>Success!</h1>
            <p>Your password has been successfully reset. You can now log in with your new password in the Talvion app.</p>
          </div>
        </div>

        <script>
          const form = document.getElementById('resetForm');
          const passwordInput = document.getElementById('password');
          const confirmPasswordInput = document.getElementById('confirmPassword');
          const strengthError = document.getElementById('strengthError');
          const matchError = document.getElementById('matchError');
          const generalError = document.getElementById('generalError');
          const resetFormContainer = document.getElementById('resetFormContainer');
          const successContainer = document.getElementById('successContainer');

          const strengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$/;

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Reset errors
            strengthError.style.display = 'none';
            matchError.style.display = 'none';
            generalError.style.display = 'none';

            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // Validate
            if (!strengthRegex.test(password)) {
              strengthError.style.display = 'block';
              return;
            }

            if (password !== confirmPassword) {
              matchError.style.display = 'block';
              return;
            }

            try {
              const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
              });

              const data = await response.json();

              if (response.ok) {
                resetFormContainer.style.display = 'none';
                successContainer.style.display = 'block';
              } else {
                generalError.textContent = data.message || 'Something went wrong. Please try again.';
                generalError.style.display = 'block';
              }
            } catch (err) {
              generalError.textContent = 'Failed to connect to server. Please try again.';
              generalError.style.display = 'block';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
};

const verifyGoogleToken = async (idToken) => {
  // If offline or mock token, return mock payload
  if (idToken.startsWith('mock_google_id_token_') || connectDB.isDbOffline()) {
    const mockEmail = idToken.replace('mock_google_id_token_', '');
    let email = `${mockEmail}@example.com`;
    let name = mockEmail.charAt(0).toUpperCase() + mockEmail.slice(1) + ' Google';
    let sub = `google-mock-id-${mockEmail}`;
    let picture = '';
    
    // Customize details based on known mock accounts
    if (mockEmail === 'meera') {
      email = 'meera@example.com';
      name = 'Meera Iyer';
      sub = 'mock-user-admin';
    } else if (mockEmail === 'riya') {
      email = 'riya@example.com';
      name = 'Riya Sen';
      sub = 'mock-user-1';
    } else if (mockEmail === 'new') {
      email = 'new_google_user@gmail.com';
      name = 'Test Google User';
      sub = 'google-mock-id-new';
    }

    return {
      sub,
      email,
      name,
      picture,
      isMock: true
    };
  }

  // Real Google token verification
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const oAuthClient = new OAuth2Client(clientId);
  
  const ticket = await oAuthClient.verifyIdToken({
    idToken,
    ...(clientId && { audience: clientId })
  });
  
  return ticket.getPayload();
};

const googleSignIn = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      const error = new Error('Google ID token is required');
      error.statusCode = 400;
      return next(error);
    }

    const payload = await verifyGoogleToken(idToken);
    const { sub: googleId, email, name: fullName, picture: avatarUrl } = payload;

    if (!email) {
      const error = new Error('Email is not associated with this Google account');
      error.statusCode = 400;
      return next(error);
    }

    // Check if user exists by googleId or email
    let user;
    const isOffline = connectDB.isDbOffline();
    const { mockUsers } = require('../models/mock.db');

    if (isOffline) {
      const rawUser = mockUsers.find(u => u.googleId === googleId || u.email === email.toLowerCase().trim());
      user = rawUser ? mockUserRepo._wrapUser(rawUser) : null;
    } else {
      user = await User.findOne({
        $or: [{ googleId }, { email: email.toLowerCase().trim() }]
      });
    }

    if (user) {
      // User exists. Ensure googleId is saved if logging in with Google for first time
      let updated = false;
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      if (user.authProvider !== 'google') {
        user.authProvider = 'google';
        updated = true;
      }
      if (avatarUrl && !user.avatarUrl) {
        user.avatarUrl = avatarUrl;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    } else {
      // User does not exist. Register them.
      // Generate a unique username based on full name or email prefix
      const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
      let baseUsername = emailPrefix.slice(0, 15).toLowerCase();
      if (baseUsername.length < 3) baseUsername = 'user_' + baseUsername;
      
      let username = baseUsername;
      let counter = 1;
      let usernameExists = true;

      while (usernameExists) {
        if (isOffline) {
          usernameExists = mockUsers.some(u => u.username === username);
        } else {
          usernameExists = await User.exists({ username });
        }
        if (usernameExists) {
          username = `${baseUsername}_${counter}`;
          counter++;
        }
      }

      // Create new user
      const userData = {
        fullName,
        email: email.toLowerCase().trim(),
        username,
        googleId,
        authProvider: 'google',
        avatarUrl: avatarUrl || '',
        profileImage: avatarUrl || '',
        category: 'Personal',
        emailVerified: true,
        emailVerifiedAt: new Date()
      };

      if (isOffline) {
        user = await mockUserRepo.create(userData);
      } else {
        user = await User.create(userData);
      }
    }

    // Create session and tokens
    const { accessToken, refreshToken } = await createUserSession(user, req);

    res.status(200).json({
      status: 'success',
      message: 'Google authentication successful',
      accessToken,
      token: accessToken, // backward compatibility
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        bio: user.bio,
        location: user.location,
        category: user.category,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        totalStars: user.totalStars,
        walletBalance: user.walletBalance,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  signUp,
  googleSignIn,
  login,
  refresh,
  logout,
  logoutAll,
  revokeSession,
  getActiveSessions,
  hashToken,
  createUserSession,
  forgotPassword,
  resetPassword,
  getResetPasswordPage,
  verifyEmail,
  resendVerification
};
