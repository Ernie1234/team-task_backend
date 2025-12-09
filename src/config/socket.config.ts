import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import type { RequestHandler } from "express";
import passport from "passport";
import { config } from "./app.config";
import Logger from "@/utils/logger";
import UserModel from "@/models/user-model";
import { chatSocketHandlers } from "@/handlers/chat-socket.handlers";

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  workspaceId?: string;
  user?: any;
}

export class SocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HTTPServer, sessionMiddleware: RequestHandler) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.FRONTEND_ORIGIN,
        credentials: true,
      },
    });

    this.setupMiddleware(sessionMiddleware);
    this.setupEventHandlers();
  }

  private setupMiddleware(sessionMiddleware: RequestHandler) {
    // Use the same session middleware from Express
    this.io.use((socket, next) => {
      sessionMiddleware(socket.request as any, {} as any, next as any);
    });

    // Passport middleware for Socket.IO
    this.io.use((socket, next) => {
      passport.initialize()(socket.request as any, {} as any, next as any);
    });

    this.io.use((socket, next) => {
      passport.session()(socket.request as any, {} as any, next as any);
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const req = socket.request as any;
        
        // Log session information for debugging
        Logger.info('Socket connection attempt:', {
          hasSession: !!req.session,
          sessionID: req.sessionID,
          hasPassport: !!req.session?.passport,
          hasUser: !!req.user,
          cookies: req.headers.cookie ? 'present' : 'missing'
        });
        
        const user = req.user;
        
        if (!user || !user._id) {
          Logger.warn("Socket connection attempted without authentication", {
            hasSession: !!req.session,
            sessionID: req.sessionID,
            passportUser: req.session?.passport?.user
          });
          return next(new Error("Authentication required"));
        }

        // Verify user exists
        const dbUser = await UserModel.findById(user._id);
        if (!dbUser) {
          Logger.warn(`Socket connection attempted by non-existent user ${user._id}`);
          return next(new Error("User not found"));
        }

        socket.userId = user._id.toString();
        socket.workspaceId = dbUser.currentWorkspace?.toString();
        socket.user = dbUser;

        Logger.info(`✅ Socket authenticated for user ${dbUser.name} (${user._id})${dbUser.currentWorkspace ? ` in workspace ${dbUser.currentWorkspace}` : ' (no workspace)'}`);
        next();
      } catch (error) {
        Logger.error("Socket authentication error:", error);
        next(new Error("Authentication failed"));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", async (socket: AuthenticatedSocket) => {
      try {
        Logger.info(`User ${socket.userId} connected to workspace ${socket.workspaceId}`);

        // Track connected user
        this.connectedUsers.set(socket.userId!, socket.id);

        // Update user online status
        await UserModel.findByIdAndUpdate(socket.userId, {
          isOnline: true,
          lastSeen: new Date(),
        });

        // Join workspace room if user has a workspace
        if (socket.workspaceId) {
          await socket.join(`workspace:${socket.workspaceId}`);

          // Notify others in workspace that user is online
          socket.to(`workspace:${socket.workspaceId}`).emit("user:online", {
            userId: socket.userId,
            user: {
              _id: socket.user._id,
              name: socket.user.name,
              profilePicture: socket.user.profilePicture,
            },
          });
        }

        // Set up chat handlers
        chatSocketHandlers(socket, this.io);

        // Handle disconnect
        socket.on("disconnect", async () => {
          try {
            Logger.info(`User ${socket.userId} disconnected from workspace ${socket.workspaceId}`);

            // Remove from connected users
            this.connectedUsers.delete(socket.userId!);

            // Update user offline status
            await UserModel.findByIdAndUpdate(socket.userId, {
              isOnline: false,
              lastSeen: new Date(),
            });

            // Notify others in workspace that user is offline
            if (socket.workspaceId) {
              socket.to(`workspace:${socket.workspaceId}`).emit("user:offline", {
                userId: socket.userId,
              });
            }
          } catch (error) {
            Logger.error("Error handling socket disconnect:", error);
          }
        });

        // Handle typing events
        socket.on("typing:start", ({ chatType, workspace, project, otherUserId }) => {
          let roomName = "";
          
          switch (chatType) {
            case "workspace":
              if (workspace) {
                roomName = `workspace:${workspace}`;
              }
              break;
            case "project":
              if (project) {
                roomName = `project:${project}`;
              }
              break;
            case "direct":
              if (otherUserId) {
                const participants = [socket.userId!, otherUserId].sort();
                roomName = `direct:${participants.join(":")}`;
              }
              break;
          }
          
          if (roomName) {
            socket.to(roomName).emit("typing:start", {
              roomName,
              userId: socket.userId,
              user: {
                _id: socket.user._id,
                name: socket.user.name,
              },
              userName: socket.user.name,
              profilePicture: socket.user.profilePicture,
            });
          }
        });

        socket.on("typing:stop", ({ chatType, workspace, project, otherUserId }) => {
          let roomName = "";
          
          switch (chatType) {
            case "workspace":
              if (workspace) {
                roomName = `workspace:${workspace}`;
              }
              break;
            case "project":
              if (project) {
                roomName = `project:${project}`;
              }
              break;
            case "direct":
              if (otherUserId) {
                const participants = [socket.userId!, otherUserId].sort();
                roomName = `direct:${participants.join(":")}`;
              }
              break;
          }
          
          if (roomName) {
            socket.to(roomName).emit("typing:stop", {
              roomName,
              userId: socket.userId,
            });
          }
        });

      } catch (error) {
        Logger.error("Error in socket connection:", error);
        socket.disconnect();
      }
    });
  }

  // Method to emit to a specific workspace
  public emitToWorkspace(workspaceId: string, event: string, data: any) {
    this.io.to(`workspace:${workspaceId}`).emit(event, data);
  }

  // Method to get connected users count for a workspace
  public async getWorkspaceUserCount(workspaceId: string): Promise<number> {
    const room = this.io.sockets.adapter.rooms.get(`workspace:${workspaceId}`);
    return room ? room.size : 0;
  }

  // Method to check if user is connected
  public isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}

export default SocketService;