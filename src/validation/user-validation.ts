import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #4F46E5");

// The user's appearance preferences. Strict so nothing else can be stored on the user.
export const appearanceSchema = z
  .object({
    mode: z.enum(["light", "dark", "system"]),
    theme: z.string().trim().min(1).max(32),
    customAccent: hexColor,
    customSidebar: hexColor,
    sidebarStyle: z.enum(["themed", "plain"]),
    font: z.string().trim().min(1).max(40),
    fontSize: z.number().int().min(12).max(20),
    radius: z.enum(["sharp", "default", "round"]),
    reduceMotion: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type AppearanceType = z.infer<typeof appearanceSchema>;

/** Finishing or skipping the guided tour */
export const tourSchema = z.object({ status: z.enum(["completed", "skipped"]) });
export type TourType = z.infer<typeof tourSchema>;

// Our own uploads, or an https image (e.g. the Google profile photo)
const avatarUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => /^https:\/\//i.test(u) || /\/uploads\/chat\/[\w-]+\.(png|jpe?g|gif|webp)$/i.test(u), "Use an uploaded image");

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80),
    profilePicture: avatarUrl.nullable(),
  })
  .partial()
  .strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(200)
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letters and at least one number"),
});

export const deleteAccountSchema = z.object({ confirmEmail: z.string().trim().toLowerCase().email() });

export type UpdateProfileType = z.infer<typeof updateProfileSchema>;
