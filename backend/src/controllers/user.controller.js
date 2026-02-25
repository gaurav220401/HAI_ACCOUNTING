const User = require('../models/user.model');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const users = await User.find().select('-firebaseUid');
  res.json(users);
});

const getById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-firebaseUid');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user);
});

module.exports = { list, getById };
