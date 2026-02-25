const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, trim: true, default: '' },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    dob: { type: Date, default: null },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', ''],
      default: '',
    },
    photoURL: { type: String, default: '' },
    provider: {
      type: String,
      enum: ['email', 'phone', 'google'],
      required: true,
    },
    profileComplete: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
