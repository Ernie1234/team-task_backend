import { z } from "zod";
import mongoose from "mongoose";
import { isValidTimeZone } from "@/utils/zoned-time";

const objectId = () => z.string().trim().refine((v) => mongoose.isValidObjectId(v), "Invalid id");
const reminder = z.number().int().min(0).max(40320).nullable();

const base = z.object({
  title: z.string().trim().min(1, "Give the event a title").max(200),
  description: z.string().max(5000).optional(),
  location: z.string().trim().max(300).optional(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  allDay: z.boolean().optional(),
  timeZone: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
  reminderMinutes: reminder.optional(),
  syncToGoogle: z.boolean().optional(),
  workspaceId: objectId().optional(),
});

export const createEventSchema = base.refine((e) => e.end >= e.start, { message: "The event can't end before it starts", path: ["end"] });
export const updateEventSchema = base.partial().strict();
export const eventIdSchema = objectId();
export const listEventsQuerySchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine((q) => q.to > q.from && q.to.getTime() - q.from.getTime() <= 400 * 86_400_000, "Pick a range of up to 400 days");
export const snoozeSchema = z.object({ minutes: z.number().int().min(1).max(1440).default(5) });

export type CreateEventType = z.infer<typeof createEventSchema>;
export type UpdateEventType = z.infer<typeof updateEventSchema>;
