import * as z from "zod";

const emailSchema = z
  .email({ message: "Please provide a valid email address" })
  .trim();

// The rest of your code remains the same
const passwordSchema = z
  .string()
  .trim()
  .min(8, {
    message: "Password must be at least 8 characters long.",
  })
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}:;<>?,.]).{8,}$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one symbol.",
  });

export const registerUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, {
      message: "Name is required.",
    })
    .max(255, {
      message: "Name must not exceed 255 characters.",
    }),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type TRegisterUser = z.infer<typeof registerUserSchema>;
