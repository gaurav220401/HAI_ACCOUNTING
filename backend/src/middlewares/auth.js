const admin = require('../config/firebase');
const User = require('../models/user.model');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Middleware: Verify Firebase ID token from Authorization header.
 * Attaches decoded token + MongoDB user to req.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized – no token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decoded;

    // Attach MongoDB user if exists
    const dbUser = await User.findOne({ firebaseUid: decoded.uid });
    req.user = dbUser;

    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ message: 'Unauthorized – invalid token' });
  }
});

/**
 * Middleware: Require profile to be complete before accessing a route.
 * Must come after authenticate.
 */
const requireCompleteProfile = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not found in database' });
  }
  if (!req.user.profileComplete) {
    return res.status(403).json({
      message: 'Profile incomplete',
      code: 'PROFILE_INCOMPLETE',
    });
  }
  next();
};

module.exports = { authenticate, requireCompleteProfile };
