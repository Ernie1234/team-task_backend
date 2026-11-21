import { compareValue, hashValue } from "@/utils/bcrypt-func";
import mongoose, { Document, Schema } from "mongoose";

export type TourStatus = "pending" | "completed" | "skipped";

export type EmailPrefs = {
  taskAssigned: boolean;
  taskUpdated: boolean;
  eventReminder: boolean;
  memberJoined: boolean;
  digest: boolean;
  /** Local hour (0-23) the daily digest goes out */
  digestHour: number;
  timeZone: string;
};

export interface UserDocument extends Document {
  name: string;
  email: string;
  password?: string;
  profilePicture: string | null;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentWorkspace: mongoose.Types.ObjectId | null;
  isOnline: boolean;
  lastSeen: Date | null;
  // Personal look of the app (theme, font, text size…), synced across devices
  appearance: Record<string, unknown> | null;
  /** Guided tour: "pending" for new accounts until they finish or skip it */
  tour: { status: TourStatus; updatedAt: Date } | null;
  /** Which emails to send; missing on older accounts (the defaults apply) */
  emailPrefs: EmailPrefs;
  /** Local date ("2026-11-21") of the last daily digest, so it goes out once a day */
  lastDigestOn: string | null;
  comparePassword(value: string): Promise<boolean>;
  omitPassword(): Omit<UserDocument, "password">;
  isVerified: boolean;
  verificationToken?: string;
  verificationTokenExpiresAt?: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, select: true },
    profilePicture: {
      type: String,
      default: null,
    },
    currentWorkspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
    },
    // resetPasswordToken: String,
    // resetPasswordExpires: Date,
    verificationTokenExpiresAt: Date,
    verificationToken: String,
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    appearance: { type: Schema.Types.Mixed, default: null },
    emailPrefs: {
      taskAssigned: { type: Boolean, default: true },
      taskUpdated: { type: Boolean, default: false },
      eventReminder: { type: Boolean, default: true },
      memberJoined: { type: Boolean, default: false },
      digest: { type: Boolean, default: true },
      digestHour: { type: Number, default: 8, min: 0, max: 23 },
      timeZone: { type: String, default: "UTC" },
    },
    lastDigestOn: { type: String, default: null },
    tour: {
      type: new Schema(
        {
          status: { type: String, enum: ["pending", "completed", "skipped"], required: true },
          updatedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Async hook: Mongoose waits for the returned promise. Don't take a `next`
// argument — newer Mongoose versions pass the save options there instead.
userSchema.pre("save", async function () {
  if (this.isModified("password") && this.password) {
    this.password = await hashValue(this.password);
  }
});

userSchema.methods.omitPassword = function (): Omit<UserDocument, "password"> {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

userSchema.methods.comparePassword = async function (value: string) {
  return compareValue(value, this.password);
};

const UserModel = mongoose.model<UserDocument>("User", userSchema);
export default UserModel;
