// validation/notification-validation.ts

import { z } from "zod";

export const notificationIdsSchema = z.array(z.string().min(1));
