import * as z from "zod";

export const inviteCodeSchema = z.object({
  inviteCode: z.string(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
});
