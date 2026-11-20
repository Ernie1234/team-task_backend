import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { BadRequestException } from "@/utils/appError";
import type { MessageAttachment } from "@/models/message-model";

// Files are stored on the API server's disk: fine for development and a single
// server. For production use object storage (S3, Cloudinary, ...) instead.
export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const CHAT_DIR = path.join(UPLOAD_ROOT, "chat");

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_MESSAGE = 5;

// Allowed types -> extension we save with. The user's own file extension is
// never trusted. SVG/HTML are deliberately excluded (they can run scripts).
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
};

export const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

const monthFolder = () => new Date().toISOString().slice(0, 7); // e.g. 2026-11

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(CHAT_DIR, monthFolder());
    fs.mkdir(dir, { recursive: true }, (error) => cb(error, dir));
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${ALLOWED_TYPES[file.mimetype]}`);
  },
});

const chatUploader = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_MESSAGE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    cb(new BadRequestException(`File type not allowed: ${file.originalname}`));
  },
}).array("files", MAX_FILES_PER_MESSAGE);

// multer middleware with its errors turned into clean 400 responses
export const chatUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  chatUploader(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `Each file must be ${MAX_FILE_SIZE / 1024 / 1024} MB or smaller`
          : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
            ? `You can attach up to ${MAX_FILES_PER_MESSAGE} files at a time`
            : error.message;
      return next(new BadRequestException(message));
    }
    next(error);
  });
};

// Browsers send multipart filenames as UTF-8 but busboy reads them as latin1
const decodeFilename = (name: string) => {
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("�") ? name : decoded;
};

export const toAttachment = (file: Express.Multer.File): MessageAttachment => ({
  url: "/" + path.relative(path.dirname(UPLOAD_ROOT), file.path).split(path.sep).join("/"),
  name: decodeFilename(file.originalname).slice(0, 255),
  size: file.size,
  mimeType: file.mimetype,
});

// Absolute path for an "/uploads/chat/..." url, or null if it points anywhere else
export const resolveChatUploadPath = (url: string): string | null => {
  if (typeof url !== "string" || !url.startsWith("/uploads/chat/")) return null;
  const absolute = path.resolve(path.dirname(UPLOAD_ROOT), "." + url);
  return absolute.startsWith(CHAT_DIR + path.sep) ? absolute : null;
};
