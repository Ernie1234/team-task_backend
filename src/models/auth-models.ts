import mongoose, { Schema, Types } from "mongoose";

/**
 * Read/write views of Better Auth's collections (Better Auth owns the schema;
 * these models are for our own queries: devices list, account clean-up, migration).
 */
export interface AuthSessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  token: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthAccountDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  accountId: string;
  providerId: string; // "credential" (email + password) or "google"
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const loose = { strict: false, versionKey: false } as const;

export const AuthSessionModel = mongoose.model<AuthSessionDoc>(
  "AuthSession",
  new Schema<AuthSessionDoc>({ userId: Schema.Types.ObjectId, token: String, expiresAt: Date }, { ...loose, collection: "auth_sessions" })
);

export const AuthAccountModel = mongoose.model<AuthAccountDoc>(
  "AuthAccount",
  new Schema<AuthAccountDoc>(
    { userId: Schema.Types.ObjectId, accountId: String, providerId: String, password: String, createdAt: Date, updatedAt: Date },
    { ...loose, collection: "auth_accounts" }
  )
);

export const AuthVerificationModel = mongoose.model(
  "AuthVerification",
  new Schema({ identifier: String, value: String, expiresAt: Date }, { ...loose, collection: "auth_verifications" })
);
