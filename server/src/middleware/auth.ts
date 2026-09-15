import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { getPrisma } from "../prisma.js";

export const SESSION_COOKIE_NAME = "tk_session";
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export async function attachUserSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const prisma = getPrisma();
    const token = req.cookies?.[SESSION_COOKIE_NAME];

    if (token) {
      const session = await prisma.session.findUnique({
        where: { id: token },
        include: { user: true },
      });

      if (session && session.expiresAt > new Date() && session.user.isActive) {
        // Sliding window expiration: extend 8 hours on activity
        const newExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
        await prisma.session.update({
          where: { id: session.id },
          data: { expiresAt: newExpiresAt },
        });

        res.cookie(SESSION_COOKIE_NAME, session.id, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          expires: newExpiresAt,
        });

        req.user = {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
          mustChangePassword: session.user.mustChangePassword,
        };
        req.sessionId = session.id;
        return next();
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.mustChangePassword) {
    res.status(403).json({ error: "Password change required before accessing this resource" });
    return;
  }
  next();
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}

