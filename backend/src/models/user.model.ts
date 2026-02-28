import { Schema, model, Model } from "mongoose";
import { IUser } from "../types";

const userSchema = new Schema<IUser>(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, trim: true, default: "" },
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
      enum: ["male", "female", "other", ""],
      default: "",
    },
    photoURL: { type: String, default: "" },
    provider: {
      type: String,
      enum: ["email", "phone", "google"],
      required: true,
    },
    profileComplete: { type: Boolean, default: false },
    roles: {
      type: [String],
      default: [],
    },
    activeOrganization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
  },
  { timestamps: true },
);

const User: Model<IUser> = model<IUser>("User", userSchema);
export default User;
