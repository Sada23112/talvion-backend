/**
 * Prevent unverified users from using protected write/interaction features
 */
const verified = (req, res, next) => {
  if (!req.user) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    return next(error);
  }

  // Bypass email verification in development/testing environments to ease local testing, or if explicitly bypassed (defaults to true for ease of setup)
  const bypass = process.env.NODE_ENV !== 'production' || process.env.BYPASS_EMAIL_VERIFICATION !== 'false';

  if (!bypass && !req.user.emailVerified) {
    const error = new Error('Please verify your email address to gain access to this feature.');
    error.statusCode = 403;
    return next(error);
  }

  next();
};

module.exports = { verified };
