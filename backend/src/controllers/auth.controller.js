const User = require('../models/user.model');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/auth/register
 * Called after successful Firebase auth. Creates or returns MongoDB user.
 * Body: { name?, dob?, gender? }
 */
const register = asyncHandler(async (req, res) => {
  const { uid, email, phone_number, picture, name: firebaseName } = req.firebaseUser;
  const { name, dob, gender } = req.body;

  // Determine provider from Firebase token
  const signInProvider =
    req.firebaseUser.firebase?.sign_in_provider || 'password';

  let provider = 'email';
  if (signInProvider === 'google.com') provider = 'google';
  else if (signInProvider === 'phone') provider = 'phone';

  // Check if user already exists
  let user = await User.findOne({ firebaseUid: uid });

  if (user) {
    // If profile incomplete and new data arrived, update it
    if (!user.profileComplete && (name || dob || gender)) {
      if (name) user.name = name.trim();
      if (dob) user.dob = new Date(dob);
      if (gender) user.gender = gender;
      user.profileComplete = !!(user.name && user.dob && user.gender);
      await user.save();
    }
    return res.json({
      user: formatUser(user),
      isNew: false,
    });
  }

  // Build new user object
  const userData = {
    firebaseUid: uid,
    provider,
    photoURL: picture || '',
  };

  // Email from Firebase or body
  if (email) userData.email = email;
  if (phone_number) userData.phone = phone_number;

  // Name: prefer body, fallback to Firebase display name
  userData.name = name || firebaseName || '';

  // Extra profile fields
  if (dob) userData.dob = new Date(dob);
  if (gender) userData.gender = gender;

  // For Google OAuth, auto-fill what we can
  if (provider === 'google') {
    userData.name = name || firebaseName || '';
    userData.photoURL = picture || '';
  }

  // Check if profile is complete (name, dob, gender required)
  userData.profileComplete = !!(userData.name && dob && gender);

  user = await User.create(userData);

  res.status(201).json({
    user: formatUser(user),
    isNew: true,
  });
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 */
const getProfile = asyncHandler(async (req, res) => {
  if (!req.user) {
    // User authenticated via Firebase but not yet in MongoDB
    return res.status(404).json({
      message: 'User not found in database',
      code: 'USER_NOT_FOUND',
    });
  }

  res.json({ user: formatUser(req.user) });
});

/**
 * PUT /api/auth/complete-profile
 * Complete or update profile with name, dob, gender.
 * Body: { name, dob, gender, phone? }
 */
const completeProfile = asyncHandler(async (req, res) => {
  const { uid } = req.firebaseUser;
  const { name, dob, gender, phone } = req.body;

  if (!name || !dob || !gender) {
    return res.status(400).json({
      message: 'name, dob and gender are required to complete profile',
    });
  }

  const updateData = {
    name: name.trim(),
    dob: new Date(dob),
    gender,
    profileComplete: true,
  };

  if (phone) updateData.phone = phone;

  let user = await User.findOne({ firebaseUid: uid });

  if (!user) {
    // Create the user if they don't exist yet
    const { email, phone_number, picture } = req.firebaseUser;
    const signInProvider =
      req.firebaseUser.firebase?.sign_in_provider || 'password';

    let provider = 'email';
    if (signInProvider === 'google.com') provider = 'google';
    else if (signInProvider === 'phone') provider = 'phone';

    user = await User.create({
      firebaseUid: uid,
      email: email || undefined,
      phone: phone_number || phone || undefined,
      photoURL: picture || '',
      provider,
      ...updateData,
    });
  } else {
    Object.assign(user, updateData);
    await user.save();
  }

  res.json({ user: formatUser(user) });
});

/**
 * PUT /api/auth/profile
 * Update profile fields (name, dob, gender, phone, photoURL).
 */
const updateProfile = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const allowedFields = ['name', 'dob', 'gender', 'phone', 'photoURL'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = field === 'dob' ? new Date(req.body[field]) : req.body[field];
    }
  }

  // Recheck profile completeness
  const willBeComplete = !!(
    (updates.name || req.user.name) &&
    (updates.dob || req.user.dob) &&
    (updates.gender || req.user.gender)
  );
  updates.profileComplete = willBeComplete;

  Object.assign(req.user, updates);
  await req.user.save();

  res.json({ user: formatUser(req.user) });
});

// ----- Helpers -----

function formatUser(user) {
  return {
    id: user._id,
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    dob: user.dob,
    gender: user.gender,
    photoURL: user.photoURL,
    provider: user.provider,
    profileComplete: user.profileComplete,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = { register, getProfile, completeProfile, updateProfile };
