import * as z from "zod";

export const inviteCodeSchema = z.object({
  inviteCode: z.string(),
});
