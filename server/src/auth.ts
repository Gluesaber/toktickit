import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Request, Response, NextFunction } from "express";
import type { Role, User } from "@prisma/client";
import { getPrisma } from "./prisma.js";

// ---------------------------------------------------------------------------
// Issue 3-2 (Lab 3) — password hashing (BR-06).
// bcryptjs, not native bcrypt: pure JavaScript, no build-toolchain dependency — chosen specifically
// for this project's Windows dev machines over the more "standard" native bcrypt/argon2 choice a
// Docker-deployed production app would normally prefer (specification.md §11).
// ---------------------------------------------------------------------------
const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// BR-14: minimum password length; no further complexity rule (specification.md §11 — course-lab
// scope, consistent with Lab 2's preference for simple, clearly-testable validation).
export const MIN_PASSWORD_LENGTH = 8;

// ---------------------------------------------------------------------------
// Session (BR-09, BR-10).
// ---------------------------------------------------------------------------
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const PgSession = connectPgSimple(session);

export const SESSION_COOKIE_NAME = "toktickit.sid";

// HTTP-only, SameSite=Lax cookie (Secure only in production — see client/vite.config.ts's dev proxy,
// which makes the client genuinely same-origin in dev so Lax is sufficient, no CSRF token needed —
// specification.md §11). Session state lives server-side in Postgres via connect-pg-simple
// (`createTableIfMissing`, so no separate migration needed for the session table itself — it isn't
// part of the Prisma-managed schema, same as any other library-owned table) rather than in-memory,
// so a server restart doesn't silently log everyone out. Fixed 24h absolute expiry, no sliding
// refresh (BR-10) — `rolling: false` is what keeps it absolute instead of resetting on activity.
export function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — copy server/.env.example to .env and set one.");
  }
  const conString = process.env.DATABASE_URL;
  if (!conString) {
    throw new Error("DATABASE_URL is not set — copy server/.env.example to .env and set one.");
  }

  return session({
    store: new PgSession({ conString, tableName: "session", createTableIfMissing: true }),
    name: SESSION_COOKIE_NAME,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
}

// ---------------------------------------------------------------------------
// Current-user shape (BR-16): passwordHash never leaves the server.
// ---------------------------------------------------------------------------
export type SafeUser = Pick<User, "id" | "name" | "email" | "role" | "isActive" | "mustChangePassword">;

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: SafeUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware.
// ---------------------------------------------------------------------------

// BR-11: every protected endpoint requires a valid, unexpired session. Re-checks `isActive` on every
// request (not just at login) — an Administrator deactivating a user must take effect immediately,
// not just the next time that user tries to log in.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in." } });
    return;
  }

  try {
    const user = await getPrisma().user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      req.session.destroy(() => {});
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in." } });
      return;
    }
    req.currentUser = toSafeUser(user);
    next();
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
}

// BR-13: blocks whatever route it's composed onto while mustChangePassword is true. Must run after
// requireAuth (reads req.currentUser). GET /api/auth/me, POST /api/auth/change-password, and
// POST /api/auth/logout stay reachable during the gate simply by never having this middleware
// applied to them — see app.ts.
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (req.currentUser?.mustChangePassword) {
    res.status(403).json({
      error: { code: "PASSWORD_CHANGE_REQUIRED", message: "You must set a new password before continuing." },
    });
    return;
  }
  next();
}

// Scaffolded now as part of Authentication Foundation; first actually composed onto a route by
// Issue 3-4 (Staff Queue) and Issue 3-6 (User Management) — specification.md §11's "full IT Staff
// parity" decision is enforced by passing multiple roles, e.g. requireRole("IT_STAFF",
// "ADMINISTRATOR"). Must run after requireAuth.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You don't have access to this." } });
      return;
    }
    next();
  };
}
