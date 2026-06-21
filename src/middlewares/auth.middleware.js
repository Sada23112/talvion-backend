const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const UserSession = require('../models/userSession.model');
const connectDB = require('../config/db');
const { mockUserRepo, mockUserSessionRepo } = require('../models/mock.db');

/**
 * Protect routes - Verification of JWT token and session validation
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Read token from Authorization Header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      const error = new Error('You are not logged in. Please log in to gain access.');
      error.statusCode = 401;
      return next(error);
    }

    // 2. Verify Token
    const secret = process.env.JWT_SECRET || 'fallback_secret_talvion_key';
    let decoded;
    
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        // Access token has expired, check if we have a refresh token to perform auto-refresh inline
        const refreshToken = req.headers['x-refresh-token'] || req.cookies?.refreshToken;
        
        if (refreshToken) {
          try {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const sessionRepo = connectDB.isDbOffline() ? mockUserSessionRepo : UserSession;

            const session = await sessionRepo.findOne({ refreshTokenHash: hash, isRevoked: false });

            if (session && (!session.expiresAt || session.expiresAt > new Date())) {
              // Rotate tokens inline
              const newRefreshToken = crypto.randomBytes(40).toString('hex');
              const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

              if (!session.oldTokenHashes) {
                session.oldTokenHashes = [];
              }
              session.oldTokenHashes.push(session.refreshTokenHash);
              session.refreshTokenHash = newHash;
              session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Extend 30 days
              session.lastActive = new Date();
              await session.save();

              // Generate new access token
              const newAccessToken = jwt.sign(
                { id: session.user, sessionId: session._id },
                secret,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
              );

              // Set rotated tokens in headers so the client can retrieve them
              res.setHeader('x-new-access-token', newAccessToken);
              res.setHeader('x-new-refresh-token', newRefreshToken);
              res.setHeader('Access-Control-Expose-Headers', 'x-new-access-token, x-new-refresh-token');

              // Proceed with decoded details of the new token
              decoded = { id: session.user, sessionId: session._id };
            } else if (session) {
              // Expired session
              session.isRevoked = true;
              await session.save();
            } else {
              // Reuse check: if the token is in oldTokenHashes, revoke all sessions of this user!
              const compromisedSession = await sessionRepo.findOne({ oldTokenHashes: hash });
              if (compromisedSession) {
                await sessionRepo.updateMany(
                  { user: compromisedSession.user },
                  { isRevoked: true }
                );
                const error = new Error('Compromised refresh token reused. All sessions revoked for security.');
                error.statusCode = 403;
                return next(error);
              }
            }
          } catch (refreshErr) {
            const logger = require('../config/logger');
            logger.error('Failed auto-refresh in protect middleware', refreshErr);
          }
        }
      }

      if (!decoded) {
        const error = new Error('Invalid or expired authentication token. Please log in again.');
        error.statusCode = 401;
        return next(error);
      }
    }

    // 3. Check session validity (Real-time Session Revocation)
    const sessionRepo = connectDB.isDbOffline() ? mockUserSessionRepo : UserSession;
    const session = await sessionRepo.findById(decoded.sessionId);
    
    if (!session || session.isRevoked || (session.expiresAt && session.expiresAt < new Date())) {
      const error = new Error('Session has been revoked or expired. Please log in again.');
      error.statusCode = 401;
      return next(error);
    }

    // 4. Check if user still exists
    let currentUser;
    const mongoose = require('mongoose');
    const isValidObjectId = mongoose.Types.ObjectId.isValid(decoded.id);

    if (connectDB.isDbOffline() || !isValidObjectId) {
      currentUser = await mockUserRepo.findById(decoded.id);
    } else {
      currentUser = await User.findById(decoded.id);
    }

    if (!currentUser) {
      const error = new Error('The user belonging to this token no longer exists.');
      error.statusCode = 401;
      return next(error);
    }

    // Update lastActive timestamp on session
    session.lastActive = new Date();
    await session.save();

    // 5. Grant access to request context
    req.user = currentUser;
    req.userSessionId = session._id;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect };
