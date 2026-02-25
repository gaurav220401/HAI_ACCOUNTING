const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate, requireCompleteProfile } = require('../middlewares/auth');

// All auth routes require a valid Firebase token
router.use(authenticate);

// Register / sync user after Firebase auth
router.post('/register', authController.register);

// Get current user's profile
router.get('/me', authController.getProfile);

// Complete profile (name, dob, gender) — for Google OAuth / incomplete profiles
router.put('/complete-profile', authController.completeProfile);

// Update profile
router.put('/profile', authController.updateProfile);

module.exports = router;
