import { Router } from "express";
import {
  connectGoogleController,
  createEventController,
  deleteEventController,
  getEventController,
  disconnectGoogleController,
  getConnectionController,
  googleCallbackController,
  listEventsController,
  snoozeController,
  syncGoogleController,
  updateEventController,
} from "@/controllers/calendar-controller";

const calendarRoute = Router();

calendarRoute.get("/connection", getConnectionController);
calendarRoute.get("/google/connect", connectGoogleController);
calendarRoute.get("/google/callback", googleCallbackController);
calendarRoute.post("/google/sync", syncGoogleController);
calendarRoute.delete("/google", disconnectGoogleController);

calendarRoute.get("/events", listEventsController);
calendarRoute.post("/events", createEventController);
calendarRoute.get("/events/:eventId", getEventController);
calendarRoute.patch("/events/:eventId", updateEventController);
calendarRoute.delete("/events/:eventId", deleteEventController);
calendarRoute.post("/events/:eventId/snooze", snoozeController);

export default calendarRoute;
