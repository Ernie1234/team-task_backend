import mongoose, { Document, Schema } from "mongoose";

export interface MessageDocument extends Document {
  content: string;
  sender: mongoose.Types.ObjectId;
  chatType: "workspace" | "project" | "direct";
  workspace?: mongoose.Types.ObjectId; // Required for workspace and project chats
  project?: mongoose.Types.ObjectId; // Required for project chats
  participants?: mongoose.Types.ObjectId[]; // Required for direct messages (sender + recipient)
  messageType: "text" | "image" | "file" | "system";
  replyTo?: mongoose.Types.ObjectId; // Reference to another message for replies
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  reactions: Array<{
    user: mongoose.Types.ObjectId;
    emoji: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<MessageDocument>(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000, // Limit message length
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chatType: {
      type: String,
      enum: ["workspace", "project", "direct"],
      required: true,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: false,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: false,
    },
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    messageType: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        emoji: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
messageSchema.index({ workspace: 1, createdAt: -1 });
messageSchema.index({ project: 1, createdAt: -1 });
messageSchema.index({ participants: 1, createdAt: -1 });
messageSchema.index({ chatType: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

// Soft delete method
messageSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = "This message was deleted";
  return this.save();
};

// Mark as edited
messageSchema.methods.markAsEdited = function () {
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

const MessageModel = mongoose.model<MessageDocument>("Message", messageSchema);
export default MessageModel;